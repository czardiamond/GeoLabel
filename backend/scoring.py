"""CRS-aware spatial matching, inter-annotator agreement, and consensus export."""

from collections import Counter
from typing import Any, Dict, List, Optional, Tuple
import math

from pyproj import CRS, Transformer
from shapely import transform as shapely_transform
from shapely.affinity import scale
from shapely.geometry import Polygon, shape
from shapely.geometry.base import BaseGeometry

DEFAULT_LINE_BUFFER = 0.5
DEFAULT_POINT_DISTANCE_THRESHOLD = 0.5
DEFAULT_IOU_THRESHOLD = 0.5


def _safe_shape(geom_dict: Dict[str, Any]) -> Optional[BaseGeometry]:
    if not isinstance(geom_dict, dict):
        return None
    try:
        geometry = shape(geom_dict)
        if geometry.is_empty:
            return None
        if isinstance(geometry, Polygon) and not geometry.is_valid:
            geometry = geometry.buffer(0)
        return None if geometry.is_empty else geometry
    except Exception:
        return None


def _project_pair_to_meters(
    geom1: BaseGeometry, geom2: BaseGeometry, crs: str
) -> Tuple[BaseGeometry, BaseGeometry]:
    """Project geographic pairs locally or convert projected axes to meters."""
    source = CRS.from_user_input(crs)
    if source.is_geographic:
        center = geom1.union(geom2).centroid
        local = CRS.from_proj4(
            f"+proj=aeqd +lat_0={center.y:.10f} +lon_0={center.x:.10f} "
            "+datum=WGS84 +units=m +no_defs"
        )
        transformer = Transformer.from_crs(source, local, always_xy=True)
        return (
            shapely_transform(geom1, transformer.transform, include_z=geom1.has_z, interleaved=False),
            shapely_transform(geom2, transformer.transform, include_z=geom2.has_z, interleaved=False),
        )
    if source.is_projected:
        factor = source.axis_info[0].unit_conversion_factor if source.axis_info else 1.0
        factor = factor or 1.0
        if math.isclose(factor, 1.0):
            return geom1, geom2
        return (
            scale(geom1, xfact=factor, yfact=factor, origin=(0, 0)),
            scale(geom2, xfact=factor, yfact=factor, origin=(0, 0)),
        )
    raise ValueError("Agreement scoring requires a geographic or projected CRS")


def compute_iou(
    geom1_dict: Dict[str, Any],
    geom2_dict: Dict[str, Any],
    line_buffer: float = DEFAULT_LINE_BUFFER,
    point_distance_threshold: float = DEFAULT_POINT_DISTANCE_THRESHOLD,
    crs: str = "EPSG:3857",
) -> float:
    """Return geometry-aware overlap in [0, 1], with thresholds interpreted in meters."""
    geom1 = _safe_shape(geom1_dict)
    geom2 = _safe_shape(geom2_dict)
    if geom1 is None or geom2 is None:
        return 0.0

    type1, type2 = geom1.geom_type, geom2.geom_type
    is_polygon_pair = type1 in ("Polygon", "MultiPolygon") and type2 in ("Polygon", "MultiPolygon")
    is_line_pair = type1 in ("LineString", "MultiLineString") and type2 in ("LineString", "MultiLineString")
    is_point_pair = type1 in ("Point", "MultiPoint") and type2 in ("Point", "MultiPoint")
    if not (is_polygon_pair or is_line_pair or is_point_pair):
        return 0.0

    try:
        geom1, geom2 = _project_pair_to_meters(geom1, geom2, crs)
        if is_polygon_pair:
            union = geom1.union(geom2).area
            return geom1.intersection(geom2).area / union if union > 0 else 0.0
        if is_line_pair:
            corridor1, corridor2 = geom1.buffer(line_buffer), geom2.buffer(line_buffer)
            union = corridor1.union(corridor2).area
            return corridor1.intersection(corridor2).area / union if union > 0 else 0.0

        distance = geom1.distance(geom2)
        if distance <= point_distance_threshold:
            return 1.0
        if distance >= point_distance_threshold * 2:
            return 0.0
        return 1.0 - ((distance - point_distance_threshold) / point_distance_threshold)
    except Exception:
        return 0.0


def _greedy_global_match(candidates: List[Tuple[float, Any, Any]]) -> List[Tuple[Any, Any]]:
    candidates.sort(key=lambda item: item[0], reverse=True)
    used_left, used_right, matches = set(), set(), []
    for score, left, right in candidates:
        if left in used_left or right in used_right:
            continue
        used_left.add(left)
        used_right.add(right)
        matches.append((left, right))
    return matches


def match_features_cohen(
    features_a: List[Dict[str, Any]],
    features_b: List[Dict[str, Any]],
    iou_threshold: float = DEFAULT_IOU_THRESHOLD,
    crs: str = "EPSG:3857",
) -> Tuple[List[Tuple[Dict[str, Any], Dict[str, Any]]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    candidates = []
    for idx_a, feature_a in enumerate(features_a):
        for idx_b, feature_b in enumerate(features_b):
            score = compute_iou(feature_a.get("geometry", {}), feature_b.get("geometry", {}), crs=crs)
            if score >= iou_threshold:
                candidates.append((score, idx_a, idx_b))

    pairs = _greedy_global_match(candidates)
    matched_a = {idx_a for idx_a, _ in pairs}
    matched_b = {idx_b for _, idx_b in pairs}
    return (
        [(features_a[a], features_b[b]) for a, b in pairs],
        [feature for idx, feature in enumerate(features_a) if idx not in matched_a],
        [feature for idx, feature in enumerate(features_b) if idx not in matched_b],
    )


def _category(feature: Dict[str, Any], allowed: List[str]) -> str:
    value = feature.get("properties", {}).get("category", "default_category")
    return value if value in allowed else "default_category"


def _kappa(observed: float, expected: float) -> float:
    if math.isclose(1.0, expected):
        value = 1.0 if math.isclose(observed, 1.0) else 0.0
    else:
        value = (observed - expected) / (1.0 - expected)
    # Cohen/Fleiss kappa can legitimately be negative; do not conceal disagreement.
    return round(max(-1.0, min(1.0, value)), 4)


def calculate_cohens_kappa(
    annotations: List[Dict[str, Any]],
    taxonomy: List[str],
    iou_threshold: float = DEFAULT_IOU_THRESHOLD,
    crs: str = "EPSG:3857",
) -> float:
    if len(annotations) < 2:
        return 1.0
    features_a = annotations[0].get("geojson", {}).get("features", [])
    features_b = annotations[1].get("geojson", {}).get("features", [])
    if not features_a and not features_b:
        return 1.0

    matched, unmatched_a, unmatched_b = match_features_cohen(
        features_a, features_b, iou_threshold=iou_threshold, crs=crs
    )
    no_feature = "no_feature"
    categories = list(taxonomy) if taxonomy else ["default_category"]
    categories = list(dict.fromkeys(categories + ["default_category", no_feature]))
    if not categories:
        categories = [no_feature]
    counts_a, counts_b = Counter(), Counter()
    agreements = 0
    total = len(matched) + len(unmatched_a) + len(unmatched_b)
    if total == 0:
        return 1.0

    for feature_a, feature_b in matched:
        cat_a, cat_b = _category(feature_a, categories), _category(feature_b, categories)
        counts_a[cat_a] += 1
        counts_b[cat_b] += 1
        agreements += int(cat_a == cat_b)
    for feature in unmatched_a:
        counts_a[_category(feature, categories)] += 1
        counts_b[no_feature] += 1
    for feature in unmatched_b:
        counts_b[_category(feature, categories)] += 1
        counts_a[no_feature] += 1

    observed = agreements / total
    expected = sum((counts_a[cat] / total) * (counts_b[cat] / total) for cat in categories)
    return _kappa(observed, expected)


def cluster_features_fleiss(
    annotations: List[Dict[str, Any]],
    iou_threshold: float = DEFAULT_IOU_THRESHOLD,
    crs: str = "EPSG:3857",
) -> List[Dict[int, Dict[str, Any]]]:
    """Greedily match each rater's objects without transitive overlap chaining."""
    rater_features = [ann.get("geojson", {}).get("features", []) for ann in annotations]
    seed_idx = next((idx for idx, features in enumerate(rater_features) if features), None)
    if seed_idx is None:
        return []
    clusters: List[Dict[int, Dict[str, Any]]] = [{seed_idx: feature} for feature in rater_features[seed_idx]]

    for rater_idx, features in enumerate(rater_features):
        if rater_idx == seed_idx or not features:
            continue
        candidates = []
        for cluster_idx, cluster in enumerate(clusters):
            representative = next(iter(cluster.values()))
            for feature_idx, feature in enumerate(features):
                overlap = compute_iou(
                    representative.get("geometry", {}), feature.get("geometry", {}), crs=crs
                )
                if overlap >= iou_threshold:
                    candidates.append((overlap, cluster_idx, feature_idx))
        matches = _greedy_global_match(candidates)
        matched_features = set()
        for cluster_idx, feature_idx in matches:
            clusters[cluster_idx][rater_idx] = features[feature_idx]
            matched_features.add(feature_idx)
        for feature_idx, feature in enumerate(features):
            if feature_idx not in matched_features:
                clusters.append({rater_idx: feature})
    return clusters


def calculate_fleiss_kappa(
    annotations: List[Dict[str, Any]],
    taxonomy: List[str],
    iou_threshold: float = DEFAULT_IOU_THRESHOLD,
    crs: str = "EPSG:3857",
) -> float:
    n_raters = len(annotations)
    if n_raters < 3:
        return calculate_cohens_kappa(annotations, taxonomy, iou_threshold=iou_threshold, crs=crs)

    clusters = cluster_features_fleiss(annotations, iou_threshold=iou_threshold, crs=crs)
    if not clusters:
        return 1.0

    no_feature = "no_feature"
    categories = list(dict.fromkeys((taxonomy or ["default_category"]) + ["default_category", no_feature]))
    item_agreements = []
    category_totals = Counter()
    for cluster in clusters:
        ratings = []
        for rater_idx in range(n_raters):
            feature = cluster.get(rater_idx)
            rating = _category(feature, categories) if feature else no_feature
            ratings.append(rating)
            category_totals[rating] += 1
        counts = Counter(ratings)
        item_agreements.append(sum(count * count for count in counts.values()) - n_raters)

    p_bar = sum(item_agreements) / (len(clusters) * n_raters * (n_raters - 1))
    total_ratings = len(clusters) * n_raters
    p_e = sum((category_totals[cat] / total_ratings) ** 2 for cat in categories)
    return _kappa(p_bar, p_e)


def compute_task_iaa(
    annotations: List[Dict[str, Any]],
    taxonomy: List[str],
    iou_threshold: float = DEFAULT_IOU_THRESHOLD,
    crs: str = "EPSG:4326",
) -> Tuple[Optional[float], str]:
    """Calculate kappa only when at least two independent annotations exist."""
    count = len(annotations)
    if count < 2:
        return None, "insufficient_annotations"
    if count == 2:
        return calculate_cohens_kappa(annotations, taxonomy, iou_threshold=iou_threshold, crs=crs), "cohens_kappa"
    return calculate_fleiss_kappa(annotations, taxonomy, iou_threshold=iou_threshold, crs=crs), "fleiss_kappa"


def build_consensus_geojson(
    annotations: List[Dict[str, Any]], iaa_score: Optional[float], crs: str
) -> Dict[str, Any]:
    """Export features with majority support using a medoid geometry and majority class."""
    clusters = cluster_features_fleiss(annotations, crs=crs) if annotations else []
    required_support = len(annotations) // 2 + 1
    consensus_features = []

    for cluster in clusters:
        if len(cluster) < required_support:
            continue
        category_counts = Counter(
            str(feature.get("properties", {}).get("category", "default_category"))
            for feature in cluster.values()
        )
        category, category_support = category_counts.most_common(1)[0]
        if category_support < required_support:
            continue

        features = list(cluster.values())
        representative = max(
            features,
            key=lambda candidate: sum(
                compute_iou(candidate.get("geometry", {}), other.get("geometry", {}), crs=crs)
                for other in features
            ),
        )
        feature_copy = dict(representative)
        properties = dict(feature_copy.get("properties", {}))
        properties.update({
            "category": category,
            "annotator_support": len(cluster),
            "annotator_count": len(annotations),
            "agreement_ratio": round(len(cluster) / len(annotations), 4),
            "iaa_score": iaa_score,
            "verification_status": "agreement_supported",
        })
        feature_copy["properties"] = properties
        consensus_features.append(feature_copy)

    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": crs}},
        "features": consensus_features,
    }
