import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:////tmp/geolabel-qa-test.db"
os.environ["FIREBASE_PROJECT_ID"] = "geolabel-qa"
os.environ["GEOLABEL_ADMIN_SECRET"] = "qa-admin-secret"
os.environ["CORS_ORIGINS"] = "http://testserver"

Path("/tmp/geolabel-qa-test.db").unlink(missing_ok=True)

import pytest
from fastapi.testclient import TestClient

from backend.database import Base, engine
from backend.main import app

Base.metadata.create_all(bind=engine)

TOKENS = {
    "alice-token": {"sub": "alice", "iss": "https://securetoken.google.com/geolabel-qa", "firebase": {"sign_in_provider": "password"}},
    "bob-token": {"sub": "bob", "iss": "https://securetoken.google.com/geolabel-qa", "firebase": {"sign_in_provider": "password"}},
    "anonymous-token": {"sub": "anon", "iss": "https://securetoken.google.com/geolabel-qa", "firebase": {"sign_in_provider": "anonymous"}},
    "nonadmin-token": {"sub": "nonadmin", "iss": "https://securetoken.google.com/geolabel-qa", "firebase": {"sign_in_provider": "password"}},
}


def fake_verify(token, request, audience=None):
    if token not in TOKENS:
        raise ValueError("invalid test token")
    return TOKENS[token]


@pytest.fixture(autouse=True)
def mock_firebase_verification(monkeypatch):
    monkeypatch.setattr("backend.auth.id_token.verify_firebase_token", fake_verify)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def auth(token):
    return {"Authorization": f"Bearer {token}"}
