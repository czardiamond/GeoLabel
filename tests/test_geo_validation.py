import pytest

from backend.geo_validation import validate_geojson_collection


def feature(geometry, properties=None, feature_id=None):
    result = {"type": "Feature", "geometry": geometry, "properties": properties or {}}
    if feature_id is not None:
        result["id"] = feature_id
    return result


def collection(*features):
    return {"type": "FeatureCollection", "features": list(features)}


def test_valid_polygon_passes_with_explicit_crs_and_required_fields():
    result = validate_geojson_collection(
        collection(feature(
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            {"class": "building"},
            "building-1",
        )),
        "EPSG:4326",
        ["class"],
    )
    assert result["valid"] is True
    assert result["feature_count"] == 1
    assert result["coordinate_count"] == 5
    assert result["geometry_counts"] == {"Polygon": 1}
    assert "semantic annotation correctness" in result["accuracy_note"]


def test_bowtie_polygon_and_missing_required_property_are_reported_per_feature():
    result = validate_geojson_collection(
        collection(feature(
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]},
            {},
        )),
        "EPSG:4326",
        ["class"],
    )
    codes = {item["code"] for item in result["errors"]}
    assert result["valid"] is False
    assert "topologically_invalid" in codes
    assert "missing_required_field" in codes


def test_open_polygon_ring_is_rejected_even_if_geometry_library_could_repair_it():
    result = validate_geojson_collection(
        collection(feature({"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]] })),
        "EPSG:4326",
    )
    assert result["valid"] is False
    assert any(item["code"] == "invalid_coordinate_structure" for item in result["errors"])


def test_epsg4326_longitude_latitude_range_is_checked():
    result = validate_geojson_collection(
        collection(feature({"type": "Point", "coordinates": [200, 20]})),
        "EPSG:4326",
    )
    assert result["valid"] is False
    assert any(item["code"] == "coordinate_out_of_range" for item in result["errors"])


def test_non_finite_coordinates_and_duplicate_ids_are_reported():
    result = validate_geojson_collection(
        collection(
            feature({"type": "Point", "coordinates": [float("nan"), 0]}, feature_id="same"),
            feature({"type": "Point", "coordinates": [0, 0]}, feature_id="same"),
        ),
        "EPSG:4326",
    )
    codes = {item["code"] for item in result["errors"]}
    assert "non_finite_coordinate" in codes
    assert "duplicate_id" in codes


def test_projected_crs_uses_projected_coordinates_without_lon_lat_checks():
    result = validate_geojson_collection(
        collection(feature({"type": "Point", "coordinates": [500000, 4649776]})),
        "EPSG:32632",
    )
    assert result["valid"] is True
    assert result["crs"] == "EPSG:32632"


@pytest.mark.parametrize("crs", ["", "not-a-crs"])
def test_crs_is_mandatory_and_must_parse(crs):
    with pytest.raises(ValueError, match="crs"):
        validate_geojson_collection(collection(), crs)


def test_feature_limit_is_enforced():
    features = [feature({"type": "Point", "coordinates": [0, 0]}) for _ in range(501)]
    with pytest.raises(ValueError, match="500-feature"):
        validate_geojson_collection(collection(*features), "EPSG:4326")


def test_error_details_are_bounded_but_total_error_count_is_preserved():
    features = [feature({"type": "Point", "coordinates": [0, 0]}) for _ in range(200)]
    result = validate_geojson_collection(collection(*features), "EPSG:4326", [f"field_{i}" for i in range(6)])
    assert result["valid"] is False
    assert result["error_count"] == 1_200
    assert result["errors_truncated"] is True
    assert len(result["errors"]) == 1_000


def test_excessively_nested_coordinates_are_reported_without_recursion_failure():
    coordinates = [0, 0]
    for _ in range(12):
        coordinates = [coordinates]
    result = validate_geojson_collection(
        collection(feature({"type": "Point", "coordinates": coordinates})),
        "EPSG:4326",
    )
    assert result["valid"] is False
    assert any("nesting" in item["message"] for item in result["errors"])


def test_extremely_large_integer_coordinate_is_reported_not_raised():
    result = validate_geojson_collection(
        collection(feature({"type": "Point", "coordinates": [10**400, 0]})),
        "EPSG:4326",
    )
    assert result["valid"] is False
    assert any(item["code"] == "non_finite_coordinate" for item in result["errors"])
