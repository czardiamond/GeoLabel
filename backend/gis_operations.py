"""Pure local GIS operations used by real workflows.

The functions in this module deliberately require CRS information from callers and
never infer a coordinate system from GeoJSON or raster content.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.errors import WindowError
from rasterio.features import geometry_mask, geometry_window
from rasterio.windows import Window
from pyproj import CRS, Transformer
from shapely import get_coordinates, transform as project_geometry
from shapely.geometry import mapping, shape
from backend.spatial_operations import spatial_join


def _validate_limit(width: int, height: int, max_pixels: int | None) -> None:
    if max_pixels is not None and (not isinstance(max_pixels, int) or max_pixels <= 0):
        raise ValueError("max_pixels must be a positive integer")
    if max_pixels is not None and width * height > max_pixels:
        raise ValueError(f"raster has {width * height} pixels, exceeding max_pixels={max_pixels}")


def _windows(width: int, height: int, block: int = 512):
    for row in range(0, height, block):
        for col in range(0, width, block):
            yield Window(col, row, min(block, width - col), min(block, height - row))


def _merge_moments(count: int, mean: float, m2: float, low: float | None,
                   high: float | None, values: np.ndarray):
    """Combine one bounded pixel window using parallel Welford moments."""
    size = int(values.size)
    if not size:
        return count, mean, m2, low, high
    chunk_mean = float(values.mean())
    centered = values - chunk_mean
    chunk_m2 = float(np.dot(centered, centered))
    chunk_low, chunk_high = float(values.min()), float(values.max())
    if not count:
        return size, chunk_mean, chunk_m2, chunk_low, chunk_high
    total = count + size
    delta = chunk_mean - mean
    combined_mean = mean + delta * size / total
    combined_m2 = m2 + chunk_m2 + delta * delta * count * size / total
    return total, combined_mean, combined_m2, min(low, chunk_low), max(high, chunk_high)


def raster_band_statistics(path: str | Path, max_pixels: int | None = None) -> dict[str, Any]:
    """Compute finite, valid-pixel statistics from a local raster using windows."""
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"raster path does not exist or is not a file: {path}")
    try:
        with rasterio.open(path) as dataset:
            _validate_limit(dataset.width, dataset.height, max_pixels)
            bands = []
            for band_number in range(1, dataset.count + 1):
                count, mean, m2, low, high = 0, 0.0, 0.0, None, None
                for window in _windows(dataset.width, dataset.height):
                    arr = dataset.read(band_number, window=window, masked=True)
                    valid = np.asarray(arr.compressed(), dtype="float64")
                    valid = valid[np.isfinite(valid)]
                    count, mean, m2, low, high = _merge_moments(count, mean, m2, low, high, valid)
                bands.append({
                    "band": band_number,
                    "valid_pixel_count": count,
                    "min": low,
                    "max": high,
                    "mean": mean if count else None,
                    "std": float(np.sqrt(max(0.0, m2 / count))) if count else None,
                })
            return {"crs": dataset.crs.to_string() if dataset.crs else None,
                    "transform": tuple(dataset.transform), "width": dataset.width,
                    "height": dataset.height, "band_count": dataset.count,
                    "bands": bands}
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"unable to read raster {path}: {exc}") from exc


def raster_change_analysis(path_a: str | Path, path_b: str | Path,
                           threshold: float | None = None,
                           max_pixels: int | None = None) -> dict[str, Any]:
    """Compare two equally gridded local rasters with windowed absolute differences."""
    if threshold is not None and (not isinstance(threshold, (int, float)) or not np.isfinite(threshold) or threshold < 0):
        raise ValueError("threshold must be a non-negative number")
    try:
        with rasterio.open(path_a) as left, rasterio.open(path_b) as right:
            if (left.width, left.height) != (right.width, right.height):
                raise ValueError("raster grid mismatch: dimensions differ")
            if left.count != right.count:
                raise ValueError("raster grid mismatch: band counts differ")
            if left.crs != right.crs or not left.transform.almost_equals(right.transform):
                raise ValueError("raster grid mismatch: CRS or affine transform differs")
            _validate_limit(left.width, left.height, max_pixels)
            stats = []
            for band in range(1, left.count + 1):
                count, mean, m2, low, high = 0, 0.0, 0.0, None, None
                changed = 0
                changed_pixel_bounds = None
                for window in _windows(left.width, left.height):
                    a = left.read(band, window=window, masked=True)
                    b = right.read(band, window=window, masked=True)
                    valid = ~(np.ma.getmaskarray(a) | np.ma.getmaskarray(b))
                    diff = np.abs(np.asarray(a.data, dtype="float64") - np.asarray(b.data, dtype="float64"))
                    valid &= np.isfinite(diff)
                    values = diff[valid]
                    count, mean, m2, low, high = _merge_moments(count, mean, m2, low, high, values)
                    if threshold is not None:
                        changed_mask = valid & (diff > threshold)
                        block_changed = int(np.count_nonzero(changed_mask))
                        changed += block_changed
                        if block_changed:
                            rows, cols = np.nonzero(changed_mask)
                            min_col = int(window.col_off + cols.min())
                            max_col = int(window.col_off + cols.max() + 1)
                            min_row = int(window.row_off + rows.min())
                            max_row = int(window.row_off + rows.max() + 1)
                            corners = [
                                left.transform @ (min_col, min_row),
                                left.transform @ (max_col, min_row),
                                left.transform @ (min_col, max_row),
                                left.transform @ (max_col, max_row),
                            ]
                            current = (min(x for x, _ in corners), min(y for _, y in corners),
                                       max(x for x, _ in corners), max(y for _, y in corners))
                            if changed_pixel_bounds is None:
                                changed_pixel_bounds = current
                            else:
                                changed_pixel_bounds = (
                                    min(changed_pixel_bounds[0], current[0]),
                                    min(changed_pixel_bounds[1], current[1]),
                                    max(changed_pixel_bounds[2], current[2]),
                                    max(changed_pixel_bounds[3], current[3]),
                                )
                item = {"band": band, "valid_pixel_count": count,
                        "min": low, "max": high, "mean": mean if count else None,
                        "std": float(np.sqrt(max(0.0, m2 / count))) if count else None}
                if threshold is not None:
                    item["changed_pixel_count"] = changed
                    item["changed_bounds"] = changed_pixel_bounds
                stats.append(item)
            return {"crs": left.crs.to_string() if left.crs else None,
                    "transform": tuple(left.transform), "width": left.width,
                    "height": left.height, "band_count": left.count,
                    "threshold": threshold, "bands": stats}
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"unable to compare rasters: {exc}") from exc


def raster_zonal_statistics(path: str | Path, zones: dict[str, Any], zones_crs: str,
                            band: int = 1, max_pixels: int = 2_000_000,
                            all_touched: bool = False) -> dict[str, Any]:
    """Summarize one raster band inside polygon zones using pixel-window reads.

    Pixels are included when their centers fall inside each zone by default;
    ``all_touched=True`` includes every pixel touched by a zone boundary. The
    total area of raster windows read across all zones is bounded by max_pixels.
    """
    if not isinstance(max_pixels, int) or max_pixels <= 0:
        raise ValueError("max_pixels must be a positive integer")
    if not isinstance(band, int) or band <= 0:
        raise ValueError("band must be a positive integer")
    if not isinstance(zones_crs, str) or not zones_crs.strip():
        raise ValueError("zones CRS is required; CRS will not be guessed")
    if not isinstance(zones, dict) or zones.get("type") != "FeatureCollection":
        raise ValueError("zones must be a GeoJSON FeatureCollection")
    features = zones.get("features")
    if not isinstance(features, list) or not features:
        raise ValueError("zones FeatureCollection must contain at least one polygon feature")

    try:
        zone_crs = CRS.from_user_input(zones_crs)
    except Exception as exc:
        raise ValueError(f"Invalid zones CRS: {zones_crs!r}") from exc

    parsed_zones = []
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError(f"zones feature {index} is malformed")
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            raise ValueError(f"zones feature {index} has malformed geometry")
        try:
            geom = shape(geometry)
            coords = get_coordinates(geom)
        except Exception as exc:
            raise ValueError(f"zones feature {index} has malformed geometry") from exc
        if geom.geom_type not in {"Polygon", "MultiPolygon"}:
            raise ValueError(f"zones feature {index} must be a Polygon or MultiPolygon")
        if geom.is_empty or not geom.is_valid or not len(coords) or not np.isfinite(coords[:, :2]).all():
            raise ValueError(f"zones feature {index} has invalid or non-finite geometry")
        properties = feature.get("properties", {})
        if properties is None:
            properties = {}
        if not isinstance(properties, dict):
            raise ValueError(f"zones feature {index} properties must be an object")
        parsed_zones.append((index, geom, properties))

    path = Path(path)
    if not path.is_file():
        raise ValueError(f"raster path does not exist or is not a file: {path}")
    try:
        with rasterio.open(path) as dataset:
            if dataset.crs is None:
                raise ValueError("raster has no CRS; zonal statistics requires an explicit raster CRS")
            if band > dataset.count:
                raise ValueError(f"band must be between 1 and {dataset.count}")
            transformer = None if zone_crs.equals(dataset.crs) else Transformer.from_crs(
                zone_crs, dataset.crs, always_xy=True
            )
            summaries = []
            pixels_read = 0
            for index, geom, properties in parsed_zones:
                if transformer is not None:
                    geom = project_geometry(geom, transformer.transform, interleaved=False)
                    coords = get_coordinates(geom)
                    if geom.is_empty or not geom.is_valid or not len(coords) or not np.isfinite(coords[:, :2]).all():
                        raise ValueError(f"zones feature {index} becomes invalid when transformed to raster CRS")
                count, mean, m2, low, high, total_sum = 0, 0.0, 0.0, None, None, 0.0
                try:
                    window = geometry_window(dataset, [mapping(geom)])
                except WindowError:
                    window = None
                if window is not None:
                    window_pixels = int(window.width) * int(window.height)
                    pixels_read += window_pixels
                    if pixels_read > max_pixels:
                        raise ValueError(
                            f"zonal raster windows contain {pixels_read} pixels, exceeding max_pixels={max_pixels}"
                        )
                    raster_values = dataset.read(band, window=window, masked=True)
                    inside = geometry_mask(
                        [mapping(geom)],
                        out_shape=(int(window.height), int(window.width)),
                        transform=dataset.window_transform(window),
                        all_touched=all_touched,
                        invert=True,
                    )
                    valid = inside & ~np.ma.getmaskarray(raster_values)
                    raw = np.asarray(raster_values.data, dtype="float64")
                    valid &= np.isfinite(raw)
                    values = raw[valid]
                    count, mean, m2, low, high = _merge_moments(count, mean, m2, low, high, values)
                    if values.size:
                        total_sum = float(values.sum(dtype="float64"))
                summaries.append({
                    "zone_index": index,
                    "properties": properties,
                    "valid_pixel_count": count,
                    "min": low,
                    "max": high,
                    "mean": mean if count else None,
                    "sum": total_sum if count else None,
                    "std": float(np.sqrt(max(0.0, m2 / count))) if count else None,
                })
            return {
                "crs": dataset.crs.to_string(),
                "zones_crs": zone_crs.to_string(),
                "band": band,
                "all_touched": all_touched,
                "window_pixels_read": pixels_read,
                "zones": summaries,
            }
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"unable to calculate raster zonal statistics: {exc}") from exc
