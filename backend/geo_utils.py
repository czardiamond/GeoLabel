"""
GeoLabel Spatial & Coordinate Reference System (CRS) Utilities
Provides CRS extraction and reprojection for GeoJSON features using pyproj and Shapely.
"""

from typing import Dict, Any
import re
from shapely import transform as shapely_transform
from shapely.geometry import shape, mapping
import pyproj


def parse_and_validate_crs(crs_input: str) -> str:
    """
    Normalizes a CRS string and validates that pyproj.CRS can parse it.
    Handles plain 'EPSG:4326' strings and OGC URN formats like:
      - 'urn:ogc:def:crs:EPSG::4326'
      - 'urn:ogc:def:crs:EPSG:6.6:4326'
      - 'urn:ogc:def:crs:OGC:1.3:CRS84'
    """
    if not crs_input:
        return "EPSG:4326"

    raw = crs_input.strip()

    # Handle OGC URN format
    if "urn:" in raw.lower():
        # Look for EPSG code, e.g. urn:ogc:def:crs:EPSG::4326 or urn:ogc:def:crs:EPSG:6.6:4326
        match = re.search(r"EPSG:*:*(\d+)", raw, re.IGNORECASE)
        if match:
            candidate = f"EPSG:{match.group(1)}"
            try:
                pyproj.CRS.from_user_input(candidate)
                return candidate
            except Exception:
                pass

        if "CRS84" in raw.upper():
            return "EPSG:4326"

    # Test if pyproj.CRS can parse raw input directly
    try:
        crs_obj = pyproj.CRS.from_user_input(raw)
        epsg_code = crs_obj.to_epsg()
        if epsg_code:
            return f"EPSG:{epsg_code}"
        return raw
    except Exception:
        # Fallback regex search for EPSG digits if direct pyproj parse failed
        match = re.search(r"(\d+)", raw)
        if match:
            candidate = f"EPSG:{match.group(1)}"
            try:
                pyproj.CRS.from_user_input(candidate)
                return candidate
            except Exception:
                pass

    return raw


def get_feature_collection_crs(geojson: Dict[str, Any]) -> str:
    """
    Extracts CRS string from a GeoJSON object (FeatureCollection or Feature).
    Handles plain 'EPSG:4326' strings, OGC URN formats (e.g. 'urn:ogc:def:crs:EPSG::4326'),
    and dict-based CRS properties.
    Defaults to 'EPSG:4326' if unspecified, as per standard GeoJSON RFC 7946 specification.
    """
    if not isinstance(geojson, dict):
        return "EPSG:4326"

    crs_obj = geojson.get("crs")
    raw_crs = None

    if isinstance(crs_obj, str):
        raw_crs = crs_obj.strip()
    elif isinstance(crs_obj, dict):
        props = crs_obj.get("properties", {})
        if isinstance(props, dict):
            name = props.get("name")
            if name:
                raw_crs = str(name).strip()

    if not raw_crs:
        return "EPSG:4326"

    return parse_and_validate_crs(raw_crs)


def reproject_geojson_feature(
    feature: Dict[str, Any],
    source_crs: str,
    target_crs: str
) -> Dict[str, Any]:
    """
    Reprojects a single GeoJSON Feature's geometry from source_crs to target_crs.
    If source_crs equals target_crs (case-insensitive or CRS equivalence), returns feature unchanged.
    Raises ValueError on reprojection failure instead of returning original feature.
    """
    if not isinstance(feature, dict):
        raise ValueError("Each annotation must be a GeoJSON Feature object")
    geom_dict = feature.get("geometry")
    if not isinstance(geom_dict, dict):
        raise ValueError("Feature geometry must be a GeoJSON geometry object")

    try:
        s_geom = shape(geom_dict)
    except Exception as exc:
        raise ValueError(f"Invalid GeoJSON geometry: {exc}") from exc
    if s_geom.is_empty:
        raise ValueError("Empty geometries cannot be submitted as annotation features")
    if not s_geom.is_valid:
        raise ValueError("Invalid geometries cannot be submitted as annotation features")

    try:
        src_crs_obj = pyproj.CRS.from_user_input(source_crs)
        tgt_crs_obj = pyproj.CRS.from_user_input(target_crs)
        if src_crs_obj == tgt_crs_obj:
            return feature

        transformer = pyproj.Transformer.from_crs(source_crs, target_crs, always_xy=True)
        reprojected_s_geom = shapely_transform(
            s_geom,
            transformer.transform,
            include_z=s_geom.has_z,
            interleaved=False,
        )
        if reprojected_s_geom.is_empty or not reprojected_s_geom.is_valid:
            raise ValueError("Reprojection produced an empty or invalid geometry")
        new_feature = dict(feature)
        new_feature["geometry"] = mapping(reprojected_s_geom)
        return new_feature
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            f"Failed to reproject feature geometry from source CRS '{source_crs}' "
            f"to target CRS '{target_crs}': {exc}"
        ) from exc


def reproject_feature_collection(
    geojson: Dict[str, Any],
    target_crs: str
) -> Dict[str, Any]:
    """
    Detects the source CRS of an incoming GeoJSON FeatureCollection, reprojects every feature
    to target_crs, and updates the FeatureCollection's CRS property.
    Raises ValueError if reprojection fails for any feature.
    """
    if not isinstance(geojson, dict):
        return geojson

    source_crs = get_feature_collection_crs(geojson)
    features = geojson.get("features", [])

    reprojected_features = [
        reproject_geojson_feature(f, source_crs, target_crs) for f in features
    ]

    new_geojson = dict(geojson)
    new_geojson["features"] = reprojected_features
    new_geojson["crs"] = {
        "type": "name",
        "properties": {
            "name": target_crs
        }
    }
    return new_geojson
