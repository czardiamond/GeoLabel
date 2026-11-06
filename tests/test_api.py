from conftest import SERVICE_KEY

SERVICE_HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}"}


def seed_legacy_task(session_factory, target_count=2, webhook_url=None):
    """Create a pre-existing legacy task so its read/annotation compatibility remains covered."""
    from backend.models import Task

    with session_factory() as db:
        task = Task(
            raster_url="https://storage.example.test/scene.tif",
            crs="EPSG:4326",
            target_annotator_count=target_count,
            webhook_url=webhook_url,
            status="queued",
        )
        task.taxonomy = ["building", "road"]
        db.add(task)
        db.commit()
        db.refresh(task)
        return {"id": task.id, "webhook_url": task.webhook_url}


def register_annotator(client, task_id):
    response = client.post("/annotators/register", json={"task_id": task_id}, headers=SERVICE_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


def create_org_owner(client, name, email):
    organization = client.post("/organizations", headers=SERVICE_HEADERS, json={
        "name": name,
        "owner_email": email,
        "owner_name": "Workspace Owner",
    })
    assert organization.status_code == 201, organization.text
    accepted = client.post("/auth/invitations/accept", json={
        "token": organization.json()["invitation_token"],
        "display_name": "Workspace Owner",
        "password": "correct-horse-battery-1",
    })
    assert accepted.status_code == 200, accepted.text
    return organization.json(), {"Authorization": f"Bearer {accepted.json()['access_token']}"}


def sample_geojson():
    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": [{
            "type": "Feature",
            "properties": {"category": "building"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
            },
        }],
    }


def test_owner_endpoints_reject_short_service_secrets(api_client, monkeypatch):
    from backend.config import settings

    client, _ = api_client
    monkeypatch.setattr(settings, "API_KEY", "too-short")
    response = client.get("/tasks/not-found", headers={"Authorization": "Bearer too-short"})
    assert response.status_code == 503


def test_legacy_task_creation_fails_closed_and_scoped_route_is_tenant_checked(api_client):
    client, session_factory = api_client
    from backend.models import Asset, Dataset, Task

    legacy_payload = {
        "raster_url": "https://storage.example.test/scene.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building"],
        "target_annotator_count": 2,
    }
    rejected = client.post("/tasks", json=legacy_payload, headers=SERVICE_HEADERS)
    assert rejected.status_code == 409, rejected.text
    assert "organization-scoped" in rejected.json()["detail"]
    assert "/projects/{project_id}/tasks" in rejected.json()["detail"]

    organization_a, owner_a = create_org_owner(client, "Tenant A", "tenant-a@example.com")
    organization_b, owner_b = create_org_owner(client, "Tenant B", "tenant-b@example.com")
    project_a = client.post(
        f"/organizations/{organization_a['id']}/projects", headers=owner_a,
        json={"name": "Project A", "description": ""},
    )
    project_b = client.post(
        f"/organizations/{organization_b['id']}/projects", headers=owner_b,
        json={"name": "Project B", "description": ""},
    )
    assert project_a.status_code == project_b.status_code == 201

    with session_factory() as db:
        dataset_a = Dataset(project_id=project_a.json()["id"], name="Dataset A", description="")
        dataset_b = Dataset(project_id=project_b.json()["id"], name="Dataset B", description="")
        db.add_all([dataset_a, dataset_b])
        db.flush()
        asset_a = Asset(
            dataset_id=dataset_a.id, original_filename="a.tif", storage_key="tests/tenant-a/a.tif",
            content_type="image/tiff", size_bytes=1, crs="EPSG:4326",
        )
        asset_b = Asset(
            dataset_id=dataset_b.id, original_filename="b.tif", storage_key="tests/tenant-b/b.tif",
            content_type="image/tiff", size_bytes=1, crs="EPSG:4326",
        )
        db.add_all([asset_a, asset_b])
        db.commit()
        dataset_a_id, asset_a_id = dataset_a.id, asset_a.id
        dataset_b_id, asset_b_id = dataset_b.id, asset_b.id

    # A user session cannot masquerade as the deployment service key or target another tenant.
    tenant_spoof = client.post("/tasks", json={**legacy_payload, "organization_id": organization_b["id"]}, headers=owner_a)
    assert tenant_spoof.status_code == 401
    with session_factory() as db:
        assert db.query(Task).count() == 0

    scoped_payload_a = {
        "title": "Tenant A task", "dataset_id": dataset_a_id, "asset_id": asset_a_id,
        "taxonomy": ["building"], "target_annotator_count": 1,
    }
    scoped_created = client.post(
        f"/projects/{project_a.json()['id']}/tasks", headers=owner_a, json=scoped_payload_a,
    )
    assert scoped_created.status_code == 201, scoped_created.text

    cross_tenant = client.post(
        f"/projects/{project_b.json()['id']}/tasks", headers=owner_a,
        json={**scoped_payload_a, "dataset_id": dataset_b_id, "asset_id": asset_b_id},
    )
    assert cross_tenant.status_code == 403, cross_tenant.text
    with session_factory() as db:
        assert db.query(Task).count() == 1
        assert db.query(Task).one().project_id == project_a.json()["id"]


def test_task_lifecycle_and_task_bound_annotator_keys(api_client):
    client, session_factory = api_client
    preflight = client.options("/annotators/ann_example", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "authorization",
    })
    assert preflight.status_code == 200
    assert "DELETE" in preflight.headers["access-control-allow-methods"]
    legacy_create = client.post("/tasks", json={}, headers=SERVICE_HEADERS)
    assert legacy_create.status_code == 409
    assert "organization-scoped" in legacy_create.json()["detail"]
    assert client.post("/tasks", json={
        "raster_url": "https://storage.example.test/a.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building"],
    }).status_code == 401

    task = seed_legacy_task(session_factory)
    first = register_annotator(client, task["id"])
    second = register_annotator(client, task["id"])
    assert first["task_id"] == task["id"]
    assert first["api_key"].startswith("gl_ann_")
    assert len(first["api_key"].removeprefix("gl_ann_")) == 64

    with session_factory() as db:
        from backend.models import AnnotatorApiKey
        stored = db.query(AnnotatorApiKey).filter_by(annotator_id=first["annotator_id"]).one()
        assert stored.api_key_hash != first["api_key"]
        assert stored.task_id == task["id"]

    worker_headers = {"X-Annotator-API-Key": first["api_key"]}
    assigned = client.get(f"/annotator/tasks/{task['id']}", headers=worker_headers)
    assert assigned.status_code == 200
    assert "webhook_url" not in assigned.json()
    assert client.get("/annotator/tasks/not-the-assigned-task", headers=worker_headers).status_code == 403
    assert client.get(f"/tasks/{task['id']}", headers=worker_headers).status_code == 401

    invalid_geojson = sample_geojson()
    invalid_geojson["features"][0]["properties"]["category"] = "not-in-taxonomy"
    rejected_category = client.post(
        f"/tasks/{task['id']}/annotations",
        json={"geojson": invalid_geojson},
        headers=worker_headers,
    )
    assert rejected_category.status_code == 400

    missing_geometry = sample_geojson()
    missing_geometry["features"][0]["geometry"] = None
    rejected_missing_geometry = client.post(
        f"/tasks/{task['id']}/annotations",
        json={"geojson": missing_geometry},
        headers=worker_headers,
    )
    assert rejected_missing_geometry.status_code == 422

    invalid_polygon = sample_geojson()
    invalid_polygon["features"][0]["geometry"]["coordinates"] = [[[0, 0], [0.001, 0.001], [0, 0.001], [0.001, 0], [0, 0]]]
    rejected_invalid_geometry = client.post(
        f"/tasks/{task['id']}/annotations",
        json={"geojson": invalid_polygon},
        headers=worker_headers,
    )
    assert rejected_invalid_geometry.status_code == 400

    invalid_geometries = [
        {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]]},
        {"type": "GeometryCollection", "geometries": []},
        {"type": "Point", "coordinates": [200, 20]},
    ]
    for geometry in invalid_geometries:
        invalid_geojson = sample_geojson()
        invalid_geojson["features"][0]["geometry"] = geometry
        rejected = client.post(
            f"/tasks/{task['id']}/annotations",
            json={"geojson": invalid_geojson},
            headers=worker_headers,
        )
        assert rejected.status_code == 400, rejected.text
        assert "validation failed" in rejected.json()["detail"].lower()
    with session_factory() as db:
        from backend.models import Annotation, Task
        assert db.query(Annotation).filter_by(task_id=task["id"]).count() == 0
        assert db.query(Task).filter_by(id=task["id"]).one().status != "completed"

    submitted = client.post(
        f"/tasks/{task['id']}/annotations",
        json={"geojson": sample_geojson()},
        headers=worker_headers,
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "in_progress"
    assert "webhook_url" not in submitted.json()

    duplicate = client.post(
        f"/tasks/{task['id']}/annotations",
        json={"geojson": sample_geojson()},
        headers=worker_headers,
    )
    assert duplicate.status_code == 409

    final_submission = client.post(
        f"/tasks/{task['id']}/annotations",
        json={"geojson": sample_geojson()},
        headers={"X-Annotator-API-Key": second["api_key"]},
    )
    assert final_submission.status_code == 200, final_submission.text
    assert final_submission.json()["status"] == "completed"
    assert final_submission.json()["iaa_score"] == 1.0

    results = client.get(f"/tasks/{task['id']}/results", headers=SERVICE_HEADERS)
    assert results.status_code == 200
    body = results.json()
    assert body["annotation_count"] == 2
    assert body["iaa_type"] == "cohens_kappa"
    assert len(body["geojson"]["features"]) == 1
    assert body["geojson"]["features"][0]["properties"]["annotator_support"] == 2

    revoked = client.delete(f"/annotators/{first['annotator_id']}", headers=SERVICE_HEADERS)
    assert revoked.status_code == 204
    assert client.get(f"/annotator/tasks/{task['id']}", headers=worker_headers).status_code == 401
    assert client.get(f"/tasks/{task['id']}/results", headers=SERVICE_HEADERS).json()["annotation_count"] == 2

    assert client.post(f"/tasks/{task['id']}/simulate-completion", headers=SERVICE_HEADERS).status_code == 404


def test_webhooks_require_https_and_an_explicit_exact_host_allowlist(api_client, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "webhook_allowed_host_list", {"hooks.example.test"}, raising=False)
    task = seed_legacy_task(session_factory)
    insecure = client.post(
        f"/tasks/{task['id']}/webhook", json={"webhook_url": "http://hooks.example.test/callback"}, headers=SERVICE_HEADERS,
    )
    assert insecure.status_code == 422
    not_allowed = client.post(
        f"/tasks/{task['id']}/webhook", json={"webhook_url": "https://other.example.test/callback"}, headers=SERVICE_HEADERS,
    )
    assert not_allowed.status_code == 400

    allowed = client.post(
        f"/tasks/{task['id']}/webhook", json={"webhook_url": "https://hooks.example.test/callback"}, headers=SERVICE_HEADERS,
    )
    assert allowed.status_code == 200, allowed.text
    key = register_annotator(client, task["id"])
    response = client.get(f"/annotator/tasks/{task['id']}", headers={"X-Annotator-API-Key": key["api_key"]})
    assert response.status_code == 200
    assert "webhook_url" not in response.json()
    assert allowed.json()["webhook_url"].startswith("https://hooks.example.test/")


def test_quote_request_is_persisted_without_claiming_email_or_pricing(api_client):
    client, session_factory = api_client
    payload = {
        "full_name": "Test User",
        "email": "test@example.com",
        "organization": "Example Org",
        "project_type": "building-footprints",
        "imagery_type": "Satellite optical",
        "spatial_resolution": "Not specified",
        "estimated_volume": "Not specified",
        "timeline": "No preference",
        "target_accuracy": "Not specified",
        "budget_range": "No preference",
        "requirements_description": "Test geospatial requirements for durable API intake.",
        "accepts_terms": True,
    }
    rejected_blank_name = client.post("/quotes", json={**payload, "full_name": "   "})
    assert rejected_blank_name.status_code == 422
    response = client.post("/quotes", json=payload)
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert receipt["status"] == "received"
    assert receipt["id"].startswith("GL-QT-")
    assert "email" not in receipt

    with session_factory() as db:
        from backend.models import QuoteRequest
        stored = db.query(QuoteRequest).filter_by(id=receipt["id"]).one()
        assert stored.email == "test@example.com"
        assert stored.status == "received"
