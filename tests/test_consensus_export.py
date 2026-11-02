import json
from io import BytesIO

from PIL import Image

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
    unavailable = client.get(endpoint, headers=owner_headers)
    assert unavailable.status_code == 409

    source_collection = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
        "features": [{
            "type": "Feature",
            "properties": {"category": "building"},
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
