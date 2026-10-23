"""Local tests for backend.gis_operations."""
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from backend.gis_operations import raster_band_statistics, raster_change_analysis, spatial_join


def fc(features):
    return {"type": "FeatureCollection", "features": features}


def feature(geometry, properties):
    return {"type": "Feature", "geometry": geometry, "properties": properties}


def polygon(x0, y0, x1, y1):
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def write_raster(path: Path, values, *, crs="EPSG:3857", transform=None, nodata=-9999):
    values = np.asarray(values, dtype="float32")
    with rasterio.open(path, "w", driver="GTiff", width=values.shape[1], height=values.shape[0],
                       count=1, dtype="float32", crs=crs, transform=transform or from_origin(0, 3, 1, 1),
                       nodata=nodata) as dst:
        dst.write(values, 1)


def test_spatial_join_reprojects_target_and_keeps_properties():
    source = fc([feature(polygon(0, 0, 2, 2), {"name": "source"})])
    # A small WGS84 polygon around the origin, transformed into Web Mercator.
    target = fc([feature(polygon(-0.0001, -0.0001, 0.0001, 0.0001), {"id": 7})])
    matches = spatial_join(source, target, "EPSG:3857", "EPSG:4326", "intersects")
    assert matches == [{"source_index": 0, "target_index": 0,
                        "source_properties": {"name": "source"}, "target_properties": {"id": 7}}]


def test_spatial_join_rejects_missing_crs_and_malformed_geometry():
    valid = fc([feature(polygon(0, 0, 1, 1), {})])
    with pytest.raises(ValueError, match="CRS"):
        spatial_join(valid, valid, "", "EPSG:4326")
    malformed = fc([feature({"type": "Polygon", "coordinates": []}, {})])
    with pytest.raises(ValueError, match="geometry"):
        spatial_join(malformed, valid, "EPSG:4326", "EPSG:4326")


def test_raster_statistics_exclude_nodata_and_report_limits(tmp_path):
    path = tmp_path / "stats.tif"
    write_raster(path, [[1, 2], [-9999, np.nan]])
    result = raster_band_statistics(path)
    band = result["bands"][0]
    assert result["width"] == result["height"] == 2
    assert band["valid_pixel_count"] == 2
    assert band["min"] == 1.0 and band["max"] == 2.0 and band["mean"] == 1.5
    with pytest.raises(ValueError, match="max_pixels"):
        raster_band_statistics(path, max_pixels=3)


def test_change_analysis_exact_grid_and_threshold(tmp_path):
    transform = from_origin(10, 14, 2, 2)
    left, right = tmp_path / "left.tif", tmp_path / "right.tif"
    write_raster(left, [[1, 2], [3, 4]], transform=transform)
    write_raster(right, [[1, 5], [3, 0]], transform=transform)
    result = raster_change_analysis(left, right, threshold=1)
    assert result["bands"][0]["valid_pixel_count"] == 4
    assert result["bands"][0]["max"] == 4.0
    assert result["bands"][0]["changed_pixel_count"] == 2
    assert result["bands"][0]["changed_bounds"] is not None


def test_change_analysis_rejects_grid_mismatch_and_limits(tmp_path):
    left, right = tmp_path / "left.tif", tmp_path / "right.tif"
    write_raster(left, [[1, 2], [3, 4]])
    write_raster(right, [[1, 2], [3, 4]], transform=from_origin(1, 3, 1, 1))
    with pytest.raises(ValueError, match="grid mismatch"):
        raster_change_analysis(left, right)
    with pytest.raises(ValueError, match="max_pixels"):
        raster_change_analysis(left, left, max_pixels=3)
