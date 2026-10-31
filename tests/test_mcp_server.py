import asyncio

from mcp import Client

from geolabel_mcp.server import mcp


def test_geojson_validation_tool_is_registered_and_works_over_mcp_protocol():
    async def exercise_server():
        async with Client(mcp, raise_exceptions=True) as client:
            listing = await client.list_tools()
            names = {tool.name for tool in listing.tools}
            assert {"validate_geojson", "reproject_geojson", "spatial_join"} <= names
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
