"""Local stdio MCP server for GeoLabel's bounded geospatial utilities.

This server only processes payloads supplied by the MCP client. It does not
read arbitrary local paths, access organization data, or persist submitted data.
"""
from __future__ import annotations

import json
from typing import Any

import pyproj
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from backend.geo_utils import reproject_feature_collection
from backend.geo_validation import MAX_FEATURES, SUPPORTED_GEOMETRIES, validate_geojson_collection
from backend.spatial_operations import spatial_join as run_spatial_join

MAX_TOOL_PAYLOAD_BYTES = 2_000_000
MAX_MCP_FEATURES = 100


def _check_payload_size(value: Any) -> None:
    try:
        encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=True).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError("Input must be JSON-compatible") from exc
    if len(encoded) > MAX_TOOL_PAYLOAD_BYTES:
        raise ValueError(f"Input exceeds the {MAX_TOOL_PAYLOAD_BYTES}-byte MCP payload limit")


def _check_collection(value: dict[str, Any]) -> None:
    if not isinstance(value, dict) or value.get("type") != "FeatureCollection" or not isinstance(value.get("features"), list):
        raise ValueError("Input must be a GeoJSON FeatureCollection")
    if len(value["features"]) > min(MAX_FEATURES, MAX_MCP_FEATURES):
        raise ValueError(f"MCP tools accept at most {MAX_MCP_FEATURES} features per collection")
    _check_payload_size(value)


def _tool_error(exc: ValueError | TypeError) -> ToolError:
    """Convert expected request-data failures to MCP's actionable tool-error result."""
    return ToolError(str(exc))


def build_server() -> MCPServer:
    server = MCPServer(
        name="GeoLabel GIS",
        title="GeoLabel GIS Tools",
        version="1.0.0",
        description="Bounded geospatial validation and transformation tools using GeoLabel's tested GIS algorithms.",
        instructions=(
            "Use validate_geojson for structural checks and validate_annotation_labels when a project taxonomy is available. "
            "Always provide the actual CRS; "
            "a successful structural validation is not a claim that annotations are semantically correct. "
            "These tools process only supplied payloads and do not persist data."
        ),
    )

    @server.tool()
    def validate_geojson(geojson: dict[str, Any], crs: str, required_fields: list[str] | None = None) -> dict[str, Any]:
        """Check a GeoJSON FeatureCollection's structure, CRS, coordinate bounds, IDs, required fields, and geometry validity."""
        try:
            _check_payload_size({"geojson": geojson, "crs": crs, "required_fields": required_fields})
            _check_collection(geojson)
            return validate_geojson_collection(geojson, crs, required_fields)
        except (ValueError, TypeError) as exc:
            raise _tool_error(exc) from exc

    @server.tool()
    def validate_annotation_labels(
        geojson: dict[str, Any],
        crs: str,
        label_field: str,
        allowed_labels: list[str],
        required_fields: list[str] | None = None,
        geometry_by_label: dict[str, list[str]] | None = None,
    ) -> dict[str, Any]:
        """Validate project-configured label values and optional label-to-geometry rules, plus GeoLabel's structural checks.

        This can check taxonomy membership and declared geometry compatibility only. It cannot verify semantic correctness,
        agreement with source imagery, or fitness for a task; human review and project-specific quality evidence remain required.
        """
        try:
            request = {
                "geojson": geojson,
                "crs": crs,
                "label_field": label_field,
                "allowed_labels": allowed_labels,
                "required_fields": required_fields,
                "geometry_by_label": geometry_by_label,
            }
            _check_payload_size(request)
            _check_collection(geojson)
            if not isinstance(label_field, str) or not label_field.strip() or label_field != label_field.strip() or len(label_field) > 100:
                raise ValueError("label_field must be a non-empty property name of 100 characters or fewer")
            if not isinstance(allowed_labels, list) or not 1 <= len(allowed_labels) <= 100:
                raise ValueError("allowed_labels must contain between 1 and 100 labels")
            if any(not isinstance(label, str) or not label.strip() or label != label.strip() or len(label) > 100 for label in allowed_labels):
                raise ValueError("allowed_labels must contain non-empty, trimmed strings of 100 characters or fewer")
            if len(set(allowed_labels)) != len(allowed_labels):
                raise ValueError("allowed_labels must not contain duplicates")

            if geometry_by_label is not None:
                if not isinstance(geometry_by_label, dict) or len(geometry_by_label) > 100:
                    raise ValueError("geometry_by_label must be an object with at most 100 label entries")
                for label, geometry_types in geometry_by_label.items():
                    if label not in allowed_labels:
                        raise ValueError(f"geometry_by_label contains a label not listed in allowed_labels: {label!r}")
                    if not isinstance(geometry_types, list) or not geometry_types:
                        raise ValueError(f"geometry_by_label[{label!r}] must be a non-empty list")
                    if any(not isinstance(item, str) or item not in SUPPORTED_GEOMETRIES for item in geometry_types):
                        raise ValueError(f"geometry_by_label[{label!r}] contains an unsupported GeoJSON geometry type")
                    if len(set(geometry_types)) != len(geometry_types):
                        raise ValueError(f"geometry_by_label[{label!r}] must not contain duplicate geometry types")

            structural = validate_geojson_collection(geojson, crs, required_fields)
            allowed = set(allowed_labels)
            label_errors: list[dict[str, Any]] = []
            for index, feature in enumerate(geojson["features"]):
                if not isinstance(feature, dict) or feature.get("type") != "Feature":
                    continue  # Reported by the structural validator.
                properties = feature.get("properties")
                label = properties.get(label_field) if isinstance(properties, dict) else None
                if not isinstance(label, str) or not label.strip():
                    label_errors.append({
                        "feature_index": index,
                        "code": "missing_or_invalid_label",
                        "field": label_field,
                        "message": f"Property '{label_field}' must contain a non-empty string label",
                    })
                    continue
                if label not in allowed:
                    label_errors.append({
                        "feature_index": index,
                        "code": "unknown_label",
                        "field": label_field,
                        "label": label,
                        "message": f"Label '{label}' is not in the configured allowed_labels taxonomy",
                    })
                    continue
                geometry_type = (feature.get("geometry") or {}).get("type") if isinstance(feature.get("geometry"), dict) else None
                permitted_types = (geometry_by_label or {}).get(label)
                if permitted_types and geometry_type not in permitted_types:
                    label_errors.append({
                        "feature_index": index,
                        "code": "label_geometry_mismatch",
                        "field": label_field,
                        "label": label,
                        "geometry_type": geometry_type,
                        "allowed_geometry_types": permitted_types,
                        "message": f"Geometry type '{geometry_type}' is not allowed for label '{label}'",
                    })

            return {
                "valid": structural["valid"] and not label_errors,
                "feature_count": structural["feature_count"],
                "label_field": label_field,
                "allowed_labels": allowed_labels,
                "geometry_by_label": geometry_by_label or {},
                "label_error_count": len(label_errors),
                "label_errors": label_errors,
                "structural_validation": structural,
                "accuracy_note": "Taxonomy membership and geometry compatibility do not establish semantic correctness or agreement with imagery/ground truth; keep human review and project-specific quality evaluation in the workflow.",
            }
        except (ValueError, TypeError) as exc:
            raise _tool_error(exc) from exc

    @server.tool()
    def reproject_geojson(geojson: dict[str, Any], source_crs: str, target_crs: str) -> dict[str, Any]:
        """Reproject a valid GeoJSON FeatureCollection from an explicitly supplied source CRS to a target CRS."""
        try:
            _check_payload_size({"geojson": geojson, "source_crs": source_crs, "target_crs": target_crs})
            _check_collection(geojson)
            validation = validate_geojson_collection(geojson, source_crs)
            if not validation["valid"]:
                raise ValueError(f"Input GeoJSON failed validation with {validation['error_count']} error(s)")
            if not isinstance(target_crs, str) or not target_crs.strip() or len(target_crs) > 256:
                raise ValueError("target_crs must be explicitly provided and no longer than 256 characters")
            try:
                normalized_target_crs = pyproj.CRS.from_user_input(target_crs).to_string()
            except Exception as exc:
                raise ValueError("target_crs must identify a valid coordinate reference system") from exc
            source_tagged = dict(geojson)
            source_tagged["crs"] = {"type": "name", "properties": {"name": source_crs}}
            result = reproject_feature_collection(source_tagged, normalized_target_crs)
            _check_payload_size(result)
            return {
                "geojson": result,
                "source_crs": validation["crs"],
                "target_crs": result["crs"]["properties"]["name"],
            }
        except (ValueError, TypeError) as exc:
            raise _tool_error(exc) from exc

    @server.tool()
    def spatial_join(
        source_geojson: dict[str, Any],
        target_geojson: dict[str, Any],
        source_crs: str,
        target_crs: str,
        predicate: str = "intersects",
    ) -> dict[str, Any]:
        """Run a CRS-aware spatial join and return matching feature index pairs."""
        try:
            _check_payload_size({
                "source_geojson": source_geojson,
                "target_geojson": target_geojson,
                "source_crs": source_crs,
                "target_crs": target_crs,
                "predicate": predicate,
            })
            _check_collection(source_geojson)
            _check_collection(target_geojson)
            source_check = validate_geojson_collection(source_geojson, source_crs)
            target_check = validate_geojson_collection(target_geojson, target_crs)
            if not source_check["valid"] or not target_check["valid"]:
                raise ValueError(
                    "Both collections must pass geometry validation before joining "
                    f"(source errors: {source_check['error_count']}; target errors: {target_check['error_count']})"
                )

            # Properties can be arbitrarily large and repeat for every match; omit them from
            # the GIS call and return indices so callers can reference their own input data.
            def geometry_only(collection: dict[str, Any]) -> dict[str, Any]:
                return {
                    "type": "FeatureCollection",
                    "features": [
                        {"type": "Feature", "geometry": feature["geometry"], "properties": {}}
                        for feature in collection["features"]
                    ],
                }

            raw_matches = run_spatial_join(
                geometry_only(source_geojson), geometry_only(target_geojson),
                source_crs, target_crs, predicate,
            )
            matches = [
                {"source_index": match["source_index"], "target_index": match["target_index"]}
                for match in raw_matches
            ]
            return {
                "source_crs": source_check["crs"],
                "target_crs": target_check["crs"],
                "predicate": predicate,
                "match_count": len(matches),
                "matches": matches,
            }
        except (ValueError, TypeError) as exc:
            raise _tool_error(exc) from exc

    return server


mcp = build_server()


if __name__ == "__main__":
    mcp.run()
