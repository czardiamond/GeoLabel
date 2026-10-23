import os

os.environ.setdefault("GEOLABEL_DATABASE_URL", "sqlite:///./test_auth.db")

from fastapi.testclient import TestClient
from backend.config import settings
from backend.main import app

client = TestClient(app)


def test_task_status_requires_auth_when_key_configured(monkeypatch):
    monkeypatch.setattr(settings, "API_KEY", "test-auth-key-0123456789abcdef0123456789abcdef")
    response = client.get("/tasks/not-a-real-task")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_protected_endpoint_fails_closed_when_key_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "API_KEY", "")
    response = client.get("/tasks/not-a-real-task", headers={"Authorization": "Bearer anything"})
    assert response.status_code == 503
    assert "GEOLABEL_API_KEY" in response.json()["detail"]


def test_health_remains_public_when_auth_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "API_KEY", "")
    response = client.get("/health")
    assert response.status_code == 200
