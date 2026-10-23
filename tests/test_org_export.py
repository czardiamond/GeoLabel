import json
import zipfile
from io import BytesIO

from PIL import Image

from test_workflows import create_org_and_owner


def test_org_export_contains_records_and_asset_without_credentials(api_client, tmp_path, monkeypatch):
    from backend.config import settings
    from backend.models import Annotation, Task

    client, session_factory = api_client
    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "org-export-assets"))
    org, _, owner_headers = create_org_and_owner(client, "Export organization", "export-owner@example.com")
    project = client.post(f"/organizations/{org['id']}/projects", headers=owner_headers,
                          json={"name": "Export project", "description": "export test"}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Export dataset", "description": ""}).json()
    image = BytesIO()
    Image.new("RGB", (8, 8), (20, 40, 60)).save(image, format="PNG")
    asset_response = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                                 files={"file": ("tile.png", image.getvalue(), "image/png")},
                                 data={"crs": "EPSG:4326", "bounds": "[-1,-1,1,1]"})
    assert asset_response.status_code == 201, asset_response.text
    task_response = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Export task", "dataset_id": dataset["id"], "asset_id": asset_response.json()["id"],
        "crs": "EPSG:4326", "taxonomy": ["building"], "target_annotator_count": 1,
    })
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]
    collection = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"category": "building"},
                  "geometry": {"type": "Point", "coordinates": [0, 0]}}]}
    with session_factory() as db:
        db.add(Annotation(task_id=task_id, annotator_id="export-test-worker",
                          geojson_data=json.dumps(collection), review_status="accepted"))
        db.commit()

    response = client.get(f"/organizations/{org['id']}/export", headers=owner_headers)
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert "manifest.json" in names
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["schema_version"] == "geolabel-organization-export-v1"
        assert manifest["tasks"][0]["id"] == task_id
        assert manifest["annotations"][0]["geojson"] == collection
        assert manifest["assets"][0]["crs"] == "EPSG:4326"
        assert manifest["audit_events"]
        asset_path = manifest["assets"][0]["archive_path"]
        assert asset_path in names
        with Image.open(BytesIO(archive.read(asset_path))) as extracted:
            assert extracted.size == (8, 8)
        manifest_text = archive.read("manifest.json").decode()
        assert "password_hash" not in manifest_text
        assert "token_hash" not in manifest_text
        assert '"session_token"' not in manifest_text

    invitation = client.post(f"/organizations/{org['id']}/invitations", headers=owner_headers, json={
        "email": "export-annotator@example.com", "role": "annotator"})
    assert invitation.status_code == 201, invitation.text
    accepted = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"], "display_name": "Export Annotator", "password": "Strong-Test-Password-42!"})
    assert accepted.status_code == 200, accepted.text
    annotator_headers = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    denied = client.get(f"/organizations/{org['id']}/export", headers=annotator_headers)
    assert denied.status_code == 403
