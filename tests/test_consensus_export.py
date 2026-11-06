import json
import sqlite3
from io import BytesIO

from PIL import Image
from shapely import from_wkb

from backend.models import Annotation, AuditEvent
from test_workflows import create_org_and_owner


def test_consensus_export_is_rfc7946_and_reprojects_projected_crs(api_client, tmp_path, monkeypatch):
    from backend.config import settings

    client, session_factory = api_client
    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "consensus-export-assets"))
    organization, _, owner_headers = create_org_and_owner(
        client, "Interoperability organization", "interoperability-owner@example.com"
    )
    project = client.post(
        f"/organizations/{organization['id']}/projects", headers=owner_headers,
        json={"name": "Export project", "description": ""},
    ).json()
    dataset = client.post(
        f"/projects/{project['id']}/datasets", headers=owner_headers,
        json={"name": "Projected scenes", "description": ""},
    ).json()
    image = BytesIO()
    Image.new("RGB", (8, 8), (30, 60, 90)).save(image, format="PNG")
    asset_response = client.post(
        f"/datasets/{dataset['id']}/assets", headers=owner_headers,
        files={"file": ("tile.png", image.getvalue(), "image/png")},
        data={"crs": "EPSG:3857", "bounds": "[0,0,111319.490793,111325.142866]"},
    )
    assert asset_response.status_code == 201, asset_response.text
    task_response = client.post(
        f"/projects/{project['id']}/tasks", headers=owner_headers,
        json={"title": "Projected consensus", "dataset_id": dataset["id"],
              "asset_id": asset_response.json()["id"], "crs": "EPSG:3857",
              "taxonomy": ["building"], "target_annotator_count": 2},
    )
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]

    endpoint = f"/work/tasks/{task_id}/consensus/export"
    geopackage_endpoint = f"/work/tasks/{task_id}/consensus/export.gpkg"
    unavailable = client.get(endpoint, headers=owner_headers)
    assert unavailable.status_code == 409
    unavailable_geopackage = client.get(geopackage_endpoint, headers=owner_headers)
    assert unavailable_geopackage.status_code == 409

    source_collection = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
        "features": [{
            "type": "Feature",
            "id": "parcel-π-1",
            "properties": {
                "category": "building", "note": "café", "metadata": {"source": "worker", "tags": ["roof", "wall"]},
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0, 0], [111319.490793, 0], [111319.490793, 111325.142866],
                                 [0, 111325.142866], [0, 0]]],
            },
        }],
    }
    with session_factory() as db:
        for index in range(2):
            db.add(Annotation(task_id=task_id, annotator_id=f"worker-{index}",
                              geojson_data=json.dumps(source_collection)))
        db.commit()

    geopackage_response = client.get(geopackage_endpoint, headers=owner_headers)
    assert geopackage_response.status_code == 200, geopackage_response.text
    assert geopackage_response.headers["content-type"].startswith("application/geopackage+sqlite3")
    assert geopackage_response.headers["content-disposition"].endswith('.gpkg"')
    geopackage_path = tmp_path / "consensus.gpkg"
    geopackage_path.write_bytes(geopackage_response.content)
    with sqlite3.connect(geopackage_path) as package:
        assert package.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert package.execute("PRAGMA application_id").fetchone()[0] == 0x47504B47
        assert package.execute("PRAGMA user_version").fetchone()[0] == 10300
        assert {row[0] for row in package.execute("SELECT srs_id FROM gpkg_spatial_ref_sys")} >= {-1, 0, 4326, 3857}
        contents = package.execute(
            "SELECT data_type, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents WHERE table_name='consensus_features'"
        ).fetchone()
        assert contents == ("features", 3857, 0.0, 0.0, 111319.490793, 111325.142866)
        geometry_metadata = package.execute(
            "SELECT column_name, geometry_type_name, srs_id, z, m FROM gpkg_geometry_columns WHERE table_name='consensus_features'"
        ).fetchone()
        assert geometry_metadata == ("geom", "GEOMETRY", 3857, 2, 0)
        row = package.execute(
            "SELECT geom, properties_json, source_feature_id_json, category, note, metadata "
            "FROM consensus_features"
        ).fetchone()
        geometry_blob, properties_json, feature_id_json, category, note, metadata = row
        assert geometry_blob[:2] == b"GP" and geometry_blob[2] == 0
        assert int.from_bytes(geometry_blob[4:8], "little", signed=True) == 3857
        projected_geometry = from_wkb(geometry_blob[8:])
        assert abs(projected_geometry.exterior.coords[1][0] - 111319.490793) < 1e-6
        assert abs(projected_geometry.exterior.coords[2][1] - 111325.142866) < 1e-6
        assert json.loads(properties_json) == {
            "category": "building", "note": "café", "metadata": {"source": "worker", "tags": ["roof", "wall"]},
            "annotator_support": 2, "annotator_count": 2, "agreement_ratio": 1.0,
            "iaa_score": 1.0, "verification_status": "agreement_supported",
        }
        assert feature_id_json == '"parcel-π-1"'
        assert (category, note, json.loads(metadata)) == ("building", "café", {"source": "worker", "tags": ["roof", "wall"]})

    response = client.get(endpoint, headers=owner_headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/geo+json")
    assert response.headers["content-disposition"].endswith('.geojson"')
    exported = response.json()
    assert exported["type"] == "FeatureCollection"
    assert "crs" not in exported
    assert len(exported["features"]) == 1
    feature = exported["features"][0]
    assert feature["properties"]["verification_status"] == "agreement_supported"
    assert feature["properties"]["annotator_support"] == 2
    ring = feature["geometry"]["coordinates"][0]
    assert abs(ring[1][0] - 1) < 0.0001
    assert abs(ring[2][1] - 1) < 0.0001
    assert -180 <= ring[2][0] <= 180 and -90 <= ring[2][1] <= 90

    with session_factory() as db:
        audit_row = db.query(AuditEvent).filter_by(
            organization_id=organization["id"], action="task.consensus_exported", resource_id=task_id,
        ).first()
        assert audit_row is not None
        assert audit_row.details["source_crs"] == "EPSG:3857"
        assert audit_row.details["target_crs"] == "OGC:CRS84"
        geopackage_audit = db.query(AuditEvent).filter_by(
            organization_id=organization["id"], action="task.consensus_geopackage_exported", resource_id=task_id,
        ).first()
        assert geopackage_audit is not None
        assert geopackage_audit.details["source_crs"] == "EPSG:3857"
        assert geopackage_audit.details["target_crs"] == "EPSG:3857"

    invitation = client.post(
        f"/organizations/{organization['id']}/invitations", headers=owner_headers,
        json={"email": "interoperability-worker@example.com", "role": "annotator"},
    )
    assert invitation.status_code == 201, invitation.text
    accepted = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"], "display_name": "Worker",
        "password": "Strong-Test-Password-42!",
    })
    assert accepted.status_code == 200, accepted.text
    worker_headers = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    denied = client.get(endpoint, headers=worker_headers)
    assert denied.status_code == 403
    denied_geopackage = client.get(geopackage_endpoint, headers=worker_headers)
    assert denied_geopackage.status_code == 403
