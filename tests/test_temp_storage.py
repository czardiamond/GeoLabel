from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.testclient import TestClient

from backend.temp_storage import AssetTempStorageMiddleware, current_asset_scope


def test_request_files_survive_streaming_then_are_removed():
    app = FastAPI()
    app.add_middleware(AssetTempStorageMiddleware)
    roots = []

    @app.get('/stream')
    def stream():
        scope = current_asset_scope()
        roots.append(scope.root)
        path = scope.root / 'private.bin'
        path.write_bytes(b'private streamed bytes')
        return FileResponse(path, media_type='application/octet-stream')

    with TestClient(app) as client:
        response = client.get('/stream')
    assert response.status_code == 200
    assert response.content == b'private streamed bytes'
    assert len(roots) == 1
    assert not roots[0].exists()


def test_request_files_are_removed_when_endpoint_fails():
    app = FastAPI()
    app.add_middleware(AssetTempStorageMiddleware)
    roots = []

    @app.get('/fail')
    def fail():
        scope = current_asset_scope()
        roots.append(scope.root)
        (scope.root / 'partial.bin').write_bytes(b'partial')
        raise HTTPException(status_code=400, detail='invalid asset')

    with TestClient(app) as client:
        response = client.get('/fail')
    assert response.status_code == 400
    assert not roots[0].exists()
