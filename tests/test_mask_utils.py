import base64
from io import BytesIO

from PIL import Image
import pytest
from shapely.geometry import shape

from backend.mask_utils import MAX_MASK_PIXELS, polygonize_png_mask, polygonize_sparse_mask


def _mask_png(width, height, painted):
    image = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    for x, y in painted:
        image.putpixel((x, y), (255, 255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _mask(data, width, height):
    return {"version": 1, "encoding": "image/png;base64", "width": width, "height": height, "data": data}


def test_polygonizes_exact_pixel_edges_in_asset_crs():
    geometry = polygonize_png_mask(
        _mask(_mask_png(3, 2, {(0, 0), (1, 0), (1, 1)}), 3, 2),
        expected_width=3, expected_height=2,
        affine_transform=[2, 0, 10, 0, -3, 20], bounds=[10, 14, 16, 20],
        source_crs="EPSG:4326", target_crs="EPSG:4326",
    )
    assert geometry["type"] == "Polygon"
    assert shape(geometry).bounds == (10.0, 14.0, 14.0, 20.0)
    assert len(geometry["coordinates"][0]) == 7


def test_polygonizes_rotated_affine_and_reprojects_to_task_crs():
    geometry = polygonize_png_mask(
        _mask(_mask_png(2, 2, {(0, 0)}), 2, 2),
        expected_width=2, expected_height=2,
        affine_transform=[2, 0.5, 10, 0.25, -3, 20], bounds=[10, 14, 15, 20],
        source_crs="EPSG:4326", target_crs="EPSG:3857",
    )
    assert geometry["type"] == "Polygon"
    assert shape(geometry).bounds[2] > 1_000_000
    assert shape(geometry).bounds[3] > 2_000_000


def test_rejects_wrong_dimensions_invalid_encoding_and_empty_mask():
    good = _mask(_mask_png(2, 2, {(0, 0)}), 2, 2)
    args = dict(expected_width=2, expected_height=2, affine_transform=[1, 0, 0, 0, -1, 2],
                bounds=[0, 0, 2, 2], source_crs="EPSG:4326", target_crs="EPSG:4326")
    with pytest.raises(ValueError, match="dimensions"):
        polygonize_png_mask({**good, "width": 3}, **args)
    with pytest.raises(ValueError, match="base64"):
        polygonize_png_mask({**good, "data": "not base64"}, **args)
    with pytest.raises(ValueError, match="no painted pixels"):
        polygonize_png_mask(_mask(_mask_png(2, 2, set()), 2, 2), **args)


def test_polygonizes_sparse_runs_on_10980_square_raster_without_dense_decode():
    width = height = 10_980
    mask = {"version": 2, "encoding": "application/vnd.geolabel.pixel-runs+json",
            "width": width, "height": height,
            "rows": [[10_978, 10_978, 10_980], [10_979, 10_978, 10_980]]}
    geometry = polygonize_sparse_mask(
        mask, expected_width=width, expected_height=height,
        affine_transform=[2, 0, 10, 0, -3, 32_940], bounds=None,
        source_crs="EPSG:3857", target_crs="EPSG:3857",
    )
    result = shape(geometry)
    assert geometry["type"] == "Polygon"
    assert result.bounds == (21_966, 0, 21_970, 6)
    assert result.area == 24


def test_sparse_polygonizer_dissolves_a_region_across_internal_tile_seams():
    mask = {"version": 2, "encoding": "application/vnd.geolabel.pixel-runs+json",
            "width": 600, "height": 400, "rows": [[255, 250, 260], [256, 250, 260]]}
    geometry = polygonize_sparse_mask(
        mask, expected_width=600, expected_height=400,
        affine_transform=[2, 0.5, 10, 0.25, -3, 20], bounds=None,
        source_crs="EPSG:4326", target_crs="EPSG:4326",
    )
    assert geometry["type"] == "Polygon"
    assert shape(geometry).area == pytest.approx(20 * abs(2 * -3 - 0.5 * 0.25))


def test_sparse_polygonizer_rejects_noncanonical_or_out_of_bounds_runs():
    valid = {"version": 2, "encoding": "application/vnd.geolabel.pixel-runs+json",
             "width": 8, "height": 8, "rows": [[2, 1, 3]]}
    args = dict(expected_width=8, expected_height=8, affine_transform=[1, 0, 0, 0, -1, 8],
                bounds=None, source_crs="EPSG:4326", target_crs="EPSG:4326")
    with pytest.raises(ValueError, match="sorted"):
        polygonize_sparse_mask({**valid, "rows": [[2, 1, 4], [2, 3, 5]]}, **args)
    with pytest.raises(ValueError, match="in bounds"):
        polygonize_sparse_mask({**valid, "rows": [[8, 1, 3]]}, **args)
    with pytest.raises(ValueError, match="dimensions"):
        polygonize_sparse_mask({**valid, "width": 9}, **args)
    over_area = {"version": 2, "encoding": "application/vnd.geolabel.pixel-runs+json",
                 "width": 50_000, "height": 501,
                 "rows": [[row, 0, 50_000] for row in range(501)]}
    with pytest.raises(ValueError, match="painted-pixel processing limit"):
        polygonize_sparse_mask(over_area, expected_width=50_000, expected_height=501,
                               affine_transform=[1, 0, 0, 0, -1, 501], bounds=None,
                               source_crs="EPSG:4326", target_crs="EPSG:4326")


def test_rejects_pixel_and_png_size_limits():
    with pytest.raises(ValueError, match="processing limit"):
        polygonize_png_mask(
            {"version": 1, "encoding": "image/png;base64", "width": MAX_MASK_PIXELS + 1,
             "height": 1, "data": "AA=="},
            expected_width=MAX_MASK_PIXELS + 1, expected_height=1,
            affine_transform=[1, 0, 0, 0, -1, 1], bounds=[0, 0, MAX_MASK_PIXELS + 1, 1],
            source_crs="EPSG:4326", target_crs="EPSG:4326",
        )
