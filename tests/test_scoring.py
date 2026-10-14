from backend.geo_utils import reproject_feature_collection
from backend.scoring import (
    _greedy_global_match,
    build_consensus_geojson,
    calculate_cohens_kappa,
    compute_iou,
    scoring_configuration,
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


def test_scorer_exposes_versioned_explicit_configuration():
    config = scoring_configuration()
    assert config["version"].startswith("geolabel-heuristic-")
    assert config["iou_threshold"] == 0.5
    assert config["consensus_support"] == "strict_majority"
    assert config["tie_break"]


def test_consensus_tie_is_stable_and_does_not_fabricate_a_majority():
    rows = [
        {"annotator_id": "a", "geojson": {"type": "FeatureCollection", "features": [polygon(0, "road")]}},
        {"annotator_id": "b", "geojson": {"type": "FeatureCollection", "features": [polygon(0, "building")]}},
        {"annotator_id": "c", "geojson": {"type": "FeatureCollection", "features": [polygon(0, "road")]}},
        {"annotator_id": "d", "geojson": {"type": "FeatureCollection", "features": [polygon(0, "building")]}},
    ]
    first = build_consensus_geojson(rows, iaa_score=0.0, crs="EPSG:4326")
    second = build_consensus_geojson(list(reversed(rows)), iaa_score=0.0, crs="EPSG:4326")
    assert first == second
    assert first["features"] == []


def test_equal_score_matching_uses_stable_index_tie_break():
    candidates = [(0.8, 1, 1), (0.8, 0, 1), (0.8, 0, 0)]
    assert _greedy_global_match(candidates) == [(0, 0), (1, 1)]
