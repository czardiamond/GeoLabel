-- Run with the deployment migration tool against the durable PostgreSQL DATABASE_URL.
-- Existing task rows must be assigned by an operator before the NOT NULL constraint.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_uid VARCHAR(255);
-- Review and populate legacy rows; never guess ownership.
-- UPDATE tasks SET owner_uid = '<verified-firebase-uid>' WHERE id = '<task-id>';
ALTER TABLE tasks ALTER COLUMN owner_uid SET NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tasks_owner_uid ON tasks(owner_uid);
CREATE TABLE IF NOT EXISTS user_memory (
  id VARCHAR(36) PRIMARY KEY,
  owner_uid VARCHAR(255) NOT NULL,
  record_key VARCHAR(160) NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_memory_owner_key UNIQUE (owner_uid, record_key)
);
CREATE INDEX IF NOT EXISTS ix_user_memory_owner_uid ON user_memory(owner_uid);
