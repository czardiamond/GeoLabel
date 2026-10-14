"""Private local GeoLabel backup utility for SQLite plus local asset storage.

The produced ZIP is intentionally unencrypted. Store it only on a protected
volume or encrypt it with the deployment's separately managed key system.
PostgreSQL and remote object storage require provider-native backup tooling.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.engine import make_url

from backend.config import settings


def _sqlite_file(database_url: str) -> Path:
    parsed = make_url(database_url)
    if parsed.drivername not in {"sqlite", "sqlite+pysqlite"}:
        raise NotImplementedError("Local backup currently supports SQLite only; use the database provider's supported backup utility for PostgreSQL or other engines.")
    if not parsed.database or parsed.database == ":memory:":
        raise ValueError("A file-backed SQLite database is required for a durable backup.")
    path = Path(parsed.database).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"SQLite database does not exist: {path}")
    return path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sqlite_snapshot(source_path: Path, target_path: Path) -> None:
    source = sqlite3.connect(f"file:{quote(str(source_path))}?mode=ro", uri=True, timeout=30)
    target = sqlite3.connect(target_path)
    try:
        source.backup(target, pages=256, sleep=0.05)
        check = target.execute("PRAGMA integrity_check").fetchone()
        if not check or check[0] != "ok":
            raise RuntimeError("SQLite backup failed its integrity check.")
    finally:
        target.close()
        source.close()


def create_backup(output: str | Path, database_url: str | None = None,
                  asset_directory: str | Path | None = None) -> Path:
    """Create an atomic, no-overwrite backup ZIP and return its absolute path."""
    database_url = database_url or settings.DATABASE_URL
    source_database = _sqlite_file(database_url)
    asset_root = Path(asset_directory or settings.ASSET_STORAGE_DIR).expanduser().resolve()
    destination = Path(output).expanduser().resolve()
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite existing backup: {destination}")
    if asset_root == destination or asset_root in destination.parents:
        raise ValueError("Backup output must be outside the live asset storage directory.")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)

    work_dir = Path(tempfile.mkdtemp(prefix="geolabel-backup-", dir=destination.parent))
    archive_temp = destination.parent / f".{destination.name}.{uuid.uuid4().hex}.tmp"
    try:
        snapshot = work_dir / "database.sqlite"
        _sqlite_snapshot(source_database, snapshot)
        asset_entries: list[tuple[Path, str, int, str]] = []
        if asset_root.exists():
            for candidate in sorted(asset_root.rglob("*")):
                if candidate.is_symlink() or not candidate.is_file():
                    continue
                relative = candidate.relative_to(asset_root)
                if not relative.parts or any(part.startswith(".") for part in relative.parts):
                    continue
                resolved = candidate.resolve()
                if asset_root != resolved and asset_root not in resolved.parents:
                    continue
                if resolved == source_database:
                    continue
                asset_entries.append((candidate, f"assets/{relative.as_posix()}", candidate.stat().st_size, _sha256(candidate)))
        manifest = {
            "format": "geolabel-local-backup-v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "database_engine": "sqlite",
            "database_snapshot": {"path": "database.sqlite", "size_bytes": snapshot.stat().st_size,
                                  "sha256": _sha256(snapshot)},
            "asset_count": len(asset_entries),
            "assets": [{"path": archive_path, "size_bytes": size, "sha256": digest}
                       for _, archive_path, size, digest in asset_entries],
            "encryption": "none; protect the destination volume and encrypt separately if required",
        }
        fd = os.open(archive_temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        with zipfile.ZipFile(archive_temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
            archive.write(snapshot, "database.sqlite")
            for path, archive_path, _, _ in asset_entries:
                archive.write(path, archive_path)
            archive.writestr("backup-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        os.chmod(archive_temp, 0o600)
        # Hard-link creation is atomic and refuses to clobber a concurrently-created destination.
        os.link(archive_temp, destination)
        archive_temp.unlink()
        return destination
    finally:
        archive_temp.unlink(missing_ok=True)
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a local SQLite plus private media backup.")
    parser.add_argument("--output", required=True, help="New backup ZIP path outside the live asset storage directory")
    args = parser.parse_args()
    path = create_backup(args.output)
    print(f"Created local backup: {path}")
    print("This ZIP is unencrypted; protect the file and destination storage.")


if __name__ == "__main__":
    main()
