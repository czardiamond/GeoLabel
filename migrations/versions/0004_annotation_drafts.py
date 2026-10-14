"""Add recoverable, user-scoped annotation drafts.

Draft rows are additive and contain only work in progress. Existing final
annotations and revisions are preserved.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_annotation_drafts"
down_revision = "0003_assignments_scoring_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "annotation_drafts" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "annotation_drafts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("draft_json", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "user_id", name="uq_annotation_draft_task_user"),
    )
    op.create_index("ix_annotation_drafts_task_id", "annotation_drafts", ["task_id"], unique=False)
    op.create_index("ix_annotation_drafts_user_id", "annotation_drafts", ["user_id"], unique=False)


def downgrade() -> None:
    raise RuntimeError(
        "Automatic downgrade is disabled because it would discard unsent contributor work. "
        "Export or recover drafts before writing a reviewed data-preserving migration."
    )
