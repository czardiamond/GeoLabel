import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin

from backend.asset_storage import inspect_and_preview


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
    assert result["preview_path"].is_file()
    with Image.open(result["preview_path"]) as preview:
        pixels = np.asarray(preview.convert("RGB"))

    assert pixels.shape == (height, width, 3)
    assert np.ptp(pixels[:, :, 0]) > 0
    assert np.ptp(pixels[:, :, 1]) > 0
    assert np.count_nonzero(pixels[:, :, 2]) == 0
