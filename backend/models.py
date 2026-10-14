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


def generate_task_id():
    return f"task_gl_{uuid.uuid4().hex[:12]}"


def generate_annotator_id():
    return f"ann_{uuid.uuid4().hex[:12]}"


def generate_quote_id():
    return f"GL-QT-{uuid.uuid4().hex[:12].upper()}"


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


class Annotation(Base):
    __tablename__ = "annotations"
    __table_args__ = (UniqueConstraint("task_id", "annotator_id", name="uq_annotation_task_annotator"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    annotator_id = Column(String, nullable=False)
    geojson_data = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=utcnow_naive)

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
