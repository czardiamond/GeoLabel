from conftest import SERVICE_KEY

SERVICE_HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}"}


def create_task(client, target_count=2, webhook_url=None):
    payload = {
        "raster_url": "https://storage.example.test/scene.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building", "road"],
        "target_annotator_count": target_count,
    }
    if webhook_url is not None:
        payload["webhook_url"] = webhook_url
    response = client.post("/tasks", json=payload, headers=SERVICE_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


def register_annotator(client, task_id):
    response = client.post("/annotators/register", json={"task_id": task_id}, headers=SERVICE_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


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


def test_task_creation_accepts_legacy_raster_uri_name(api_client):
    client, _ = api_client
    payload = {
        "raster_uri": "s3://geolabel-smoke-test/example.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building_footprint"],
        "target_annotator_count": 2,
    }
    response = client.post("/tasks", json=payload, headers=SERVICE_HEADERS)
    assert response.status_code == 201, response.text
    assert response.json()["raster_url"] == payload["raster_uri"]
    assert response.json()["status"] == "queued"

    conflicting = {**payload, "raster_url": "https://storage.example.test/other.tif"}
    rejected = client.post("/tasks", json=conflicting, headers=SERVICE_HEADERS)
    assert rejected.status_code == 422


def test_task_lifecycle_and_task_bound_annotator_keys(api_client):
    client, session_factory = api_client
    preflight = client.options("/annotators/ann_example", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "authorization",
    })
    assert preflight.status_code == 200
    assert "DELETE" in preflight.headers["access-control-allow-methods"]
    assert client.post("/tasks", json={}, headers=SERVICE_HEADERS).status_code == 422
    assert client.post("/tasks", json={
        "raster_url": "https://storage.example.test/a.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building"],
    }).status_code == 401

    task = create_task(client)
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
    client, _ = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "webhook_allowed_host_list", {"hooks.example.test"}, raising=False)
    base = {
        "raster_url": "https://storage.example.test/scene.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building"],
    }
    insecure = client.post("/tasks", json={**base, "webhook_url": "http://hooks.example.test/callback"}, headers=SERVICE_HEADERS)
    assert insecure.status_code == 422
    not_allowed = client.post("/tasks", json={**base, "webhook_url": "https://other.example.test/callback"}, headers=SERVICE_HEADERS)
    assert not_allowed.status_code == 400

    task = create_task(client, webhook_url="https://hooks.example.test/callback")
    key = register_annotator(client, task["id"])
    response = client.get(f"/annotator/tasks/{task['id']}", headers={"X-Annotator-API-Key": key["api_key"]})
    assert response.status_code == 200
    assert "webhook_url" not in response.json()
    assert task["webhook_url"].startswith("https://hooks.example.test/")


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
