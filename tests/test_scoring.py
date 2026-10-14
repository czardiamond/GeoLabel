from backend.geo_utils import reproject_feature_collection
from backend.scoring import (
    build_consensus_geojson,
    calculate_cohens_kappa,
    compute_iou,
)


def polygon(x, category):
    return {
        "type": "Feature",
        "properties": {"category": category},
        "geometry": {
            "type": "Polygon",
            "coordinates":[[[x, 0], [x + 0.001, 0], [x + 0.001, 0.001], [x, 0.001], [x, 0]]],
        },
    }


def annotation(features):
    return {"annotator_id": "test", "geojson": {"type": "FeatureCollection", "features": features}}


def test_geographic_geometry_iou_uses_meter_projection():
    geom = polygon(0, "building")["geometry"]
    assert compute_iou(geom, geom, crs="EPSG:4326") == 1.0


def test_kappa_preserves_negative_agreement():
    first = [polygon(0, "x"), polygon(0.01, "x"), polygon(0.02, "y")]
    second = [polygon(0, "y"), polygon(0.01, "y"), polygon(0.02, "x")]
    score = calculate_cohens_kappa(
        [annotation(first), annotation(second)],
        taxonomy=["x", "y"],
        crs="EPSG:4326",
    )
    assert score < 0


def test_consensus_requires_majority_support_and_uses_majority_class():
    first = [polygon(0, "building"), polygon(0.02, "road")]
    second = [polygon(0, "building")]
    third = [polygon(0, "road")]
    result = build_consensus_geojson(
        [annotation(first), annotation(second), annotation(third)],
        iaa_score=0.4,
        crs="EPSG:4326",
    )
    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 1
    properties = result["features"][0]["properties"]
    assert properties["category"] == "building"
    assert properties["annotator_support"] == 3
    assert properties["verification_status"] == "agreement_supported"


def test_geojson_coordinates_are_reprojected_to_task_crs():
    source = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": [{
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "Point", "coordinates": [1, 1]},
        }],
    }
    result = reproject_feature_collection(source, "EPSG:3857")
    x, y = result["features"][0]["geometry"]["coordinates"]
    assert abs(x - 111319.49) < 1
    assert abs(y - 111325.14) < 1
    assert result["crs"]["properties"]["name"] == "EPSG:3857"
