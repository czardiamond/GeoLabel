import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import settings
from backend.database import Base, get_db
import backend.main as main

SERVICE_KEY = "test-service-key-do-not-use-in-production"


@pytest.fixture
def api_client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    monkeypatch.setattr(settings, "API_KEY", SERVICE_KEY)
    monkeypatch.setattr(settings, "webhook_allowed_host_list", set(), raising=False)
    main.app.dependency_overrides[get_db] = override_get_db
    with TestClient(main.app) as client:
        yield client, TestSession
    main.app.dependency_overrides.clear()
    engine.dispose()
