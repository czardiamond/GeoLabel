"""Lightweight, explicit-CRS vector spatial operations shared by GIS workflows."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

from pyproj import CRS, Transformer
from shapely import transform as project_geometry
from shapely.geometry import shape

Predicate = Literal["intersects", "contains", "within"]


def _crs(value: str, label: str) -> CRS:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} CRS is required and must be valid; CRS will not be guessed")
    try:
        return CRS.from_user_input(value)
    except Exception as exc:
        raise ValueError(f"Invalid {label} CRS: {value!r}") from exc


def _features(collection: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(collection, dict) or collection.get("type") != "FeatureCollection":
        raise ValueError(f"{label} must be a GeoJSON FeatureCollection")
    features = collection.get("features")
    if not isinstance(features, list):
        raise ValueError(f"{label}.features must be a list")
    result: list[dict[str, Any]] = []
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError(f"{label} feature {index} is malformed")
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") == "GeometryCollection":
            raise ValueError(f"{label} feature {index} has malformed geometry")
        try:
            parsed = shape(geometry)
        except Exception as exc:
            raise ValueError(f"{label} feature {index} has malformed geometry") from exc
        if parsed.is_empty or not parsed.is_valid:
            raise ValueError(f"{label} feature {index} has invalid geometry")
        result.append(feature)
    return result


def spatial_join(
    source: dict[str, Any],
    target: dict[str, Any],
    source_crs: str,
    target_crs: str,
    predicate: Predicate = "intersects",
) -> list[dict[str, Any]]:
    """Join target features to source features after explicit CRS transformation.

    Returns a stable source-major list of ``{"source_index", "target_index",
    "source_properties", "target_properties"}`` records. Properties are copied
    from the original input features and are never synthesized or altered.
    """
    if predicate not in {"intersects", "contains", "within"}:
        raise ValueError("predicate must be one of: intersects, contains, within")
    src_crs, dst_crs = _crs(source_crs, "source"), _crs(target_crs, "target")
    src_features, dst_features = _features(source, "source"), _features(target, "target")
    src_geoms = [shape(feature["geometry"]) for feature in src_features]
    dst_geoms = [shape(feature["geometry"]) for feature in dst_features]
    if not src_crs.equals(dst_crs):
        transformer = Transformer.from_crs(dst_crs, src_crs, always_xy=True)
        dst_geoms = [project_geometry(geom, transformer.transform, interleaved=False) for geom in dst_geoms]
    result: list[dict[str, Any]] = []
    for source_index, source_geom in enumerate(src_geoms):
        for target_index, target_geom in enumerate(dst_geoms):
            if predicate == "intersects":
                matched = source_geom.intersects(target_geom)
            elif predicate == "contains":
                matched = source_geom.contains(target_geom)
            else:  # within is evaluated in the conventional source-to-target direction.
                matched = source_geom.within(target_geom)
            if matched:
                result.append({
                    "source_index": source_index,
                    "target_index": target_index,
                    "source_properties": deepcopy(src_features[source_index].get("properties", {})),
                    "target_properties": deepcopy(dst_features[target_index].get("properties", {})),
                })
    return result
