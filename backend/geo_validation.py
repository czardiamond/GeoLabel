"""Bounded, explicit-CRS GeoJSON validation for annotation QA."""
from __future__ import annotations

import json
import math
from collections import Counter
from typing import Any, Iterable

import pyproj
from shapely.geometry import shape
from shapely.validation import explain_validity

MAX_FEATURES = 500
MAX_COORDINATES = 100_000
MAX_REPORTED_ERRORS = 1_000
SUPPORTED_GEOMETRIES = {
    "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon",
}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_finite_number(value: Any) -> bool:
    if not _is_number(value):
        return False
    try:
        return math.isfinite(float(value))
    except (OverflowError, TypeError, ValueError):
        return False


def _walk_positions(value: Any, depth: int = 0) -> Iterable[list[Any]]:
    """Yield coordinate tuples from nested GeoJSON coordinates."""
    if depth > 8:
        raise ValueError("coordinates nesting exceeds the supported geometry depth")
    if not isinstance(value, (list, tuple)):
        raise ValueError("coordinates must be nested arrays of positions")
    if len(value) >= 2 and all(_is_number(item) for item in value):
        yield list(value)
        return
    for child in value:
        yield from _walk_positions(child, depth + 1)


def _check_linear_rings(geometry: dict[str, Any]) -> list[str]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    errors: list[str] = []

    def check_ring(ring: Any, label: str) -> None:
        if not isinstance(ring, list) or len(ring) < 4:
            errors.append(f"{label} must contain at least four positions")
            return
        if ring[0] != ring[-1]:
            errors.append(f"{label} must be closed (first and last positions must match)")

    if geometry_type == "LineString" and (not isinstance(coordinates, list) or len(coordinates) < 2):
        errors.append("LineString must contain at least two positions")
    elif geometry_type == "MultiLineString":
        if not isinstance(coordinates, list) or not coordinates:
            errors.append("MultiLineString must contain at least one line")
        else:
            for index, line in enumerate(coordinates):
                if not isinstance(line, list) or len(line) < 2:
                    errors.append(f"MultiLineString line {index} must contain at least two positions")
    elif geometry_type == "Polygon":
        if not isinstance(coordinates, list) or not coordinates:
            errors.append("Polygon must contain an exterior ring")
        else:
            for index, ring in enumerate(coordinates):
                check_ring(ring, f"Polygon ring {index}")
    elif geometry_type == "MultiPolygon":
        if not isinstance(coordinates, list) or not coordinates:
            errors.append("MultiPolygon must contain at least one polygon")
        else:
            for polygon_index, polygon in enumerate(coordinates):
                if not isinstance(polygon, list) or not polygon:
                    errors.append(f"MultiPolygon polygon {polygon_index} must contain an exterior ring")
                    continue
                for ring_index, ring in enumerate(polygon):
                    check_ring(ring, f"MultiPolygon polygon {polygon_index} ring {ring_index}")
    elif geometry_type == "MultiPoint" and (not isinstance(coordinates, list) or not coordinates):
        errors.append("MultiPoint must contain at least one position")
    return errors


def validate_geojson_collection(
    geojson: dict[str, Any],
    crs: str,
    required_fields: list[str] | None = None,
) -> dict[str, Any]:
    """Validate feature structure, explicit CRS, bounded coordinates, and geometry topology.

    This validates data integrity only. It cannot determine whether annotations are
    semantically correct or whether a dataset is suitable for a particular project.
    """
    if not isinstance(geojson, dict) or geojson.get("type") != "FeatureCollection":
        raise ValueError("geojson must be a GeoJSON FeatureCollection")
    features = geojson.get("features")
    if not isinstance(features, list):
        raise ValueError("FeatureCollection.features must be an array")
    if len(features) > MAX_FEATURES:
        raise ValueError(f"FeatureCollection exceeds the {MAX_FEATURES}-feature validation limit")
    if not isinstance(crs, str) or not crs.strip() or len(crs) > 256:
        raise ValueError("crs must be explicitly provided as a valid CRS identifier")
    try:
        crs_obj = pyproj.CRS.from_user_input(crs.strip())
    except Exception as exc:
        raise ValueError("crs must identify a valid coordinate reference system") from exc

    required_fields = required_fields or []
    if len(required_fields) > 50 or any(not isinstance(field, str) or not field.strip() or len(field) > 100 for field in required_fields):
        raise ValueError("required_fields must contain at most 50 non-empty field names of 100 characters or fewer")
    if len(set(required_fields)) != len(required_fields):
        raise ValueError("required_fields must not contain duplicates")

    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    geometry_counts: Counter[str] = Counter()
    seen_ids: dict[str, int] = {}
    coordinate_count = 0
    wgs84 = crs_obj.to_epsg() == 4326

    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            errors.append({"feature_index": index, "code": "invalid_feature", "message": "Each item must be a GeoJSON Feature"})
            continue

        if "id" in feature:
            try:
                feature_id = json.dumps(feature["id"], sort_keys=True, separators=(",", ":"))
            except (TypeError, ValueError):
                feature_id = repr(feature["id"])
            if feature_id in seen_ids:
                errors.append({
                    "feature_index": index,
                    "code": "duplicate_id",
                    "message": f"Feature id duplicates feature {seen_ids[feature_id]}",
                })
            else:
                seen_ids[feature_id] = index

        properties = feature.get("properties")
        if properties is None:
            properties = {}
        elif not isinstance(properties, dict):
            errors.append({"feature_index": index, "code": "invalid_properties", "message": "Feature properties must be an object or null"})
            properties = {}
        for field in required_fields:
            value = properties.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                errors.append({
                    "feature_index": index,
                    "code": "missing_required_field",
                    "field": field,
                    "message": f"Required property '{field}' is missing or empty",
                })

        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            errors.append({"feature_index": index, "code": "missing_geometry", "message": "Feature geometry must be a GeoJSON geometry object"})
            continue
        geometry_type = geometry.get("type")
        if geometry_type not in SUPPORTED_GEOMETRIES:
            errors.append({
                "feature_index": index,
                "code": "unsupported_geometry",
                "message": f"Geometry type must be one of: {', '.join(sorted(SUPPORTED_GEOMETRIES))}",
            })
            continue

        for message in _check_linear_rings(geometry):
            errors.append({"feature_index": index, "code": "invalid_coordinate_structure", "message": message})

        try:
            positions = list(_walk_positions(geometry.get("coordinates")))
        except ValueError as exc:
            errors.append({"feature_index": index, "code": "invalid_coordinates", "message": str(exc)})
            continue
        if not positions:
            errors.append({"feature_index": index, "code": "empty_geometry", "message": "Geometry must contain at least one coordinate"})
            continue

        dimensions: set[int] = set()
        coordinates_valid = True
        for position in positions:
            if len(position) not in (2, 3):
                errors.append({"feature_index": index, "code": "invalid_position", "message": "Every position must contain exactly two or three ordinates"})
                coordinates_valid = False
                break
            dimensions.add(len(position))
            if any(not _is_finite_number(value) for value in position):
                errors.append({"feature_index": index, "code": "non_finite_coordinate", "message": "Coordinates must be finite numbers"})
                coordinates_valid = False
                break
            if wgs84 and not (-180 <= float(position[0]) <= 180 and -90 <= float(position[1]) <= 90):
                errors.append({"feature_index": index, "code": "coordinate_out_of_range", "message": "EPSG:4326 coordinates must be longitude [-180, 180] and latitude [-90, 90]"})
                coordinates_valid = False
                break
        if len(dimensions) > 1:
            errors.append({"feature_index": index, "code": "mixed_dimensions", "message": "A geometry must use a consistent 2D or 3D position dimension"})
            coordinates_valid = False
        coordinate_count += len(positions)
        if coordinate_count > MAX_COORDINATES:
            raise ValueError(f"FeatureCollection exceeds the {MAX_COORDINATES}-coordinate validation limit")
        if not coordinates_valid:
            continue

        try:
            parsed = shape(geometry)
        except Exception as exc:
            errors.append({"feature_index": index, "code": "invalid_geometry", "message": f"Geometry could not be parsed: {exc}"})
            continue
        if parsed.is_empty:
            errors.append({"feature_index": index, "code": "empty_geometry", "message": "Empty geometries cannot be used for annotation"})
            continue
        geometry_counts[parsed.geom_type] += 1
        if not parsed.is_valid:
            errors.append({
                "feature_index": index,
                "code": "topologically_invalid",
                "message": explain_validity(parsed),
            })

    if not features:
        warnings.append({"code": "empty_collection", "message": "The FeatureCollection contains no features"})

    error_count = len(errors)
    return {
        "valid": not errors,
        "crs": crs_obj.to_string(),
        "feature_count": len(features),
        "coordinate_count": coordinate_count,
        "geometry_counts": dict(sorted(geometry_counts.items())),
        "required_fields": required_fields,
        "error_count": error_count,
        "errors_truncated": error_count > MAX_REPORTED_ERRORS,
        "errors": errors[:MAX_REPORTED_ERRORS],
        "warnings": warnings,
        "checks": [
            "GeoJSON FeatureCollection and Feature structure",
            "explicit CRS parsed by PROJ",
            "finite 2D/3D coordinates and supported geometry types",
            "closed polygon rings and minimum line/ring lengths",
            "Shapely topological validity",
            "WGS84 longitude/latitude ranges when CRS is EPSG:4326",
            "required properties when configured",
            "unique feature IDs when supplied",
        ],
        "accuracy_note": "This is structural and geometric validation; it does not verify semantic annotation correctness or ground truth.",
    }
