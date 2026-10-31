"""Remote Preview MCP authentication and Streamable HTTP boundary tests."""
from fastapi.testclient import TestClient

from mcp_preview.app import _allowed_hosts, create_app

TOKEN = "a" * 64
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-03-26",
}
INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "GeoLabel-test", "version": "0.1.0"},
    },
}


def client_for(api_key: str) -> TestClient:
    return TestClient(create_app(api_key=api_key), base_url="http://127.0.0.1")


def test_remote_mcp_fails_closed_when_bearer_key_is_missing_or_weak():
    with client_for("") as client:
        response = client.post("/mcp", json=INITIALIZE, headers=HEADERS)
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"
    assert "not configured" in response.json()["error"]

    with client_for("short") as client:
        response = client.post("/mcp", json=INITIALIZE, headers=HEADERS)
    assert response.status_code == 503


def test_remote_mcp_rejects_invalid_bearer_key_without_disclosing_configured_key():
    with client_for(TOKEN) as client:
        response = client.post(
            "/mcp",
            json=INITIALIZE,
            headers={**HEADERS, "Authorization": "Bearer not-the-key"},
        )
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert response.headers["cache-control"] == "no-store"
    assert TOKEN not in response.text


def test_remote_mcp_rejects_duplicate_authorization_headers():
    duplicate_headers = [
        *HEADERS.items(),
        ("Authorization", f"Bearer {TOKEN}"),
        ("Authorization", "Bearer ignored"),
    ]
    with client_for(TOKEN) as client:
        response = client.post("/mcp", json=INITIALIZE, headers=duplicate_headers)
    assert response.status_code == 401


def test_remote_mcp_rejects_unlisted_hosts_and_browser_origins():
    app = create_app(
        api_key=TOKEN,
        allowed_hosts=["127.0.0.1"],
        allowed_origins=["https://trusted.example"],
    )
    headers = {**HEADERS, "Authorization": f"Bearer {TOKEN}"}
    with TestClient(app, base_url="http://127.0.0.1") as client:
        wrong_host = client.post("/mcp", json=INITIALIZE, headers={**headers, "Host": "evil.example"})
        wrong_origin = client.post("/mcp", json=INITIALIZE, headers={**headers, "Origin": "https://evil.example"})
    assert wrong_host.status_code == 421
    assert wrong_origin.status_code == 403


def test_vercel_host_allowlist_excludes_local_hosts(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_URL", "mcp-preview.vercel.app")
    monkeypatch.delenv("VERCEL_BRANCH_URL", raising=False)
    monkeypatch.delenv("VERCEL_PROJECT_PRODUCTION_URL", raising=False)
    monkeypatch.delenv("GEOLABEL_MCP_ALLOWED_HOSTS", raising=False)
    assert _allowed_hosts() == ["mcp-preview.vercel.app"]


def test_remote_mcp_accepts_bearer_key_and_serves_streamable_http_tools():
    headers = {**HEADERS, "Authorization": f"Bearer {TOKEN}"}
    with client_for(TOKEN) as client:
        initialized = client.post("/mcp", json=INITIALIZE, headers=headers)
        listed = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            headers=headers,
        )

    assert initialized.status_code == 200, initialized.text
    assert initialized.headers["cache-control"] == "no-store"
    assert initialized.json()["result"]["protocolVersion"] == "2025-03-26"
    assert listed.status_code == 200, listed.text
    names = {tool["name"] for tool in listed.json()["result"]["tools"]}
    assert {"validate_geojson", "validate_annotation_labels", "reproject_geojson", "spatial_join"} <= names


def test_remote_project_exposes_no_web_docs_or_other_public_routes():
    with client_for(TOKEN) as client:
        root = client.get("/")
        docs = client.get("/docs")
        schema = client.get("/openapi.json")
    assert root.status_code == 404
    assert docs.status_code == 404
    assert schema.status_code == 404


def test_remote_mcp_is_disabled_outside_vercel_preview(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "production")
    app = create_app(api_key=TOKEN, allowed_hosts=["127.0.0.1"])
    headers = {**HEADERS, "Authorization": f"Bearer {TOKEN}"}
    with TestClient(app, base_url="http://127.0.0.1") as client:
        response = client.post("/mcp", json=INITIALIZE, headers=headers)
    assert response.status_code == 503
    assert "only in Preview" in response.json()["error"]
