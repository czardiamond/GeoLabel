"""Add additive multi-worker assignments, scorer provenance and login throttles.

Legacy scalar task assignments and every existing task, annotation and user row
remain intact. Downgrade is deliberately disabled for data-preservation safety.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_assignments_scoring_auth"
down_revision = "0002_workspaces_assets_review"
branch_labels = None
depends_on = None


def _columns(table):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    task_columns = _columns("tasks")
    for column in (
        sa.Column("scoring_version", sa.String(length=64), nullable=True),
        sa.Column("scoring_config_json", sa.Text(), nullable=True),
    ):
        if column.name not in task_columns:
            op.add_column("tasks", column)

    # These tables are purely additive and are registered in ORM metadata.
    from backend.database import Base
    import backend.models  # noqa: F401
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    raise RuntimeError(
        "Automatic downgrade is disabled because assignment and authentication history may have been written. "
        "Back up the database and write a reviewed data-preserving migration instead."
    )
