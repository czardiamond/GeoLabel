from io import BytesIO

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from conftest import SERVICE_KEY

SERVICE_HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}"}


def create_org_and_owner(client, name, email):
    created = client.post("/organizations", headers=SERVICE_HEADERS, json={
        "name": name,
        "owner_email": email,
        "owner_name": "Workspace Owner",
    })
    assert created.status_code == 201, created.text
    accepted = client.post("/auth/invitations/accept", json={
        "token": created.json()["invitation_token"],
        "display_name": "Workspace Owner",
        "password": "correct-horse-battery-1",
    })
    assert accepted.status_code == 200, accepted.text
    return created.json(), accepted.json(), {"Authorization": f"Bearer {accepted.json()['access_token']}"}


def geotiff_bytes():
    output = BytesIO()
    with MemoryFile() as mem:
        with mem.open(
            driver="GTiff", width=4, height=4, count=3, dtype="uint8",
            crs="EPSG:4326", transform=from_origin(-1, 1, 0.5, 0.5),
        ) as dataset:
            dataset.write(np.full((3, 4, 4), 100, dtype="uint8"))
        output.write(mem.read())
    return output.getvalue()


def polygon_collection(category="building", shift=0.0):
    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": [{
            "type": "Feature",
            "properties": {"category": category},
            "geometry": {"type": "Polygon", "coordinates": [[
                [-0.8 + shift, -0.8], [-0.2 + shift, -0.8], [-0.2 + shift, -0.2],
                [-0.8 + shift, -0.2], [-0.8 + shift, -0.8],
            ]]},
        }],
    }


def test_local_org_roles_and_full_asset_to_review_workflow(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import AnnotationRevision, AuditEvent, OrganizationMembership

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "private-assets"))
    organization, owner_session, owner_headers = create_org_and_owner(client, "Field Ops", "owner@example.com")
    org_id = organization["id"]

    invitation = client.post(
        f"/organizations/{org_id}/invitations",
        headers=owner_headers,
        json={"email": "worker@example.com", "role": "annotator"},
    )
    assert invitation.status_code == 201, invitation.text
    worker_response = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"],
        "display_name": "Field Worker",
        "password": "correct-horse-battery-2",
    })
    assert worker_response.status_code == 200, worker_response.text
    worker_headers = {"Authorization": f"Bearer {worker_response.json()['access_token']}"}

    project_response = client.post(
        f"/organizations/{org_id}/projects", headers=owner_headers,
        json={"name": "Flood mapping", "description": "Test project"},
    )
    assert project_response.status_code == 201, project_response.text
    project = project_response.json()
    dataset_response = client.post(
        f"/projects/{project['id']}/datasets", headers=owner_headers,
        json={"name": "Scene batch 1", "description": "Input imagery"},
    )
    assert dataset_response.status_code == 201, dataset_response.text
    dataset = dataset_response.json()

    upload = client.post(
        f"/datasets/{dataset['id']}/assets",
        headers=owner_headers,
        files={"file": ("scene.tif", geotiff_bytes(), "image/tiff")},
    )
    assert upload.status_code == 201, upload.text
    asset = upload.json()
    assert asset["kind"] == "image"
    assert asset["crs"] == "EPSG:4326"
    assert asset["bounds"] == [-1.0, -1.0, 1.0, 1.0]
    preview = client.get(asset["preview_path"], headers=owner_headers)
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"

    created_task = client.post(
        f"/projects/{project['id']}/tasks", headers=owner_headers, json={
            "title": "Scene tile 01", "dataset_id": dataset["id"], "asset_id": asset["id"],
            "crs": "EPSG:4326", "taxonomy": ["building", "road"], "target_annotator_count": 1,
            "priority": 8,
        },
    )
    assert created_task.status_code == 201, created_task.text
    task = created_task.json()

    assignment = client.post(
        f"/work/tasks/{task['id']}/assign", headers=owner_headers,
        json={"user_id": worker_response.json()["user"]["id"]},
    )
    assert assignment.status_code == 200, assignment.text
    other_invite = client.post(
        f"/organizations/{org_id}/invitations", headers=owner_headers,
        json={"email": "other-worker@example.com", "role": "annotator"},
    )
    other_worker = client.post("/auth/invitations/accept", json={
        "token": other_invite.json()["token"], "display_name": "Other Worker",
        "password": "correct-horse-battery-3",
    })
    other_headers = {"Authorization": f"Bearer {other_worker.json()['access_token']}"}
    assert client.get(f"/work/tasks/{task['id']}/asset/preview", headers=other_headers).status_code == 403
    assert client.get(f"/assets/{asset['id']}/content", headers=other_headers).status_code == 403
    assert client.get(f"/datasets/{dataset['id']}/assets", headers=other_headers).json() == []
    reassigned = client.post(f"/work/tasks/{task['id']}/assign", headers=owner_headers,
                            json={"user_id": other_worker.json()["user"]["id"]})
    assert reassigned.status_code == 200
    assert client.get(f"/work/tasks/{task['id']}/asset/preview", headers=worker_headers).status_code == 403
    assert client.get(f"/work/tasks/{task['id']}/asset/preview", headers=other_headers).status_code == 200
    assert client.post(f"/work/tasks/{task['id']}/assign", headers=owner_headers,
                       json={"user_id": worker_response.json()["user"]["id"]}).status_code == 200
    queue = client.get(f"/organizations/{org_id}/queue?view=annotate", headers=worker_headers)
    assert queue.status_code == 200
    assert [item["id"] for item in queue.json()] == [task["id"]]

    reservation = client.post(f"/work/tasks/{task['id']}/reserve", headers=worker_headers, json={"seconds": 600})
    assert reservation.status_code == 200
    assert reservation.json()["reserved_by_user_id"] == worker_response.json()["user"]["id"]
    worker_preview = client.get(f"/work/tasks/{task['id']}/asset/preview", headers=worker_headers)
    assert worker_preview.status_code == 200

    gold = client.put(
        f"/work/tasks/{task['id']}/gold-standard", headers=owner_headers,
        json={"geojson": polygon_collection()},
    )
    assert gold.status_code == 200, gold.text

    suggestion = client.post(
        f"/work/tasks/{task['id']}/preannotations", headers=owner_headers,
        json={"source": "external-detector", "model_version": "detector-v2", "geojson": polygon_collection()},
    )
    assert suggestion.status_code == 201, suggestion.text
    decision = client.post(
        f"/work/preannotations/{suggestion.json()['id']}/decision", headers=owner_headers,
        json={"decision": "accept"},
    )
    assert decision.status_code == 200
    assert decision.json()["status"] == "accepted"

    comment = client.post(
        f"/work/tasks/{task['id']}/comments", headers=worker_headers,
        json={"body": "The northeast building edge is slightly obscured.", "kind": "issue"},
    )
    assert comment.status_code == 201, comment.text
    assert client.get(f"/work/tasks/{task['id']}/comments", headers=owner_headers).json()[0]["kind"] == "issue"
    resolved = client.post(f"/work/comments/{comment.json()['id']}/status", headers=owner_headers,
                           json={"status": "resolved"})
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"

    submit = client.post(
        f"/work/tasks/{task['id']}/annotations", headers=worker_headers,
        json={"geojson": polygon_collection()},
    )
    assert submit.status_code == 200, submit.text
    assert submit.json()["review_status"] == "pending_review"
    quality = client.get(f"/work/tasks/{task['id']}/quality", headers=owner_headers)
    assert quality.status_code == 200
    assert quality.json()["available"] is True
    assert quality.json()["macro_f1"] == 1.0
    assert quality.json()["annotators"][0]["category_accuracy"] == 1.0

    analyst_invite = client.post(f"/organizations/{org_id}/invitations", headers=owner_headers,
                                 json={"email": "analyst@example.com", "role": "analyst"})
    analyst_session = client.post("/auth/invitations/accept", json={
        "token": analyst_invite.json()["token"], "display_name": "Quality Analyst",
        "password": "correct-horse-battery-4",
    })
    analyst_headers = {"Authorization": f"Bearer {analyst_session.json()['access_token']}"}
    score_queue = client.get(f"/organizations/{org_id}/queue?view=all&min_quality_score=0", headers=analyst_headers)
    assert score_queue.status_code == 200
    assert score_queue.json()[0]["gold_quality"] == 1.0
    assert client.get(f"/work/tasks/{task['id']}/quality", headers=analyst_headers).status_code == 200
    assert client.post(f"/organizations/{org_id}/projects", headers=analyst_headers,
                       json={"name": "Forbidden", "description": ""}).status_code == 403
    assert client.get(f"/organizations/{org_id}/members", headers=analyst_headers).status_code == 403

    review_queue = client.get(f"/organizations/{org_id}/queue?view=review", headers=owner_headers)
    assert review_queue.status_code == 200
    assert review_queue.json()[0]["id"] == task["id"]
    rework = client.post(
        f"/work/tasks/{task['id']}/review", headers=owner_headers,
        json={"decision": "rework", "comment": "Please refine the western boundary."},
    )
    assert rework.status_code == 200
    assert rework.json()["status"] == "revision_requested"
    revised = client.post(
        f"/work/tasks/{task['id']}/annotations", headers=worker_headers,
        json={"geojson": polygon_collection(shift=0.01)},
    )
    assert revised.status_code == 200
    assert revised.json()["review_status"] == "pending_review"
    with session_factory() as db:
        assert db.query(AnnotationRevision).count() == 1

    accepted = client.post(
        f"/work/tasks/{task['id']}/review", headers=owner_headers,
        json={"decision": "accept", "comment": "Accepted after revision."},
    )
    assert accepted.status_code == 200
    assert accepted.json()["review_status"] == "accepted"
    history = client.get(f"/work/tasks/{task['id']}/annotation-history", headers=owner_headers)
    assert history.status_code == 200
    assert [(row["version"], row["current"]) for row in history.json()["history"]] == [(1, False), (2, True)]
    assert history.json()["history"][0]["geojson"]["features"][0]["geometry"] != history.json()["history"][1]["geojson"]["features"][0]["geometry"]
    worker_history = client.get(f"/work/tasks/{task['id']}/annotation-history", headers=worker_headers)
    assert len(worker_history.json()["history"]) == 2
    worker_notifications = client.get("/auth/notifications?unread_only=true", headers=worker_headers)
    assert worker_notifications.status_code == 200
    assert any("accepted" in item["title"].lower() or "rework" in item["title"].lower() for item in worker_notifications.json())
    assert client.get(f"/organizations/{org_id}/audit", headers=owner_headers).status_code == 200
    with session_factory() as db:
        assert db.query(AuditEvent).filter_by(organization_id=org_id).count() >= 8
        assert db.query(OrganizationMembership).filter_by(organization_id=org_id).count() == 4


def test_org_roles_isolate_projects_and_reject_unsafe_remote_import(api_client):
    client, _ = api_client
    first_org, _, first_headers = create_org_and_owner(client, "Tenant One", "one@example.com")
    second_org, _, second_headers = create_org_and_owner(client, "Tenant Two", "two@example.com")
    created = client.post(
        f"/organizations/{first_org['id']}/projects", headers=first_headers,
        json={"name": "Private project", "description": "Tenant data"},
    )
    assert created.status_code == 201
    assert client.get(f"/organizations/{first_org['id']}/projects", headers=second_headers).status_code == 403
    dataset = client.post(f"/projects/{created.json()['id']}/datasets", headers=first_headers,
                          json={"name": "Input", "description": ""}).json()
    unsafe = client.post(f"/datasets/{dataset['id']}/assets/import", headers=first_headers, json={
        "url": "http://127.0.0.1/private", "filename": "private.tif",
    })
    assert unsafe.status_code == 400
    assert client.get("/auth/me", headers=first_headers).status_code == 200
    assert client.post("/auth/logout", headers=first_headers).status_code == 204
    assert client.get("/auth/me", headers=first_headers).status_code == 401
