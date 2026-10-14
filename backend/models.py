import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database import Base


def utcnow_naive():
    """Return a naive UTC datetime for the repository's existing DB columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def generate_uuid():
    return str(uuid.uuid4())


def _id(prefix: str):
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def generate_task_id():
    return f"task_gl_{uuid.uuid4().hex[:12]}"


def generate_annotator_id():
    return f"ann_{uuid.uuid4().hex[:12]}"


def generate_quote_id():
    return f"GL-QT-{uuid.uuid4().hex[:12].upper()}"


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: _id("org"))
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id = Column(String, primary_key=True, default=lambda: _id("usr"))
    email = Column(String(320), nullable=False, unique=True, index=True)
    display_name = Column(String(160), nullable=False)
    password_hash = Column(String(512), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)
    last_login_at = Column(DateTime, nullable=True)


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("user_accounts.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class OrganizationInvitation(Base):
    __tablename__ = "organization_invitations"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    email = Column(String(320), nullable=False, index=True)
    role = Column(String(32), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("user_accounts.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)
    revoked_at = Column(DateTime, nullable=True)


class AuthThrottle(Base):
    """Persistent, privacy-preserving login failure window keyed by a digest."""
    __tablename__ = "auth_throttles"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_hash = Column(String(64), nullable=False, unique=True, index=True)
    window_started_at = Column(DateTime, nullable=False, default=utcnow_naive)
    failed_count = Column(Integer, nullable=False, default=0)
    blocked_until = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=utcnow_naive)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    actor_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True, index=True)
    actor_kind = Column(String(32), nullable=False, default="user")
    action = Column(String(100), nullable=False)
    resource_type = Column(String(80), nullable=False)
    resource_id = Column(String(100), nullable=False)
    details_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)

    @property
    def details(self):
        try:
            return json.loads(self.details_json)
        except (TypeError, json.JSONDecodeError):
            return {}

    @details.setter
    def details(self, value):
        self.details_json = json.dumps(value or {}, separators=(",", ":"))


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: _id("prj"))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=lambda: _id("ds"))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String, primary_key=True, default=lambda: _id("asset"))
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    storage_key = Column(Text, nullable=False, unique=True)
    preview_key = Column(Text, nullable=True)
    content_type = Column(String(120), nullable=False)
    kind = Column(String(24), nullable=False, default="image")
    size_bytes = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    crs = Column(String(256), nullable=True)
    bounds_json = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)

    @property
    def bounds(self):
        try:
            return json.loads(self.bounds_json) if self.bounds_json else None
        except (TypeError, json.JSONDecodeError):
            return None

    @property
    def asset_metadata(self):
        try:
            return json.loads(self.metadata_json)
        except (TypeError, json.JSONDecodeError):
            return {}


class AnnotatorApiKey(Base):
    __tablename__ = "annotator_api_keys"

    annotator_id = Column(String, primary_key=True, default=generate_annotator_id)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=True, index=True)
    api_key_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=utcnow_naive)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_task_id)
    raster_url = Column(Text, nullable=False)
    crs = Column(String, nullable=False, default="EPSG:4326")
    taxonomy_json = Column(Text, nullable=False, default="[]")
    target_annotator_count = Column(Integer, nullable=False, default=2)
    status = Column(String, nullable=False, default="queued")
    webhook_url = Column(Text, nullable=True)
    iaa_score = Column(Float, nullable=True)
    iaa_type = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)
    completed_at = Column(DateTime, nullable=True)
    title = Column(String(200), nullable=True)
    task_type = Column(String(24), nullable=False, default="geospatial")
    # These columns are added to legacy tasks with nullable ALTER TABLE operations;
    # migrations intentionally do not retrofit foreign-key constraints onto them.
    project_id = Column(String, nullable=True, index=True)
    dataset_id = Column(String, nullable=True, index=True)
    asset_id = Column(String, nullable=True, index=True)
    priority = Column(Integer, nullable=False, default=0, index=True)
    assigned_user_id = Column(String, nullable=True, index=True)
    reserved_by_user_id = Column(String, nullable=True)
    reserved_until = Column(DateTime, nullable=True)
    review_status = Column(String(32), nullable=False, default="not_started")
    scoring_version = Column(String(64), nullable=True)
    scoring_config_json = Column(Text, nullable=True)

    annotations = relationship("Annotation", back_populates="task", cascade="all, delete-orphan")

    @property
    def taxonomy(self):
        try:
            return json.loads(self.taxonomy_json)
        except (TypeError, json.JSONDecodeError):
            return []

    @taxonomy.setter
    def taxonomy(self, value):
        self.taxonomy_json = json.dumps(value)


class TaskAssignment(Base):
    """Explicit additive worker assignment; legacy Task.assigned_user_id remains valid."""
    __tablename__ = "task_assignments"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_task_assignment_worker"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("user_accounts.id"), nullable=False, index=True)
    assigned_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    assigned_at = Column(DateTime, nullable=False, default=utcnow_naive)
    deactivated_at = Column(DateTime, nullable=True)


class Annotation(Base):
    __tablename__ = "annotations"
    __table_args__ = (UniqueConstraint("task_id", "annotator_id", name="uq_annotation_task_annotator"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    annotator_id = Column(String, nullable=False)
    geojson_data = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=utcnow_naive)
    review_status = Column(String(24), nullable=False, default="pending", index=True)
    reviewed_by_user_id = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_comment = Column(Text, nullable=True)

    task = relationship("Task", back_populates="annotations")

    @property
    def geojson(self):
        try:
            return json.loads(self.geojson_data)
        except (TypeError, json.JSONDecodeError):
            return {}

    @geojson.setter
    def geojson(self, value):
        self.geojson_data = json.dumps(value)


class AnnotationRevision(Base):
    __tablename__ = "annotation_revisions"
    __table_args__ = (UniqueConstraint("annotation_id", "version", name="uq_annotation_revision_version"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    annotation_id = Column(String, ForeignKey("annotations.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    geojson_data = Column(Text, nullable=False)
    review_status = Column(String(24), nullable=False)
    submitted_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class AnnotationDraft(Base):
    """Recoverable, private in-progress annotation state for one task worker."""
    __tablename__ = "annotation_drafts"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_annotation_draft_task_user"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("user_accounts.id"), nullable=False, index=True)
    draft_json = Column(Text, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime, nullable=False, default=utcnow_naive)


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    author_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    author_annotator_id = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    issue_status = Column(String(24), nullable=False, default="comment")
    status = Column(String(24), nullable=False, default="open")
    resolved_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("user_accounts.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    resource_type = Column(String(80), nullable=False)
    resource_id = Column(String(100), nullable=False)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)


class GoldStandard(Base):
    __tablename__ = "gold_standards"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, unique=True, index=True)
    geojson_data = Column(Text, nullable=False)
    created_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=utcnow_naive)


class PreAnnotation(Base):
    __tablename__ = "preannotations"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    source = Column(String(120), nullable=False)
    model_version = Column(String(160), nullable=True)
    geojson_data = Column(Text, nullable=False)
    status = Column(String(24), nullable=False, default="pending")
    created_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    reviewed_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)
    reviewed_at = Column(DateTime, nullable=True)

    @property
    def geojson(self):
        try:
            return json.loads(self.geojson_data)
        except (TypeError, json.JSONDecodeError):
            return {}


class VideoSegmentSubmission(Base):
    __tablename__ = "video_segment_submissions"
    __table_args__ = (UniqueConstraint("task_id", "user_id", "version", name="uq_video_submission_version"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("user_accounts.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    segments_json = Column(Text, nullable=False)
    tracks_json = Column(Text, nullable=False, default="[]", server_default="[]")
    review_status = Column(String(24), nullable=False, default="pending")
    reviewed_by_user_id = Column(String, ForeignKey("user_accounts.id"), nullable=True)
    submitted_at = Column(DateTime, nullable=False, default=utcnow_naive)
    reviewed_at = Column(DateTime, nullable=True)

    @property
    def segments(self):
        try:
            return json.loads(self.segments_json)
        except (TypeError, json.JSONDecodeError):
            return []

    @segments.setter
    def segments(self, value):
        self.segments_json = json.dumps(value)

    @property
    def tracks(self):
        try:
            return json.loads(self.tracks_json)
        except (TypeError, json.JSONDecodeError):
            return []

    @tracks.setter
    def tracks(self, value):
        self.tracks_json = json.dumps(value)


class QuoteRequest(Base):
    __tablename__ = "quote_requests"

    id = Column(String, primary_key=True, default=generate_quote_id)
    full_name = Column(String(160), nullable=False)
    email = Column(String(320), nullable=False, index=True)
    organization = Column(String(200), nullable=False)
    role = Column(String(160), nullable=True)
    project_type = Column(String(120), nullable=False)
    imagery_type = Column(String(120), nullable=False)
    spatial_resolution = Column(String(120), nullable=False)
    estimated_volume = Column(String(120), nullable=False)
    timeline = Column(String(120), nullable=False)
    target_accuracy = Column(String(120), nullable=False)
    budget_range = Column(String(120), nullable=False)
    requirements_description = Column(Text, nullable=False)
    accepted_terms = Column(Boolean, nullable=False)
    status = Column(String(32), nullable=False, default="received")
    created_at = Column(DateTime, default=utcnow_naive, nullable=False)
