from test_workflows import create_org_and_owner, geotiff_bytes, polygon_collection


def test_two_annotators_submit_independently_and_reviewer_gets_majority_consensus(api_client, tmp_path, monkeypatch):
    client, _ = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "consensus-assets"))
    org, _, owner_headers = create_org_and_owner(client, "Independent reviewers", "consensus-owner@example.com")
    workers = []
    for index in range(2):
        invited = client.post(f"/organizations/{org['id']}/invitations", headers=owner_headers, json={
            "email": f"review-worker-{index}@example.com", "role": "annotator",
        })
        accepted = client.post("/auth/invitations/accept", json={
            "token": invited.json()["token"], "display_name": f"Worker {index}",
            "password": f"correct-horse-battery-{index + 5}",
        })
        workers.append({"Authorization": f"Bearer {accepted.json()['access_token']}"})

    project = client.post(f"/organizations/{org['id']}/projects", headers=owner_headers,
                          json={"name": "Consensus project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Scenes", "description": ""}).json()
    upload = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                         files={"file": ("scene.tif", geotiff_bytes(), "image/tiff")})
    assert upload.status_code == 201, upload.text
    task_response = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Consensus tile", "dataset_id": dataset["id"], "asset_id": upload.json()["id"],
        "crs": "EPSG:4326", "taxonomy": ["building", "road"], "target_annotator_count": 2,
    })
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]

    first_queue = client.get(f"/organizations/{org['id']}/queue?view=annotate", headers=workers[0])
    assert any(task["id"] == task_id for task in first_queue.json())
    reserved = client.post(f"/work/tasks/{task_id}/reserve", headers=workers[0], json={"seconds": 600})
    assert reserved.status_code == 200
    first_submission = client.post(f"/work/tasks/{task_id}/annotations", headers=workers[0],
                                   json={"geojson": polygon_collection()})
    assert first_submission.status_code == 200, first_submission.text
    assert first_submission.json()["review_status"] == "not_started"
    assert first_submission.json()["reserved_by_user_id"] is None
    unavailable = client.get(f"/work/tasks/{task_id}/consensus", headers=owner_headers)
    assert unavailable.status_code == 200
    assert unavailable.json()["available"] is False
    assert unavailable.json()["geojson"]["features"] == []

    second_queue = client.get(f"/organizations/{org['id']}/queue?view=annotate", headers=workers[1])
    assert any(task["id"] == task_id for task in second_queue.json())
    assert client.post(f"/work/tasks/{task_id}/reserve", headers=workers[1], json={"seconds": 600}).status_code == 200
    second_submission = client.post(f"/work/tasks/{task_id}/annotations", headers=workers[1],
                                    json={"geojson": polygon_collection()})
    assert second_submission.status_code == 200, second_submission.text
    assert second_submission.json()["review_status"] == "pending_review"
    assert second_submission.json()["iaa_score"] == 1.0

    consensus = client.get(f"/work/tasks/{task_id}/consensus", headers=owner_headers)
    assert consensus.status_code == 200, consensus.text
    body = consensus.json()
    assert body["available"] is True
    assert body["annotation_count"] == 2
    assert body["required_support"] == 2
    assert len(body["geojson"]["features"]) == 1
    assert body["geojson"]["features"][0]["properties"]["annotator_support"] == 2
    assert client.get(f"/work/tasks/{task_id}/consensus", headers=workers[0]).status_code == 403

    rework = client.post(f"/work/tasks/{task_id}/review", headers=owner_headers,
                         json={"decision": "rework", "comment": "Refine the boundary independently."})
    assert rework.status_code == 200
    first_revision = client.post(f"/work/tasks/{task_id}/annotations", headers=workers[0],
                                 json={"geojson": polygon_collection()})
    assert first_revision.status_code == 200
    assert first_revision.json()["review_status"] == "not_started"
    second_revision = client.post(f"/work/tasks/{task_id}/annotations", headers=workers[1],
                                  json={"geojson": polygon_collection()})
    assert second_revision.status_code == 200
    assert second_revision.json()["review_status"] == "pending_review"
