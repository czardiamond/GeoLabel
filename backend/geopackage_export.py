"""Small, standards-based GeoPackage writer for consensus feature exports.

The file is a standalone SQLite GeoPackage; it is never written into the
application database. Geometry coordinates remain in the supplied project CRS.
"""

from __future__ import annotations

import json
import math
import sqlite3
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyproj
from shapely import to_wkb
from shapely.geometry import shape


GPKG_APPLICATION_ID = 0x47504B47  # ASCII "GPKG"
GPKG_USER_VERSION = 10300  # GeoPackage 1.3.0
FEATURE_TABLE = "consensus_features"
GEOMETRY_COLUMN = "geom"
PROPERTIES_JSON_COLUMN = "properties_json"
FEATURE_ID_JSON_COLUMN = "source_feature_id_json"
CUSTOM_SRS_ID = 100000
_SQLITE_INTEGER_MIN = -(2**63)
_SQLITE_INTEGER_MAX = 2**63 - 1
_RESERVED_COLUMNS = {"fid", GEOMETRY_COLUMN.casefold(), PROPERTIES_JSON_COLUMN.casefold(), FEATURE_ID_JSON_COLUMN.casefold()}


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _field_name(original: str, used: set[str]) -> str:
    """Keep ordinary property names readable and alias SQL/reserved collisions."""
    candidate = original
    if not candidate or "\x00" in candidate or candidate.casefold() in _RESERVED_COLUMNS:
        candidate = "property"
    base = candidate
    suffix = 2
    while candidate.casefold() in used:
        candidate = f"{base}_{suffix}"
        suffix += 1
    used.add(candidate.casefold())
    return candidate


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _sqlite_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return _json_text(value)
    if isinstance(value, bool):
        return int(value)
    return value


def _sqlite_type(values: list[Any]) -> str:
    present = [value for value in values if value is not None]
    if not present:
        return "TEXT"
    if all(isinstance(value, bool) for value in present):
        return "BOOLEAN"
    if all(isinstance(value, (bool, int)) and not isinstance(value, float) for value in present):
        if any(isinstance(value, int) and not isinstance(value, bool)
               and not _SQLITE_INTEGER_MIN <= value <= _SQLITE_INTEGER_MAX for value in present):
            return "TEXT"
        return "INTEGER"
    if all(isinstance(value, (bool, int, float)) for value in present):
        return "REAL"
    if all(isinstance(value, (str, dict, list)) for value in present):
        return "TEXT"
    # Mixed-type GeoJSON values have no single scalar SQL type. BLOB affinity
    # avoids SQLite coercing numbers or strings; properties_json remains the
    # authoritative, lossless representation of every original value.
    return "BLOB"


def _srs_row(crs: pyproj.CRS) -> tuple[int, str, int, str, str]:
    epsg = crs.to_epsg()
    if epsg is not None and 0 < epsg < 2**31:
        return epsg, "EPSG", epsg, crs.to_wkt(version="WKT2_2019"), crs.name
    return (
        CUSTOM_SRS_ID,
        "NONE",
        CUSTOM_SRS_ID,
        crs.to_wkt(version="WKT2_2019"),
        f"GeoLabel custom CRS: {crs.name}",
    )


def _iter_positions(value: Any):
    if isinstance(value, (list, tuple)):
        if len(value) >= 2 and all(isinstance(part, (int, float)) and not isinstance(part, bool) for part in value[:2]):
            yield value
        else:
            for part in value:
                yield from _iter_positions(part)


def _iter_geometry_positions(geometry: dict[str, Any]):
    if geometry.get("type") == "GeometryCollection":
        for child in geometry.get("geometries", []):
            if isinstance(child, dict):
                yield from _iter_geometry_positions(child)
        return
    yield from _iter_positions(geometry.get("coordinates"))


def _encode_geometry(geometry_geojson: Any, srs_id: int) -> tuple[bytes, tuple[float, float, float, float]]:
    if not isinstance(geometry_geojson, dict) or not isinstance(geometry_geojson.get("type"), str):
        raise ValueError("Each consensus feature must include a GeoJSON geometry object.")
    try:
        geometry = shape(geometry_geojson)
    except Exception as exc:
        raise ValueError(f"A consensus geometry could not be encoded: {exc}") from exc
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError("Empty or invalid geometries cannot be written to GeoPackage.")

    positions = list(_iter_geometry_positions(geometry_geojson))
    if not positions or not all(math.isfinite(float(value)) for position in positions for value in position):
        raise ValueError("Consensus geometry coordinates must be finite and non-empty.")

    bounds = tuple(float(value) for value in geometry.bounds)
    if len(bounds) != 4 or not all(math.isfinite(value) for value in bounds):
        raise ValueError("Consensus geometry bounds must be finite.")
    output_dimension = 3 if geometry.has_z else 2
    try:
        wkb = to_wkb(
            geometry,
            output_dimension=output_dimension,
            byte_order=1,
            include_srid=False,
            flavor="iso",
        )
    except Exception as exc:
        raise ValueError(f"A consensus geometry could not be serialized: {exc}") from exc
    # GeoPackageBinary: magic, version 0, little-endian/no-envelope flags,
    # signed SRS ID, followed by standard little-endian ISO WKB.
    header = b"GP" + bytes((0, 1)) + struct.pack("<i", srs_id)
    return header + bytes(wkb), (bounds[0], bounds[1], bounds[2], bounds[3])


def build_consensus_geopackage(feature_collection: dict[str, Any], crs_input: str) -> bytes:
    """Return a GeoPackage 1.3 file with consensus features in ``crs_input``.

    Scalar GeoJSON properties are exposed as SQLite attributes. Nested values
    are compact JSON strings in their own columns, and ``properties_json``
    retains every original property (including its JSON type and original key)
    losslessly. ``source_feature_id_json`` retains an optional GeoJSON Feature
    ID without conflating it with the GeoPackage integer primary key.
    """
    if not isinstance(feature_collection, dict) or feature_collection.get("type") != "FeatureCollection":
        raise ValueError("A GeoJSON FeatureCollection is required for GeoPackage export.")
    features = feature_collection.get("features")
    if not isinstance(features, list):
        raise ValueError("The consensus FeatureCollection must contain a features array.")
    if not isinstance(crs_input, str) or not crs_input.strip():
        raise ValueError("A project CRS is required for GeoPackage export.")
    try:
        crs = pyproj.CRS.from_user_input(crs_input)
    except Exception as exc:
        raise ValueError(f"The project CRS is not recognized: {exc}") from exc

    srs_id, organization, authority_id, definition, srs_name = _srs_row(crs)
    prepared = []
    property_keys: set[str] = set()
    bounds: list[tuple[float, float, float, float]] = []
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError("Every consensus item must be a GeoJSON Feature.")
        properties = feature.get("properties")
        if properties is None:
            properties = {}
        if not isinstance(properties, dict) or any(not isinstance(key, str) for key in properties):
            raise ValueError("GeoJSON feature properties must be an object with string keys.")
        try:
            properties_json = _json_text(properties)
            feature_id_json = _json_text(feature["id"]) if "id" in feature else None
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Consensus attributes must contain finite, standard JSON values: {exc}") from exc
        geometry_blob, geometry_bounds = _encode_geometry(feature.get("geometry"), srs_id)
        property_keys.update(properties)
        prepared.append((feature, properties, properties_json, feature_id_json, geometry_blob))
        bounds.append(geometry_bounds)

    used_names = set(_RESERVED_COLUMNS)
    columns: dict[str, str] = {}
    original_to_column: dict[str, str] = {}
    for key in sorted(property_keys):
        name = _field_name(key, used_names)
        original_to_column[key] = name
        columns[name] = _sqlite_type([item[1].get(key) for item in prepared])

    if bounds:
        min_x = min(item[0] for item in bounds)
        min_y = min(item[1] for item in bounds)
        max_x = max(item[2] for item in bounds)
        max_y = max(item[3] for item in bounds)
    else:
        min_x = min_y = max_x = max_y = None

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    with tempfile.TemporaryDirectory(prefix="geolabel-gpkg-") as directory:
        path = Path(directory) / "consensus.gpkg"
        connection = sqlite3.connect(path)
        try:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute(f"PRAGMA application_id = {GPKG_APPLICATION_ID}")
            connection.execute(f"PRAGMA user_version = {GPKG_USER_VERSION}")
            connection.execute("PRAGMA page_size = 4096")
            connection.executescript(
                """
                CREATE TABLE gpkg_spatial_ref_sys (
                    srs_name TEXT NOT NULL,
                    srs_id INTEGER PRIMARY KEY,
                    organization TEXT NOT NULL,
                    organization_coordsys_id INTEGER NOT NULL,
                    definition TEXT NOT NULL,
                    description TEXT
                );
                CREATE TABLE gpkg_contents (
                    table_name TEXT NOT NULL PRIMARY KEY,
                    data_type TEXT NOT NULL,
                    identifier TEXT UNIQUE,
                    description TEXT DEFAULT ' ',
                    last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    min_x DOUBLE,
                    min_y DOUBLE,
                    max_x DOUBLE,
                    max_y DOUBLE,
                    srs_id INTEGER,
                    CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
                );
                CREATE TABLE gpkg_geometry_columns (
                    table_name TEXT NOT NULL,
                    column_name TEXT NOT NULL,
                    geometry_type_name TEXT NOT NULL,
                    srs_id INTEGER NOT NULL,
                    z TINYINT NOT NULL,
                    m TINYINT NOT NULL,
                    CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
                    CONSTRAINT uk_gc_table_name UNIQUE (table_name),
                    CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
                    CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
                );
                """
            )

            required_crs = pyproj.CRS.from_epsg(4326)
            required_wkt = required_crs.to_wkt(version="WKT2_2019")
            connection.executemany(
                "INSERT INTO gpkg_spatial_ref_sys "
                "(srs_name, srs_id, organization, organization_coordsys_id, definition, description) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                [
                    ("Undefined Cartesian SRS", -1, "NONE", -1, "undefined", "undefined"),
                    ("Undefined Geographic SRS", 0, "NONE", 0, "undefined", "undefined"),
                    ("WGS 84 geodetic", 4326, "EPSG", 4326, required_wkt, "longitude/latitude coordinates in decimal degrees"),
                ],
            )
            if srs_id not in {-1, 0, 4326}:
                connection.execute(
                    "INSERT INTO gpkg_spatial_ref_sys "
                    "(srs_name, srs_id, organization, organization_coordsys_id, definition, description) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (srs_name, srs_id, organization, authority_id, definition, "GeoLabel task/project CRS"),
                )

            connection.execute(
                "INSERT INTO gpkg_contents "
                "(table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) "
                "VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?, ?)",
                (FEATURE_TABLE, "GeoLabel consensus", "Agreement-supported consensus features in the task CRS.",
                 timestamp, min_x, min_y, max_x, max_y, srs_id),
            )
            connection.execute(
                "INSERT INTO gpkg_geometry_columns "
                "(table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, ?, 'GEOMETRY', ?, 2, 0)",
                (FEATURE_TABLE, GEOMETRY_COLUMN, srs_id),
            )

            attribute_columns = ", ".join(
                f"{_quote_identifier(name)} {column_type}" for name, column_type in columns.items()
            )
            extra_columns = f", {attribute_columns}" if attribute_columns else ""
            connection.execute(
                f"CREATE TABLE {_quote_identifier(FEATURE_TABLE)} "
                f"(fid INTEGER PRIMARY KEY AUTOINCREMENT, "
                f"{_quote_identifier(GEOMETRY_COLUMN)} BLOB, "
                f"{_quote_identifier(PROPERTIES_JSON_COLUMN)} TEXT NOT NULL, "
                f"{_quote_identifier(FEATURE_ID_JSON_COLUMN)} TEXT{extra_columns})"
            )
            insert_columns = ["fid", GEOMETRY_COLUMN, PROPERTIES_JSON_COLUMN, FEATURE_ID_JSON_COLUMN, *columns]
            insert_sql = (
                f"INSERT INTO {_quote_identifier(FEATURE_TABLE)} "
                f"({', '.join(_quote_identifier(name) for name in insert_columns)}) "
                f"VALUES ({', '.join('?' for _ in insert_columns)})"
            )
            for _, properties, properties_json, feature_id_json, geometry_blob in prepared:
                values = [None, geometry_blob, properties_json, feature_id_json]
                for key in original_to_column:
                    value = properties.get(key)
                    if isinstance(value, int) and not isinstance(value, bool) and not _SQLITE_INTEGER_MIN <= value <= _SQLITE_INTEGER_MAX:
                        value = str(value)
                    if isinstance(value, (dict, list)):
                        value = _json_text(value)
                    values.append(_sqlite_value(value))
                connection.execute(insert_sql, values)
            connection.commit()
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise ValueError(f"Generated GeoPackage failed SQLite integrity_check: {integrity}")
        except (sqlite3.Error, OSError) as exc:
            raise ValueError(f"GeoPackage creation failed: {exc}") from exc
        finally:
            connection.close()
        return path.read_bytes()
