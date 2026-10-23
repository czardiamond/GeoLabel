import pytest

from backend.asset_storage import parse_world_file


def test_world_file_uses_pixel_center_affine_for_footprint():
    bounds, coefficients = parse_world_file("2\n0\n0\n-2\n101\n199\n", width=8, height=8)
    assert bounds == [100.0, 184.0, 116.0, 200.0]
    assert coefficients == [2.0, 0.0, 0.0, -2.0, 101.0, 199.0]


def test_rotated_world_file_returns_axis_aligned_envelope():
    bounds, _ = parse_world_file("1\n1\n-1\n1\n0\n0\n", width=2, height=2)
    assert bounds[0] < bounds[2] and bounds[1] < bounds[3]


@pytest.mark.parametrize("contents", ["1\n2\n3", "1\n0\n0\n-1\n0\ninf", "1\n1\n1\n1\n0\n0"])
def test_world_file_rejects_incomplete_nonfinite_or_singular_affines(contents):
    with pytest.raises(ValueError):
        parse_world_file(contents, width=8, height=8)
