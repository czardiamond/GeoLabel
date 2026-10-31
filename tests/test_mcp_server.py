import asyncio
import json
from pathlib import Path

from mcp import Client

from geolabel_mcp.server import mcp


def test_geojson_validation_tool_is_registered_and_works_over_mcp_protocol():
    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            listing = await client.list_tools()
            names = {tool.name for tool in listing.tools}
            assert {"validate_geojson", "validate_annotation_labels", "reproject_geojson", "spatial_join"} <= names
            result = await client.call_tool("validate_geojson", {
                "geojson": {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [12.5, 41.9]},
                        "properties": {"class": "landmark"},
                    }],
                },
                "crs": "EPSG:4326",
                "required_fields": ["class"],
            })
            assert result.is_error is not True
            assert result.structured_content["valid"] is True
            assert result.structured_content["geometry_counts"] == {"Point": 1}

    asyncio.run(exercise_server())


def test_mcp_annotation_label_validation_checks_taxonomy_and_geometry_rules():
    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            collection = {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}, "properties": {"class": "building"}},
                    {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}, "properties": {"class": "waterway"}},
                    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0.5, 0.5]}, "properties": {"class": "unapproved"}},
                    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0.5, 0.5]}, "properties": {"class": "building"}},
                    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0.5, 0.5]}, "properties": {}},
                ],
            }
            result = await client.call_tool("validate_annotation_labels", {
                "geojson": collection,
                "crs": "OGC:CRS84",
                "label_field": "class",
                "allowed_labels": ["building", "waterway"],
                "geometry_by_label": {"building": ["Polygon", "MultiPolygon"], "waterway": ["LineString", "MultiLineString"]},
            })
            assert result.is_error is not True
            report = result.structured_content
            assert report["valid"] is False
            assert report["label_error_count"] == 3
            assert [error["code"] for error in report["label_errors"]] == [
                "unknown_label", "label_geometry_mismatch", "missing_or_invalid_label",
            ]
            assert report["structural_validation"]["valid"] is True
            assert "do not establish semantic correctness" in report["accuracy_note"]

    asyncio.run(exercise_server())


def test_mcp_validates_and_joins_official_nigeria_adm1_sample():
    sample_path = Path(__file__).resolve().parents[1] / "examples" / "data" / "nigeria-adm1-geoboundaries.geojson"
    collection = json.loads(sample_path.read_text(encoding="utf-8"))
    crs = collection["crs"]["properties"]["name"]

    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            validation = await client.call_tool("validate_geojson", {
                "geojson": collection,
                "crs": crs,
                "required_fields": ["shapeName", "shapeISO", "shapeID"],
            })
            assert validation.is_error is not True
            assert validation.structured_content["valid"] is True
            assert validation.structured_content["feature_count"] == 37

            point = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [3.3792, 6.5244]},
                    "properties": {},
                }],
            }
            join = await client.call_tool("spatial_join", {
                "source_geojson": collection,
                "target_geojson": point,
                "source_crs": crs,
                "target_crs": "OGC:CRS84",
                "predicate": "contains",
            })
            assert join.is_error is not True
            matches = join.structured_content["matches"]
            assert len(matches) == 1
            assert collection["features"][matches[0]["source_index"]]["properties"]["shapeName"] == "Lagos"

    asyncio.run(exercise_server())


def test_mcp_reprojection_uses_explicit_source_crs():
    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            result = await client.call_tool("reproject_geojson", {
                "geojson": {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [0, 0]},
                        "properties": {},
                    }],
                },
                "source_crs": "EPSG:4326",
                "target_crs": "EPSG:3857",
            })
            assert result.is_error is not True
            assert result.structured_content["source_crs"] == "EPSG:4326"
            assert result.structured_content["target_crs"] == "EPSG:3857"

    asyncio.run(exercise_server())


def test_mcp_spatial_join_returns_bounded_index_pairs():
    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            polygon = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
            point = {"type": "Point", "coordinates": [0.5, 0.5]}
            result = await client.call_tool("spatial_join", {
                "source_geojson": {"type": "FeatureCollection", "features":[{"type":"Feature","geometry":polygon,"properties":{"secret":"large metadata omitted"}}]},
                "target_geojson": {"type": "FeatureCollection", "features":[{"type":"Feature","geometry":point,"properties":{"id":"target"}}]},
                "source_crs": "EPSG:4326",
                "target_crs": "EPSG:4326",
                "predicate": "intersects",
            })
            assert result.is_error is not True
            assert result.structured_content["match_count"] == 1
            assert result.structured_content["matches"] == [{"source_index": 0, "target_index": 0}]

    asyncio.run(exercise_server())


def test_mcp_reprojection_rejects_invalid_target_for_empty_collection():
    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            result = await client.call_tool("reproject_geojson", {
                "geojson": {"type": "FeatureCollection", "features": []},
                "source_crs": "EPSG:4326",
                "target_crs": "not-a-crs",
            })
            assert result.is_error is True
            assert "target_crs" in result.content[0].text

    asyncio.run(exercise_server())
