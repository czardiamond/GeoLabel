import ctypes
import hashlib
import platform
import sys

import pytest

from backend import native_runtime


def test_native_artifact_integrity_and_license():
    native = native_runtime.NATIVE_DIR
    expected = (native / "libexpat.sha256").read_text().split()[0]
    assert hashlib.sha256((native / "libexpat.so.1").read_bytes()).hexdigest() == expected
    assert "Permission is hereby granted" in (native / "EXPAT-LICENSE").read_text()


@pytest.mark.skipif(sys.platform != "linux" or platform.machine() != "x86_64", reason="Linux x86_64 artifact")
def test_actual_native_version_and_vercel_preload(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(native_runtime, "_LOADED", None)
    assert native_runtime.prepare_native_runtime() is True
    version = native_runtime._LOADED.XML_ExpatVersion
    version.restype = ctypes.c_char_p
    assert version() == b"expat_2.9.0"
    assert native_runtime.prepare_native_runtime() is True


def test_local_runtime_does_not_load_vendored_library(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(native_runtime.ctypes, "CDLL", lambda *_a, **_k: pytest.fail("Unexpected native load"))
    assert native_runtime.prepare_native_runtime() is False


@pytest.mark.skipif(sys.platform != "linux" or platform.machine() != "x86_64", reason="Linux x86_64 artifact")
def test_vercel_rejects_corrupt_native_artifact(monkeypatch, tmp_path):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(native_runtime, "_LOADED", None)
    monkeypatch.setattr(native_runtime, "NATIVE_DIR", tmp_path)
    (tmp_path / "libexpat.so.1").write_bytes(b"not a native library")
    (tmp_path / "libexpat.sha256").write_text("0" * 64 + "  libexpat.so.1\n")
    with pytest.raises(RuntimeError, match="integrity check"):
        native_runtime.prepare_native_runtime()
