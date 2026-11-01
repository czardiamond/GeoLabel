from backend.geo_utils import reproject_feature_collection
from backend.scoring import (
    _optimal_global_match,
    build_consensus_geojson,
    calculate_cohens_kappa,
    compute_iou,
    compare_features_to_reference,
    score_reference_agreement,
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
    assert config["version"].startswith("geolabel-reference-agreement-")
    assert config["version"] == "geolabel-reference-agreement-v3"
    assert config["iou_threshold"] == 0.5
    assert config["match_assignment"] == "maximum_cardinality_then_maximum_total_overlap_one_to_one"
    assert config["primary_metric"] == "class_aware_micro_f1"
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


def test_global_matching_prefers_two_valid_pairs_over_one_higher_overlap_pair():
    candidates = [(0.9, 0, 0), (0.8, 0, 1), (0.85, 1, 0)]
    assert _optimal_global_match(candidates) == [(0, 1), (1, 0)]


def test_global_matching_maximizes_total_overlap_after_match_count():
    candidates = [
        (0.8, 0, 0), (0.9, 0, 1),
        (0.7, 1, 0), (0.6, 1, 1),
    ]
    assert _optimal_global_match(candidates) == [(0, 1), (1, 0)]


def test_global_matching_handles_empty_and_rectangular_candidate_sets():
    assert _optimal_global_match([]) == []
    assert _optimal_global_match([(0.7, 5, 9), (0.8, 5, 9)]) == [(5, 9)]
    assert _optimal_global_match([(0.6, 0, 9), (0.9, 1, 9)]) == [(1, 9)]


def test_equal_score_matching_is_deterministic_and_input_order_independent():
    candidates = [(0.8, 1, 1), (0.8, 0, 1), (0.8, 1, 0), (0.8, 0, 0)]
    expected = _optimal_global_match(candidates)
    assert _optimal_global_match(list(reversed(candidates))) == expected
    assert _optimal_global_match(candidates) == expected


def test_reference_metrics_and_diagnostics_use_global_assignment(monkeypatch):
    submitted = [
        {"type": "Feature", "properties": {"category": "x"},
         "geometry": {"type": "Point", "coordinates": [0, 0]}},
        {"type": "Feature", "properties": {"category": "y"},
         "geometry": {"type": "Point", "coordinates": [1, 0]}},
    ]
    reference = [
        {"type": "Feature", "properties": {"category": "y"},
         "geometry": {"type": "Point", "coordinates": [10, 0]}},
        {"type": "Feature", "properties": {"category": "x"},
         "geometry": {"type": "Point", "coordinates": [11, 0]}},
    ]
    overlaps = {
        (0, 10): 0.9, (0, 11): 0.8,
        (1, 10): 0.85, (1, 11): 0.1,
    }

    def fake_iou(geometry_a, geometry_b, **kwargs):
        return overlaps[(geometry_a["coordinates"][0], geometry_b["coordinates"][0])]

    monkeypatch.setattr("backend.scoring.compute_iou", fake_iou)
    score = score_reference_agreement(
        submitted, reference, taxonomy=["x", "y"], crs="EPSG:4326"
    )
    assert score["geometry_matches"] == 2
    assert score["true_positive"] == 2
    assert score["category_mismatches"] == 0
    assert score["f1"] == 1.0
    diagnostics = compare_features_to_reference(submitted, reference, crs="EPSG:4326")
    pairs = sorted(
        (item["feature_index"], item["reference_feature_index"])
        for item in diagnostics if item["status"] == "matched"
    )
    assert pairs == [(0, 1), (1, 0)]


def test_feature_diagnostics_report_category_and_presence_disagreements():
    diagnostics = compare_features_to_reference(
        [polygon(0, "building"), polygon(0.03, "road")],
        [polygon(0, "road"), polygon(0.06, "road")],
        crs="EPSG:4326",
    )
    by_status = {item["status"]: item for item in diagnostics}
    assert by_status["category_mismatch"]["feature_index"] == 0
    assert by_status["category_mismatch"]["reference_feature_index"] == 0
    assert by_status["category_mismatch"]["overlap_score"] == 1.0
    assert by_status["unmatched_submission"]["feature_index"] == 1
    assert by_status["unmatched_reference"]["reference_feature_index"] == 1


def test_feature_diagnostics_preserve_original_indexes_after_canonical_sort():
    diagnostics = compare_features_to_reference(
        [polygon(0.02, "road"), polygon(0, "building")],
        [polygon(0, "building"), polygon(0.02, "road")],
        crs="EPSG:4326",
    )
    pairs = sorted(
        (item["feature_index"], item["reference_feature_index"])
        for item in diagnostics
        if item["status"] == "matched"
    )
    assert pairs == [(0, 1), (1, 0)]


def test_reference_agreement_counts_wrong_category_as_false_positive_and_negative():
    score = score_reference_agreement(
        [polygon(0, "building")],
        [polygon(0, "road")],
        taxonomy=["building", "road"],
        crs="EPSG:4326",
    )
    assert score["geometry_matches"] == 1
    assert score["category_mismatches"] == 1
    assert score["true_positive"] == 0
    assert score["false_positive"] == 1
    assert score["false_negative"] == 1
    assert score["precision"] == 0.0
    assert score["recall"] == 0.0
    assert score["f1"] == 0.0
    assert score["category_accuracy"] == 0.0
    assert score["confusion_matrix"] == [{
        "reference_category": "road", "submission_category": "building", "count": 1,
    }]


def test_reference_agreement_reports_per_class_scores_and_undefined_empty_metrics():
    score = score_reference_agreement(
        [polygon(0, "building"), polygon(0.03, "road")],
        [polygon(0, "building"), polygon(0.06, "road")],
        taxonomy=["building", "road"],
        crs="EPSG:4326",
    )
    assert score["geometry_matches"] == 1
    assert score["mean_matched_overlap"] == 1.0
    assert score["match_score_threshold"] == 0.5
    assert score["true_positive"] == 1
    assert score["false_positive"] == 1
    assert score["false_negative"] == 1
    assert score["f1"] == 0.5
    assert {row["category"]: row["f1"] for row in score["per_class"]} == {
        "building": 1.0, "road": 0.0,
    }

    empty = score_reference_agreement([], [], taxonomy=["building"], crs="EPSG:4326")
    assert empty["precision"] is None
    assert empty["recall"] is None
    assert empty["f1"] is None
    assert empty["macro_f1"] is None

    missing_all = score_reference_agreement([], [polygon(0, "building")], crs="EPSG:4326")
    assert missing_all["precision"] is None
    assert missing_all["recall"] == 0.0
    assert missing_all["f1"] == 0.0
    assert missing_all["false_negative"] == 1
