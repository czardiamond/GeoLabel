from test_workflows import create_org_and_owner


def test_login_failures_are_throttled_without_blocking_other_accounts(api_client, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import AuthThrottle

    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT_ATTEMPTS", 3)
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT_WINDOW_SECONDS", 900)
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT_BLOCK_SECONDS", 120)
    organization, _, owner_headers = create_org_and_owner(client, "Throttle Test", "throttle-owner@example.com")

    invitation = client.post(
        f"/organizations/{organization['id']}/invitations",
        headers=owner_headers,
        json={"email": "other-worker@example.com", "role": "annotator"},
    )
    assert invitation.status_code == 201
    accepted = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"],
        "display_name": "Other Worker",
        "password": "correct-horse-battery-2",
    })
    assert accepted.status_code == 200

    for _ in range(2):
        response = client.post("/auth/login", json={"email": "throttle-owner@example.com", "password": "wrong-password"})
        assert response.status_code == 401
        assert response.json()["detail"] == "Email or password is incorrect."
    locked = client.post("/auth/login", json={"email": "throttle-owner@example.com", "password": "wrong-password"})
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0
    assert client.post("/auth/login", json={"email": "throttle-owner@example.com", "password": "correct-horse-battery-1"}).status_code == 429

    other_login = client.post("/auth/login", json={"email": "other-worker@example.com", "password": "correct-horse-battery-2"})
    assert other_login.status_code == 200
    with session_factory() as db:
        throttle = db.query(AuthThrottle).one()
        assert throttle.failed_count == 3
        assert throttle.blocked_until is not None
        assert "throttle-owner@example.com" not in throttle.subject_hash
        assert "127.0.0.1" not in throttle.subject_hash
