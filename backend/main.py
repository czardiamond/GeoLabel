"""
GeoLabel Task Management FastAPI Server
Supports SQLite / Postgres, API Key Auth, Human-in-the-Loop Annotation Tasks, and IAA Scoring
"""

from typing import Optional, List
from datetime import datetime
import json
import httpx
from fastapi import FastAPI, Depends, HTTPException, Security, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import Base, engine, get_db
from backend.models import Task, Annotation, AnnotatorApiKey
from backend.schemas import (
    TaskCreate,
    TaskResponse,
    TaskResultsResponse,
    AnnotationSubmit,
    WebhookRegister,
    AnnotatorRegisterResponse
)
from backend.scoring import compute_task_iaa, build_consensus_geojson
from backend.geo_utils import get_feature_collection_crs, reproject_feature_collection
from backend.auth import generate_annotator_credentials, get_current_annotator

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend REST API for GeoLabel Specialist Geospatial Annotation Platform"
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

def verify_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
):
    """
    Validates Bearer token or fallback secret key for admin/client endpoints.
    """
    if not settings.API_KEY:
        return True  # If no API key set, allow requests (dev mode)

    provided_key = None
    if credentials:
        provided_key = credentials.credentials

    if not provided_key or provided_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Provide Bearer token in Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True


async def trigger_webhook_callback(webhook_url: str, task_data: dict):
    """
    Dispatches HTTP POST notification to client webhook URL upon task completion.
    """
    if not webhook_url:
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "event": "task.completed",
                "task_id": task_data["id"],
                "status": task_data["status"],
                "iaa_score": task_data["iaa_score"],
                "iaa_type": task_data["iaa_type"],
                "completed_at": str(task_data["completed_at"]),
            }
            await client.post(webhook_url, json=payload)
    except Exception as e:
        print(f"[Webhook Error] Failed to send webhook to {webhook_url}: {str(e)}")


@app.get("/health")
def health_check():
    """Public health check endpoint for Railway/Render probes."""
    return {"status": "ok", "service": "geolabel-backend", "version": settings.VERSION}


@app.get("/")
def root_info():
    """API Info."""
    return {
        "message": "GeoLabel Geospatial Annotation API",
        "docs": "/docs",
        "health": "/health"
    }


@app.post("/annotators/register", response_model=AnnotatorRegisterResponse, status_code=status.HTTP_201_CREATED)
def register_annotator(
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key)
):
    """
    Register a new specialist annotator, generate a secret API key, and return the key once.
    Stores only the SHA-256 hash of the API key in the database.
    """
    annotator_id, raw_api_key, api_key_hash = generate_annotator_credentials()
    key_record = AnnotatorApiKey(
        annotator_id=annotator_id,
        api_key_hash=api_key_hash,
        created_at=datetime.utcnow()
    )
    db.add(key_record)
    db.commit()
    db.refresh(key_record)

    return AnnotatorRegisterResponse(
        annotator_id=key_record.annotator_id,
        api_key=raw_api_key,
        created_at=key_record.created_at
    )


@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key)
):
    """
    Create a new human-in-the-loop geospatial annotation task.
    """
    new_task = Task(
        raster_url=payload.raster_url,
        crs=payload.crs,
        target_annotator_count=payload.target_annotator_count,
        webhook_url=payload.webhook_url,
        status="queued"
    )
    new_task.taxonomy = payload.taxonomy

    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@app.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task_status(
    task_id: str,
    db: Session = Depends(get_db)
):
    """
    Check status, metadata, and progress of an annotation task.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation task '{task_id}' not found."
        )
    return task


@app.get("/tasks/{task_id}/results", response_model=TaskResultsResponse)
def get_task_results(
    task_id: str,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key)
):
    """
    Download completed annotations as GeoJSON, including Inter-Annotator Agreement (IAA) score.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation task '{task_id}' not found."
        )

    annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    ann_dicts = [{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in annotations]

    geojson_consensus = build_consensus_geojson(
        ann_dicts,
        iaa_score=task.iaa_score or 0.0,
        crs=task.crs
    )

    return TaskResultsResponse(
        task_id=task.id,
        status=task.status,
        iaa_score=task.iaa_score,
        iaa_type=task.iaa_type,
        annotation_count=len(annotations),
        geojson=geojson_consensus
    )


@app.post("/tasks/{task_id}/webhook", response_model=TaskResponse)
def register_webhook(
    task_id: str,
    payload: WebhookRegister,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key)
):
    """
    Register or update a callback webhook URL for task completion notification.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation task '{task_id}' not found."
        )

    task.webhook_url = payload.webhook_url
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@app.post("/tasks/{task_id}/annotations", response_model=TaskResponse)
def submit_annotation(
    task_id: str,
    payload: AnnotationSubmit,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    annotator_id: str = Depends(get_current_annotator)
):
    """
    Submit a human specialist annotation for a task.
    Requires authentic annotator API key (passed in X-Annotator-API-Key or Bearer header).
    Uses database row locking (SELECT FOR UPDATE) to safely calculate completion status.
    Prevents duplicate submissions from the same annotator on a task.
    """
    # Use SELECT FOR UPDATE row-level lock on Task
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation task '{task_id}' not found."
        )

    # Check for duplicate submission by this annotator on this task
    existing_annotation = db.query(Annotation).filter(
        Annotation.task_id == task_id,
        Annotation.annotator_id == annotator_id
    ).first()
    if existing_annotation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Annotator '{annotator_id}' has already submitted an annotation for task '{task_id}'."
        )

    # Reproject incoming GeoJSON to the task's stored CRS before saving
    try:
        reprojected_geojson = reproject_feature_collection(payload.geojson, task.crs)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Submission CRS reprojection failed: {str(e)}"
        )

    # Save human annotation with reprojected features and authenticated annotator_id
    annotation = Annotation(
        task_id=task_id,
        annotator_id=annotator_id
    )
    annotation.geojson = reprojected_geojson
    db.add(annotation)
    db.flush()  # Make annotation visible to subsequent query in this transaction

    # Fetch all annotations under row-level lock
    all_annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    ann_dicts = [{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in all_annotations]

    task.status = "in_progress"

    if len(all_annotations) >= task.target_annotator_count:
        iaa_score, iaa_type = compute_task_iaa(ann_dicts, task.taxonomy)
        task.status = "completed"
        task.iaa_score = iaa_score
        task.iaa_type = iaa_type
        task.completed_at = datetime.utcnow()

        if task.webhook_url:
            task_dict = {
                "id": task.id,
                "status": task.status,
                "iaa_score": task.iaa_score,
                "iaa_type": task.iaa_type,
                "completed_at": task.completed_at
            }
            background_tasks.add_task(trigger_webhook_callback, task.webhook_url, task_dict)

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@app.post("/tasks/{task_id}/simulate-completion", response_model=TaskResponse)
def simulate_task_completion(
    task_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    authenticated: bool = Depends(verify_api_key)
):
    """
    Helper endpoint: Simulates human specialist annotators completing the task.
    Generates realistic vector geometries with high inter-annotator agreement.
    Uses row-level locking to safely update completion state.
    """
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation task '{task_id}' not found."
        )

    categories = task.taxonomy if task.taxonomy else ["building_footprint"]
    
    # Generate annotations matching target_annotator_count
    for i in range(task.target_annotator_count):
        annotator_id = f"specialist_annotator_{i+1}"
        
        existing = db.query(Annotation).filter(
            Annotation.task_id == task_id,
            Annotation.annotator_id == annotator_id
        ).first()
        if existing:
            continue

        cat = categories[i % len(categories)]
        sample_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-122.4194 + (i * 0.0001), 37.7749 + (i * 0.0001)],
                                [-122.4180 + (i * 0.0001), 37.7749 + (i * 0.0001)],
                                [-122.4180 + (i * 0.0001), 37.7760 + (i * 0.0001)],
                                [-122.4194 + (i * 0.0001), 37.7760 + (i * 0.0001)],
                                [-122.4194 + (i * 0.0001), 37.7749 + (i * 0.0001)]
                            ]
                        ]
                    },
                    "properties": {
                        "category": cat,
                        "confidence": 0.98,
                        "orthogonal_rectified": True
                    }
                }
            ]
        }
        
        try:
            sample_geojson_reprojected = reproject_feature_collection(sample_geojson, task.crs)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sample annotation CRS reprojection failed: {str(e)}"
            )
        ann = Annotation(task_id=task_id, annotator_id=annotator_id)
        ann.geojson = sample_geojson_reprojected
        db.add(ann)

    db.flush()

    all_annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    ann_dicts = [{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in all_annotations]

    iaa_score, iaa_type = compute_task_iaa(ann_dicts, task.taxonomy)
    task.status = "completed"
    task.iaa_score = iaa_score
    task.iaa_type = iaa_type
    task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()

    if task.webhook_url:
        task_dict = {
            "id": task.id,
            "status": task.status,
            "iaa_score": task.iaa_score,
            "iaa_type": task.iaa_type,
            "completed_at": task.completed_at
        }
        background_tasks.add_task(trigger_webhook_callback, task.webhook_url, task_dict)

    db.commit()
    db.refresh(task)
    return task


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
