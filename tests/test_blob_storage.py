from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend import asset_storage, blob_storage


def test_put_file_streams_to_private_blob_and_returns_opaque_key(tmp_path, monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    source = tmp_path / "source.tif"
    content = b"geospatial payload" * 100
    source.write_bytes(content)
    captured = {}

    def fake_put(pathname, body, **options):
        captured.update(pathname=pathname, options=options, body=b"".join(body))
        return SimpleNamespace(pathname=pathname)

    monkeypatch.setattr(blob_storage.blob_sync, "put_blob", fake_put)
    key = blob_storage.put_file("geolabel/org/dataset/asset/original_source.tif", source, "image/tiff")

    assert key == "vercel-blob://geolabel/org/dataset/asset/original_source.tif"
    assert captured["body"] == content
    assert captured["options"]["access"] == "private"
    assert captured["options"]["content_length"] == len(content)
    assert captured["options"]["content_type"] == "image/tiff"
    assert captured["options"]["allow_overwrite"] is False


def test_storage_keys_reject_traversal_and_untrusted_prefixes():
    for pathname in (
        "../secret", "geolabel/../secret", "/geolabel/org/file", "other/org/file",
        "geolabel/org/file?download=1", "geolabel/org\\file",
    ):
        with pytest.raises(ValueError):
            blob_storage.key_from_pathname(pathname)
    with pytest.raises(ValueError):
        blob_storage.pathname_from_key("file:///tmp/private")


def test_download_is_streamed_atomically_and_partial_files_are_removed(tmp_path, monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    target = tmp_path / "nested" / "asset.bin"

    @contextmanager
    def stream(_pathname, access):
        assert access == "private"
        yield iter((b"first-", b"second"))

    monkeypatch.setattr(blob_storage.blob_sync, "stream_blob", stream)
    blob_storage.download_to_path(
        "vercel-blob://geolabel/org/dataset/asset/original.bin", target
    )
    assert target.read_bytes() == b"first-second"
    assert not target.with_name(target.name + ".partial").exists()


def test_download_failure_removes_partial_and_target(tmp_path, monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    target = tmp_path / "asset.bin"

    @contextmanager
    def broken_stream(_pathname, access):
        assert access == "private"
        yield iter((b"partial",))
        raise OSError("provider stream failed")

    monkeypatch.setattr(blob_storage.blob_sync, "stream_blob", broken_stream)
    with pytest.raises(OSError):
        blob_storage.download_to_path(
            "vercel-blob://geolabel/org/dataset/asset/original.bin", target
        )
    assert not target.exists()
    assert not target.with_name(target.name + ".partial").exists()


def test_blob_download_cache_reuses_verified_private_object(tmp_path, monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    monkeypatch.setattr(asset_storage.tempfile, "gettempdir", lambda: str(tmp_path))
    calls = []

    def fake_download(key, target):
        calls.append(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"verified bytes")
        return target

    monkeypatch.setattr(asset_storage, "download_to_path", fake_download)
    key = "vercel-blob://geolabel/org/dataset/asset/original.bin"
    first = asset_storage.resolve_storage_key(key)
    second = asset_storage.resolve_storage_key(key)

    assert first == second
    assert first.read_bytes() == b"verified bytes"
    assert len(calls) == 1


def test_request_materializations_reuse_within_request_then_are_deleted(tmp_path, monkeypatch):
    from backend.temp_storage import asset_temp_scope
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    calls = []

    def fake_download(key, target):
        calls.append(key)
        target.write_bytes(b"private imagery")
        return target

    monkeypatch.setattr(asset_storage, "download_to_path", fake_download)
    with asset_temp_scope() as scope:
        root = scope.root
        first = asset_storage.resolve_storage_key("vercel-blob://geolabel/org/asset/original")
        second = asset_storage.resolve_storage_key("vercel-blob://geolabel/org/asset/original")
        assert first == second and first.read_bytes() == b"private imagery"
        assert len(calls) == 1
    assert not root.exists()


def test_failed_concurrent_download_does_not_delete_published_winner(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "test-only")
    published = threading.Event()
    started = threading.Event()
    target = tmp_path / "shared.bin"

    @contextmanager
    def stream(pathname, access):
        if pathname.endswith("loser"):
            def broken():
                yield b"partial"
                started.set()
                assert published.wait(5)
                raise OSError("interrupted stream")
            yield broken()
        else:
            assert started.wait(5)
            yield iter((b"complete winner",))

    monkeypatch.setattr(blob_storage.blob_sync, "stream_blob", stream)
    def winner():
        blob_storage.download_to_path("vercel-blob://geolabel/org/winner", target)
        published.set()
    with ThreadPoolExecutor(max_workers=2) as executor:
        loser = executor.submit(blob_storage.download_to_path, "vercel-blob://geolabel/org/loser", target)
        successful = executor.submit(winner)
        successful.result(timeout=10)
        with pytest.raises(OSError):
            loser.result(timeout=10)
    assert target.read_bytes() == b"complete winner"
    assert list(tmp_path.glob("*.partial")) == []
    assert list(tmp_path.glob(".*.partial")) == []


def test_vercel_scope_bounds_and_releases_concurrent_reservations(monkeypatch):
    from backend import temp_storage
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(temp_storage, "MAX_VERCEL_FILE_BYTES", 10)
    monkeypatch.setattr(temp_storage, "MAX_VERCEL_REQUEST_BYTES", 15)
    monkeypatch.setattr(temp_storage, "MAX_VERCEL_INFLIGHT_BYTES", 18)
    with temp_storage.asset_temp_scope() as first:
        first.reserve(first.root / "a", 10)
        with pytest.raises(temp_storage.AssetCapacityError):
            first.reserve(first.root / "too-large", 11)
        with temp_storage.asset_temp_scope() as second:
            with pytest.raises(temp_storage.AssetCapacityError):
                second.reserve(second.root / "b", 10)
            second.reserve(second.root / "b", 8)
        first.reserve(first.root / "c", 5)
        with pytest.raises(temp_storage.AssetCapacityError):
            first.reserve(first.root / "d", 1)
    assert temp_storage._inflight_bytes == 0


def test_ordinary_image_limit_is_checked_before_pixel_decode(tmp_path, monkeypatch):
    class HugeImage:
        size = (10000, 10000)
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def convert(self, *args): raise AssertionError("must not decode oversized image")
    monkeypatch.setattr(asset_storage.Image, "open", lambda path: HugeImage())
    with pytest.raises(ValueError, match="40 million pixels"):
        asset_storage.inspect_and_preview(tmp_path / "image.png", "image.png", "image/png", "EPSG:4326", "[0,0,1,1]")


def test_pillow_decompression_warning_becomes_validation_error(tmp_path, monkeypatch):
    def bomb(path):
        raise asset_storage.Image.DecompressionBombWarning("test")
    monkeypatch.setattr(asset_storage.Image, "open", bomb)
    with pytest.raises(ValueError, match="decoded-pixel"):
        asset_storage.inspect_and_preview(tmp_path / "image.png", "image.png", "image/png", "EPSG:4326", "[0,0,1,1]")
