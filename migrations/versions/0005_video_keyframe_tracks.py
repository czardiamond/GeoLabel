"""Persist contributor-authored video keyframe tracks.

The default empty JSON array keeps all earlier temporal-segment submissions
readable without rewriting or dropping existing data.
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_video_keyframe_tracks"
down_revision = "0004_annotation_drafts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "video_segment_submissions" not in sa.inspect(bind).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(bind).get_columns("video_segment_submissions")}
    if "tracks_json" not in columns:
        op.add_column(
            "video_segment_submissions",
            sa.Column("tracks_json", sa.Text(), nullable=False, server_default=sa.text("'[]'")),
        )


def downgrade() -> None:
    raise RuntimeError(
        "Automatic downgrade is disabled because it would discard submitted video keyframe tracks."
    )
