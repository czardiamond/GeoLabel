from io import BytesIO

from PIL import Image
from shapely.geometry import shape

from backend.inference import normalize_pixel_suggestions
from test_workflows import create_org_and_owner


def _png():
    image = Image.new("RGB", (4, 3), (40, 60, 80))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _pixel_candidate():
    return {"features": [{
        "category": "tree",
        "geometry": {"type": "Polygon", "coordinates": [[
            [0.1, 0.1], [0.6, 0.1], [0.6, 0.6], [0.1, 0.6], [0.1, 0.1],
        ]]},
    }]}


def test_normalized_pixel_suggestions_use_asset_affine_and_reject_unsafe_output():
    result = normalize_pixel_suggestions(
        _pixel_candidate(), taxonomy=["tree"], width=4, height=3,
        affine_transform=[2, 0, 10, 0, -2, 20], bounds=[10, 14, 18, 20], source_crs="EPSG:4326",
    )
    bounds = shape(result["features"][0]["geometry"]).bounds
    assert bounds == (10.8, 16.4, 14.8, 19.4)
    assert result["crs"]["properties"]["name"] == "EPSG:4326"
    assert result["features"][0]["properties"] == {"category": "tree", "suggestion": True}

    outside = _pixel_candidate()
    outside["features"][0]["geometry"]["coordinates"][0][1][0] = 1.5
    try:
        normalize_pixel_suggestions(outside, taxonomy=["tree"], width=4, height=3, bounds=[10, 14, 18, 20])
    except ValueError as exc:
        assert "normalized" in str(exc)
    else:
        raise AssertionError("out-of-image provider coordinates must be rejected")

    wrong_label = _pixel_candidate()
    wrong_label["features"][0]["category"] = "invented"
    try:
        normalize_pixel_suggestions(wrong_label, taxonomy=["tree"], width=4, height=3, bounds=[10, 14, 18, 20])
    except ValueError as exc:
        assert "taxonomy" in str(exc)
    else:
        raise AssertionError("provider labels outside the task taxonomy must be rejected")


def test_ai_suggestions_require_deployment_and_task_consent_and_remain_pending(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import AuditEvent, PreAnnotation

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "inference-assets"))
    organization, _, owner_headers = create_org_and_owner(client, "AI consent", "ai-owner@example.com")
    project = client.post(f"/organizations/{organization['id']}/projects", headers=owner_headers,
                          json={"name": "AI project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "AI dataset", "description": ""}).json()
    upload = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                         files={"file": ("scene.png", _png(), "image/png")},
                         data={"crs": "EPSG:4326", "bounds": "[10,14,18,20]"})
    assert upload.status_code == 201, upload.text
    asset = upload.json()
    task = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "AI task", "dataset_id": dataset["id"], "asset_id": asset["id"],
        "crs": "EPSG:3857", "taxonomy": ["tree"], "target_annotator_count": 1,
    }).json()
    # This route's current task-creation policy defaults a task to its asset CRS;
    # set the target explicitly here to exercise the inference reprojection path.
    from backend.models import Task
    with session_factory() as db:
        db.query(Task).filter_by(id=task["id"]).one().crs = "EPSG:3857"
        db.commit()

    # The ordinary configuration is inert and reports no availability.
    status = client.get(f"/work/tasks/{task['id']}/inference/status", headers=owner_headers)
    assert status.status_code == 200
    assert status.json()["available"] is False
    assert status.json()["human_review_required"] is True
    assert status.json()["external_data_transfer"] is False

    for setting, value in {
        "INFERENCE_ENABLED": True,
        "INFERENCE_PROVIDER_BASE_URL": "https://inference.example.test/v1",
        "INFERENCE_ALLOWED_HOSTS": "inference.example.test",
        "INFERENCE_MODEL": "vision-test-model",
        "INFERENCE_API_KEY": "test-provider-secret",
        "INFERENCE_DATA_TRANSFER_APPROVED": True,
        "INFERENCE_SPEND_APPROVED": True,
    }.items():
        monkeypatch.setattr(settings, setting, value)

    request_calls = []
    def fake_provider(image_bytes, **kwargs):
        request_calls.append((image_bytes, kwargs))
        return normalize_pixel_suggestions(
            _pixel_candidate(), taxonomy=kwargs["taxonomy"], width=kwargs["width"], height=kwargs["height"],
            affine_transform=kwargs["affine_transform"], bounds=kwargs["bounds"], source_crs=kwargs["source_crs"],
        )

    monkeypatch.setattr("backend.workflows.request_provider_suggestions", fake_provider)
    path = f"/work/tasks/{task['id']}/inference/suggestions"
    monkeypatch.setattr(settings, "INFERENCE_DATA_TRANSFER_APPROVED", False)
    deployment_denied = client.post(path, headers=owner_headers, json={
        "confirm_data_transfer": True, "confirm_provider_costs": True,
    })
    assert deployment_denied.status_code == 409
    assert not request_calls
    monkeypatch.setattr(settings, "INFERENCE_DATA_TRANSFER_APPROVED", True)
    missing_confirmation = client.post(path, headers=owner_headers, json={
        "confirm_data_transfer": True, "confirm_provider_costs": False,
    })
    assert missing_confirmation.status_code == 428
    assert not request_calls

    generated = client.post(path, headers=owner_headers, json={
        "confirm_data_transfer": True, "confirm_provider_costs": True,
    })
    assert generated.status_code == 201, generated.text
    result = generated.json()
    assert result["status"] == "pending"
    assert result["human_review_required"] is True
    assert result["source"] == "configured_vision_provider"
    assert result["model_version"] == "vision-test-model"
    assert request_calls and request_calls[0][0].startswith(b"\x89PNG")
    assert result["geojson"]["crs"]["properties"]["name"] == "EPSG:3857", (asset.get("crs"), request_calls[0][1])
    bounds = shape(result["geojson"]["features"][0]["geometry"]).bounds
    assert bounds[0] > 1_000_000 and bounds[2] > bounds[0]

    with session_factory() as db:
        stored = db.query(PreAnnotation).filter_by(task_id=task["id"]).one()
        event = db.query(AuditEvent).filter_by(action="preannotation.generated", resource_id=stored.id).one()
        assert stored.status == "pending"
        assert stored.reviewed_by_user_id is None
        assert event.details["human_review_required"] is True
        assert event.details["external_data_transfer_confirmed"] is True
        assert event.details["provider_costs_confirmed"] is True


def test_vision_adapter_builds_expected_request_without_live_network(monkeypatch):
    import json
    from backend.inference import ProviderConfig, request_provider_suggestions

    calls = []
    def fake_dns(host):
        assert host == "approved.example.test"
        return ("8.8.8.8",)
    def fake_post(host, address, path, api_key, body, timeout):
        calls.append((host, address, path, api_key, body, timeout))
        provider_response = {"choices": [{"message": {"content": json.dumps(_pixel_candidate())}}]}
        return json.dumps(provider_response).encode()

    monkeypatch.setattr("backend.inference._resolve_public_provider_dns", fake_dns)
    monkeypatch.setattr("backend.inference._post_pinned_provider_request", fake_post)
    provider = ProviderConfig(
        base_url="https://approved.example.test/v1", host="approved.example.test",
        model="vision-test-model", api_key="server-only-key",
    )
    image_bytes = _png()
    normalized = request_provider_suggestions(
        image_bytes, config=provider, taxonomy=["tree"], width=4, height=3,
        affine_transform=[2, 0, 10, 0, -2, 20], bounds=[10, 14, 18, 20], source_crs="EPSG:4326",
    )
    assert len(calls) == 1
    host, address, path, api_key, body, timeout = calls[0]
    assert (host, address, path, api_key) == (
        "approved.example.test", "8.8.8.8", "/v1/chat/completions", "server-only-key",
    )
    assert timeout > 0
    assert body["model"] == "vision-test-model"
    assert body["response_format"] == {"type": "json_object"}
    user_content = body["messages"][1]["content"]
    assert user_content[1]["type"] == "image_url"
    assert user_content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert normalized["crs"]["properties"]["name"] == "EPSG:4326"
    assert normalized["features"][0]["properties"]["suggestion"] is True

    try:
        request_provider_suggestions(
            image_bytes, config=provider, taxonomy=["tree"], width=4, height=2,
            affine_transform=[2, 0, 10, 0, -2, 20], bounds=[10, 14, 18, 20], source_crs="EPSG:4326",
        )
    except ValueError as exc:
        assert "aspect ratios" in str(exc)
    else:
        raise AssertionError("a mismatched preview must be rejected before provider dispatch")
    assert len(calls) == 1
    try:
        request_provider_suggestions(
            image_bytes, config=provider, taxonomy=["tree"], width=4, height=3,
            affine_transform=[2, 0, 10, 0, -2, 20], bounds=[10, 14, 18, 20], source_crs="not-a-crs",
        )
    except ValueError as exc:
        assert "CRS" in str(exc)
    else:
        raise AssertionError("invalid source CRS must be rejected before provider dispatch")
    assert len(calls) == 1


def test_provider_dns_rejects_private_addresses_and_tls_connects_to_pinned_ip(monkeypatch):
    import socket
    from backend.inference import _PinnedHTTPSConnection, _resolve_public_provider_dns

    public = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
    private = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443))
    monkeypatch.setattr("backend.inference.socket.getaddrinfo", lambda *_args, **_kwargs: [public])
    assert _resolve_public_provider_dns("approved.example.test") == ("8.8.8.8",)
    monkeypatch.setattr("backend.inference.socket.getaddrinfo", lambda *_args, **_kwargs: [public, private])
    try:
        _resolve_public_provider_dns("approved.example.test")
    except ValueError as exc:
        assert "public IP" in str(exc)
    else:
        raise AssertionError("a mixed public/private DNS answer must be rejected")

    connected = {}
    class FakeSocket:
        def settimeout(self, timeout):
            connected["socket_timeout"] = timeout
        def close(self):
            return None
    class FakeTLSContext:
        def wrap_socket(self, sock, *, server_hostname):
            connected["tls_hostname"] = server_hostname
            return sock
    def fake_connect(address, *, timeout):
        connected["address"] = address
        connected["connect_timeout"] = timeout
        return FakeSocket()
    monkeypatch.setattr("backend.inference.socket.create_connection", fake_connect)
    connection = _PinnedHTTPSConnection("approved.example.test", "8.8.8.8", 4.0)
    connection._context = FakeTLSContext()
    connection.connect()
    assert connected["address"] == ("8.8.8.8", 443)
    assert connected["tls_hostname"] == "approved.example.test"
    assert connected["connect_timeout"] == 4.0
    connection.close()


def test_pinned_provider_http_streams_and_caps_response_bytes(monkeypatch):
    import json
    from backend.inference import _post_pinned_provider_request

    sent = {}
    class FakeResponse:
        status = 200
        def __init__(self, body):
            self.body = body
        def read(self, limit):
            chunk, self.body = self.body[:limit], self.body[limit:]
            return chunk
    class FakeConnection:
        response_body = json.dumps({"ok": True}).encode()
        def __init__(self, hostname, address, timeout):
            sent.update(hostname=hostname, address=address, timeout=timeout)
        def request(self, method, path, *, body, headers):
            sent.update(method=method, path=path, body=body, headers=headers)
        def getresponse(self):
            return FakeResponse(type(self).response_body)
        def close(self):
            sent["closed"] = True
    monkeypatch.setattr("backend.inference._PinnedHTTPSConnection", FakeConnection)
    response = _post_pinned_provider_request(
        "approved.example.test", "8.8.8.8", "/v1/chat/completions", "server-only-key", {"model": "test"}, 10,
    )
    assert json.loads(response) == {"ok": True}
    assert sent["address"] == "8.8.8.8"
    assert sent["method"] == "POST"
    assert sent["path"] == "/v1/chat/completions"
    assert sent["headers"]["Host"] == "approved.example.test"
    assert sent["headers"]["Authorization"] == "Bearer server-only-key"
    assert json.loads(sent["body"]) == {"model": "test"}
    assert sent["closed"] is True

    monkeypatch.setattr("backend.inference.MAX_PROVIDER_RESPONSE_BYTES", 8)
    FakeConnection.response_body = b"x" * 9
    try:
        _post_pinned_provider_request(
            "approved.example.test", "8.8.8.8", "/v1/chat/completions", "server-only-key", {}, 10,
        )
    except ValueError as exc:
        assert "safety limit" in str(exc)
    else:
        raise AssertionError("oversized provider responses must be rejected")
