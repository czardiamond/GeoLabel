import shutil
import subprocess

import pytest

from conftest import SERVICE_KEY
from test_workflows import create_org_and_owner

SERVICE_HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}"}


def test_video_upload_and_temporal_segments_are_persisted_and_duration_checked(api_client, tmp_path, monkeypatch):
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg is not installed in this test environment")
    client, _ = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "private-video"))
    organization, _, owner_headers = create_org_and_owner(client, "Video review", "video-owner@example.com")
    org_id = organization["id"]
    project = client.post(f"/organizations/{org_id}/projects", headers=owner_headers,
                          json={"name": "Video project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Video dataset", "description": ""}).json()

    video_path = tmp_path / "sample.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
        "-i", "color=c=black:s=32x32:r=5:d=1", "-t", "1", "-c:v", "mpeg4",
        "-pix_fmt", "yuv420p", str(video_path),
    ], check=True, capture_output=True)
    uploaded = client.post(
        f"/datasets/{dataset['id']}/assets", headers=owner_headers,
        files={"file": ("sample.mp4", video_path.read_bytes(), "video/mp4")},
    )
    assert uploaded.status_code == 201, uploaded.text
    asset = uploaded.json()
    assert asset["kind"] == "video"
    assert asset["metadata"]["duration_ms"] is not None

    task_response = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Clip review", "dataset_id": dataset["id"], "asset_id": asset["id"],
        "crs": "EPSG:4326", "taxonomy": ["vehicle"], "target_annotator_count": 1,
    })
    assert task_response.status_code == 201, task_response.text
    task = task_response.json()
    too_long = client.post(f"/work/tasks/{task['id']}/video-segments", headers=owner_headers, json={
        "segments": [{"start_ms": 0, "end_ms": asset["metadata"]["duration_ms"] + 1000, "category": "vehicle", "notes": ""}],
    })
    assert too_long.status_code == 400

    submitted = client.post(f"/work/tasks/{task['id']}/video-segments", headers=owner_headers, json={
        "segments": [{"start_ms": 100, "end_ms": min(700, asset["metadata"]["duration_ms"]), "category": "vehicle", "notes": "moving through frame"}],
    })
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["segments"][0]["category"] == "vehicle"
    refreshed = client.get(f"/work/tasks/{task['id']}", headers=owner_headers)
    assert refreshed.json()["status"] == "completed"
    assert refreshed.json()["review_status"] == "pending_review"
    stored = client.get(f"/work/tasks/{task['id']}/video-segments", headers=owner_headers)
    assert len(stored.json()) == 1
    assert stored.json()[0]["segments"][0]["start_ms"] == 100
    reviewed = client.post(f"/work/tasks/{task['id']}/review", headers=owner_headers,
                           json={"decision": "accept", "comment": "Temporal labels verified."})
    assert reviewed.status_code == 200
    assert reviewed.json()["review_status"] == "accepted"
