from io import BytesIO

from PIL import Image

from test_workflows import create_org_and_owner, geotiff_bytes


def test_georeference_repair_is_audited_and_stops_after_task_link(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import Asset, AuditEvent

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "repair-assets"))
    org, _, owner_headers = create_org_and_owner(client, "Georeference repair", "repair-owner@example.com")
    project = client.post(f"/organizations/{org['id']}/projects", headers=owner_headers,
                          json={"name": "Repair project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Repair dataset", "description": ""}).json()

    png = BytesIO()
    Image.new("RGB", (8, 8), (20, 50, 80)).save(png, format="PNG")
    uploaded = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                           files={"file": ("tile.png", png.getvalue(), "image/png")},
                           data={"crs": "EPSG:4326", "bounds": "[-1,-1,1,1]"})
    assert uploaded.status_code == 201, uploaded.text
    asset_id = uploaded.json()["id"]

    worldfile_image = BytesIO()
    Image.new("RGB", (8, 8), (90, 100, 110)).save(worldfile_image, format="PNG")
    worldfile_upload = client.post(
        f"/datasets/{dataset['id']}/assets", headers=owner_headers,
        files={"file": ("worldfile.png", worldfile_image.getvalue(), "image/png"),
               "world_file": ("worldfile.pgw", b"2\n0\n0\n-2\n101\n199\n", "text/plain")},
        data={"crs": "EPSG:4326"},
    )
    assert worldfile_upload.status_code == 201, worldfile_upload.text
    assert worldfile_upload.json()["bounds"] == [100, 184, 116, 200]
    with session_factory() as db:
        world_asset = db.query(Asset).filter(Asset.id == worldfile_upload.json()["id"]).one()
        assert world_asset.asset_metadata["georeference"] == "world_file"

    repaired = client.patch(f"/assets/{asset_id}/georeference", headers=owner_headers, json={
        "crs": "EPSG:3857", "bounds": [1000, 2000, 9000, 12000],
        "rationale": "Corrected from the verified field control points.",
    })
    assert repaired.status_code == 200, repaired.text
    assert repaired.json()["crs"] == "EPSG:3857"
    assert repaired.json()["bounds"] == [1000, 2000, 9000, 12000]
    with session_factory() as db:
        stored = db.query(Asset).filter(Asset.id == asset_id).one()
        assert stored.asset_metadata["georeference"] == "manual_repair"
        assert stored.asset_metadata["georeference_history"][-1]["previous"]["crs"] == "EPSG:4326"
        assert db.query(AuditEvent).filter(AuditEvent.action == "asset.georeference.repaired").count() == 1

    invalid = client.patch(f"/assets/{asset_id}/georeference", headers=owner_headers, json={
        "crs": "EPSG:3857", "bounds": [1, 1, 0, 0], "rationale": "Invalid bounds.",
    })
    assert invalid.status_code == 422

    linked = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Already linked", "dataset_id": dataset["id"], "asset_id": asset_id,
        "crs": "EPSG:3857", "taxonomy": ["building"], "target_annotator_count": 1,
    })
    assert linked.status_code == 201, linked.text
    blocked = client.patch(f"/assets/{asset_id}/georeference", headers=owner_headers, json={
        "crs": "EPSG:4326", "bounds": [-2, -2, 2, 2],
        "rationale": "Attempted change after annotation semantics are set.",
    })
    assert blocked.status_code == 409

    raster = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                         files={"file": ("embedded.tif", geotiff_bytes(), "image/tiff")})
    assert raster.status_code == 201, raster.text
    raster_patch = client.patch(f"/assets/{raster.json()['id']}/georeference", headers=owner_headers, json={
        "crs": "EPSG:3857", "bounds": [0, 0, 10, 10],
        "rationale": "Do not overwrite embedded affine coordinates.",
    })
    assert raster_patch.status_code == 415
