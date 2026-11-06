from io import BytesIO

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin, Affine
from rasterio.windows import Window

from backend.asset_storage import inspect_and_preview, render_source_window


def test_uint16_geotiff_with_nodata_mask_generates_preview(tmp_path):
    source = tmp_path / "sentinel2_uint16.tif"
    height, width = 12, 16
    bands = np.stack([
        np.arange(1, height * width + 1, dtype=np.uint16).reshape(height, width),
        np.arange(100, 100 + height * width, dtype=np.uint16).reshape(height, width),
        np.zeros((height, width), dtype=np.uint16),
    ])
    bands[0, 0, :] = 0
    bands[1, :, 0] = 0

    with rasterio.open(
        source,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=3,
        dtype="uint16",
        nodata=0,
        crs="EPSG:32631",
        transform=from_origin(500000, 800000, 10, 10),
    ) as dataset:
        dataset.write(bands)

    result = inspect_and_preview(source, source.name, "image/tiff", None, None)

    assert result["width"] == width
    assert result["height"] == height
    assert result["crs"] == "EPSG:32631"
    assert result["metadata"]["band_dtypes"] == ["uint16"] * 3
    assert result["metadata"]["nodata_values"] == [0.0] * 3
    assert len(result["metadata"]["display_minmax"]) == 3
    assert result["preview_path"].is_file()
    with Image.open(result["preview_path"]) as preview:
        pixels = np.asarray(preview.convert("RGB"))

    assert pixels.shape == (height, width, 3)
    assert np.ptp(pixels[:, :, 0]) > 0
    assert np.ptp(pixels[:, :, 1]) > 0
    assert np.count_nonzero(pixels[:, :, 2]) == 0


def test_source_window_reads_true_pixels_from_large_georeferenced_raster(tmp_path):
    source = tmp_path / "large_sparse_scene.tif"
    width = height = 10_980
    x, y, window_size = 10_000, 10_100, 32
    transform = Affine(10, 2, 500_000, 3, -10, 800_000)
    known = np.empty((3, window_size, window_size), dtype=np.uint8)
    known[0] = np.arange(window_size * window_size, dtype=np.uint16).reshape(window_size, window_size) % 254 + 1
    known[1] = 80
    known[2] = 160
    known[:, 17, 16] = [42, 80, 160]

    with rasterio.open(
        source,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=3,
        dtype="uint8",
        nodata=0,
        crs="EPSG:32631",
        transform=transform,
        tiled=True,
        blockxsize=256,
        blockysize=256,
        compress="deflate",
    ) as dataset:
        dataset.write(known, window=Window(x, y, window_size, window_size))

    png = render_source_window(
        source, "image/tiff", x, y, window_size, window_size,
        window_size, window_size, {"display_minmax": [[0, 255], [0, 255], [0, 255]]},
    )
    with Image.open(BytesIO(png)) as rendered:
        pixels = np.asarray(rendered.convert("RGB"))

    assert pixels.shape == (window_size, window_size, 3)
    assert pixels[17, 16].tolist() == [42, 80, 160]
    assert pixels[0, 0].tolist() == known[:, 0, 0].tolist()
    with rasterio.open(source) as dataset:
        window_transform = dataset.window_transform(Window(x, y, window_size, window_size))
        source_pixel = dataset.transform @ (x + 16.5, y + 17.5)
        window_pixel = window_transform @ (16.5, 17.5)
        assert window_pixel == source_pixel
