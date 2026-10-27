"""GeoLabel API. Persistent user/client operations require a verified non-anonymous Firebase ID token."""
from typing import Optional
from datetime import datetime
import json
import httpx
from fastapi import Body, FastAPI, Depends, HTTPException, status, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.config import settings
from backend.database import Base, engine, get_db
from backend.models import Task, Annotation, AnnotatorApiKey, UserMemory
from backend.schemas import TaskCreate, TaskResponse, TaskResultsResponse, AnnotationSubmit, WebhookRegister, AnnotatorRegisterResponse
from backend.scoring import compute_task_iaa, build_consensus_geojson
from backend.geo_utils import reproject_feature_collection
from backend.auth import generate_annotator_credentials, get_current_annotator, require_user, require_admin

Base.metadata.create_all(bind=engine)
app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "X-Annotator-API-Key", "X-GeoLabel-Admin-Secret"])


def owned_task(db, task_id: str, uid: str) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.owner_uid == uid).first()
    if not task: raise HTTPException(404, f"Annotation task '{task_id}' not found.")
    return task


async def trigger_webhook_callback(url: str, task_data: dict):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={"event": "task.completed", **task_data})
    except Exception as exc:
        print(f"[Webhook Error] {exc}")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "geolabel-backend", "version": settings.VERSION, "persistent_storage": not settings.DATABASE_URL.startswith("sqlite")}


@app.get("/")
def root_info():
    return {"message": "GeoLabel Geospatial Annotation API", "docs": "/docs", "health": "/health"}


@app.post("/annotators/register", response_model=AnnotatorRegisterResponse, status_code=201)
def register_annotator(db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    annotator_id, raw_key, key_hash = generate_annotator_credentials()
    record = AnnotatorApiKey(annotator_id=annotator_id, api_key_hash=key_hash)
    db.add(record); db.commit(); db.refresh(record)
    return AnnotatorRegisterResponse(annotator_id=record.annotator_id, api_key=raw_key, created_at=record.created_at)


@app.post("/tasks", response_model=TaskResponse, status_code=201)
def create_task(payload: TaskCreate, db: Session = Depends(get_db), user: dict = Depends(require_user)):
    task = Task(owner_uid=user["sub"], raster_url=payload.raster_url, crs=payload.crs, target_annotator_count=payload.target_annotator_count, webhook_url=payload.webhook_url)
    task.taxonomy = payload.taxonomy
    db.add(task); db.commit(); db.refresh(task); return task


@app.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task_status(task_id: str, db: Session = Depends(get_db), user: dict = Depends(require_user)):
    return owned_task(db, task_id, user["sub"])


@app.get("/tasks/{task_id}/results", response_model=TaskResultsResponse)
def get_task_results(task_id: str, db: Session = Depends(get_db), user: dict = Depends(require_user)):
    task = owned_task(db, task_id, user["sub"])
    annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    result = build_consensus_geojson([{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in annotations], iaa_score=task.iaa_score or 0.0, crs=task.crs)
    return TaskResultsResponse(task_id=task.id, status=task.status, iaa_score=task.iaa_score, iaa_type=task.iaa_type, annotation_count=len(annotations), geojson=result)


@app.post("/tasks/{task_id}/webhook", response_model=TaskResponse)
def register_webhook(task_id: str, payload: WebhookRegister, db: Session = Depends(get_db), user: dict = Depends(require_user)):
    task = owned_task(db, task_id, user["sub"]); task.webhook_url = payload.webhook_url; task.updated_at = datetime.utcnow(); db.commit(); db.refresh(task); return task


@app.post("/tasks/{task_id}/annotations", response_model=TaskResponse)
def submit_annotation(task_id: str, payload: AnnotationSubmit, background_tasks: BackgroundTasks, db: Session = Depends(get_db), annotator_id: str = Depends(get_current_annotator)):
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task: raise HTTPException(404, f"Annotation task '{task_id}' not found.")
    if db.query(Annotation).filter(Annotation.task_id == task_id, Annotation.annotator_id == annotator_id).first(): raise HTTPException(409, "Annotator has already submitted an annotation")
    try: geojson = reproject_feature_collection(payload.geojson, task.crs)
    except ValueError as exc: raise HTTPException(400, f"Submission CRS reprojection failed: {exc}")
    annotation = Annotation(task_id=task_id, annotator_id=annotator_id); annotation.geojson = geojson; db.add(annotation); db.flush()
    all_annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all(); task.status = "in_progress"
    if len(all_annotations) >= task.target_annotator_count:
        task.iaa_score, task.iaa_type = compute_task_iaa([{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in all_annotations], task.taxonomy); task.status = "completed"; task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow(); db.commit(); db.refresh(task); return task


@app.post("/tasks/{task_id}/simulate-completion", response_model=TaskResponse)
def simulate_task_completion(task_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task: raise HTTPException(404, f"Annotation task '{task_id}' not found.")
    categories = task.taxonomy or ["building_footprint"]
    for i in range(task.target_annotator_count):
        annotator_id = f"specialist_annotator_{i+1}"
        if db.query(Annotation).filter(Annotation.task_id == task_id, Annotation.annotator_id == annotator_id).first(): continue
        x = i * 0.0001; cat = categories[i % len(categories)]
        geo = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-122.4194+x,37.7749+x],[-122.418+x,37.7749+x],[-122.418+x,37.776+x],[-122.4194+x,37.776+x],[-122.4194+x,37.7749+x]]]},"properties":{"category":cat,"confidence":0.98,"orthogonal_rectified":True}}]}
        ann = Annotation(task_id=task_id, annotator_id=annotator_id); ann.geojson = reproject_feature_collection(geo, task.crs); db.add(ann)
    db.flush(); annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all(); task.iaa_score, task.iaa_type = compute_task_iaa([{"annotator_id":a.annotator_id,"geojson":a.geojson} for a in annotations], task.taxonomy); task.status="completed"; task.completed_at=datetime.utcnow(); task.updated_at=datetime.utcnow(); db.commit(); db.refresh(task); return task


@app.get("/memory", response_model=dict)
def read_memory(db: Session = Depends(get_db), user: dict = Depends(require_user)):
    return {row.record_key: json.loads(row.value_json) for row in db.query(UserMemory).filter(UserMemory.owner_uid == user["sub"]).all()}


@app.put("/memory/{record_key}", response_model=dict)
def write_memory(record_key: str, value: object = Body(...), db: Session = Depends(get_db), user: dict = Depends(require_user)):
    if not record_key or len(record_key) > 160: raise HTTPException(400, "Invalid memory key")
    row = db.query(UserMemory).filter(UserMemory.owner_uid == user["sub"], UserMemory.record_key == record_key).first()
    if row: row.value_json = json.dumps(value)
    else: db.add(UserMemory(owner_uid=user["sub"], record_key=record_key, value_json=json.dumps(value)))
    db.commit(); return {"key": record_key, "value": value}


@app.delete("/memory/{record_key}", status_code=204)
def delete_memory(record_key: str, db: Session = Depends(get_db), user: dict = Depends(require_user)):
    db.query(UserMemory).filter(UserMemory.owner_uid == user["sub"], UserMemory.record_key == record_key).delete(); db.commit()
