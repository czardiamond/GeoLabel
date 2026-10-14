
def test_readiness_probes_database_and_local_asset_storage(api_client, tmp_path, monkeypatch):
    from backend.config import settings

    client, _ = api_client
    storage = tmp_path / "ready-assets"
    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(storage))
    ready = client.get("/health/ready")
    assert ready.status_code == 200, ready.text
    assert ready.json()["asset_storage"] == "writable_local"
    assert not list(storage.glob(".health-check-*"))

    blocked = tmp_path / "not-a-directory"
    blocked.write_text("not storage", encoding="utf-8")
    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(blocked))
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["detail"] == "Configured local asset storage is not ready"
