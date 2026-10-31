import os
from pathlib import Path
import subprocess
import sys

from fastapi import HTTPException
import pytest

from backend.models import Asset
from backend.workflows import AssetUploadIntent, _asset_response, _validate_direct_upload


def test_asset_manifest_paths_follow_deployment_prefix(monkeypatch):
    asset = Asset(id='asset_manifest', dataset_id='dataset_test', original_filename='tile.png',
                  content_type='image/png', kind='image', size_bytes=123,
                  preview_key='vercel-blob://geolabel/org/asset/preview.png', metadata_json='{}')
    monkeypatch.delenv('VERCEL', raising=False)
    assert _asset_response(asset)['preview_path'] == '/assets/asset_manifest/preview'
    monkeypatch.setenv('VERCEL', '1')
    response = _asset_response(asset)
    assert response['preview_path'] == '/api/assets/asset_manifest/preview'
    assert response['content_path'] == '/api/assets/asset_manifest/content'


def test_vercel_upload_limit_is_128_mib_even_with_larger_local_setting(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    payload = AssetUploadIntent(asset_id='asset_' + 'a' * 32, filename='tile.tif',
                                content_type='image/tiff', size_bytes=129 * 1024 * 1024)
    with pytest.raises(HTTPException) as exc:
        _validate_direct_upload(payload)
    assert exc.value.status_code == 413
    assert '128 MiB' in exc.value.detail


def test_actual_vercel_app_mounts_api_prefix_and_rejects_ephemeral_readiness():
    env = os.environ.copy()
    env.update(VERCEL='1', DATABASE_URL='sqlite:///:memory:')
    env.pop('BLOB_READ_WRITE_TOKEN', None)
    script = '''
from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as client:
    assert client.get('/api/health').status_code == 200
    assert client.get('/health').status_code == 404
    assert client.get('/api/openapi.json').status_code == 200
    assert client.get('/api/health/ready').status_code == 503
'''
    subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).resolve().parents[1],
                   env=env, check=True, capture_output=True, text=True)
