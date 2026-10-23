"""Bootstrap GeoLabel schema and add task-scoped annotator keys.

This baseline is safe for databases created by the pre-Alembic application:
it creates missing tables and adds the nullable assignment column without
recreating existing task, annotation, or key data.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_bootstrap"
down_revision = None
branch_labels = None
depends_on = None


def _tables(bind):
    return set(sa.inspect(bind).get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    tables = _tables(bind)

    if "tasks" not in tables:
        op.create_table(
            "tasks",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("raster_url", sa.Text(), nullable=False),
            sa.Column("crs", sa.String(), nullable=False),
            sa.Column("taxonomy_json", sa.Text(), nullable=False),
            sa.Column("target_annotator_count", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("webhook_url", sa.Text(), nullable=True),
            sa.Column("iaa_score", sa.Float(), nullable=True),
            sa.Column("iaa_type", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    tables = _tables(bind)
    if "annotator_api_keys" not in tables:
        op.create_table(
            "annotator_api_keys",
            sa.Column("annotator_id", sa.String(), nullable=False),
            sa.Column("task_id", sa.String(), nullable=True),
            sa.Column("api_key_hash", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
            sa.PrimaryKeyConstraint("annotator_id"),
        )
    else:
        columns = {column["name"] for column in sa.inspect(bind).get_columns("annotator_api_keys")}
        if "task_id" not in columns:
            with op.batch_alter_table("annotator_api_keys") as batch:
                batch.add_column(sa.Column("task_id", sa.String(), nullable=True))
                batch.create_foreign_key("fk_annotator_api_keys_task_id_tasks", "tasks", ["task_id"], ["id"])

    tables = _tables(bind)
    if "annotations" not in tables:
        op.create_table(
            "annotations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("task_id", sa.String(), nullable=False),
            sa.Column("annotator_id", sa.String(), nullable=False),
            sa.Column("geojson_data", sa.Text(), nullable=False),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("task_id", "annotator_id", name="uq_annotation_task_annotator"),
        )
    else:
        unique_pairs = {
            tuple(constraint.get("column_names") or [])
            for constraint in sa.inspect(bind).get_unique_constraints("annotations")
        }
        if ("task_id", "annotator_id") not in unique_pairs:
            duplicate = bind.execute(sa.text(
                "SELECT task_id, annotator_id, COUNT(*) AS n FROM annotations "
                "GROUP BY task_id, annotator_id HAVING COUNT(*) > 1 LIMIT 1"
            )).first()
            if duplicate:
                raise RuntimeError(
                    "Cannot enforce one annotation per task/annotator: duplicate rows exist. "
                    "Resolve duplicate annotation records, then rerun the migration."
                )
            with op.batch_alter_table("annotations") as batch:
                batch.create_unique_constraint("uq_annotation_task_annotator", ["task_id", "annotator_id"])

    tables = _tables(bind)
    if "quote_requests" not in tables:
        op.create_table(
            "quote_requests",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("full_name", sa.String(length=160), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("organization", sa.String(length=200), nullable=False),
            sa.Column("role", sa.String(length=160), nullable=True),
            sa.Column("project_type", sa.String(length=120), nullable=False),
            sa.Column("imagery_type", sa.String(length=120), nullable=False),
            sa.Column("spatial_resolution", sa.String(length=120), nullable=False),
            sa.Column("estimated_volume", sa.String(length=120), nullable=False),
            sa.Column("timeline", sa.String(length=120), nullable=False),
            sa.Column("target_accuracy", sa.String(length=120), nullable=False),
            sa.Column("budget_range", sa.String(length=120), nullable=False),
            sa.Column("requirements_description", sa.Text(), nullable=False),
            sa.Column("accepted_terms", sa.Boolean(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    indexes = {(table, index["name"]) for table in inspector.get_table_names() for index in inspector.get_indexes(table)}
    desired_indexes = [
        ("annotator_api_keys", "ix_annotator_api_keys_api_key_hash", ["api_key_hash"], True),
        ("annotator_api_keys", "ix_annotator_api_keys_task_id", ["task_id"], False),
        ("annotations", "ix_annotations_task_id", ["task_id"], False),
        ("quote_requests", "ix_quote_requests_email", ["email"], False),
    ]
    for table, name, columns, unique in desired_indexes:
        if (table, name) not in indexes:
            op.create_index(name, table, columns, unique=unique)


def downgrade() -> None:
    raise RuntimeError(
        "Automatic downgrade is disabled because it may discard scoping requests, annotations, or task assignments. "
        "Back up the database and write a reviewed data-preserving migration instead."
    )
