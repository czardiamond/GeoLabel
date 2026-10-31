from io import BytesIO

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from test_workflows import create_org_and_owner


def test_spatial_join_and_raster_analysis_are_role_checked_and_grid_safe(api_client, tmp_path, monkeypatch):
    client, _ = api_client
    from backend.config import settings

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "gis-assets"))
    org, _, owner_headers = create_org_and_owner(client, "GIS operations", "gis-owner@example.com")
    project = client.post(f"/organizations/{org['id']}/projects", headers=owner_headers,
                          json={"name": "GIS project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Raster set", "description": ""}).json()

    def write_raster(values, transform=from_origin(-1, 1, 0.5, 0.5)):
        output = BytesIO()
        with MemoryFile() as memory:
            with memory.open(driver="GTiff", width=4, height=4, count=1, dtype="uint8",
                             crs="EPSG:4326", transform=transform) as raster:
                raster.write(np.asarray(values, dtype="uint8"), 1)
            output.write(memory.read())
        return output.getvalue()

    first = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                        files={"file": ("first.tif", write_raster(np.full((4, 4), 100)), "image/tiff")})
    second = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                         files={"file": ("second.tif", write_raster(np.full((4, 4), 90)), "image/tiff")})
    mismatched = client.post(f"/datasets/{dataset['id']}/assets", headers=owner_headers,
                             files={"file": ("different-grid.tif", write_raster(np.full((4, 4), 90), from_origin(-2, 2, 0.5, 0.5)), "image/tiff")})
    assert first.status_code == second.status_code == mismatched.status_code == 201

    stats = client.post(f"/assets/{first.json()['id']}/raster/statistics", headers=owner_headers,
                        json={"max_pixels": 16})
    assert stats.status_code == 200, stats.text
    assert stats.json()["width"] == 4 and stats.json()["height"] == 4
    assert stats.json()["bands"][0]["valid_pixel_count"] == 16
    assert stats.json()["bands"][0]["mean"] == 100.0
    too_large = client.post(f"/assets/{first.json()['id']}/raster/statistics", headers=owner_headers,
                            json={"max_pixels": 4})
    assert too_large.status_code == 422

    change = client.post(f"/organizations/{org['id']}/gis/raster-change", headers=owner_headers, json={
        "first_asset_id": first.json()["id"], "second_asset_id": second.json()["id"],
        "threshold": 5, "max_pixels": 16,
    })
    assert change.status_code == 200, change.text
    assert change.json()["bands"][0]["changed_pixel_count"] == 16
    grid_error = client.post(f"/organizations/{org['id']}/gis/raster-change", headers=owner_headers, json={
        "first_asset_id": first.json()["id"], "second_asset_id": mismatched.json()["id"], "max_pixels": 16,
    })
    assert grid_error.status_code == 422
    assert "grid mismatch" in grid_error.json()["detail"]

    collection = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {"name": "source"}, "geometry": {
            "type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        }}],
    }
    join = client.post(f"/organizations/{org['id']}/gis/spatial-join", headers=owner_headers, json={
        "source_geojson": collection, "target_geojson": collection,
        "source_crs": "EPSG:4326", "target_crs": "EPSG:4326", "predicate": "intersects",
    })
    assert join.status_code == 200, join.text
    assert join.json()["match_count"] == 1
    assert join.json()["matches"][0]["source_properties"] == {"name": "source"}

    validation = client.post(f"/organizations/{org['id']}/gis/validate", headers=owner_headers, json={
        "geojson": collection,
        "crs": "EPSG:4326",
        "required_fields": ["name"],
    })
    assert validation.status_code == 200, validation.text
    assert validation.json()["valid"] is True
    assert validation.json()["geometry_counts"] == {"Polygon": 1}

    invalid_collection = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {}, "geometry": {
            "type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]],
        }}],
    }
    invalid = client.post(f"/organizations/{org['id']}/gis/validate", headers=owner_headers, json={
        "geojson": invalid_collection,
        "crs": "EPSG:4326",
    })
    assert invalid.status_code == 200
    assert invalid.json()["valid"] is False
    assert any(error["code"] == "topologically_invalid" for error in invalid.json()["errors"])
    huge_integer_collection = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {}, "geometry": {
            "type": "Point", "coordinates": [10**400, 0],
        }}],
    }
    huge_integer = client.post(f"/organizations/{org['id']}/gis/validate", headers=owner_headers, json={
        "geojson": huge_integer_collection,
        "crs": "EPSG:4326",
    })
    assert huge_integer.status_code == 200
    assert any(error["code"] == "non_finite_coordinate" for error in huge_integer.json()["errors"])
    missing_crs = client.post(f"/organizations/{org['id']}/gis/validate", headers=owner_headers, json={
        "geojson": collection,
        "crs": "not-a-crs",
    })
    assert missing_crs.status_code == 422

    invite = client.post(f"/organizations/{org['id']}/invitations", headers=owner_headers,
                         json={"email": "gis-worker@example.com", "role": "annotator"})
    accepted = client.post("/auth/invitations/accept", json={
        "token": invite.json()["token"], "display_name": "GIS Worker", "password": "correct-horse-battery-8",
    })
    worker_headers = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    denied = client.post(f"/assets/{first.json()['id']}/raster/statistics", headers=worker_headers, json={})
    assert denied.status_code == 403
    worker_validation = client.post(f"/organizations/{org['id']}/gis/validate", headers=worker_headers, json={
        "geojson": collection,
        "crs": "EPSG:4326",
        "required_fields": ["name"],
    })
    assert worker_validation.status_code == 200, worker_validation.text
