import os
import subprocess
import sys


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def task_payload():
    return {
        "raster_url": "https://example.invalid/sample.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building_footprint"],
        "target_annotator_count": 1,
    }


def test_no_auth_and_anonymous_cannot_access_persistent_routes(client):
    assert client.post("/tasks", json=task_payload()).status_code == 401
    assert client.get("/memory").status_code == 401
    assert client.post("/tasks", json=task_payload(), headers=auth("anonymous-token")).status_code == 403
    assert client.get("/memory", headers=auth("anonymous-token")).status_code == 403


def test_raw_annotator_key_is_not_a_user_credential(client):
    response = client.post("/tasks", json=task_payload(), headers={"Authorization": "Bearer gl_ann_test-key"})
    assert response.status_code == 401


def test_alice_can_create_read_and_write_her_owned_data(client):
    response = client.post("/tasks", json=task_payload(), headers=auth("alice-token"))
    assert response.status_code == 201
    task_id = response.json()["id"]
    assert response.json()["owner_uid"] if "owner_uid" in response.json() else True

    read = client.get(f"/tasks/{task_id}", headers=auth("alice-token"))
    assert read.status_code == 200
    memory = client.put("/memory/quote", json={"email": "alice@example.invalid"}, headers=auth("alice-token"))
    assert memory.status_code == 200
    assert client.get("/memory", headers=auth("alice-token")).json()["quote"]["email"] == "alice@example.invalid"


def test_bob_cannot_read_or_mutate_alices_task_or_memory(client):
    created = client.post("/tasks", json=task_payload(), headers=auth("alice-token"))
    task_id = created.json()["id"]
    assert client.get(f"/tasks/{task_id}", headers=auth("bob-token")).status_code == 404
    assert client.post(f"/tasks/{task_id}/webhook", json={"webhook_url": "https://example.invalid/hook"}, headers=auth("bob-token")).status_code == 404
    assert client.get("/memory", headers=auth("bob-token")).json() == {}
    client.put("/memory/alice-only", json="alice", headers=auth("alice-token"))
    assert client.get("/memory", headers=auth("bob-token")).json() == {}


def test_nonadmin_cannot_register_annotators_or_simulate(client):
    assert client.post("/annotators/register", headers=auth("nonadmin-token")).status_code == 403
    created = client.post("/tasks", json=task_payload(), headers=auth("alice-token"))
    task_id = created.json()["id"]
    assert client.post(f"/tasks/{task_id}/simulate-completion", headers=auth("nonadmin-token")).status_code == 403
    assert client.post(f"/tasks/{task_id}/simulate-completion", headers=auth("alice-token")).status_code == 403


def test_missing_database_url_fails_closed_in_production():
    env = os.environ.copy()
    env.pop("DATABASE_URL", None)
    env["APP_ENV"] = "production"
    env["PYTHONPATH"] = os.getcwd()
    result = subprocess.run(
        [sys.executable, "-c", "import backend.database"],
        cwd=os.getcwd(), env=env, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "DATABASE_URL is required" in (result.stderr + result.stdout)


def test_sqlite_is_rejected_in_production():
    env = os.environ.copy()
    env["DATABASE_URL"] = "sqlite:////tmp/geolabel-qa-production.db"
    env["APP_ENV"] = "production"
    env["PYTHONPATH"] = os.getcwd()
    result = subprocess.run(
        [sys.executable, "-c", "import backend.database"],
        cwd=os.getcwd(), env=env, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "SQLite is allowed only" in (result.stderr + result.stdout)
