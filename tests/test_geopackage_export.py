import json
import sqlite3

import pytest
import pyproj
from shapely import from_wkb

from backend.geopackage_export import build_consensus_geopackage


def _collection(geometry):
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {"category": "field"}, "geometry": geometry}],
    }


def test_custom_crs_and_geometry_collection_are_preserved(tmp_path):
    custom_crs = pyproj.CRS.from_proj4(
        "+proj=aeqd +lat_0=34 +lon_0=-117 +datum=WGS84 +units=m +no_defs +type=crs"
    )
    geometry = {
        "type": "GeometryCollection",
        "geometries": [
            {"type": "Point", "coordinates": [12.5, 25.5]},
            {"type": "LineString", "coordinates": [[30, 40], [50, 60]]},
        ],
    }
    encoded = build_consensus_geopackage(_collection(geometry), custom_crs.to_wkt())
    path = tmp_path / "custom.gpkg"
    path.write_bytes(encoded)

    with sqlite3.connect(path) as package:
        custom_srs = package.execute(
            "SELECT organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys WHERE srs_id=100000"
        ).fetchone()
        assert custom_srs is not None
        assert custom_srs[0:2] == ("NONE", 100000)
        assert pyproj.CRS.from_wkt(custom_srs[2]) == custom_crs
        assert package.execute(
            "SELECT srs_id FROM gpkg_geometry_columns WHERE table_name='consensus_features'"
        ).fetchone()[0] == 100000
        geometry_blob, = package.execute("SELECT geom FROM consensus_features").fetchone()
        assert int.from_bytes(geometry_blob[4:8], "little", signed=True) == 100000
        decoded = from_wkb(geometry_blob[8:])
        assert decoded.geom_type == "GeometryCollection"
        assert list(decoded.geoms[1].coords) == [(30.0, 40.0), (50.0, 60.0)]
        assert package.execute("PRAGMA foreign_key_check").fetchall() == []


def test_non_finite_properties_and_invalid_crs_are_rejected():
    point = {"type": "Point", "coordinates": [1, 2]}
    with pytest.raises(ValueError, match="finite, standard JSON"):
        build_consensus_geopackage(
            {"type": "FeatureCollection", "features": [{
                "type": "Feature", "properties": {"score": float("nan")}, "geometry": point,
            }]},
            "EPSG:4326",
        )

    with pytest.raises(ValueError, match="not recognized"):
        build_consensus_geopackage(_collection(point), "EPSG:not-a-crs")


def test_attribute_json_is_compact_utf8_and_preserves_large_integer_values(tmp_path):
    properties = {"message": "naïve café", "big": 2**70, "reserved": "safe"}
    feature = {"type": "Feature", "id": 7, "properties": properties,
               "geometry": {"type": "Point", "coordinates": [0, 0]}}
    path = tmp_path / "attributes.gpkg"
    path.write_bytes(build_consensus_geopackage({"type": "FeatureCollection", "features": [feature]}, "EPSG:4326"))

    with sqlite3.connect(path) as package:
        row = package.execute(
            "SELECT properties_json, source_feature_id_json, message, big, reserved FROM consensus_features"
        ).fetchone()
        properties_json, source_id, message, big, reserved = row
        assert json.loads(properties_json) == properties
        assert properties_json == '{"message":"naïve café","big":1180591620717411303424,"reserved":"safe"}'
        assert source_id == "7"
        assert message == "naïve café"
        assert big == str(2**70)
        assert reserved == "safe"


def test_three_dimensional_geometry_uses_iso_wkb_and_keeps_elevation(tmp_path):
    feature = {
        "type": "Feature",
        "properties": {},
        "geometry": {"type": "Point", "coordinates": [10, 20, 35.5]},
    }
    path = tmp_path / "three-dimensional.gpkg"
    path.write_bytes(build_consensus_geopackage({"type": "FeatureCollection", "features": [feature]}, "EPSG:3857"))

    with sqlite3.connect(path) as package:
        geometry_blob, = package.execute("SELECT geom FROM consensus_features").fetchone()
        # Standard ISO WKB uses type code 1001 for Point Z; EWKB would set the
        # high bit on type 1 instead.
        assert int.from_bytes(geometry_blob[9:13], "little") == 1001
        geometry = from_wkb(geometry_blob[8:])
        assert geometry.has_z
        assert tuple(geometry.coords[0]) == (10.0, 20.0, 35.5)
        assert package.execute(
            "SELECT z, m FROM gpkg_geometry_columns WHERE table_name='consensus_features'"
        ).fetchone() == (2, 0)
