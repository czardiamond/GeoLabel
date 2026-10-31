"""GeoLabel Task Management FastAPI Server."""

import logging
import json
import os
import secrets
import uuid
from typing import Optional
from urllib.parse import urlsplit

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Security, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth import generate_annotator_credentials, get_current_annotator
from backend.asset_storage import storage_root
from backend.config import settings
from backend.temp_storage import AssetCapacityError, AssetTempStorageMiddleware
from backend.database import get_db
from backend.geo_utils import reproject_feature_collection
from backend.models import Annotation, AnnotatorApiKey, QuoteRequest, Task, utcnow_naive
from backend.schemas import (
    AnnotatorTaskResponse,
    AnnotatorRegisterRequest,
    AnnotatorRegisterResponse,
    AnnotationSubmit,
    QuoteCreate,
    QuoteResponse,
    TaskCreate,
    TaskResponse,
    TaskResultsResponse,
    WebhookRegister,
)
from backend.scoring import build_consensus_geojson, compute_task_iaa, scoring_configuration, SCORER_VERSION
from backend.identity import router as identity_router
from backend.workflows import router as workflows_router
from backend.blob_storage import check_access as check_blob_access, is_configured as blob_storage_configured

logger = logging.getLogger(__name__)
IS_VERCEL = os.getenv("VERCEL") == "1"
API_PREFIX = "/api" if IS_VERCEL else ""


def api_path(path: str) -> str:
    return f"{API_PREFIX}{path}"

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API for geospatial annotation task intake, annotation submission, and agreement scoring.",
    openapi_url=api_path("/openapi.json"),
    docs_url=api_path("/docs"),
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Annotator-API-Key"],
)

app.add_middleware(AssetTempStorageMiddleware)

@app.exception_handler(AssetCapacityError)
async def asset_capacity_error(_request, exc: AssetCapacityError):
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


security = HTTPBearer(auto_error=False)

app.include_router(identity_router, prefix=API_PREFIX)
app.include_router(workflows_router, prefix=API_PREFIX)


def webhook_host_allowed(webhook_url: str) -> bool:
    hostname = urlsplit(webhook_url).hostname
    return bool(hostname and hostname.lower().rstrip(".") in settings.webhook_allowed_host_list)


def require_allowed_webhook(webhook_url: Optional[str]) -> None:
    if webhook_url and not webhook_host_allowed(webhook_url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhooks are disabled for this host. Configure its exact hostname in WEBHOOK_ALLOWED_HOSTS.",
        )


def verify_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
):
    """Require the configured service key; never accept an unset or sample key."""
    configured_key = settings.API_KEY
    if not configured_key or len(configured_key) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API authentication is not configured safely. Set GEOLABEL_API_KEY to a random secret of at least 32 characters.",
        )

    provided_key = credentials.credentials if credentials else None
    if not provided_key or not secrets.compare_digest(provided_key, configured_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Provide a Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True


async def trigger_webhook_callback(webhook_url: str, task_data: dict):
    """Send a best-effort completion event. Delivery is not retried by this service."""
    if not webhook_url:
        return
    if not webhook_host_allowed(webhook_url):
        logger.error("Webhook host is not allowlisted for task %s", task_data["id"])
        return

    payload = {
        "event": "task.completed",
        "task_id": task_data["id"],
        "status": task_data["status"],
        "iaa_score": task_data["iaa_score"],
        "iaa_type": task_data["iaa_type"],
        "completed_at": str(task_data["completed_at"]),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
    except Exception:
        logger.exception("Webhook delivery failed for task %s", task_data["id"])


@app.get(api_path("/health"))
def health_check():
    """Liveness probe."""
    return {"status": "ok", "service": "geolabel-backend", "version": settings.VERSION}


@app.get(api_path("/health/ready"))
def readiness_check(db: Session = Depends(get_db)):
    """Readiness probe for persistent database and configured private asset storage."""
    if IS_VERCEL and settings.DATABASE_URL.startswith("sqlite"):
        raise HTTPException(status_code=503, detail="Persistent PostgreSQL is required on Vercel; SQLite is ephemeral there.")
    if IS_VERCEL and not blob_storage_configured():
        raise HTTPException(status_code=503, detail="Private Vercel Blob storage is not configured.")
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Database readiness check failed")
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    if blob_storage_configured():
        try:
            check_blob_access()
        except Exception as exc:
            logger.exception("Private Blob storage readiness check failed")
            raise HTTPException(status_code=503, detail="Private asset storage is not ready") from exc
        storage_status = "private_vercel_blob"
    else:
        probe = None
        try:
            root = storage_root()
            probe = root / f".health-check-{uuid.uuid4().hex}"
            probe.write_bytes(b"geolabel-storage-ready")
            if probe.read_bytes() != b"geolabel-storage-ready":
                raise OSError("storage readiness marker did not round-trip")
        except Exception as exc:
            logger.exception("Local asset storage readiness check failed")
            raise HTTPException(status_code=503, detail="Configured local asset storage is not ready") from exc
        finally:
            if probe:
                probe.unlink(missing_ok=True)
        storage_status = "writable_local"
    return {"status": "ready", "service": "geolabel-backend", "version": settings.VERSION,
            "asset_storage": storage_status}


@app.get(api_path("/"))
def root_info():
    return {"message": "GeoLabel Geospatial Annotation API", "docs": api_path("/docs"), "health": api_path("/health")}


@app.post(
    api_path("/annotators/register"),
    response_model=AnnotatorRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_annotator(
    payload: AnnotatorRegisterRequest,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key),
):
    """Create an annotator credential; the raw key is returned only once."""
    task = db.query(Task).filter(Task.id == payload.task_id).with_for_update().first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Annotation task '{payload.task_id}' not found.")
    assigned_count = db.query(AnnotatorApiKey).filter(AnnotatorApiKey.task_id == task.id).count()
    if assigned_count >= task.target_annotator_count:
        raise HTTPException(status_code=409, detail="This task already has its target number of annotator credentials.")

    annotator_id, raw_api_key, api_key_hash = generate_annotator_credentials()
    key_record = AnnotatorApiKey(
        annotator_id=annotator_id,
        task_id=task.id,
        api_key_hash=api_key_hash,
        created_at=utcnow_naive(),
    )
    db.add(key_record)
    db.commit()
    db.refresh(key_record)
    return AnnotatorRegisterResponse(
        annotator_id=key_record.annotator_id,
        task_id=key_record.task_id,
        api_key=raw_api_key,
        created_at=key_record.created_at,
    )


@app.delete(api_path("/annotators/{annotator_id}"), status_code=status.HTTP_204_NO_CONTENT)
def revoke_annotator_key(
    annotator_id: str,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key),
):
    """Revoke an annotator credential; submitted annotations remain in the task history."""
    key_record = db.query(AnnotatorApiKey).filter(AnnotatorApiKey.annotator_id == annotator_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Annotator credential not found.")
    db.delete(key_record)
    db.commit()
    return None


@app.post(api_path("/quotes"), response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
def create_quote_request(payload: QuoteCreate, db: Session = Depends(get_db)):
    """Persist a project scoping request; this endpoint does not send email or create a price quote."""
    quote = QuoteRequest(
        full_name=payload.full_name,
        email=str(payload.email),
        organization=payload.organization,
        role=payload.role,
        project_type=payload.project_type,
        imagery_type=payload.imagery_type,
        spatial_resolution=payload.spatial_resolution,
        estimated_volume=payload.estimated_volume,
        timeline=payload.timeline,
        target_accuracy=payload.target_accuracy,
        budget_range=payload.budget_range,
        requirements_description=payload.requirements_description,
        accepted_terms=payload.accepts_terms,
        status="received",
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return QuoteResponse(id=quote.id, status=quote.status, submitted_at=quote.created_at)


@app.post(api_path("/tasks"), response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key),
):
    """Create a task record. Imagery URIs are stored; this endpoint does not ingest or copy imagery."""
    webhook_url = str(payload.webhook_url) if payload.webhook_url else None
    require_allowed_webhook(webhook_url)
    new_task = Task(
        raster_url=payload.raster_url,
        crs=payload.crs,
        target_annotator_count=payload.target_annotator_count,
        webhook_url=webhook_url,
        status="queued",
    )
    new_task.taxonomy = payload.taxonomy
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@app.get(api_path("/tasks/{task_id}"), response_model=TaskResponse)
def get_task_status(
    task_id: str,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key),
):
    """Retrieve status and metadata for a task using the service API key."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Annotation task '{task_id}' not found.")
    return task


@app.get(api_path("/annotator/tasks/{task_id}"), response_model=AnnotatorTaskResponse)
def get_assigned_task(
    task_id: str,
    db: Session = Depends(get_db),
    annotator_id: str = Depends(get_current_annotator),
):
    """Return only the task associated with the supplied annotator credential."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Annotation task '{task_id}' not found.")
    return task


@app.get(api_path("/tasks/{task_id}/results"), response_model=TaskResultsResponse)
def get_task_results(
    task_id: str,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key),
):
    """Return agreement-supported GeoJSON for a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Annotation task '{task_id}' not found.")

    annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    ann_dicts = [{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in annotations]
    geojson_consensus = build_consensus_geojson(
        ann_dicts,
        iaa_score=task.iaa_score,
        crs=task.crs,
    )
    return TaskResultsResponse(
        task_id=task.id,
        status=task.status,
        iaa_score=task.iaa_score,
        iaa_type=task.iaa_type,
        annotation_count=len(annotations),
        geojson=geojson_consensus,
    )


@app.post(api_path("/tasks/{task_id}/webhook"), response_model=TaskResponse)
def register_webhook(
    task_id: str,
    payload: WebhookRegister,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key),
):
    """Register or update a task-completion webhook URL."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Annotation task '{task_id}' not found.")
    require_allowed_webhook(str(payload.webhook_url))
    task.webhook_url = str(payload.webhook_url)
    task.updated_at = utcnow_naive()
    db.commit()
    db.refresh(task)
    return task


@app.post(api_path("/tasks/{task_id}/annotations"), response_model=AnnotatorTaskResponse)
def submit_annotation(
    task_id: str,
    payload: AnnotationSubmit,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    annotator_id: str = Depends(get_current_annotator),
):
    """Accept one GeoJSON FeatureCollection per registered annotator and task."""
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Annotation task '{task_id}' not found.")
    if task.status == "completed":
        raise HTTPException(status_code=409, detail="This task already has its required annotations.")

    existing = db.query(Annotation).filter(
        Annotation.task_id == task_id,
        Annotation.annotator_id == annotator_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This annotator has already submitted an annotation for this task.")

    try:
        reprojected_geojson = reproject_feature_collection(payload.geojson, task.crs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Submission CRS reprojection failed: {exc}") from exc

    allowed_categories = set(task.taxonomy)
    for index, feature in enumerate(reprojected_geojson.get("features", [])):
        properties = feature.get("properties")
        category = properties.get("category") if isinstance(properties, dict) else None
        if not isinstance(category, str) or category not in allowed_categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"features[{index}].properties.category must match a task taxonomy label.",
            )
        if not isinstance(feature.get("geometry"), dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"features[{index}].geometry must be a GeoJSON geometry object.",
            )

    annotation = Annotation(task_id=task_id, annotator_id=annotator_id)
    annotation.geojson = reprojected_geojson
    db.add(annotation)
    try:
        db.flush()
        all_annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
        task.status = "in_progress"

        if len(all_annotations) >= task.target_annotator_count:
            ann_dicts = [{"annotator_id": item.annotator_id, "geojson": item.geojson} for item in all_annotations]
            task.iaa_score, task.iaa_type = compute_task_iaa(ann_dicts, task.taxonomy, crs=task.crs)
            task.scoring_version = SCORER_VERSION
            task.scoring_config_json = json.dumps(scoring_configuration(), sort_keys=True, separators=(",", ":"))
            task.status = "completed"
            task.completed_at = utcnow_naive()

        task.updated_at = utcnow_naive()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This annotator has already submitted an annotation for this task.") from exc

    db.refresh(task)
    if task.status == "completed" and task.webhook_url:
        task_data = {
            "id": task.id,
            "status": task.status,
            "iaa_score": task.iaa_score,
            "iaa_type": task.iaa_type,
            "completed_at": task.completed_at,
        }
        background_tasks.add_task(trigger_webhook_callback, task.webhook_url, task_data)
    return task


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
