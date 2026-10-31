from datetime import datetime, timedelta
from io import BytesIO
from types import SimpleNamespace

from PIL import Image
from backend.temp_storage import AssetCapacityError

from backend import asset_storage, workflows
from backend.blob_storage import key_from_pathname
from backend.models import Asset, UploadIntent
from test_workflows import create_org_and_owner


def _workspace(client, name, email):
    organization, _, owner_headers = create_org_and_owner(client, name, email)
    project = client.post(
        f"/organizations/{organization['id']}/projects", headers=owner_headers,
        json={"name": "Raster project", "description": ""},
    ).json()
    dataset = client.post(
        f"/projects/{project['id']}/datasets", headers=owner_headers,
        json={"name": "Imagery", "description": ""},
    ).json()
    return organization, project, dataset, owner_headers


def _png_bytes():
    output = BytesIO()
    Image.new("RGB", (4, 4), color=(20, 80, 140)).save(output, format="PNG")
    return output.getvalue()


def test_direct_upload_authorization_is_authenticated_and_role_checked(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    organization, _, dataset, owner_headers = _workspace(client, "Upload roles", "owner-upload@example.com")
    payload = {
        "asset_id": "asset_0123456789abcdef0123456789abcdef",
        "filename": "field.png",
        "content_type": "image/png",
        "size_bytes": 256,
    }
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"

    unauthenticated = client.post(route, json=payload)
    assert unauthenticated.status_code == 401
    authorized = client.post(route, headers=owner_headers, json=payload)
    assert authorized.status_code == 200, authorized.text
    body = authorized.json()
    assert body["content_type"] == "image/png"
    assert body["maximum_size_bytes"] >= payload["size_bytes"]
    assert body["allowed_content_types"]
    assert body["pathname"].startswith(
        f"geolabel/{organization['id']}/{dataset['id']}/{payload['asset_id']}/"
    )
    assert "https://" not in body["pathname"]

    invitation = client.post(
        f"/organizations/{organization['id']}/invitations", headers=owner_headers,
        json={"email": "annotator-upload@example.com", "role": "annotator"},
    )
    accepted = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"], "display_name": "Annotator",
        "password": "correct-horse-battery-7",
    })
    worker_headers = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    denied = client.post(route, headers=worker_headers, json={
        **payload, "asset_id": "asset_fedcba9876543210fedcba9876543210",
    })
    assert denied.status_code == 403


def test_blob_finalize_verifies_metadata_and_cannot_delete_committed_asset(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    monkeypatch.setattr(asset_storage.tempfile, "gettempdir", lambda: str(tmp_path))
    organization, _, dataset, owner_headers = _workspace(client, "Finalize upload", "owner-finalize@example.com")
    image_bytes = _png_bytes()
    payload = {
        "asset_id": "asset_0123456789abcdef0123456789abcdef",
        "filename": "field.png",
        "content_type": "image/png",
        "size_bytes": len(image_bytes),
        "crs": "EPSG:4326",
        "bounds": "[0,0,1,1]",
    }
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    intent = client.post(route, headers=owner_headers, json={k: payload[k] for k in (
        "asset_id", "filename", "content_type", "size_bytes"
    )})
    assert intent.status_code == 200, intent.text
    pathname = intent.json()["pathname"]
    key = key_from_pathname(pathname)

    def fake_head(storage_key):
        assert storage_key == key
        return SimpleNamespace(pathname=pathname, size=len(image_bytes), content_type="image/png")

    def fake_download(storage_key, target):
        assert storage_key == key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(image_bytes)
        return target

    def fake_put(blob_path, source, content_type):
        assert source.is_file()
        assert content_type in {"image/png", "image/tiff"}
        return key_from_pathname(blob_path)

    monkeypatch.setattr(workflows, "head_blob_file", fake_head)
    monkeypatch.setattr(workflows, "download_blob_to_path", fake_download)
    monkeypatch.setattr(asset_storage, "put_blob_file", fake_put)

    finalized = client.post(
        f"/datasets/{dataset['id']}/assets/finalize", headers=owner_headers,
        json={**payload, "pathname": pathname},
    )
    assert finalized.status_code == 201, finalized.text
    assert finalized.json()["kind"] == "image"
    assert finalized.json()["crs"] == "EPSG:4326"
    assert finalized.json()["bounds"] == [0.0, 0.0, 1.0, 1.0]

    db = session_factory()
    try:
        asset = db.query(Asset).filter(Asset.id == payload["asset_id"]).one()
        assert asset.storage_key == key
        assert asset.preview_key.startswith("vercel-blob://geolabel/")
    finally:
        db.close()

    duplicate = client.post(
        f"/datasets/{dataset['id']}/assets/finalize", headers=owner_headers,
        json={**payload, "pathname": pathname},
    )
    assert duplicate.status_code == 409

    deleted = []
    monkeypatch.setattr(workflows, "delete_storage_key", deleted.append)
    cancel_committed = client.post(
        f"/datasets/{dataset['id']}/assets/cancel-upload", headers=owner_headers,
        json={**{k: payload[k] for k in (
            "asset_id", "filename", "content_type", "size_bytes"
        )}, "pathname": pathname},
    )
    assert cancel_committed.status_code == 409
    assert deleted == []


def test_cancel_abandoned_upload_deletes_only_its_authorized_path(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    organization, _, dataset, owner_headers = _workspace(client, "Cancel upload", "owner-cancel@example.com")
    payload = {
        "asset_id": "asset_0123456789abcdef0123456789abcdef",
        "filename": "field.png",
        "content_type": "image/png",
        "size_bytes": 256,
    }
    intent = client.post(
        f"/datasets/{dataset['id']}/assets/upload-authorize", headers=owner_headers,
        json=payload,
    )
    assert intent.status_code == 200, intent.text
    deleted = []
    monkeypatch.setattr(workflows, "delete_storage_key", deleted.append)
    cancelled = client.post(
        f"/datasets/{dataset['id']}/assets/cancel-upload", headers=owner_headers,
        json={**payload, "pathname": intent.json()["pathname"]},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json() == {"status": "discarded"}
    assert deleted == [key_from_pathname(intent.json()["pathname"])]

    tampered = client.post(
        f"/datasets/{dataset['id']}/assets/cancel-upload", headers=owner_headers,
        json={**payload, "pathname": f"geolabel/{organization['id']}/other-dataset/file.png"},
    )
    assert tampered.status_code == 400
    assert len(deleted) == 1


def test_authorize_enforces_exact_byte_cap_and_is_idempotent(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    monkeypatch.setattr(workflows.settings, "MAX_ASSET_UPLOAD_MB", 1)
    _, _, dataset, owner_headers = _workspace(client, "Upload cap", "owner-cap@example.com")
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    payload = {"asset_id": "asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "filename": "field.png", "content_type": "image/png", "size_bytes": 1024 * 1024}
    first = client.post(route, headers=owner_headers, json=payload)
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["maximum_size_bytes"] == 1024 * 1024
    second = client.post(route, headers=owner_headers, json=payload)
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["intent_id"] == first_body["intent_id"]
    assert second_body["pathname"] == first_body["pathname"]
    assert second_body["expires_at"] == first_body["expires_at"]
    assert second_body["valid_until_ms"] == first_body["valid_until_ms"]
    too_large = client.post(route, headers=owner_headers, json={**payload, "asset_id": "asset_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "size_bytes": 1024 * 1024 + 1})
    assert too_large.status_code == 413


def test_authorize_existing_intent_rejects_changed_metadata(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    _, _, dataset, owner_headers = _workspace(client, "Upload metadata", "owner-metadata@example.com")
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    payload = {"asset_id": "asset_cccccccccccccccccccccccccccccccc", "filename": "field.png", "content_type": "image/png", "size_bytes": 256}
    assert client.post(route, headers=owner_headers, json=payload).status_code == 200
    conflict = client.post(route, headers=owner_headers, json={**payload, "filename": "other.png"})
    assert conflict.status_code == 409


def test_same_org_admin_cannot_use_another_users_upload_intent(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    organization, _, dataset, owner_headers = _workspace(client, "Upload ownership", "owner-ownership@example.com")
    invitation = client.post(f"/organizations/{organization['id']}/invitations", headers=owner_headers, json={"email": "admin-ownership@example.com", "role": "admin"})
    accepted = client.post("/auth/invitations/accept", json={"token": invitation.json()["token"], "display_name": "Other Admin", "password": "correct-horse-battery-8"})
    assert accepted.status_code == 200, accepted.text
    admin_headers = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    payload = {"asset_id": "asset_dddddddddddddddddddddddddddddddd", "filename": "field.png", "content_type": "image/png", "size_bytes": 256}
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    intent = client.post(route, headers=owner_headers, json=payload)
    assert intent.status_code == 200, intent.text
    finalize = {**payload, "pathname": intent.json()["pathname"]}
    assert client.post(route, headers=admin_headers, json=payload).status_code == 403
    assert client.post(f"/datasets/{dataset['id']}/assets/finalize", headers=admin_headers, json=finalize).status_code == 403
    assert client.post(f"/datasets/{dataset['id']}/assets/cancel-upload", headers=admin_headers, json=finalize).status_code == 403


def test_expired_intent_cannot_finalize_or_reauthorize_same_asset_id(api_client, monkeypatch):
    client, session_factory = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    _, _, dataset, owner_headers = _workspace(client, "Expired upload", "owner-expired@example.com")
    payload = {"asset_id": "asset_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "filename": "field.png", "content_type": "image/png", "size_bytes": 256}
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    intent = client.post(route, headers=owner_headers, json=payload)
    assert intent.status_code == 200, intent.text
    finalize = {**payload, "pathname": intent.json()["pathname"]}
    db = session_factory()
    try:
        row = db.query(UploadIntent).filter(UploadIntent.asset_id == payload["asset_id"]).one()
        row.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    finally:
        db.close()
    assert client.post(f"/datasets/{dataset['id']}/assets/finalize", headers=owner_headers, json=finalize).status_code == 410
    assert client.post(route, headers=owner_headers, json=payload).status_code == 409


def test_cancelled_intent_cannot_be_reauthorized(api_client, monkeypatch):
    client, _ = api_client
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    monkeypatch.setattr(workflows, "delete_storage_key", lambda _key: None)
    _, _, dataset, owner_headers = _workspace(client, "Cancelled upload", "owner-cancelled@example.com")
    payload = {"asset_id": "asset_ffffffffffffffffffffffffffffffff", "filename": "field.png", "content_type": "image/png", "size_bytes": 256}
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    intent = client.post(route, headers=owner_headers, json=payload)
    assert intent.status_code == 200, intent.text
    cancel = client.post(f"/datasets/{dataset['id']}/assets/cancel-upload", headers=owner_headers, json={**payload, "pathname": intent.json()["pathname"]})
    assert cancel.status_code == 200, cancel.text
    assert client.post(route, headers=owner_headers, json=payload).status_code == 409


def test_transient_download_capacity_error_preserves_blob_and_pending_intent(api_client, monkeypatch):
    client, session_factory = api_client
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    monkeypatch.setattr(workflows, "blob_storage_configured", lambda: True)
    _, _, dataset, owner_headers = _workspace(client, "Capacity retry", "owner-capacity@example.com")
    payload = {"asset_id": "asset_12121212121212121212121212121212", "filename": "field.png", "content_type": "image/png", "size_bytes": 256}
    route = f"/datasets/{dataset['id']}/assets/upload-authorize"
    intent = client.post(route, headers=owner_headers, json=payload)
    assert intent.status_code == 200, intent.text
    pathname = intent.json()["pathname"]
    deleted = []
    monkeypatch.setattr(workflows, "head_blob_file", lambda key: SimpleNamespace(pathname=pathname, size=256, content_type="image/png"))
    def raise_capacity(*_args):
        raise AssetCapacityError("retry", 503)
    monkeypatch.setattr(workflows, "download_blob_to_path", raise_capacity)
    monkeypatch.setattr(workflows, "delete_storage_key", deleted.append)
    response = client.post(f"/datasets/{dataset['id']}/assets/finalize", headers=owner_headers, json={**payload, "pathname": pathname})
    assert response.status_code == 503
    assert deleted == []
    db = session_factory()
    try:
        row = db.query(UploadIntent).filter(UploadIntent.asset_id == payload["asset_id"]).one()
        assert row.status == "pending"
    finally:
        db.close()
