"""Load the licensed native dependency absent from Vercel's minimal runtime."""
from __future__ import annotations

import ctypes
import hashlib
import os
from pathlib import Path
import platform
import sys

NATIVE_DIR = Path(__file__).with_name("native")
_LOADED = None


def prepare_native_runtime() -> bool:
    """Preload Expat by its real SONAME for GDAL; do not replace GIS behavior."""
    global _LOADED
    if os.getenv("VERCEL") != "1":
        return False
    if sys.platform != "linux" or platform.machine().lower() not in {"x86_64", "amd64"}:
        raise RuntimeError("The bundled Vercel native dependency requires Linux x86_64.")
    if _LOADED is not None:
        return True
    library = NATIVE_DIR / "libexpat.so.1"
    checksum = NATIVE_DIR / "libexpat.sha256"
    try:
        expected = checksum.read_text().split()[0]
        actual = hashlib.sha256(library.read_bytes()).hexdigest()
    except (OSError, IndexError) as exc:
        raise RuntimeError("The Vercel native dependency is missing or incomplete.") from exc
    if actual != expected:
        raise RuntimeError("The Vercel native dependency failed its integrity check.")
    _LOADED = ctypes.CDLL(str(library), mode=ctypes.RTLD_GLOBAL)
    return True
