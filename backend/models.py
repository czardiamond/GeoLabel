import uuid
import json
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def generate_task_id():
    return f"task_gl_{uuid.uuid4().hex[:12]}"

def generate_annotator_id():
    return f"ann_{uuid.uuid4().hex[:12]}"

class AnnotatorApiKey(Base):
    __tablename__ = "annotator_api_keys"

    annotator_id = Column(String, primary_key=True, default=generate_annotator_id)
    api_key_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_task_id)
    raster_url = Column(Text, nullable=False)
    crs = Column(String, nullable=False, default="EPSG:4326")
    taxonomy_json = Column(Text, nullable=False, default="[]")  # JSON encoded list of category strings
    target_annotator_count = Column(Integer, nullable=False, default=2)
    status = Column(String, nullable=False, default="queued")  # queued, in_progress, completed, failed
    webhook_url = Column(Text, nullable=True)
    
    iaa_score = Column(Float, nullable=True)
    iaa_type = Column(String, nullable=True)  # cohens_kappa or fleiss_kappa
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    annotations = relationship("Annotation", back_populates="task", cascade="all, delete-orphan")

    @property
    def taxonomy(self):
        try:
            return json.loads(self.taxonomy_json)
        except Exception:
            return []

    @taxonomy.setter
    def taxonomy(self, val):
        self.taxonomy_json = json.dumps(val)


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    annotator_id = Column(String, nullable=False)
    geojson_data = Column(Text, nullable=False)  # JSON encoded GeoJSON FeatureCollection/Feature
    submitted_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="annotations")

    @property
    def geojson(self):
        try:
            return json.loads(self.geojson_data)
        except Exception:
            return {}

    @geojson.setter
    def geojson(self, val):
        self.geojson_data = json.dumps(val)
