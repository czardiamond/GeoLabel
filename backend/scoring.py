"""
GeoLabel Inter-Annotator Agreement (IAA) Scoring Engine
Computes real Cohen's Kappa (for 2 annotators) and Fleiss' Kappa (for 3+ annotators)
on human-in-the-loop specialist annotations with geometry-type-aware spatial matching.

FIXES over previous version:
1. compute_iou() now branches by geometry type. Polygons use true area IoU.
   LineStrings are compared by buffering to a tolerance corridor, then IoU on
   the buffered shapes. Points are compared by distance threshold (converted
   to a pseudo-IoU-style score so downstream logic is unchanged).
2. Fleiss clustering no longer uses BFS connected-components (which lets
   unrelated features "chain" together transitively: A~B~C even if A and C
   don't overlap). It instead uses greedy global best-match matching across
   all rater pairs, similar in spirit to the Cohen's Kappa matching, which
   guarantees no two features from the same annotator ever land in the same
   cluster and no chaining occurs.
"""

from typing import List, Dict, Any, Tuple, Optional
import math
from shapely.geometry import shape, Point, LineString, Polygon
from shapely.geometry.base import BaseGeometry

# Tunable defaults for projected CRS units (meters). A line "matches" if buffered
# corridors overlap enough; a point "matches" if within this distance (e.g. 0.5 meters).
DEFAULT_LINE_BUFFER = 0.5
DEFAULT_POINT_DISTANCE_THRESHOLD = 0.5


def _safe_shape(geom_dict: Dict[str, Any]) -> Optional[BaseGeometry]:
    """Parses a GeoJSON geometry dict into a Shapely geometry, repairing
    invalid polygons where possible. Returns None on failure."""
    if not geom_dict:
        return None
    try:
        geom = shape(geom_dict)
        if geom.is_empty:
            return None
        if isinstance(geom, Polygon) and not geom.is_valid:
            geom = geom.buffer(0)
            if geom.is_empty:
                return None
        return geom
    except Exception:
        return None


def compute_iou(
    geom1_dict: Dict[str, Any],
    geom2_dict: Dict[str, Any],
    line_buffer: float = DEFAULT_LINE_BUFFER,
    point_distance_threshold: float = DEFAULT_POINT_DISTANCE_THRESHOLD,
) -> float:
    """
    Computes a spatial overlap score between two GeoJSON geometries, branching
    by geometry type since raw area-IoU is meaningless for lines and points
    (they have zero area and would always return 0.0).

    - Polygon vs Polygon: true area IoU = Area(intersection) / Area(union).
    - LineString vs LineString: buffer both lines into corridors of width
      `line_buffer`, then compute area IoU on the corridors. This rewards
      lines that run along a similar path even if they're not pixel-identical.
    - Point vs Point: returns 1.0 if within `point_distance_threshold` of each
      other, decaying linearly to 0.0 at 2x that distance, else 0.0. This
      keeps the return value in the same [0, 1] range the rest of the pipeline
      expects, so it can be thresholded the same way as polygon/line IoU.
    - Mismatched geometry types (e.g. a Point vs a Polygon) are treated as
      non-comparable and return 0.0 — they should never be considered the
      same real-world feature.

    Returns 0.0 on any invalid/unparseable geometry.
    """
    s1 = _safe_shape(geom1_dict)
    s2 = _safe_shape(geom2_dict)
    if s1 is None or s2 is None:
        return 0.0

    type1 = s1.geom_type
    type2 = s2.geom_type

    is_poly1 = type1 in ("Polygon", "MultiPolygon")
    is_poly2 = type2 in ("Polygon", "MultiPolygon")
    is_line1 = type1 in ("LineString", "MultiLineString")
    is_line2 = type2 in ("LineString", "MultiLineString")
    is_point1 = type1 in ("Point", "MultiPoint")
    is_point2 = type2 in ("Point", "MultiPoint")

    try:
        if is_poly1 and is_poly2:
            intersection = s1.intersection(s2).area
            union = s1.union(s2).area
            if union <= 0.0:
                return 0.0
            return intersection / union

        if is_line1 and is_line2:
            corridor1 = s1.buffer(line_buffer)
            corridor2 = s2.buffer(line_buffer)
            intersection = corridor1.intersection(corridor2).area
            union = corridor1.union(corridor2).area
            if union <= 0.0:
                return 0.0
            return intersection / union

        if is_point1 and is_point2:
            distance = s1.distance(s2)
            if distance <= point_distance_threshold:
                return 1.0
            elif distance >= point_distance_threshold * 2:
                return 0.0
            else:
                # Linear decay between threshold and 2x threshold
                return 1.0 - ((distance - point_distance_threshold) / point_distance_threshold)

        # Mismatched geometry types (e.g. point vs polygon) are never the
        # same real-world feature.
        return 0.0
    except Exception:
        return 0.0


def _greedy_global_match(
    pairwise_candidates: List[Tuple[float, Any, Any]]
) -> List[Tuple[Any, Any]]:
    """
    Given a list of (score, key_a, key_b) candidate pairs, greedily selects
    the highest-scoring pairs such that each key_a and key_b is used at most
    once. Shared helper for both Cohen's and Fleiss' matching so the matching
    strategy is consistent everywhere in this module.
    """
    pairwise_candidates.sort(key=lambda x: x[0], reverse=True)
    used_a = set()
    used_b = set()
    matches = []
    for score, key_a, key_b in pairwise_candidates:
        if key_a in used_a or key_b in used_b:
            continue
        used_a.add(key_a)
        used_b.add(key_b)
        matches.append((key_a, key_b))
    return matches


def match_features_cohen(
    features_a: List[Dict[str, Any]],
    features_b: List[Dict[str, Any]],
    iou_threshold: float = 0.5
) -> Tuple[List[Tuple[Dict[str, Any], Dict[str, Any]]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    SPATIAL MATCHING STEP FOR COHEN'S KAPPA:
    Pairs features drawn by Annotator A and Annotator B based on geometry-
    type-aware spatial overlap (see compute_iou). Only pairs with overlap
    score >= iou_threshold are considered candidates for agreement.

    Unmatched features on either side represent spatial disagreements (one
    annotator drew a feature where the other drew nothing, or their features
    didn't overlap enough to count as the same real-world object).
    """
    candidates = []
    for idx_a, fa in enumerate(features_a):
        geom_a = fa.get("geometry", {})
        for idx_b, fb in enumerate(features_b):
            geom_b = fb.get("geometry", {})
            score = compute_iou(geom_a, geom_b)
            if score >= iou_threshold:
                candidates.append((score, idx_a, idx_b))

    matched_idx_pairs = _greedy_global_match(candidates)
    matched_a_idx = {a for a, b in matched_idx_pairs}
    matched_b_idx = {b for a, b in matched_idx_pairs}

    matched_pairs = [(features_a[a], features_b[b]) for a, b in matched_idx_pairs]
    unmatched_a = [fa for idx, fa in enumerate(features_a) if idx not in matched_a_idx]
    unmatched_b = [fb for idx, fb in enumerate(features_b) if idx not in matched_b_idx]

    return matched_pairs, unmatched_a, unmatched_b


def calculate_cohens_kappa(
    annotations: List[Dict[str, Any]],
    taxonomy: List[str],
    iou_threshold: float = 0.5
) -> float:
    """
    Computes Cohen's Kappa (κ) for exactly 2 annotators across category
    assignments AND geometry-type-aware spatial overlap.

    Step 1: Spatially match features between Annotator A & B (compute_iou >= iou_threshold).
    Step 2: Compare taxonomy category assignments for matched pairs.
    Step 3: Unmatched features count as disagreements against 'no_feature'.
    """
    if len(annotations) < 2:
        return 1.0

    annotator_a = annotations[0].get("geojson", {})
    annotator_b = annotations[1].get("geojson", {})

    features_a = annotator_a.get("features", [])
    features_b = annotator_b.get("features", [])

    if not features_a and not features_b:
        return 1.0

    matched_pairs, unmatched_a, unmatched_b = match_features_cohen(
        features_a, features_b, iou_threshold=iou_threshold
    )

    NO_FEATURE = "no_feature"
    categories = list(taxonomy) if taxonomy else ["default_category"]
    if NO_FEATURE not in categories:
        categories.append(NO_FEATURE)

    total_items = len(matched_pairs) + len(unmatched_a) + len(unmatched_b)
    if total_items == 0:
        return 1.0

    agreements = 0
    cat_counts_a = {cat: 0 for cat in categories}
    cat_counts_b = {cat: 0 for cat in categories}

    for fa, fb in matched_pairs:
        cat_a = fa.get("properties", {}).get("category", categories[0])
        cat_b = fb.get("properties", {}).get("category", categories[0])
        if cat_a not in cat_counts_a:
            cat_a = categories[0]
        if cat_b not in cat_counts_b:
            cat_b = categories[0]
        cat_counts_a[cat_a] += 1
        cat_counts_b[cat_b] += 1
        if cat_a == cat_b:
            agreements += 1

    for fa in unmatched_a:
        cat_a = fa.get("properties", {}).get("category", categories[0])
        if cat_a not in cat_counts_a:
            cat_a = categories[0]
        cat_counts_a[cat_a] += 1
        cat_counts_b[NO_FEATURE] += 1

    for fb in unmatched_b:
        cat_b = fb.get("properties", {}).get("category", categories[0])
        if cat_b not in cat_counts_b:
            cat_b = categories[0]
        cat_counts_b[cat_b] += 1
        cat_counts_a[NO_FEATURE] += 1

    po = agreements / float(total_items)

    pe = 0.0
    for cat in categories:
        p_a = cat_counts_a[cat] / float(total_items)
        p_b = cat_counts_b[cat] / float(total_items)
        pe += (p_a * p_b)

    if pe >= 1.0:
        return 1.0

    kappa = (po - pe) / (1.0 - pe)
    return round(max(0.0, min(1.0, kappa)), 4)


def cluster_features_fleiss(
    annotations: List[Dict[str, Any]],
    iou_threshold: float = 0.5
) -> List[Dict[int, Dict[str, Any]]]:
    """
    SPATIAL CLUSTERING STEP FOR FLEISS' KAPPA (N >= 3 raters).

    IMPORTANT: this does NOT use BFS/connected-components over the overlap
    graph. Connected-components allows transitive chaining — if feature A
    overlaps B, and B overlaps C, but A and C do not overlap each other,
    naive BFS would still group A, B, and C into a single "same real-world
    object" cluster. That's wrong: A and C may be two different buildings
    that both happen to be near the same third building.

    Instead, this builds clusters via iterative greedy global best-match,
    reusing the same pairwise-matching approach as Cohen's Kappa:
      1. Treat rater 0's features as the seed clusters.
      2. For each subsequent rater, greedily match their features against
         the current cluster set using the highest available IoU/overlap
         score (>= iou_threshold), one feature per cluster, one cluster per
         feature.
      3. Unmatched features from that rater start new clusters.
    This guarantees no two features from the same rater ever land in the
    same cluster, and no chaining through an intermediate feature.
    """
    n_raters = len(annotations)
    rater_features: List[List[Dict[str, Any]]] = [
        ann.get("geojson", {}).get("features", []) for ann in annotations
    ]

    if not any(rater_features):
        return []

    # Seed clusters from the first non-empty rater's features.
    clusters: List[Dict[int, Dict[str, Any]]] = []
    seed_rater_idx = None
    for idx, feats in enumerate(rater_features):
        if feats:
            seed_rater_idx = idx
            break
    if seed_rater_idx is None:
        return []

    for f in rater_features[seed_rater_idx]:
        clusters.append({seed_rater_idx: f})

    for rater_idx in range(n_raters):
        if rater_idx == seed_rater_idx:
            continue
        feats = rater_features[rater_idx]
        if not feats:
            continue

        candidates = []
        for cluster_idx, cluster_map in enumerate(clusters):
            # Compare against any one existing feature already in the cluster
            # (representative geometry) to decide if this rater's feature
            # belongs to the same real-world object.
            existing_geom = None
            for existing_feat in cluster_map.values():
                existing_geom = existing_feat.get("geometry", {})
                break
            if existing_geom is None:
                continue
            for feat_idx, f in enumerate(feats):
                score = compute_iou(existing_geom, f.get("geometry", {}))
                if score >= iou_threshold:
                    candidates.append((score, cluster_idx, feat_idx))

        matched = _greedy_global_match(candidates)
        matched_feat_idx = set()
        for cluster_idx, feat_idx in matched:
            clusters[cluster_idx][rater_idx] = feats[feat_idx]
            matched_feat_idx.add(feat_idx)

        # Unmatched features from this rater start their own new clusters.
        for feat_idx, f in enumerate(feats):
            if feat_idx not in matched_feat_idx:
                clusters.append({rater_idx: f})

    return clusters


def calculate_fleiss_kappa(
    annotations: List[Dict[str, Any]],
    taxonomy: List[str],
    iou_threshold: float = 0.5
) -> float:
    """
    Computes Fleiss' Kappa (κ) for N >= 3 raters evaluating categorical
    assignments AND geometry-type-aware spatial overlap.

    κ = (P_bar - Pe_bar) / (1 - Pe_bar)
    """
    n_raters = len(annotations)
    if n_raters < 3:
        return calculate_cohens_kappa(annotations, taxonomy, iou_threshold=iou_threshold)

    clusters = cluster_features_fleiss(annotations, iou_threshold=iou_threshold)

    if not clusters:
        return 1.0

    NO_FEATURE = "no_feature"
    categories = list(taxonomy) if taxonomy else ["default_category"]
    if NO_FEATURE not in categories:
        categories.append(NO_FEATURE)

    n_items = len(clusters)

    n_matrix = []
    for cluster_map in clusters:
        row_counts = {cat: 0 for cat in categories}
        for rater_idx in range(n_raters):
            if rater_idx in cluster_map:
                feat = cluster_map[rater_idx]
                cat = feat.get("properties", {}).get("category", categories[0])
                if cat not in row_counts:
                    cat = categories[0]
                row_counts[cat] += 1
            else:
                row_counts[NO_FEATURE] += 1
        n_matrix.append([row_counts[cat] for cat in categories])

    p_i_list = []
    for row in n_matrix:
        row_sq_sum = sum(x * x for x in row)
        p_i = (row_sq_sum - n_raters) / float(n_raters * (n_raters - 1)) if n_raters > 1 else 1.0
        p_i_list.append(p_i)

    p_bar = sum(p_i_list) / float(n_items) if n_items > 0 else 1.0

    total_ratings = n_items * n_raters
    p_j_list = []
    for j in range(len(categories)):
        col_sum = sum(n_matrix[i][j] for i in range(n_items))
        p_j = col_sum / float(total_ratings) if total_ratings > 0 else 0
        p_j_list.append(p_j)

    pe_bar = sum(pj * pj for pj in p_j_list)

    if pe_bar >= 1.0:
        return 1.0

    kappa = (p_bar - pe_bar) / (1.0 - pe_bar)
    return round(max(0.0, min(1.0, kappa)), 4)


def compute_task_iaa(
    annotations: List[Dict[str, Any]],
    taxonomy: List[str],
    iou_threshold: float = 0.5
) -> Tuple[float, str]:
    """
    Main entry point for calculating IAA score and returning (score, type).
    """
    count = len(annotations)
    if count == 0:
        return (0.0, "insufficient_annotations")
    elif count == 1:
        return (1.0, "single_annotator_baseline")
    elif count == 2:
        score = calculate_cohens_kappa(annotations, taxonomy, iou_threshold=iou_threshold)
        return (score, "cohens_kappa")
    else:
        score = calculate_fleiss_kappa(annotations, taxonomy, iou_threshold=iou_threshold)
        return (score, "fleiss_kappa")


def build_consensus_geojson(annotations: List[Dict[str, Any]], iaa_score: float, crs: str) -> Dict[str, Any]:
    """
    Combines individual specialist annotations into a consensus GeoJSON FeatureCollection.
    """
    combined_features = []

    for ann_idx, ann in enumerate(annotations):
        annotator_id = ann.get("annotator_id", f"annotator_{ann_idx + 1}")
        feats = ann.get("geojson", {}).get("features", [])
        for f in feats:
            feature_copy = dict(f)
            props = dict(feature_copy.get("properties", {}))
            props["annotator_id"] = annotator_id
            props["verification_status"] = "human_specialist_verified"
            props["iaa_consensus_score"] = iaa_score
            feature_copy["properties"] = props
            combined_features.append(feature_copy)

    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": crs
            }
        },
        "features": combined_features
    }
