import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_bootstrap_migrates_existing_unversioned_database_without_losing_records(tmp_path):
    root = Path(__file__).resolve().parents[1]
    database = tmp_path / "legacy.db"
    connection = sqlite3.connect(database)
    connection.executescript("""
        CREATE TABLE tasks (
            id VARCHAR PRIMARY KEY,
            raster_url TEXT NOT NULL,
            crs VARCHAR NOT NULL,
            taxonomy_json TEXT NOT NULL,
            target_annotator_count INTEGER NOT NULL,
            status VARCHAR NOT NULL,
            webhook_url TEXT,
            iaa_score FLOAT,
            iaa_type VARCHAR,
            created_at DATETIME,
            updated_at DATETIME,
            completed_at DATETIME
        );
        CREATE TABLE annotator_api_keys (
            annotator_id VARCHAR PRIMARY KEY,
            api_key_hash VARCHAR NOT NULL UNIQUE,
            created_at DATETIME
        );
        CREATE TABLE annotations (
            id VARCHAR PRIMARY KEY,
            task_id VARCHAR NOT NULL,
            annotator_id VARCHAR NOT NULL,
            geojson_data TEXT NOT NULL,
            submitted_at DATETIME,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );
        CREATE TABLE video_segment_submissions (
            id VARCHAR PRIMARY KEY,
            task_id VARCHAR NOT NULL,
            user_id VARCHAR NOT NULL,
            version INTEGER NOT NULL,
            segments_json TEXT NOT NULL,
            review_status VARCHAR(24) NOT NULL DEFAULT 'pending',
            reviewed_by_user_id VARCHAR,
            submitted_at DATETIME,
            reviewed_at DATETIME,
            UNIQUE(task_id, user_id, version)
        );
        INSERT INTO tasks (id, raster_url, crs, taxonomy_json, target_annotator_count, status)
        VALUES ('task_existing', 'https://storage.example.test/old.tif', 'EPSG:4326', '["building"]', 2, 'in_progress');
        INSERT INTO annotator_api_keys (annotator_id, api_key_hash) VALUES ('ann_existing', 'sha256hash');
        INSERT INTO annotations (id, task_id, annotator_id, geojson_data)
        VALUES ('annotation_existing', 'task_existing', 'ann_existing', '{"type":"FeatureCollection","features":[]}');
        INSERT INTO video_segment_submissions (id, task_id, user_id, version, segments_json)
        VALUES ('video_existing', 'task_existing', 'user_existing', 1, '[{"start_ms":100,"end_ms":300,"category":"building"}]');
    """)
    connection.commit()
    connection.close()

    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{database}"
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    migrated = sqlite3.connect(database)
    task = migrated.execute("SELECT id, status FROM tasks WHERE id='task_existing'").fetchone()
    annotation = migrated.execute("SELECT id FROM annotations WHERE id='annotation_existing'").fetchone()
    video_submission = migrated.execute("SELECT segments_json, tracks_json FROM video_segment_submissions WHERE id='video_existing'").fetchone()
    key_columns = {row[1] for row in migrated.execute("PRAGMA table_info(annotator_api_keys)")}
    task_columns = {row[1] for row in migrated.execute("PRAGMA table_info(tasks)")}
    annotation_columns = {row[1] for row in migrated.execute("PRAGMA table_info(annotations)")}
    video_columns = {row[1] for row in migrated.execute("PRAGMA table_info(video_segment_submissions)")}
    new_tables = {row[0] for row in migrated.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    upload_intent_columns = {row[1] for row in migrated.execute("PRAGMA table_info(upload_intents)")}
    quote_table = migrated.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='quote_requests'").fetchone()
    version = migrated.execute("SELECT version_num FROM alembic_version").fetchone()
    assert task == ("task_existing", "in_progress")
    assert annotation == ("annotation_existing",)
    assert "task_id" in key_columns
    assert {"project_id", "asset_id", "priority", "review_status", "task_type", "scoring_version", "scoring_config_json"}.issubset(task_columns)
    assert {"review_status", "reviewed_at", "review_comment"}.issubset(annotation_columns)
    assert {"organizations", "projects", "datasets", "assets", "organization_memberships", "audit_events", "task_comments", "task_assignments", "auth_throttles", "annotation_drafts", "video_segment_submissions", "upload_intents"}.issubset(new_tables)
    assert {"id", "asset_id", "pathname", "dataset_id", "creator_user_id", "declared_filename", "declared_content_type", "declared_size_bytes", "status", "created_at", "expires_at"}.issubset(upload_intent_columns)
    assert "tracks_json" in video_columns
    assert video_submission == ('[{"start_ms":100,"end_ms":300,"category":"building"}]', "[]")
    assert migrated.execute("SELECT review_status FROM tasks WHERE id='task_existing'").fetchone() == ("not_started",)
    assert migrated.execute("SELECT review_status FROM annotations WHERE id='annotation_existing'").fetchone() == ("pending",)
    assert quote_table is not None
    assert version == ("0006_upload_intents",)
    migrated.close()
