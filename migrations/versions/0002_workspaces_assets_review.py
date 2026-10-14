"""Additive workspaces, geospatial asset ingestion, and review workflows.

Existing task, annotation, credential, and quote rows are preserved. New task
columns are nullable or have server defaults so older rows remain usable.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_workspaces_assets_review"
down_revision = "0001_bootstrap"
branch_labels = None
depends_on = None


def _columns(table):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    task_columns = _columns("tasks")
    additions = [
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("dataset_id", sa.String(), nullable=True),
        sa.Column("asset_id", sa.String(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_user_id", sa.String(), nullable=True),
        sa.Column("reserved_by_user_id", sa.String(), nullable=True),
        sa.Column("reserved_until", sa.DateTime(), nullable=True),
        sa.Column("review_status", sa.String(length=32), nullable=False, server_default="not_started"),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("task_type", sa.String(length=24), nullable=False, server_default="geospatial"),
    ]
    for column in additions:
        if column.name not in task_columns:
            op.add_column("tasks", column)

    annotation_columns = _columns("annotations")
    annotation_additions = [
        sa.Column("review_status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("reviewed_by_user_id", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_comment", sa.Text(), nullable=True),
    ]
    for column in annotation_additions:
        if column.name not in annotation_columns:
            op.add_column("annotations", column)

    # Model metadata creates only missing additive tables and their declared indexes.
    from backend.database import Base
    import backend.models  # noqa: F401 - ensure all additive models are registered
    Base.metadata.create_all(bind=bind, checkfirst=True)

    indexes = {(table, index["name"]) for table in sa.inspect(bind).get_table_names() for index in sa.inspect(bind).get_indexes(table)}
    for table, name, columns in [
        ("tasks", "ix_tasks_project_id", ["project_id"]),
        ("tasks", "ix_tasks_dataset_id", ["dataset_id"]),
        ("tasks", "ix_tasks_asset_id", ["asset_id"]),
        ("tasks", "ix_tasks_assigned_user_id", ["assigned_user_id"]),
        ("tasks", "ix_tasks_priority", ["priority"]),
        ("annotations", "ix_annotations_review_status", ["review_status"]),
    ]:
        if (table, name) not in indexes:
            op.create_index(name, table, columns, unique=False)


def downgrade() -> None:
    raise RuntimeError(
        "Automatic downgrade is disabled because this migration adds account, dataset, asset, review, and audit data. "
        "Back up the database and write a reviewed data-preserving migration instead."
    )
