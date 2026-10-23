"""Private local asset storage and geospatial image inspection helpers."""
import json
import math
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError
import pyproj

from backend.config import settings

IMAGE_TYPES = {"image/tiff", "image/geotiff", "image/png", "image/jpeg", "image/webp", "image/bmp"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_PREVIEW_EDGE = 1600


def storage_root() -> Path:
    root = Path(settings.ASSET_STORAGE_DIR).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_filename(name: str) -> str:
    base = Path(name or "upload").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    return (cleaned or "upload")[:180]


def parse_bounds(value: str | None) -> list[float] | None:
    if not value:
        return None
    try:
        raw: Any = json.loads(value)
    except json.JSONDecodeError:
        raw = [part.strip() for part in value.split(",")]
    if isinstance(raw, dict):
        raw = [raw.get(key) for key in ("xmin", "ymin", "xmax", "ymax")]
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        raise ValueError("bounds must be [xmin, ymin, xmax, ymax] or a four-value comma-separated string")
    try:
        bounds = [float(item) for item in raw]
    except (TypeError, ValueError) as exc:
        raise ValueError("bounds values must be numeric") from exc
    if not all(math.isfinite(item) for item in bounds):
        raise ValueError("bounds values must be finite")
    if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
        raise ValueError("bounds must have xmin < xmax and ymin < ymax")
    return bounds


def parse_world_file(value: str, width: int, height: int) -> tuple[list[float], list[float]]:
    """Return axis-aligned bounds and the six standard A,D,B,E,C,F coefficients."""
    try:
        coefficients = [float(line.strip()) for line in value.splitlines() if line.strip()]
    except ValueError as exc:
        raise ValueError("world file must contain six numeric A,D,B,E,C,F coefficients") from exc
    if len(coefficients) != 6 or not all(math.isfinite(item) for item in coefficients):
        raise ValueError("world file must contain six finite numeric A,D,B,E,C,F coefficients")
    a, d, b, e, c, f = coefficients
    if width <= 0 or height <= 0 or abs(a * e - b * d) < 1e-15:
        raise ValueError("world file has invalid image dimensions or a singular affine transform")
    corners = [
        (a * col + b * row + c, d * col + e * row + f)
        for col, row in ((-0.5, -0.5), (width - 0.5, -0.5),
                         (width - 0.5, height - 0.5), (-0.5, height - 0.5))
    ]
    bounds = [min(x for x, _ in corners), min(y for _, y in corners),
              max(x for x, _ in corners), max(y for _, y in corners)]
    if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
        raise ValueError("world file affine transform produced invalid image bounds")
    return bounds, coefficients


def normalize_crs(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    try:
        return pyproj.CRS.from_user_input(value).to_string()
    except Exception as exc:
        raise ValueError("crs must identify a valid coordinate reference system") from exc


def _is_tiff(path: Path, content_type: str, filename: str) -> bool:
    return content_type in {"image/tiff", "image/geotiff"} or Path(filename).suffix.lower() in {".tif", ".tiff", ".cog"}


def _raster_preview(path: Path, output: Path) -> tuple[int, int, str | None, list[float] | None, list[float]]:
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling

    with rasterio.open(path) as dataset:
        width, height = dataset.width, dataset.height
        if width <= 0 or height <= 0 or dataset.count <= 0:
            raise ValueError("The raster contains no readable pixels")
        scale = min(1.0, MAX_PREVIEW_EDGE / max(width, height))
        out_width = max(1, round(width * scale))
        out_height = max(1, round(height * scale))
        indexes = [1, 2, 3] if dataset.count >= 3 else [1]
        bands = dataset.read(indexes, out_shape=(len(indexes), out_height, out_width), resampling=Resampling.average, masked=True)
        image_bands = []
        for band in bands:
            values = np.asarray(band.filled(np.nan), dtype=np.float32)
            finite = values[np.isfinite(values)]
            if not finite.size:
                image_bands.append(np.zeros(values.shape, dtype=np.uint8))
                continue
            low, high = np.nanpercentile(finite, [2, 98])
            if not math.isfinite(float(low)) or not math.isfinite(float(high)) or high <= low:
                low, high = float(np.nanmin(finite)), float(np.nanmax(finite))
            if high <= low:
                high = low + 1.0
            scaled = (np.nan_to_num(values, nan=low) - low) * (255.0 / (high - low))
            image_bands.append(np.clip(scaled, 0, 255).astype(np.uint8))
        if len(image_bands) == 1:
            preview = Image.fromarray(image_bands[0], mode="L").convert("RGB")
        else:
            preview = Image.fromarray(np.stack(image_bands[:3], axis=-1), mode="RGB")
        preview.save(output, format="PNG", optimize=True)
        crs = dataset.crs.to_string() if dataset.crs else None
        bounds = [float(dataset.bounds.left), float(dataset.bounds.bottom), float(dataset.bounds.right), float(dataset.bounds.top)]
        if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
            bounds = None
        transform = [float(value) for value in dataset.transform[:6]]
        return width, height, crs, bounds, transform


def inspect_and_preview(path: Path, filename: str, content_type: str, crs_value: str | None,
                        bounds_value: str | None, world_file_value: str | None = None) -> dict:
    """Validate file bytes and return persisted metadata plus an optional preview path."""
    declared = (content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream").lower().split(";")[0].strip()
    supplied_crs = normalize_crs(crs_value)
    supplied_bounds = parse_bounds(bounds_value)
    preview_path = path.with_name(f"{path.stem}_preview.png")

    if declared in VIDEO_TYPES or Path(filename).suffix.lower() in {".mp4", ".webm", ".mov"}:
        if declared not in VIDEO_TYPES and Path(filename).suffix.lower() not in {".mp4", ".webm", ".mov"}:
            raise ValueError("Unsupported video format")
        with path.open("rb") as source:
            header = source.read(32)
        suffix = Path(filename).suffix.lower()
        if suffix == ".webm" or declared == "video/webm":
            if not header.startswith(bytes.fromhex("1a45dfa3")):
                raise ValueError("The WebM upload does not have a valid EBML container signature")
        elif b"ftyp" not in header[4:16]:
            raise ValueError("The MP4/MOV upload does not have a valid ISO Base Media container signature")
        duration_ms = None
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                check=True, capture_output=True, text=True, timeout=12,
            )
            duration_seconds = float(json.loads(probe.stdout)["format"]["duration"])
            if math.isfinite(duration_seconds) and duration_seconds > 0:
                duration_ms = int(round(duration_seconds * 1000))
        except FileNotFoundError:
            pass  # Browser-native duration remains available; deployment may opt to install ffprobe.
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("The uploaded video container could not be probed") from exc
        return {
            "kind": "video", "content_type": declared if declared in VIDEO_TYPES else mimetypes.guess_type(filename)[0] or "video/mp4",
            "width": None, "height": None, "crs": supplied_crs, "bounds": supplied_bounds,
            "preview_path": None, "metadata": {"temporal_annotations": "video_segments", "duration_ms": duration_ms},
        }

    if declared not in IMAGE_TYPES and Path(filename).suffix.lower() not in {".tif", ".tiff", ".cog", ".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        raise ValueError("Supported uploads are GeoTIFF, PNG, JPEG, WebP, BMP, MP4, WebM, and MOV")

    if _is_tiff(path, declared, filename):
        if world_file_value:
            raise ValueError("GeoTIFF uploads use their embedded affine transform; sidecar world files are supported only for ordinary images")
        try:
            width, height, raster_crs, raster_bounds, affine_transform = _raster_preview(path, preview_path)
        except Exception as exc:
            preview_path.unlink(missing_ok=True)
            raise ValueError(f"The GeoTIFF could not be decoded: {exc}") from exc
        final_crs = raster_crs or supplied_crs
        final_bounds = raster_bounds or supplied_bounds
        if not final_crs or not final_bounds:
            preview_path.unlink(missing_ok=True)
            raise ValueError("This TIFF lacks a georeference; supply both crs and bounds to place it on the map")
        if raster_crs and supplied_crs and pyproj.CRS.from_user_input(raster_crs) != pyproj.CRS.from_user_input(supplied_crs):
            preview_path.unlink(missing_ok=True)
            raise ValueError("The supplied CRS conflicts with the GeoTIFF's embedded CRS")
        if raster_bounds and supplied_bounds and any(abs(a - b) > max(1e-8, abs(a) * 1e-8) for a, b in zip(raster_bounds, supplied_bounds)):
            preview_path.unlink(missing_ok=True)
            raise ValueError("The supplied bounds conflict with the GeoTIFF's embedded bounds")
        return {"kind": "image", "content_type": "image/tiff", "width": width, "height": height,
                "crs": final_crs, "bounds": final_bounds, "preview_path": preview_path,
                "metadata": {"driver": "GeoTIFF", "bands": "raster", "affine_transform": affine_transform}}

    try:
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            width, height = image.size
            if width <= 0 or height <= 0:
                raise ValueError("The image has invalid dimensions")
            image.thumbnail((MAX_PREVIEW_EDGE, MAX_PREVIEW_EDGE), Image.Resampling.LANCZOS)
            image.save(preview_path, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("The upload is not a readable image") from exc
    world_bounds = None
    world_coefficients = None
    if world_file_value:
        world_bounds, world_coefficients = parse_world_file(world_file_value, width, height)
        if supplied_bounds and any(abs(a - b) > max(1e-8, abs(a) * 1e-8) for a, b in zip(supplied_bounds, world_bounds)):
            preview_path.unlink(missing_ok=True)
            raise ValueError("The supplied bounds conflict with the uploaded world file")
    final_bounds = world_bounds or supplied_bounds
    if not supplied_crs or not final_bounds:
        preview_path.unlink(missing_ok=True)
        raise ValueError("An ordinary image requires a CRS and either explicit bounds or a valid six-line world file; coordinates are never guessed")
    metadata = {"georeference": "world_file" if world_file_value else "explicit_bounds"}
    if world_coefficients:
        metadata["world_file_coefficients"] = world_coefficients
        a, d, b, e, c, f = world_coefficients
        metadata["affine_transform"] = [a, b, c - 0.5 * (a + b), d, e, f - 0.5 * (d + e)]
    else:
        xmin, ymin, xmax, ymax = final_bounds
        metadata["affine_transform"] = [(xmax - xmin) / width, 0.0, xmin,
                                        0.0, -(ymax - ymin) / height, ymax]
    return {"kind": "image", "content_type": declared, "width": width, "height": height,
            "crs": supplied_crs, "bounds": final_bounds, "preview_path": preview_path,
            "metadata": metadata}


def make_storage_paths(organization_id: str, asset_id: str, filename: str) -> tuple[Path, str]:
    safe = safe_filename(filename)
    directory = storage_root() / organization_id / asset_id
    directory.mkdir(parents=True, exist_ok=False)
    target = directory / f"original_{safe}"
    relative = target.relative_to(storage_root()).as_posix()
    return target, relative


def resolve_storage_key(key: str) -> Path:
    root = storage_root()
    path = (root / key).resolve()
    if root != path and root not in path.parents:
        raise ValueError("Invalid internal storage key")
    return path


def save_temp_asset(source: Path, organization_id: str, asset_id: str, filename: str, preview_path: Path | None) -> tuple[str, str | None]:
    target, storage_key = make_storage_paths(organization_id, asset_id, filename)
    shutil.move(str(source), str(target))
    preview_key = None
    if preview_path and preview_path.exists():
        preview_target = target.parent / "preview.png"
        shutil.move(str(preview_path), str(preview_target))
        preview_key = preview_target.relative_to(storage_root()).as_posix()
    return storage_key, preview_key


def new_temp_path() -> Path:
    temp_dir = storage_root() / ".incoming"
    temp_dir.mkdir(parents=True, exist_ok=True)
    return temp_dir / f"{uuid.uuid4().hex}.upload"
