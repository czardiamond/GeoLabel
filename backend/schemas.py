from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

import pyproj
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator, model_validator


class TaskCreate(BaseModel):
    raster_url: str = Field(..., min_length=1, max_length=2048, description="HTTPS, S3, or GCS imagery URI")
    crs: str = Field(default="EPSG:4326", min_length=1, max_length=256)
    taxonomy: List[str] = Field(..., min_length=1, max_length=200)
    target_annotator_count: int = Field(default=2, ge=1, le=10)
    webhook_url: Optional[HttpUrl] = None

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_raster_uri(cls, value: Any) -> Any:
        """Accept the SDK/older-docs name while keeping raster_url canonical."""
        if not isinstance(value, dict) or "raster_uri" not in value:
            return value
        value = dict(value)
        legacy_value = value.pop("raster_uri")
        if "raster_url" in value and value["raster_url"] != legacy_value:
            raise ValueError("Provide one matching raster_url or raster_uri value.")
        value.setdefault("raster_url", legacy_value)
        return value

    @field_validator("raster_url")
    @classmethod
    def validate_raster_uri(cls, value: str) -> str:
        value = value.strip()
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"https", "s3", "gs"} or not parsed.netloc:
            raise ValueError("raster_url must be an HTTPS URL, s3:// URI, or gs:// URI")
        if parsed.username or parsed.password:
            raise ValueError("Credentials must not be embedded in raster_url")
        return value

    @field_validator("crs")
    @classmethod
    def validate_crs(cls, value: str) -> str:
        value = value.strip()
        try:
            return pyproj.CRS.from_user_input(value).to_string()
        except Exception as exc:
            raise ValueError("crs must be a valid coordinate reference system") from exc

    @field_validator("taxonomy")
    @classmethod
    def validate_taxonomy(cls, value: List[str]) -> List[str]:
        cleaned = [item.strip() for item in value]
        if any(not item or len(item) > 100 for item in cleaned):
            raise ValueError("taxonomy labels must contain 1–100 characters")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("taxonomy labels must be unique")
        return cleaned

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook_scheme(cls, value: Optional[HttpUrl]) -> Optional[HttpUrl]:
        if value is not None and value.scheme.lower() != "https":
            raise ValueError("webhook_url must use HTTPS")
        return value


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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


class AnnotatorTaskResponse(BaseModel):
    """Task fields visible to an assigned worker; never expose owner callback URLs."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    raster_url: str
    crs: str
    taxonomy: List[str]
    target_annotator_count: int
    status: str
    iaa_score: Optional[float] = None
    iaa_type: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class TaskResultsResponse(BaseModel):
    task_id: str
    status: str
    iaa_score: Optional[float] = None
    iaa_type: Optional[str] = None
    annotation_count: int
    geojson: Dict[str, Any]


class AnnotationSubmit(BaseModel):
    geojson: Dict[str, Any] = Field(..., description="GeoJSON FeatureCollection")

    @field_validator("geojson")
    @classmethod
    def validate_feature_collection(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if value.get("type") != "FeatureCollection" or not isinstance(value.get("features"), list):
            raise ValueError("geojson must be a GeoJSON FeatureCollection with a features array")
        if len(value["features"]) > 10000:
            raise ValueError("A submission may contain at most 10,000 features")
        for feature in value["features"]:
            if not isinstance(feature, dict) or feature.get("type") != "Feature":
                raise ValueError("Every entry in features must be a GeoJSON Feature")
            if not isinstance(feature.get("geometry"), dict):
                raise ValueError("Feature geometry must be a GeoJSON geometry object")
        return value


class WebhookRegister(BaseModel):
    webhook_url: HttpUrl

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook_scheme(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme.lower() != "https":
            raise ValueError("webhook_url must use HTTPS")
        return value


class AnnotatorRegisterRequest(BaseModel):
    task_id: str = Field(..., min_length=1, max_length=64)


class AnnotatorRegisterResponse(BaseModel):
    annotator_id: str
    task_id: str
    api_key: str
    created_at: datetime


class QuoteCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    email: EmailStr
    organization: str = Field(..., min_length=2, max_length=200)
    role: Optional[str] = Field(default=None, max_length=160)
    project_type: str = Field(..., min_length=1, max_length=120)
    imagery_type: str = Field(..., min_length=1, max_length=120)
    spatial_resolution: str = Field(..., min_length=1, max_length=120)
    estimated_volume: str = Field(..., min_length=1, max_length=120)
    timeline: str = Field(..., min_length=1, max_length=120)
    target_accuracy: str = Field(..., min_length=1, max_length=120)
    budget_range: str = Field(..., min_length=1, max_length=120)
    requirements_description: str = Field(..., min_length=10, max_length=10000)
    accepts_terms: bool = False

    @field_validator("full_name", "organization", "project_type", "imagery_type", "spatial_resolution", "estimated_volume", "timeline", "target_accuracy", "budget_range", "requirements_description", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_terms_acceptance(self):
        if not self.accepts_terms:
            raise ValueError("You must accept the contact and scoping terms before submitting")
        return self


class QuoteResponse(BaseModel):
    id: str
    status: str
    submitted_at: datetime
