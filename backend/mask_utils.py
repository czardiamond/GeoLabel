"""Validated raster-mask decoding and georeferenced pixel-footprint polygonization."""
from __future__ import annotations

import base64
import binascii
from collections import defaultdict
from io import BytesIO
import math
from typing import Any

from affine import Affine
from PIL import Image, UnidentifiedImageError
import numpy as np
import pyproj
from rasterio.features import shapes
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

MAX_MASK_PIXELS = 8_000_000
MAX_MASK_PNG_BYTES = 2_000_000
MAX_SPARSE_MASK_PIXELS = 500_000_000
MAX_SPARSE_MASK_EDGE = 100_000
MAX_SPARSE_MASK_PAINTED_PIXELS = 25_000_000
MAX_SPARSE_SUBMISSION_PAINTED_PIXELS = 50_000_000
MAX_SPARSE_MASK_RUNS = 250_000
MAX_SPARSE_MASK_BYTES = 2_000_000
MAX_MASK_POLYGONS = 10_000
SPARSE_POLYGONIZE_TILE_SIZE = 256


def _transform_coordinates(value: Any, transformer: pyproj.Transformer) -> Any:
    if not isinstance(value, (list, tuple)):
        return value
    if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        x, y = transformer.transform(float(value[0]), float(value[1]))
        return [x, y, *value[2:]]
    return [_transform_coordinates(item, transformer) for item in value]


def _affine_transform(value: list[float] | tuple[float, ...] | None,
                      width: int, height: int,
                      bounds: list[float] | tuple[float, ...] | None) -> Affine:
    if value is not None:
        if len(value) != 6 or not all(math.isfinite(float(item)) for item in value):
            raise ValueError("asset affine transform must contain six finite coefficients")
        a, b, c, d, e, f = (float(item) for item in value)
        if abs(a * e - b * d) < 1e-15:
            raise ValueError("asset affine transform is singular")
        return Affine(a, b, c, d, e, f)
    if bounds is None or len(bounds) != 4:
        raise ValueError("asset has no usable affine transform or georeferenced bounds")
    xmin, ymin, xmax, ymax = (float(item) for item in bounds)
    if not all(math.isfinite(item) for item in (xmin, ymin, xmax, ymax)) or xmin >= xmax or ymin >= ymax:
        raise ValueError("asset bounds are invalid for pixel-mask polygonization")
    return Affine((xmax - xmin) / width, 0, xmin, 0, -(ymax - ymin) / height, ymax)


def polygonize_sparse_mask(mask: dict[str, Any], *, expected_width: int, expected_height: int,
                           affine_transform: list[float] | tuple[float, ...] | None,
                           bounds: list[float] | tuple[float, ...] | None,
                           source_crs: str, target_crs: str) -> dict[str, Any]:
    """Polygonize [row, start, end) runs with temporary arrays limited to 256×256."""
    if (not isinstance(mask, dict) or mask.get("version") != 2
            or mask.get("encoding") != "application/vnd.geolabel.pixel-runs+json"):
        raise ValueError("raster_mask must use GeoLabel sparse pixel-run encoding version 2")
    width, height = mask.get("width"), mask.get("height")
    if (isinstance(width, bool) or isinstance(height, bool) or not isinstance(width, int)
            or not isinstance(height, int) or width != expected_width or height != expected_height
            or width <= 0 or height <= 0):
        raise ValueError("raster_mask dimensions must exactly match the source asset pixels")
    if width > MAX_SPARSE_MASK_EDGE or height > MAX_SPARSE_MASK_EDGE or width * height > MAX_SPARSE_MASK_PIXELS:
        raise ValueError(f"raster_mask exceeds the {MAX_SPARSE_MASK_PIXELS}-pixel sparse processing limit")
    try:
        import json
        encoded_size = len(json.dumps(mask, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8"))
    except (TypeError, ValueError, RecursionError) as exc:
        raise ValueError("raster_mask must contain finite JSON-compatible sparse runs") from exc
    if encoded_size > MAX_SPARSE_MASK_BYTES:
        raise ValueError(f"raster_mask sparse data must not exceed {MAX_SPARSE_MASK_BYTES} bytes")
    runs = mask.get("rows")
    if not isinstance(runs, list) or not runs or len(runs) > MAX_SPARSE_MASK_RUNS:
        if isinstance(runs, list) and not runs:
            raise ValueError("raster_mask contains no painted pixels")
        raise ValueError(f"raster_mask must contain at most {MAX_SPARSE_MASK_RUNS} sparse pixel runs")

    stripes: dict[int, dict[int, list[tuple[int, int]]]] = defaultdict(dict)
    previous_y, previous_end, painted_pixels = -1, -1, 0
    for run in runs:
        if (not isinstance(run, (list, tuple)) or len(run) != 3
                or any(isinstance(value, bool) or not isinstance(value, int) for value in run)):
            raise ValueError("raster_mask runs must be integer [row, start, end] triples")
        y, start, end = run
        if (y < 0 or y >= height or start < 0 or start >= end or end > width
                or y < previous_y or (y == previous_y and start <= previous_end)):
            raise ValueError("raster_mask runs must be sorted, in bounds, non-overlapping, and non-adjacent")
        painted_pixels += end - start
        if painted_pixels > MAX_SPARSE_MASK_PAINTED_PIXELS:
            raise ValueError(f"raster_mask exceeds the {MAX_SPARSE_MASK_PAINTED_PIXELS}-painted-pixel processing limit")
        stripes[y // SPARSE_POLYGONIZE_TILE_SIZE].setdefault(y, []).append((start, end))
        previous_y, previous_end = y, end

    transform = _affine_transform(affine_transform, width, height, bounds)
    regions = []
    for tile_y, rows in sorted(stripes.items()):
        y0 = tile_y * SPARSE_POLYGONIZE_TILE_SIZE
        tile_height = min(SPARSE_POLYGONIZE_TILE_SIZE, height - y0)
        tile_xs: set[int] = set()
        for intervals in rows.values():
            for start, end in intervals:
                tile_xs.update(range(start // SPARSE_POLYGONIZE_TILE_SIZE,
                                     (end - 1) // SPARSE_POLYGONIZE_TILE_SIZE + 1))
        for tile_x in sorted(tile_xs):
            x0 = tile_x * SPARSE_POLYGONIZE_TILE_SIZE
            tile_width = min(SPARSE_POLYGONIZE_TILE_SIZE, width - x0)
            active = np.zeros((tile_height, tile_width), dtype=np.uint8)
            for y, intervals in rows.items():
                for start, end in intervals:
                    left, right = max(start, x0), min(end, x0 + tile_width)
                    if left < right:
                        active[y - y0, left - x0:right - x0] = 1
            tile_transform = transform @ Affine.translation(x0, y0)
            for geometry, value in shapes(active, mask=active.astype(bool), transform=tile_transform, connectivity=4):
                if int(value) != 1:
                    continue
                if len(regions) >= MAX_MASK_POLYGONS:
                    raise ValueError(f"raster_mask contains more than {MAX_MASK_POLYGONS} disconnected regions")
                regions.append(shape(geometry))
    if not regions:
        raise ValueError("raster_mask could not be polygonized")
    geometry = mapping(unary_union(regions))
    try:
        source = pyproj.CRS.from_user_input(source_crs)
        target = pyproj.CRS.from_user_input(target_crs)
        if source != target:
            transformer = pyproj.Transformer.from_crs(source, target, always_xy=True)
            geometry["coordinates"] = _transform_coordinates(geometry["coordinates"], transformer)
    except Exception as exc:
        raise ValueError(f"raster_mask CRS conversion failed: {exc}") from exc
    return geometry


def polygonize_png_mask(mask: dict[str, Any], *, expected_width: int, expected_height: int,
                         affine_transform: list[float] | tuple[float, ...] | None,
                         bounds: list[float] | tuple[float, ...] | None,
                         source_crs: str, target_crs: str) -> dict[str, Any]:
    """Convert a transparent PNG mask to exact pixel-edge GeoJSON geometry.

    The mask PNG uses its alpha channel as the binary label. Pixels are polygonized
    against the asset's pixel-corner affine transform; the resulting geometry is
    transformed from the asset CRS into the annotation task CRS.
    """
    if not isinstance(mask, dict) or mask.get("encoding") != "image/png;base64" or mask.get("version") != 1:
        raise ValueError("raster_mask must use GeoLabel PNG-mask encoding version 1")
    try:
        width, height = int(mask.get("width")), int(mask.get("height"))
    except (TypeError, ValueError) as exc:
        raise ValueError("raster_mask width and height must be integers") from exc
    if width != expected_width or height != expected_height or width <= 0 or height <= 0:
        raise ValueError("raster_mask dimensions must exactly match the source asset pixels")
    if width * height > MAX_MASK_PIXELS:
        raise ValueError(f"raster_mask exceeds the {MAX_MASK_PIXELS}-pixel processing limit")
    encoded = mask.get("data")
    if not isinstance(encoded, str) or not encoded or len(encoded) > (MAX_MASK_PNG_BYTES * 4 // 3 + 8):
        raise ValueError(f"raster_mask PNG must be present and no larger than {MAX_MASK_PNG_BYTES} bytes")
    try:
        png = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("raster_mask data must be valid base64-encoded PNG bytes") from exc
    if not png or len(png) > MAX_MASK_PNG_BYTES:
        raise ValueError(f"raster_mask PNG must be no larger than {MAX_MASK_PNG_BYTES} bytes")
    try:
        with Image.open(BytesIO(png)) as image:
            if image.format != "PNG" or image.size != (width, height):
                raise ValueError("raster_mask PNG format and dimensions do not match its metadata")
            alpha = np.asarray(image.convert("RGBA"), dtype=np.uint8)[:, :, 3]
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("raster_mask is not a valid PNG image") from exc
    active = alpha > 0
    if not bool(active.any()):
        raise ValueError("raster_mask contains no painted pixels")
    transform = _affine_transform(affine_transform, width, height, bounds)
    regions = []
    for index, (geometry, value) in enumerate(shapes(active.astype(np.uint8), mask=active, transform=transform, connectivity=4)):
        if int(value) != 1:
            continue
        if index >= MAX_MASK_POLYGONS:
            raise ValueError(f"raster_mask contains more than {MAX_MASK_POLYGONS} disconnected regions")
        regions.append(geometry["coordinates"])
    if not regions:
        raise ValueError("raster_mask could not be polygonized")
    if len(regions) == 1:
        geometry = {"type": "Polygon", "coordinates": regions[0]}
    else:
        geometry = {"type": "MultiPolygon", "coordinates": regions}
    try:
        source = pyproj.CRS.from_user_input(source_crs)
        target = pyproj.CRS.from_user_input(target_crs)
        if source != target:
            transformer = pyproj.Transformer.from_crs(source, target, always_xy=True)
            geometry["coordinates"] = _transform_coordinates(geometry["coordinates"], transformer)
    except Exception as exc:
        raise ValueError(f"raster_mask CRS conversion failed: {exc}") from exc
    return geometry
