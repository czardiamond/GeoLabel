"""Request-scoped scratch files: never retain private imagery across requests."""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
import os
import shutil
import tempfile
import threading

MIB = 1024 * 1024
MAX_VERCEL_FILE_BYTES = 128 * MIB
MAX_VERCEL_REQUEST_BYTES = 256 * MIB
MAX_VERCEL_INFLIGHT_BYTES = 384 * MIB
MIN_FREE_BYTES = 64 * MIB
_budget_lock = threading.Lock()
_inflight_bytes = 0
_current: ContextVar["AssetTempScope | None"] = ContextVar("geolabel_asset_temp_scope", default=None)


class AssetCapacityError(Exception):
    def __init__(self, detail: str, status_code: int = 503):
        super().__init__(detail)
        self.status_code = status_code


class AssetTempScope:
    def __init__(self):
        self.root = Path(tempfile.mkdtemp(prefix="geolabel-request-"))
        self.lock = threading.RLock()
        self.reservations: dict[Path, int] = {}
        self.total = 0
        self.bounded = os.getenv("VERCEL") == "1"

    def reserve(self, target: Path, total_bytes: int) -> None:
        global _inflight_bytes
        with self.lock:
            old = self.reservations.get(target, 0)
            delta = max(0, total_bytes - old)
            if self.bounded:
                if total_bytes > MAX_VERCEL_FILE_BYTES:
                    raise AssetCapacityError("Private assets processed on Vercel are limited to 128 MiB.", 413)
                with _budget_lock:
                    if self.total + delta > MAX_VERCEL_REQUEST_BYTES or _inflight_bytes + delta > MAX_VERCEL_INFLIGHT_BYTES:
                        raise AssetCapacityError("Temporary asset capacity is busy; retry after current processing completes.")
                    if shutil.disk_usage(self.root).free < delta + MIN_FREE_BYTES:
                        raise AssetCapacityError("Insufficient temporary asset capacity; retry later.")
                    _inflight_bytes += delta
            self.reservations[target] = old + delta
            self.total += delta

    def close(self) -> None:
        global _inflight_bytes
        with self.lock:
            shutil.rmtree(self.root, ignore_errors=True)
            if self.bounded:
                with _budget_lock:
                    _inflight_bytes = max(0, _inflight_bytes - self.total)
            self.total = 0
            self.reservations.clear()


def current_asset_scope() -> AssetTempScope | None:
    return _current.get()


def reserve_download(target: Path, total_bytes: int) -> None:
    scope = current_asset_scope()
    if scope is not None:
        scope.reserve(target, total_bytes)


@contextmanager
def asset_temp_scope():
    scope = AssetTempScope()
    token = _current.set(scope)
    try:
        yield scope
    finally:
        scope.close()
        _current.reset(token)


class AssetTempStorageMiddleware:
    """Pure ASGI lifecycle includes streaming responses and background callbacks."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        with asset_temp_scope():
            await self.app(scope, receive, send)
