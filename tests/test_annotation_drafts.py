from conftest import SERVICE_KEY
from test_workflows import create_org_and_owner, geotiff_bytes, polygon_collection

SERVICE_HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}"}


def _invite_worker(client, org_id, owner_headers, email):
    invitation = client.post(f"/organizations/{org_id}/invitations", headers=owner_headers,
                             json={"email": email, "role": "annotator"})
    assert invitation.status_code == 201, invitation.text
    accepted = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"], "display_name": "Draft Worker",
        "password": "correct-horse-battery-9",
    })
    assert accepted.status_code == 200, accepted.text
    return accepted.json(), {"Authorization": f"Bearer {accepted.json()['access_token']}"}


def test_server_draft_recovery_is_versioned_private_bounded_and_cleared_on_submit(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import AnnotationDraft

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "draft-assets"))
    organization, _, owner_headers = create_org_and_owner(client, "Draft recovery", "draft-owner@example.com")
    org_id = organization["id"]
    worker, worker_headers = _invite_worker(client, org_id, owner_headers, "draft-worker@example.com")
    unassigned, unassigned_headers = _invite_worker(client, org_id, owner_headers, "other-worker@example.com")

    project = client.post(f"/organizations/{org_id}/projects", headers=owner_headers,
                          json={"name": "Draft project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Draft dataset", "description": ""}).json()
    uploaded = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                           files={"file": ("scene.tif", geotiff_bytes(), "image/tiff")})
    assert uploaded.status_code == 201, uploaded.text
    task_response = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Draft task", "dataset_id": dataset["id"], "asset_id": uploaded.json()["id"],
        "crs": "EPSG:4326", "taxonomy": ["building"], "target_annotator_count": 1,
        "assigned_user_id": worker["user"]["id"],
    })
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]

    inference_status = client.get(f"/work/tasks/{task_id}/inference/status", headers=worker_headers)
    assert inference_status.status_code == 200
    assert inference_status.json()["available"] is False
    assert inference_status.json()["provider_configured"] is False
    assert inference_status.json()["model_configured"] is False
    assert inference_status.json()["external_data_transfer"] is False
    assert inference_status.json()["human_review_required"] is True
    assert client.get(f"/work/tasks/{task_id}/inference/status", headers=unassigned_headers).status_code == 403

    missing = client.get(f"/work/tasks/{task_id}/draft", headers=worker_headers)
    assert missing.status_code == 200
    assert missing.json() == {"available": False, "version": 0}

    from backend.config import settings
    monkeypatch.setattr(settings, "MAX_ANNOTATION_DRAFT_BYTES", 30)
    oversized = client.put(f"/work/tasks/{task_id}/draft", headers=worker_headers,
                           json={"draft": polygon_collection(), "version": 0})
    assert oversized.status_code == 413
    monkeypatch.setattr(settings, "MAX_ANNOTATION_DRAFT_BYTES", 5_000_000)

    saved = client.put(f"/work/tasks/{task_id}/draft", headers=worker_headers,
                       json={"draft": polygon_collection(), "version": 0})
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 1
    recovered = client.get(f"/work/tasks/{task_id}/draft", headers=worker_headers)
    assert recovered.json()["available"] is True
    assert recovered.json()["draft"]["features"][0]["properties"]["category"] == "building"

    # Drafts are per contributor, even when an owner can inspect the task itself.
    owner_view = client.get(f"/work/tasks/{task_id}/draft", headers=owner_headers)
    assert owner_view.json() == {"available": False, "version": 0}
    unassigned_view = client.get(f"/work/tasks/{task_id}/draft", headers=unassigned_headers)
    assert unassigned_view.status_code == 403

    conflict = client.put(f"/work/tasks/{task_id}/draft", headers=worker_headers,
                          json={"draft": polygon_collection(shift=0.05), "version": 0})
    assert conflict.status_code == 409
    updated = client.put(f"/work/tasks/{task_id}/draft", headers=worker_headers,
                         json={"draft": polygon_collection(shift=0.05), "version": 1})
    assert updated.status_code == 200
    assert updated.json()["version"] == 2

    submitted = client.post(f"/work/tasks/{task_id}/annotations", headers=worker_headers,
                            json={"geojson": polygon_collection(shift=0.05)})
    assert submitted.status_code == 200, submitted.text
    cleared = client.get(f"/work/tasks/{task_id}/draft", headers=worker_headers)
    assert cleared.json() == {"available": False, "version": 0}
    with session_factory() as db:
        assert db.query(AnnotationDraft).filter_by(task_id=task_id, user_id=worker["user"]["id"]).count() == 0


def test_draft_discard_is_idempotent(api_client, tmp_path, monkeypatch):
    client, _ = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "discard-assets"))
    organization, _, owner_headers = create_org_and_owner(client, "Discard draft", "discard-owner@example.com")
    project = client.post(f"/organizations/{organization['id']}/projects", headers=owner_headers,
                          json={"name": "Discard project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Discard dataset", "description": ""}).json()
    uploaded = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                           files={"file": ("scene.tif", geotiff_bytes(), "image/tiff")})
    task = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Discard task", "dataset_id": dataset["id"], "asset_id": uploaded.json()["id"],
        "crs": "EPSG:4326", "taxonomy": ["building"],
    }).json()
    for _ in range(2):
        deleted = client.delete(f"/work/tasks/{task['id']}/draft", headers=owner_headers)
        assert deleted.status_code == 204
