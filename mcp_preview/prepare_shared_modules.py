"""Copy the shared GIS/MCP source files into the Vercel project root at build time."""
from __future__ import annotations

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = PROJECT_ROOT.parent
MODULES = {
    "backend": ("__init__.py", "geo_utils.py", "geo_validation.py", "spatial_operations.py"),
    "geolabel_mcp": ("__init__.py", "server.py"),
}


def main() -> None:
    for package, filenames in MODULES.items():
        source = REPOSITORY_ROOT / package
        destination = PROJECT_ROOT / package
        destination.mkdir(parents=True, exist_ok=True)
        for filename in filenames:
            source_file = source / filename
            if source_file.is_file():
                shutil.copy2(source_file, destination / filename)
            elif filename != "__init__.py":
                raise FileNotFoundError(f"Required shared module is missing: {source_file}")
            else:
                (destination / filename).write_text("", encoding="utf-8")


if __name__ == "__main__":
    main()
