import uuid
import json
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.database import Base


def generate_uuid(): return str(uuid.uuid4())
def generate_task_id(): return f"task_gl_{uuid.uuid4().hex[:12]}"
def generate_annotator_id(): return f"ann_{uuid.uuid4().hex[:12]}"


class AnnotatorApiKey(Base):
    __tablename__ = "annotator_api_keys"
    annotator_id = Column(String, primary_key=True, default=generate_annotator_id)
    api_key_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Task(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True, default=generate_task_id)
    owner_uid = Column(String, nullable=False, index=True)
    raster_url = Column(Text, nullable=False)
    crs = Column(String, nullable=False, default="EPSG:4326")
    taxonomy_json = Column(Text, nullable=False, default="[]")
    target_annotator_count = Column(Integer, nullable=False, default=2)
    status = Column(String, nullable=False, default="queued")
    webhook_url = Column(Text, nullable=True)
    iaa_score = Column(Float, nullable=True)
    iaa_type = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    annotations = relationship("Annotation", back_populates="task", cascade="all, delete-orphan")

    @property
    def taxonomy(self):
        try: return json.loads(self.taxonomy_json)
        except Exception: return []
    @taxonomy.setter
    def taxonomy(self, val): self.taxonomy_json = json.dumps(val)


class Annotation(Base):
    __tablename__ = "annotations"
    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    annotator_id = Column(String, nullable=False)
    geojson_data = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    task = relationship("Task", back_populates="annotations")
    @property
    def geojson(self):
        try: return json.loads(self.geojson_data)
        except Exception: return {}
    @geojson.setter
    def geojson(self, val): self.geojson_data = json.dumps(val)


class UserMemory(Base):
    __tablename__ = "user_memory"
    id = Column(String, primary_key=True, default=generate_uuid)
    owner_uid = Column(String, nullable=False, index=True)
    record_key = Column(String, nullable=False)
    value_json = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("owner_uid", "record_key", name="uq_user_memory_owner_key"),)
