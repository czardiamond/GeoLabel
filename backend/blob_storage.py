"""Private Vercel Blob primitives used by GeoLabel's storage adapter.

Only server-side code imports this module. Stored keys are opaque internal
references; private Blob URLs and the read/write token are never returned to
clients.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterator

from vercel.blob import sync as blob_sync
from backend.temp_storage import AssetCapacityError, MAX_VERCEL_FILE_BYTES, reserve_download

BLOB_KEY_PREFIX = "vercel-blob://"
BLOB_PATH_PREFIX = "geolabel/"


def is_configured() -> bool:
    return bool(os.getenv("BLOB_READ_WRITE_TOKEN", "").strip())


def is_blob_key(key: str | None) -> bool:
    return isinstance(key, str) and key.startswith(BLOB_KEY_PREFIX)


def _validated_pathname(pathname: str) -> str:
    if not isinstance(pathname, str) or not pathname or "\\" in pathname or "?" in pathname or "#" in pathname:
        raise ValueError("Invalid private asset storage key")
    path = PurePosixPath(pathname)
    if path.is_absolute() or not path.parts or path.parts[0] != "geolabel" or any(part in {".", ".."} for part in path.parts):
        raise ValueError("Invalid private asset storage key")
    return path.as_posix()


def pathname_from_key(key: str) -> str:
    if not is_blob_key(key):
        raise ValueError("Storage key is not a Vercel Blob reference")
    return _validated_pathname(key[len(BLOB_KEY_PREFIX):])


def key_from_pathname(pathname: str) -> str:
    return BLOB_KEY_PREFIX + _validated_pathname(pathname)


def _file_chunks(path: Path, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    with path.open("rb") as source:
        while chunk := source.read(chunk_size):
            yield chunk


def put_file(pathname: str, source: Path, content_type: str) -> str:
    """Stream a local file into a private Blob and return its opaque key."""
    if not is_configured():
        raise RuntimeError("Private Vercel Blob storage is not configured")
    safe_path = _validated_pathname(pathname)
    result = blob_sync.put_blob(
        safe_path,
        _file_chunks(source),
        access="private",
        content_length=source.stat().st_size,
        content_type=content_type,
        add_random_suffix=False,
        allow_overwrite=False,
    )
    return key_from_pathname(result.pathname)


def head_file(key: str) -> Any:
    if not is_configured():
        raise RuntimeError("Private Vercel Blob storage is not configured")
    return blob_sync.head_blob(pathname_from_key(key))


def download_to_path(key: str, target: Path) -> Path:
    """Stream a private Blob to a temporary local file, atomically."""
    if not is_configured():
        raise RuntimeError("Private Vercel Blob storage is not configured")
    pathname = pathname_from_key(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".partial", dir=target.parent)
    os.close(fd)
    partial = Path(name)
    total = 0
    try:
        with blob_sync.stream_blob(pathname, access="private") as download:
            with partial.open("wb") as destination:
                for chunk in download:
                    total += len(chunk)
                    if os.getenv("VERCEL") == "1" and total > MAX_VERCEL_FILE_BYTES:
                        raise AssetCapacityError("Private assets processed on Vercel are limited to 128 MiB.", 413)
                    reserve_download(target, total)
                    destination.write(chunk)
        partial.replace(target)
        return target
    except Exception:
        partial.unlink(missing_ok=True)
        # Never unlink a target that another successful download has published.
        raise


def delete_key(key: str) -> None:
    """Delete a private Blob object by its verified internal key."""
    if not is_configured():
        raise RuntimeError("Private Vercel Blob storage is not configured")
    blob_sync.delete_blob(pathname_from_key(key))


def check_access() -> None:
    """Verify private-store credentials with a bounded metadata-only query."""
    if not is_configured():
        raise RuntimeError("Private Vercel Blob storage is not configured")
    next(blob_sync.query_blobs(prefix=BLOB_PATH_PREFIX, page_size=1), None)
