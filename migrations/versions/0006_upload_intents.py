"""Add creator-scoped, expiring direct-upload leases."""
from alembic import op
import sqlalchemy as sa

revision = "0006_upload_intents"
down_revision = "0005_video_keyframe_tracks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "upload_intents" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "upload_intents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("asset_id", sa.String(), nullable=False),
        sa.Column("pathname", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.String(), nullable=False),
        sa.Column("creator_user_id", sa.String(), nullable=False),
        sa.Column("declared_filename", sa.String(length=255), nullable=False),
        sa.Column("declared_content_type", sa.String(length=120), nullable=False),
        sa.Column("declared_size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"]),
        sa.ForeignKeyConstraint(["creator_user_id"], ["user_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", name="uq_upload_intent_asset"),
        sa.UniqueConstraint("pathname", name="uq_upload_intents_pathname"),
    )
    for name, column in (("asset_id", "asset_id"), ("dataset_id", "dataset_id"), ("creator_user_id", "creator_user_id"), ("status", "status"), ("expires_at", "expires_at")):
        op.create_index(f"ix_upload_intents_{name}", "upload_intents", [column])


def downgrade() -> None:
    raise RuntimeError("Automatic downgrade is disabled for upload intents.")
