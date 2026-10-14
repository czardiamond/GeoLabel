import base64
from io import BytesIO

from PIL import Image
from shapely.geometry import shape

from test_workflows import create_org_and_owner


def _png(width=3, height=2):
    image = Image.new("RGB", (width, height), (40, 60, 80))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _mask_png(width, height, painted):
    image = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    for x, y in painted:
        image.putpixel((x, y), (255, 255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_image_annotation_mask_uses_source_affine_and_task_crs(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import Annotation

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "pixel-mask-assets"))
    organization, _, owner_headers = create_org_and_owner(client, "Pixel masks", "mask-owner@example.com")
    project = client.post(f"/organizations/{organization['id']}/projects", headers=owner_headers,
                          json={"name": "Mask project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Mask dataset", "description": ""}).json()
    upload = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                         files={"file": ("small.png", _png(), "image/png")},
                         data={"crs": "EPSG:4326", "bounds": "[10,14,16,20]"})
    assert upload.status_code == 201, upload.text
    asset = upload.json()
    assert asset["metadata"]["affine_transform"] == [2.0, 0.0, 10.0, 0.0, -3.0, 20.0]
    task = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Pixel mask task", "dataset_id": dataset["id"], "asset_id": asset["id"],
        "crs": "EPSG:3857", "taxonomy": ["tree"], "target_annotator_count": 1,
    }).json()
    mask = {"version": 1, "encoding": "image/png;base64", "width": 3, "height": 2,
            "data": _mask_png(3, 2, {(0, 0), (1, 0), (1, 1)})}
    placeholder = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
    submitted = client.post(f"/work/tasks/{task['id']}/annotations", headers=owner_headers, json={
        "geojson": {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
                    "features": [{"type": "Feature", "properties": {"category": "tree", "raster_mask": mask},
                                  "geometry": placeholder}]},
    })
    assert submitted.status_code == 200, submitted.text
    with session_factory() as db:
        saved = db.query(Annotation).filter_by(task_id=task["id"]).one().geojson
    feature = saved["features"][0]
    assert feature["properties"]["raster_mask"] == mask
    bounds = shape(feature["geometry"]).bounds
    # Three painted pixels occupy columns 0–2 and rows 0–2 in the source/task CRS.
    assert bounds == (10.0, 14.0, 14.0, 20.0)


def test_rejects_mask_dimensions_that_do_not_match_the_source_asset(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend.config import settings
    from backend.models import Annotation

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "bad-mask-assets"))
    organization, _, owner_headers = create_org_and_owner(client, "Bad mask", "bad-mask-owner@example.com")
    project = client.post(f"/organizations/{organization['id']}/projects", headers=owner_headers,
                          json={"name": "Bad mask project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                         json={"name": "Bad mask dataset", "description": ""}).json()
    asset = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                        files={"file": ("small.png", _png(), "image/png")},
                        data={"crs": "EPSG:4326", "bounds": "[10,14,16,20]"}).json()
    task = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Bad mask task", "dataset_id": dataset["id"], "asset_id": asset["id"],
        "crs": "EPSG:4326", "taxonomy": ["tree"],
    }).json()
    bad_mask = {"version": 1, "encoding": "image/png;base64", "width": 2, "height": 2,
                "data": _mask_png(2, 2, {(0, 0)})}
    result = client.post(f"/work/tasks/{task['id']}/annotations", headers=owner_headers, json={
        "geojson": {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"category": "tree", "raster_mask": bad_mask},
             "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}}
        ]},
    })
    assert result.status_code == 400
    assert "match the source asset" in result.json()["detail"]
    with session_factory() as db:
        assert db.query(Annotation).filter_by(task_id=task["id"]).count() == 0
