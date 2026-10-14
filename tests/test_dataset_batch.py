from test_workflows import create_org_and_owner, geotiff_bytes


def test_dataset_batch_creates_one_real_task_per_selected_asset(api_client, tmp_path, monkeypatch):
    client, _ = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "batch-assets"))
    organization, _, owner_headers = create_org_and_owner(client, "Batch team", "batch-owner@example.com")
    project = client.post(f"/organizations/{organization['id']}/projects", headers=owner_headers,
                          json={"name": "Batch project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Scenes", "description": ""}).json()
    asset_ids = []
    for index in range(2):
        upload = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                             files={"file": (f"scene-{index}.tif", geotiff_bytes(), "image/tiff")})
        assert upload.status_code == 201, upload.text
        asset_ids.append(upload.json()["id"])

    batch = client.post(f"/datasets/{dataset['id']}/tasks/batch", headers=owner_headers, json={
        "title_prefix": "Scene", "asset_ids": asset_ids, "crs": "EPSG:4326",
        "taxonomy": ["building", "road"], "target_annotator_count": 3, "priority": 7,
    })
    assert batch.status_code == 201, batch.text
    tasks = batch.json()
    assert len(tasks) == 2
    assert {task["asset_id"] for task in tasks} == set(asset_ids)
    assert {task["title"] for task in tasks} == {"Scene 1", "Scene 2"}
    assert all(task["crs"] == "EPSG:4326" and task["taxonomy"] == ["building", "road"] for task in tasks)
    assert all(task["target_annotator_count"] == 3 and task["priority"] == 7 for task in tasks)
    all_tasks = client.get(f"/organizations/{organization['id']}/queue?view=all", headers=owner_headers)
    assert all_tasks.status_code == 200
    assert {task["id"] for task in all_tasks.json()} == {task["id"] for task in tasks}
