from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field, HttpUrl

class TaskCreate(BaseModel):
    raster_url: str = Field(..., description="URI or HTTP URL to raster tile/imagery (S3/GCS/COG)")
    crs: str = Field(default="EPSG:4326", description="Coordinate Reference System (e.g. EPSG:4326, EPSG:32634)")
    taxonomy: List[str] = Field(..., min_items=1, description="List of object categories to annotate (e.g. ['building_footprint', 'solar_pv'])")
    target_annotator_count: int = Field(default=2, ge=1, le=10, description="Number of specialist annotators required for agreement scoring")
    webhook_url: Optional[str] = Field(None, description="Optional callback URL triggered upon task completion")

class TaskResponse(BaseModel):
    id: str
    raster_url: str
    crs: str
    taxonomy: List[str]
    target_annotator_count: int
    status: str
    webhook_url: Optional[str] = None
    iaa_score: Optional[float] = None
    iaa_type: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TaskResultsResponse(BaseModel):
    task_id: str
    status: str
    iaa_score: Optional[float] = None
    iaa_type: Optional[str] = None
    annotation_count: int
    geojson: Dict[str, Any]

class AnnotationSubmit(BaseModel):
    annotator_id: Optional[str] = Field(None, description="Optional annotator ID (overridden by authenticated key)")
    geojson: Dict[str, Any] = Field(..., description="GeoJSON FeatureCollection submitted by the human annotator")

class WebhookRegister(BaseModel):
    webhook_url: str = Field(..., description="Callback URL for task completion notifications")

class AnnotatorRegisterResponse(BaseModel):
    annotator_id: str = Field(..., description="Unique generated annotator identifier")
    api_key: str = Field(..., description="Raw API key — shown ONCE. Store securely.")
    created_at: datetime
