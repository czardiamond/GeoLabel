import json
import sqlite3
import zipfile

import pytest

from backend.backup import create_backup


def test_local_backup_contains_sqlite_snapshot_and_live_assets_only(tmp_path):
    database = tmp_path / "source.sqlite"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE sample (value TEXT)")
        db.execute("INSERT INTO sample VALUES ('preserved')")

    asset_root = tmp_path / "assets"
    real_asset = asset_root / "org-1" / "asset-1" / "original.bin"
    real_asset.parent.mkdir(parents=True)
    real_asset.write_bytes(b"private imagery bytes")
    incoming = asset_root / ".incoming" / "partial.upload"
    incoming.parent.mkdir()
    incoming.write_bytes(b"not a committed asset")
    private_export = asset_root / ".exports" / "leftover.zip"
    private_export.parent.mkdir()
    private_export.write_bytes(b"temporary export")

    output = tmp_path / "backups" / "geolabel.zip"
    result = create_backup(output, f"sqlite:///{database}", asset_root)
    assert result == output.resolve()
    assert result.stat().st_mode & 0o777 == 0o600
    with zipfile.ZipFile(result) as archive:
        assert set(archive.namelist()) == {
            "database.sqlite", "assets/org-1/asset-1/original.bin", "backup-manifest.json"
        }
        assert archive.read("assets/org-1/asset-1/original.bin") == b"private imagery bytes"
        manifest = json.loads(archive.read("backup-manifest.json"))
        assert manifest["asset_count"] == 1
        assert manifest["encryption"].startswith("none;")
        extracted = tmp_path / "snapshot.sqlite"
        extracted.write_bytes(archive.read("database.sqlite"))
    with sqlite3.connect(extracted) as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT value FROM sample").fetchone()[0] == "preserved"
    with pytest.raises(FileExistsError):
        create_backup(output, f"sqlite:///{database}", asset_root)


def test_local_backup_fails_closed_for_other_database_engines(tmp_path):
    with pytest.raises(NotImplementedError, match="SQLite only"):
        create_backup(tmp_path / "backup.zip", "postgresql://user:pass@localhost/db", tmp_path / "assets")
