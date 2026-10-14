"""Organization-scoped annotation workflows, private media, review and quality APIs."""
import asyncio
import ipaddress
import json
import math
import mimetypes
import os
import shutil
import socket
import tempfile
import uuid
import zipfile
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field, HttpUrl, ValidationError, field_validator
import pyproj
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from backend.asset_storage import (
    inspect_and_preview,
    make_storage_paths,
    new_temp_path,
    parse_bounds,
    resolve_storage_key,
    safe_filename,
    save_temp_asset,
    storage_root,
)
from backend.gis_operations import raster_band_statistics, raster_change_analysis, spatial_join
from backend.mask_utils import polygonize_png_mask
from backend.auth import get_current_annotator
from backend.config import settings
from backend.database import get_db
from backend.geo_utils import reproject_feature_collection
from backend.identity import MemberContext, audit, membership_for, notify, require_member, require_roles
from backend.models import (
    Annotation,
    AnnotationDraft,
    AnnotationRevision,
    AuditEvent,
    Asset,
    Dataset,
    GoldStandard,
    Organization,
    OrganizationMembership,
    PreAnnotation,
    Project,
    Task,
    TaskAssignment,
    TaskComment,
    UserAccount,
    UserNotification,
    VideoSegmentSubmission,
    utcnow_naive,
)
from backend.scoring import (
    SCORER_VERSION,
    build_consensus_geojson,
    compute_task_iaa,
    match_features_cohen,
    scoring_configuration,
)

router = APIRouter(tags=["projects, media, tasks and review"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=10000)


class DatasetCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=10000)


class RemoteAssetImport(BaseModel):
    url: str = Field(min_length=8, max_length=4096)
    filename: str = Field(min_length=1, max_length=255)
    crs: str | None = Field(default=None, max_length=256)
    bounds: list[float] | None = None

    @field_validator("bounds")
    @classmethod
    def check_bounds(cls, value):
        if value is not None:
            if len(value) != 4 or not all(math.isfinite(float(item)) for item in value):
                raise ValueError("bounds must contain four finite numbers")
            if value[0] >= value[2] or value[1] >= value[3]:
                raise ValueError("bounds must have xmin < xmax and ymin < ymax")
        return value


class TaskCreateInProject(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    dataset_id: str
    asset_id: str
    crs: str = Field(default="EPSG:4326", min_length=1, max_length=256)
    taxonomy: list[str] = Field(min_length=1, max_length=200)
    target_annotator_count: int = Field(default=1, ge=1, le=10)
    priority: int = Field(default=0, ge=-100, le=100)
    assigned_user_id: str | None = None

    @field_validator("taxonomy")
    @classmethod
    def clean_taxonomy(cls, value):
        clean = [str(label).strip() for label in value]
        if any(not label or len(label) > 100 for label in clean) or len(set(clean)) != len(clean):
            raise ValueError("taxonomy labels must be unique and contain 1–100 characters")
        return clean

    @field_validator("crs")
    @classmethod
    def valid_crs(cls, value):
        try:
            return pyproj.CRS.from_user_input(value).to_string()
        except Exception as exc:
            raise ValueError("crs must identify a valid coordinate reference system") from exc


class BatchTasksCreate(BaseModel):
    asset_ids: list[str] = Field(min_length=1, max_length=100)
    title_prefix: str = Field(min_length=2, max_length=160)
    crs: str = Field(default="EPSG:4326", min_length=1, max_length=256)
    taxonomy: list[str] = Field(min_length=1, max_length=200)
    target_annotator_count: int = Field(default=1, ge=1, le=10)
    priority: int = Field(default=0, ge=-100, le=100)

    @field_validator("crs")
    @classmethod
    def valid_crs(cls, value):
        try:
            return pyproj.CRS.from_user_input(value).to_string()
        except Exception as exc:
            raise ValueError("crs must identify a valid coordinate reference system") from exc

    @field_validator("taxonomy")
    @classmethod
    def valid_taxonomy(cls, value):
        clean = [str(label).strip() for label in value]
        if any(not label or len(label) > 100 for label in clean) or len(set(clean)) != len(clean):
            raise ValueError("taxonomy labels must be unique and contain 1–100 characters")
        return clean


class AssignTask(BaseModel):
    user_id: str


class AssignWorkers(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=10)

    @field_validator("user_ids")
    @classmethod
    def unique_user_ids(cls, value):
        clean = [str(user_id).strip() for user_id in value]
        if any(not user_id for user_id in clean) or len(set(clean)) != len(clean):
            raise ValueError("user_ids must contain unique non-empty account IDs")
        return clean


class ReserveTask(BaseModel):
    seconds: int = Field(default=900, ge=60, le=86400)


class ReviewDecision(BaseModel):
    decision: str = Field(pattern="^(accept|reject|rework)$")
    comment: str = Field(default="", max_length=4000)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    kind: str = Field(default="comment", pattern="^(comment|issue)$")


class IssueStatusUpdate(BaseModel):
    status: str = Field(pattern="^(open|resolved)$")


class GoldStandardInput(BaseModel):
    geojson: dict


class PreAnnotationInput(BaseModel):
    source: str = Field(min_length=2, max_length=120)
    model_version: str | None = Field(default=None, max_length=160)
    geojson: dict


class PreAnnotationDecision(BaseModel):
    decision: str = Field(pattern="^(accept|reject)$")


class AnnotationDraftSave(BaseModel):
    draft: dict
    version: int = Field(default=0, ge=0)


class GeoreferenceRepair(BaseModel):
    crs: str = Field(min_length=1, max_length=256)
    bounds: list[float] = Field(min_length=4, max_length=4)
    rationale: str = Field(min_length=5, max_length=1000)

    @field_validator("crs")
    @classmethod
    def valid_crs(cls, value):
        try:
            return pyproj.CRS.from_user_input(value).to_string()
        except Exception as exc:
            raise ValueError("crs must identify a valid coordinate reference system") from exc

    @field_validator("bounds")
    @classmethod
    def valid_bounds(cls, value):
        try:
            clean = [float(item) for item in value]
        except (TypeError, ValueError) as exc:
            raise ValueError("bounds must contain four numbers") from exc
        if not all(math.isfinite(item) for item in clean) or clean[0] >= clean[2] or clean[1] >= clean[3]:
            raise ValueError("bounds must be finite [xmin, ymin, xmax, ymax] with positive area")
        return clean


class SpatialJoinRequest(BaseModel):
    source_geojson: dict
    target_geojson: dict
    source_crs: str = Field(min_length=1, max_length=256)
    target_crs: str = Field(min_length=1, max_length=256)
    predicate: str = Field(default="intersects", pattern="^(intersects|contains|within)$")

    @field_validator("source_geojson", "target_geojson")
    @classmethod
    def bound_feature_count(cls, value):
        if not isinstance(value, dict) or not isinstance(value.get("features"), list) or len(value["features"]) > 500:
            raise ValueError("Each FeatureCollection must contain at most 500 features")
        return value


class RasterStatsRequest(BaseModel):
    max_pixels: int = Field(default=2_000_000, ge=1, le=25_000_000)


class RasterChangeRequest(BaseModel):
    first_asset_id: str
    second_asset_id: str
    threshold: float | None = Field(default=None, ge=0, le=1e12)
    max_pixels: int = Field(default=2_000_000, ge=1, le=25_000_000)


class VideoSegment(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    notes: str = Field(default="", max_length=4000)

    @field_validator("end_ms")
    @classmethod
    def check_end(cls, value, info):
        start = info.data.get("start_ms")
        if start is not None and value <= start:
            raise ValueError("end_ms must be greater than start_ms")
        return value


class VideoKeyframe(BaseModel):
    timestamp_ms: int = Field(ge=0)
    coordinates: list[Any] = Field(min_length=2, max_length=4096)


class VideoTrack(BaseModel):
    id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")
    category: str = Field(min_length=1, max_length=100)
    kind: str = Field(pattern="^(bbox|point|polyline)$")
    keyframes: list[VideoKeyframe] = Field(min_length=1, max_length=500)

    @field_validator("keyframes")
    @classmethod
    def validate_keyframes(cls, value, info):
        kind = info.data.get("kind")
        frames = sorted(value, key=lambda frame: frame.timestamp_ms)
        timestamps = [frame.timestamp_ms for frame in frames]
        if len(timestamps) != len(set(timestamps)):
            raise ValueError("keyframe timestamps must be unique within a track")
        topology = None
        for frame in frames:
            coordinates = frame.coordinates
            if kind in {"bbox", "point"}:
                expected = 4 if kind == "bbox" else 2
                if len(coordinates) != expected or any(isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)) for item in coordinates):
                    raise ValueError(f"{kind} keyframes require {expected} finite numeric coordinates")
                numbers = [float(item) for item in coordinates]
                if kind == "bbox":
                    x, y, width, height = numbers
                    if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > 1 or y + height > 1:
                        raise ValueError("bbox keyframes must fit within normalized video coordinates")
                elif not all(0 <= item <= 1 for item in numbers):
                    raise ValueError("point coordinates must be normalized between 0 and 1")
                current_topology = expected
            else:
                if not isinstance(coordinates, list) or len(coordinates) < 2 or any(
                    not isinstance(point, (list, tuple)) or len(point) != 2
                    or any(isinstance(item, bool) or not isinstance(item, (int, float))
                           or not math.isfinite(float(item)) or not 0 <= float(item) <= 1 for item in point)
                    for point in coordinates
                ):
                    raise ValueError("polyline keyframes require at least two normalized [x, y] points")
                current_topology = len(coordinates)
            if topology is None:
                topology = current_topology
            elif topology != current_topology:
                raise ValueError("all keyframes in a track must have the same coordinate topology")
        return frames


class VideoSegmentsSubmit(BaseModel):
    segments: list[VideoSegment] = Field(max_length=10000)
    tracks: list[VideoTrack] = Field(default_factory=list, max_length=200)


def _project_for_member(db: Session, project_id: str, member: MemberContext) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    membership_for(db, member.user_id, project.organization_id)
    return project


def _dataset_for_member(db: Session, dataset_id: str, member: MemberContext) -> tuple[Dataset, Project]:
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    project = _project_for_member(db, dataset.project_id, member)
    return dataset, project


def _task_for_member(db: Session, task_id: str, member: MemberContext) -> tuple[Task, OrganizationMembership]:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not task.project_id:
        raise HTTPException(status_code=404, detail="Organization task not found.")
    project = _project_for_member(db, task.project_id, member)
    return task, membership_for(db, member.user_id, project.organization_id)


def _locked_task(db: Session, task_id: str) -> Task:
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task:
        raise HTTPException(status_code=404, detail="Organization task not found.")
    return task


def _require_task_assignment(task: Task, membership: OrganizationMembership, member: MemberContext, db: Session, check_reservation: bool = True) -> None:
    if membership.role != "annotator":
        return
    assigned_ids = _assigned_user_ids(task, db)
    if assigned_ids and member.user_id not in assigned_ids:
        raise HTTPException(status_code=403, detail="This task is assigned to another worker.")
    if check_reservation and task.reserved_until and task.reserved_until > utcnow_naive() and task.reserved_by_user_id != member.user_id:
        raise HTTPException(status_code=403, detail="This task is actively reserved by another worker.")


def _require_asset_assignment(asset: Asset, membership: OrganizationMembership, member: MemberContext, db: Session) -> None:
    if membership.role != "annotator":
        return
    explicit_task_ids = db.query(TaskAssignment.task_id).filter(
        TaskAssignment.user_id == member.user_id, TaskAssignment.active.is_(True)
    )
    access = db.query(Task.id).filter(
        Task.asset_id == asset.id,
        or_(
            Task.assigned_user_id == member.user_id,
            Task.id.in_(explicit_task_ids),
            and_(Task.reserved_by_user_id == member.user_id, Task.reserved_until > utcnow_naive()),
        ),
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="This asset is available only through an assigned or reserved task.")


def _asset_response(asset: Asset) -> dict:
    return {
        "id": asset.id, "dataset_id": asset.dataset_id, "filename": asset.original_filename,
        "content_type": asset.content_type, "kind": asset.kind, "size_bytes": asset.size_bytes,
        "width": asset.width, "height": asset.height, "crs": asset.crs, "bounds": asset.bounds,
        "metadata": asset.asset_metadata,
        "created_at": asset.created_at,
        "preview_path": f"/assets/{asset.id}/preview" if asset.preview_key else None,
        "content_path": f"/assets/{asset.id}/content",
    }


def _assigned_user_ids(task: Task, db: Session) -> set[str]:
    assigned = {task.assigned_user_id} if task.assigned_user_id else set()
    assigned.update(row[0] for row in db.query(TaskAssignment.user_id).filter(
        TaskAssignment.task_id == task.id, TaskAssignment.active.is_(True)
    ).all())
    return assigned


def _task_response(task: Task, db: Session, include_quality: bool = False) -> dict:
    asset = db.query(Asset).filter(Asset.id == task.asset_id).first() if task.asset_id else None
    response = {
        "id": task.id, "title": task.title, "status": task.status, "review_status": task.review_status,
        "task_type": task.task_type, "raster_url": task.raster_url, "crs": task.crs,
        "taxonomy": task.taxonomy, "target_annotator_count": task.target_annotator_count,
        "annotation_count": db.query(Annotation).filter(Annotation.task_id == task.id).count(),
        "priority": task.priority, "assigned_user_id": task.assigned_user_id,
        "assigned_user_ids": sorted(_assigned_user_ids(task, db)),
        "reserved_by_user_id": task.reserved_by_user_id, "reserved_until": task.reserved_until,
        "project_id": task.project_id, "dataset_id": task.dataset_id, "asset_id": task.asset_id,
        "asset": _asset_response(asset) if asset else None,
        "iaa_score": task.iaa_score, "iaa_type": task.iaa_type,
        "scoring_version": task.scoring_version,
        "scoring_config": json.loads(task.scoring_config_json) if task.scoring_config_json else None,
        "created_at": task.created_at, "completed_at": task.completed_at,
    }
    if include_quality:
        response["gold_quality"] = _quality_scores(db, task)["macro_f1"]
    return response


def _can_edit(role: str):
    require_roles_for = ("owner", "admin")
    if role not in require_roles_for:
        raise HTTPException(status_code=403, detail="This action requires an owner or admin role.")


def _task_asset(task: Task, db: Session) -> Asset:
    if not task.asset_id:
        raise HTTPException(status_code=404, detail="This task has no uploaded asset.")
    asset = db.query(Asset).filter(Asset.id == task.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="The task asset record is missing.")
    return asset


def _safe_local_address(hostname: str) -> bool:
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
    except OSError:
        return False
    return bool(addresses) and all(ipaddress.ip_address(address).is_global for address in addresses)


def _validate_remote_url(value: str) -> str:
    parts = urlsplit(value)
    host = (parts.hostname or "").lower().rstrip(".")
    if parts.scheme.lower() != "https" or not host or parts.username or parts.password:
        raise HTTPException(status_code=400, detail="Remote imagery import requires an HTTPS URL without embedded credentials.")
    if host not in settings.imagery_allowed_host_list:
        raise HTTPException(status_code=403, detail="Remote imagery host is not allowlisted. Add its exact hostname to IMAGERY_ALLOWED_HOSTS.")
    if not _safe_local_address(host):
        raise HTTPException(status_code=400, detail="Remote imagery host resolves to a non-public or unavailable address.")
    return host


def _check_annotation_geojson(task: Task, geojson: dict, db: Session) -> dict:
    if geojson.get("type") != "FeatureCollection" or not isinstance(geojson.get("features"), list):
        raise HTTPException(status_code=422, detail="geojson must be a GeoJSON FeatureCollection with a features array.")
    source_features = geojson["features"]
    masks = [
        (index, feature)
        for index, feature in enumerate(source_features)
        if isinstance(feature, dict) and isinstance(feature.get("properties"), dict)
        and "raster_mask" in feature["properties"]
    ]
    if len(masks) > 200:
        raise HTTPException(status_code=413, detail="An annotation may contain at most 200 pixel-mask strokes.")
    total_mask_bytes = sum(
        (len(feature["properties"]["raster_mask"].get("data", "")) * 3 // 4)
        for _, feature in masks
        if isinstance(feature["properties"]["raster_mask"], dict)
        and isinstance(feature["properties"]["raster_mask"].get("data"), str)
    )
    if total_mask_bytes > 8_000_000:
        raise HTTPException(status_code=413, detail="Pixel-mask PNG data exceeds the 8 MB per-submission limit.")
    try:
        if not masks:
            result = reproject_feature_collection(geojson, task.crs)
        else:
            asset = _task_asset(task, db)
            if asset.kind != "image" or not asset.width or not asset.height:
                raise HTTPException(status_code=415, detail="Pixel masks require a georeferenced image asset with known pixel dimensions.")
            normal_features = [feature for feature in source_features if not (
                isinstance(feature, dict) and isinstance(feature.get("properties"), dict)
                and "raster_mask" in feature["properties"]
            )]
            normal_collection = {**geojson, "features": normal_features}
            normalized_normals = reproject_feature_collection(normal_collection, task.crs)
            normal_iter = iter(normalized_normals["features"])
            by_index = {index: feature for index, feature in masks}
            output_features = []
            metadata = asset.asset_metadata or {}
            for index, feature in enumerate(source_features):
                if index not in by_index:
                    output_features.append(next(normal_iter))
                    continue
                properties = feature.get("properties") or {}
                try:
                    geometry = polygonize_png_mask(
                        properties["raster_mask"], expected_width=asset.width, expected_height=asset.height,
                        affine_transform=metadata.get("affine_transform"), bounds=asset.bounds,
                        source_crs=asset.crs or task.crs, target_crs=task.crs,
                    )
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=f"features[{index}].properties.raster_mask: {exc}") from exc
                output_features.append({**feature, "geometry": geometry})
            result = {**normalized_normals, "features": output_features}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Submission CRS reprojection failed: {exc}") from exc
    allowed = set(task.taxonomy)
    for index, feature in enumerate(result.get("features", [])):
        properties = feature.get("properties") if isinstance(feature, dict) else None
        category = properties.get("category") if isinstance(properties, dict) else None
        if not isinstance(category, str) or category not in allowed:
            raise HTTPException(status_code=400, detail=f"features[{index}].properties.category must match a task taxonomy label.")
        if not isinstance(feature.get("geometry"), dict):
            raise HTTPException(status_code=400, detail=f"features[{index}].geometry must be a geometry object.")
    return result


def _check_video_segments(task: Task, asset: Asset, segments: list[VideoSegment]) -> list[dict]:
    categories = set(task.taxonomy)
    duration_ms = (asset.asset_metadata or {}).get("duration_ms")
    for index, segment in enumerate(segments):
        if segment.end_ms <= segment.start_ms:
            raise HTTPException(status_code=422, detail=f"segments[{index}].end_ms must be after start_ms")
        if segment.category not in categories:
            raise HTTPException(status_code=400, detail=f"segments[{index}].category must match the task taxonomy")
        if duration_ms is not None and segment.end_ms > duration_ms:
            raise HTTPException(status_code=400, detail=f"segments[{index}].end_ms exceeds the uploaded video's {duration_ms} ms duration")
    return [segment.model_dump() for segment in segments]


def _check_video_tracks(task: Task, asset: Asset, tracks: list[VideoTrack]) -> list[dict]:
    categories = set(task.taxonomy)
    duration_ms = (asset.asset_metadata or {}).get("duration_ms")
    if len(tracks) > 200:
        raise HTTPException(status_code=422, detail="A video submission may contain at most 200 tracks.")
    if len({track.id for track in tracks}) != len(tracks):
        raise HTTPException(status_code=422, detail="Video track IDs must be unique within a submission.")
    keyframe_count = sum(len(track.keyframes) for track in tracks)
    if keyframe_count > 5000:
        raise HTTPException(status_code=422, detail="A video submission may contain at most 5,000 keyframes.")
    for track_index, track in enumerate(tracks):
        if track.category not in categories:
            raise HTTPException(status_code=400, detail=f"tracks[{track_index}].category must match the task taxonomy")
        for keyframe_index, keyframe in enumerate(track.keyframes):
            if duration_ms is not None and keyframe.timestamp_ms > duration_ms:
                raise HTTPException(
                    status_code=400,
                    detail=f"tracks[{track_index}].keyframes[{keyframe_index}].timestamp_ms exceeds the uploaded video's {duration_ms} ms duration",
                )
    return [track.model_dump() for track in tracks]


def _quality_scores(db: Session, task: Task) -> dict:
    gold = db.query(GoldStandard).filter(GoldStandard.task_id == task.id).first()
    if not gold:
        return {"available": False, "macro_f1": None, "annotators": [],
                "scorer_version": SCORER_VERSION, "scorer_configuration": scoring_configuration()}
    gold_features = json.loads(gold.geojson_data).get("features", [])
    annotations = db.query(Annotation).filter(Annotation.task_id == task.id).all()
    scores = []
    for annotation in annotations:
        features = annotation.geojson.get("features", [])
        matched, unmatched_gold, unmatched_worker = match_features_cohen(gold_features, features, crs=task.crs)
        true_positive = len(matched)
        false_negative = len(unmatched_gold)
        false_positive = len(unmatched_worker)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else (1.0 if not gold_features and not features else 0.0)
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else (1.0 if not gold_features and not features else 0.0)
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        category_accuracy = sum(
            1 for reference, candidate in matched
            if reference.get("properties", {}).get("category") == candidate.get("properties", {}).get("category")
        ) / true_positive if true_positive else (1.0 if not gold_features and not features else 0.0)
        scores.append({
            "annotator_id": annotation.annotator_id, "precision": round(precision, 4),
            "recall": round(recall, 4), "f1": round(f1, 4),
            "category_accuracy": round(category_accuracy, 4), "matched": true_positive,
            "false_positive": false_positive, "false_negative": false_negative,
            "review_status": annotation.review_status,
        })
    macro = sum(row["f1"] for row in scores) / len(scores) if scores else None
    return {"available": True, "macro_f1": round(macro, 4) if macro is not None else None, "annotators": scores,
            "method": "geometric matching at the scoring module default IoU threshold; category accuracy measured on matches",
            "scorer_version": SCORER_VERSION, "scorer_configuration": scoring_configuration(),
            "reference_source": "manually supplied task gold standard; not an independently validated dataset"}


def _notify_reviewers(db: Session, organization_id: str, author_id: str, task: Task, title: str, message: str):
    recipients = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.role.in_(["owner", "admin", "reviewer"]),
        OrganizationMembership.user_id != author_id,
    ).all()
    for membership in recipients:
        notify(db, membership.user_id, title, message, "task", task.id)


@router.post("/organizations/{organization_id}/projects", status_code=status.HTTP_201_CREATED)
def create_project(organization_id: str, payload: ProjectCreate, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    membership = membership_for(db, member.user_id, organization_id)
    _can_edit(membership.role)
    project = Project(organization_id=organization_id, name=payload.name.strip(), description=payload.description.strip())
    db.add(project)
    db.flush()
    audit(db, organization_id, member.user_id, "project.created", "project", project.id, {"name": project.name})
    db.commit()
    return {"id": project.id, "organization_id": project.organization_id, "name": project.name, "description": project.description, "created_at": project.created_at}


@router.get("/organizations/{organization_id}/projects")
def list_projects(organization_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    membership_for(db, member.user_id, organization_id)
    rows = db.query(Project).filter(Project.organization_id == organization_id).order_by(Project.created_at.desc()).all()
    return [{"id": item.id, "organization_id": item.organization_id, "name": item.name, "description": item.description, "created_at": item.created_at} for item in rows]


@router.post("/projects/{project_id}/datasets", status_code=status.HTTP_201_CREATED)
def create_dataset(project_id: str, payload: DatasetCreate, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    project = _project_for_member(db, project_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _can_edit(membership.role)
    dataset = Dataset(project_id=project.id, name=payload.name.strip(), description=payload.description.strip())
    db.add(dataset)
    db.flush()
    audit(db, project.organization_id, member.user_id, "dataset.created", "dataset", dataset.id, {"name": dataset.name})
    db.commit()
    return {"id": dataset.id, "project_id": dataset.project_id, "name": dataset.name, "description": dataset.description, "created_at": dataset.created_at}


@router.get("/projects/{project_id}/datasets")
def list_datasets(project_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    project = _project_for_member(db, project_id, member)
    rows = db.query(Dataset).filter(Dataset.project_id == project.id).order_by(Dataset.created_at.desc()).all()
    return [{"id": item.id, "project_id": item.project_id, "name": item.name, "description": item.description, "created_at": item.created_at} for item in rows]


async def _store_upload(dataset: Dataset, project: Project, filename: str, content_type: str, source: Path, size: int, crs: str | None, bounds: str | None, member: MemberContext, db: Session, world_file_value: str | None = None) -> Asset:
    if size <= 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        metadata = inspect_and_preview(source, filename, content_type, crs, bounds, world_file_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    try:
        storage_key, preview_key = save_temp_asset(source, project.organization_id, asset_id, filename, metadata["preview_path"])
        asset = Asset(
            id=asset_id, dataset_id=dataset.id, original_filename=safe_filename(filename),
            storage_key=storage_key, preview_key=preview_key, content_type=metadata["content_type"],
            kind=metadata["kind"], size_bytes=size, width=metadata["width"], height=metadata["height"],
            crs=metadata["crs"], bounds_json=json.dumps(metadata["bounds"]) if metadata["bounds"] else None,
            metadata_json=json.dumps(metadata["metadata"]),
        )
        db.add(asset)
        audit(db, project.organization_id, member.user_id, "asset.ingested", "asset", asset.id,
              {"filename": asset.original_filename, "kind": asset.kind, "size_bytes": size})
        db.commit()
        db.refresh(asset)
        return asset
    except Exception:
        parent = storage_root() / project.organization_id / asset_id
        shutil.rmtree(parent, ignore_errors=True)
        raise


@router.post("/datasets/{dataset_id}/assets", status_code=status.HTTP_201_CREATED)
async def upload_asset(
    dataset_id: str,
    file: UploadFile = File(...),
    crs: str | None = Form(default=None),
    bounds: str | None = Form(default=None),
    world_file: UploadFile | None = File(default=None),
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    dataset, project = _dataset_for_member(db, dataset_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _can_edit(membership.role)
    max_bytes = max(1, settings.MAX_ASSET_UPLOAD_MB) * 1024 * 1024
    temp_path = new_temp_path()
    size = 0
    world_file_value = None
    try:
        with temp_path.open("wb") as target:
            while True:
                block = await file.read(1024 * 1024)
                if not block:
                    break
                size += len(block)
                if size > max_bytes:
                    raise HTTPException(status_code=413, detail=f"Asset exceeds the {settings.MAX_ASSET_UPLOAD_MB} MB configured upload limit.")
                target.write(block)
        if world_file:
            world_bytes = await world_file.read(4097)
            if len(world_bytes) > 4096:
                raise HTTPException(status_code=413, detail="World files are limited to 4 KiB.")
            try:
                world_file_value = world_bytes.decode("ascii")
            except UnicodeDecodeError as exc:
                raise HTTPException(status_code=400, detail="World files must be ASCII text.") from exc
        asset = await _store_upload(dataset, project, file.filename or "upload", file.content_type or "application/octet-stream", temp_path, size, crs, bounds, member, db, world_file_value)
        return _asset_response(asset)
    finally:
        await file.close()
        if world_file:
            await world_file.close()
        temp_path.unlink(missing_ok=True)


@router.post("/datasets/{dataset_id}/assets/import", status_code=status.HTTP_201_CREATED)
async def import_remote_asset(dataset_id: str, payload: RemoteAssetImport, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    dataset, project = _dataset_for_member(db, dataset_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _can_edit(membership.role)
    if payload.url.lower().startswith(("s3://", "gs://")):
        raise HTTPException(status_code=503, detail="Direct S3 and Google Cloud connectors are not configured. Set provider credentials/adapters in the deployment; public HTTPS object URLs can be imported when host-allowlisted.")
    _validate_remote_url(payload.url)
    temp_path = new_temp_path()
    total = 0
    max_bytes = max(1, settings.MAX_ASSET_UPLOAD_MB) * 1024 * 1024
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0), follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", payload.url, headers={"Accept": "image/*,video/mp4,video/webm,video/quicktime"}) as response:
                if response.is_redirect:
                    raise HTTPException(status_code=400, detail="Redirects are blocked during remote ingestion; import the final allowlisted URL directly.")
                if response.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Remote imagery source returned HTTP {response.status_code}.")
                content_type = response.headers.get("content-type", "application/octet-stream").split(";")[0]
                with temp_path.open("wb") as target:
                    async for block in response.aiter_bytes(1024 * 1024):
                        total += len(block)
                        if total > max_bytes:
                            raise HTTPException(status_code=413, detail=f"Remote asset exceeds the {settings.MAX_ASSET_UPLOAD_MB} MB configured limit.")
                        target.write(block)
        bounds_string = json.dumps(payload.bounds) if payload.bounds else None
        asset = await _store_upload(dataset, project, payload.filename, content_type, temp_path, total, payload.crs, bounds_string, member, db)
        return _asset_response(asset)
    finally:
        temp_path.unlink(missing_ok=True)


@router.get("/datasets/{dataset_id}/assets")
def list_assets(dataset_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    dataset, project = _dataset_for_member(db, dataset_id, member)
    query = db.query(Asset).filter(Asset.dataset_id == dataset.id)
    membership = membership_for(db, member.user_id, project.organization_id)
    if membership.role == "annotator":
        explicit_task_ids = db.query(TaskAssignment.task_id).filter(
            TaskAssignment.user_id == member.user_id, TaskAssignment.active.is_(True)
        )
        accessible_assets = db.query(Task.asset_id).filter(
            Task.dataset_id == dataset.id,
            or_(
                Task.assigned_user_id == member.user_id,
                Task.id.in_(explicit_task_ids),
                and_(Task.reserved_by_user_id == member.user_id, Task.reserved_until > utcnow_naive()),
            ),
        )
        query = query.filter(Asset.id.in_(accessible_assets))
    rows = query.order_by(Asset.created_at.desc()).all()
    return [_asset_response(asset) for asset in rows]


@router.get("/assets/{asset_id}/preview")
def get_asset_preview(asset_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    _, project = _dataset_for_member(db, asset.dataset_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _require_asset_assignment(asset, membership, member, db)
    if not asset.preview_key:
        raise HTTPException(status_code=415, detail="This asset has no image preview.")
    path = resolve_storage_key(asset.preview_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset preview file is missing from configured storage.")
    return FileResponse(path, media_type="image/png", filename=f"{asset.id}-preview.png")


@router.get("/assets/{asset_id}/content")
def get_asset_content(asset_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    _, project = _dataset_for_member(db, asset.dataset_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _require_asset_assignment(asset, membership, member, db)
    path = resolve_storage_key(asset.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file is missing from configured storage.")
    return FileResponse(path, media_type=asset.content_type, filename=asset.original_filename, content_disposition_type="inline")


@router.post("/projects/{project_id}/tasks", status_code=status.HTTP_201_CREATED)
def create_task(project_id: str, payload: TaskCreateInProject, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    project = _project_for_member(db, project_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _can_edit(membership.role)
    dataset, dataset_project = _dataset_for_member(db, payload.dataset_id, member)
    asset = db.query(Asset).filter(Asset.id == payload.asset_id, Asset.dataset_id == dataset.id).first()
    if dataset_project.id != project.id or not asset:
        raise HTTPException(status_code=400, detail="The dataset and asset must belong to this project.")
    asset_crs = asset.crs or payload.crs
    if payload.assigned_user_id:
        assignee = membership_for(db, payload.assigned_user_id, project.organization_id)
        if assignee.role not in {"annotator", "admin", "owner"}:
            raise HTTPException(status_code=400, detail="Tasks can be assigned only to annotators or administrators.")
    task = Task(
        title=payload.title.strip(), project_id=project.id, dataset_id=dataset.id, asset_id=asset.id,
        raster_url=f"asset://{asset.id}", crs=asset_crs, taxonomy_json=json.dumps(payload.taxonomy),
        target_annotator_count=payload.target_annotator_count, priority=payload.priority,
        assigned_user_id=payload.assigned_user_id, task_type="video" if asset.kind == "video" else "geospatial",
        status="queued", review_status="not_started",
    )
    db.add(task)
    db.flush()
    if payload.assigned_user_id:
        notify(db, payload.assigned_user_id, "Annotation task assigned", f"You were assigned {task.title}.", "task", task.id)
    audit(db, project.organization_id, member.user_id, "task.created", "task", task.id, {"asset_id": asset.id, "priority": task.priority})
    db.commit()
    db.refresh(task)
    return _task_response(task, db)


@router.post("/datasets/{dataset_id}/tasks/batch", status_code=status.HTTP_201_CREATED)
def create_batch_tasks(dataset_id: str, payload: BatchTasksCreate, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    dataset, project = _dataset_for_member(db, dataset_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    _can_edit(membership.role)
    if len(set(payload.asset_ids)) != len(payload.asset_ids):
        raise HTTPException(status_code=422, detail="asset_ids must be unique.")
    assets = db.query(Asset).filter(Asset.dataset_id == dataset.id, Asset.id.in_(payload.asset_ids)).all()
    by_id = {asset.id: asset for asset in assets}
    missing = [asset_id for asset_id in payload.asset_ids if asset_id not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Assets are missing or belong to another dataset: {', '.join(missing)}")
    tasks = []
    for index, asset_id in enumerate(payload.asset_ids, start=1):
        asset = by_id[asset_id]
        task = Task(
            title=f"{payload.title_prefix.strip()} {index}", project_id=project.id, dataset_id=dataset.id,
            asset_id=asset.id, raster_url=f"asset://{asset.id}", crs=asset.crs or payload.crs,
            taxonomy_json=json.dumps(payload.taxonomy), target_annotator_count=payload.target_annotator_count,
            priority=payload.priority, task_type="video" if asset.kind == "video" else "geospatial",
            status="queued", review_status="not_started",
        )
        db.add(task)
        tasks.append(task)
    db.flush()
    for task in tasks:
        audit(db, project.organization_id, member.user_id, "task.created_from_batch", "task", task.id, {"dataset_id": dataset.id})
    db.commit()
    return [_task_response(task, db) for task in tasks]


@router.get("/organizations/{organization_id}/queue")
def task_queue(
    organization_id: str,
    view: str = Query(default="annotate", pattern="^(annotate|review|all)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    min_priority: int | None = Query(default=None, ge=-100, le=100),
    min_quality_score: float | None = Query(default=None, ge=0, le=1),
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    membership = membership_for(db, member.user_id, organization_id)
    query = db.query(Task).join(Project, Project.id == Task.project_id).filter(Project.organization_id == organization_id)
    current_assignment = db.query(TaskAssignment.id).filter(
        TaskAssignment.task_id == Task.id,
        TaskAssignment.user_id == member.user_id,
        TaskAssignment.active.is_(True),
    ).exists()
    any_assignment = db.query(TaskAssignment.id).filter(
        TaskAssignment.task_id == Task.id, TaskAssignment.active.is_(True)
    ).exists()
    if view == "annotate":
        require_roles(membership, "owner", "admin", "annotator")
        query = query.filter(Task.status.in_(["queued", "in_progress", "revision_requested"]))
        if membership.role == "annotator":
            query = query.filter(or_(
                Task.assigned_user_id == member.user_id,
                current_assignment,
                and_(Task.assigned_user_id.is_(None), ~any_assignment),
            ))
        else:
            query = query.filter((Task.assigned_user_id.is_(None)) | (Task.assigned_user_id == member.user_id))
        query = query.filter((Task.reserved_until.is_(None)) | (Task.reserved_until < utcnow_naive()) | (Task.reserved_by_user_id == member.user_id))
    elif view == "review":
        require_roles(membership, "owner", "admin", "reviewer")
        query = query.filter(Task.review_status == "pending_review")
    elif membership.role == "annotator":
        query = query.filter(or_(Task.assigned_user_id == member.user_id, current_assignment, Task.reserved_by_user_id == member.user_id))
    if status_filter:
        query = query.filter(Task.status == status_filter)
    if min_priority is not None:
        query = query.filter(Task.priority >= min_priority)
    rows = query.order_by(Task.priority.desc(), Task.created_at.asc()).limit(500).all()
    output = [_task_response(task, db, include_quality=min_quality_score is not None) for task in rows]
    if min_quality_score is not None:
        output = [item for item in output if item["gold_quality"] is not None and item["gold_quality"] >= min_quality_score]
    return output


@router.get("/work/tasks/{task_id}")
def get_work_task(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    return _task_response(task, db)


@router.post("/work/tasks/{task_id}/reserve")
def reserve_task(task_id: str, payload: ReserveTask, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    require_roles(membership, "owner", "admin", "annotator")
    if task.status not in {"queued", "in_progress", "revision_requested"}:
        raise HTTPException(status_code=409, detail="This task is not available for annotation.")
    assigned_ids = _assigned_user_ids(task, db)
    if assigned_ids and member.user_id not in assigned_ids and membership.role not in {"owner", "admin"}:
        raise HTTPException(status_code=409, detail="This task is assigned to another worker.")
    now = utcnow_naive()
    if task.reserved_until and task.reserved_until > now and task.reserved_by_user_id != member.user_id and membership.role not in {"owner", "admin"}:
        raise HTTPException(status_code=409, detail="This task is actively reserved by another worker.")
    task.reserved_by_user_id = member.user_id
    task.reserved_until = now + timedelta(seconds=payload.seconds)
    project = db.query(Project).filter(Project.id == task.project_id).first()
    audit(db, project.organization_id, member.user_id, "task.reserved", "task", task.id, {"seconds": payload.seconds})
    db.commit()
    return _task_response(task, db)


@router.post("/work/tasks/{task_id}/assign")
def assign_task(task_id: str, payload: AssignTask, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    require_roles(membership, "owner", "admin", "reviewer")
    target = membership_for(db, payload.user_id, membership.organization_id)
    if target.role not in {"annotator", "admin", "owner"}:
        raise HTTPException(status_code=400, detail="Tasks can be assigned only to annotators or administrators.")
    task.assigned_user_id = payload.user_id
    task.reserved_by_user_id = None
    task.reserved_until = None
    notify(db, payload.user_id, "Annotation task assigned", f"You were assigned {task.title or task.id}.", "task", task.id)
    audit(db, membership.organization_id, member.user_id, "task.assigned", "task", task.id, {"user_id": payload.user_id})
    db.commit()
    return _task_response(task, db)


@router.post("/work/tasks/{task_id}/assignments")
def add_task_assignments(task_id: str, payload: AssignWorkers, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    require_roles(membership, "owner", "admin", "reviewer")
    if task.status in {"completed", "rejected"} or task.review_status in {"accepted", "rejected"}:
        raise HTTPException(status_code=409, detail="Closed tasks cannot receive new worker assignments.")
    current_ids = _assigned_user_ids(task, db)
    requested = set(payload.user_ids)
    all_ids = current_ids | requested
    if len(all_ids) > task.target_annotator_count:
        raise HTTPException(status_code=409, detail="The number of assigned workers cannot exceed target_annotator_count.")
    for user_id in payload.user_ids:
        target = membership_for(db, user_id, membership.organization_id)
        if target.role not in {"annotator", "admin", "owner"}:
            raise HTTPException(status_code=400, detail="Tasks can be assigned only to annotators or administrators.")
    now = utcnow_naive()
    added = []
    for user_id in sorted(requested):
        assignment = db.query(TaskAssignment).filter_by(task_id=task.id, user_id=user_id).first()
        if assignment and assignment.active:
            continue
        if not assignment:
            assignment = TaskAssignment(task_id=task.id, user_id=user_id, assigned_by_user_id=member.user_id, active=True)
            db.add(assignment)
        else:
            assignment.active = True
            assignment.assigned_by_user_id = member.user_id
            assignment.assigned_at = now
            assignment.deactivated_at = None
        added.append(user_id)
        if user_id != member.user_id:
            notify(db, user_id, "Annotation task assigned", f"You were assigned {task.title or task.id}.", "task", task.id)
    if task.reserved_by_user_id and task.reserved_by_user_id not in all_ids:
        task.reserved_by_user_id = None
        task.reserved_until = None
    if added:
        audit(db, membership.organization_id, member.user_id, "task.workers_assigned", "task", task.id, {"user_ids": added})
    db.commit()
    return _task_response(task, db)


@router.delete("/work/tasks/{task_id}/assignments/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_task_assignment(task_id: str, user_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    require_roles(membership, "owner", "admin", "reviewer")
    if task.assigned_user_id == user_id:
        raise HTTPException(status_code=409, detail="The legacy scalar assignee must be changed through the existing /assign endpoint.")
    assignment = db.query(TaskAssignment).filter_by(task_id=task.id, user_id=user_id, active=True).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Active task assignment not found.")
    has_annotation = db.query(Annotation.id).filter(Annotation.task_id == task.id, Annotation.annotator_id == user_id).first()
    has_video = db.query(VideoSegmentSubmission.id).filter(VideoSegmentSubmission.task_id == task.id, VideoSegmentSubmission.user_id == user_id).first()
    if has_annotation or has_video:
        raise HTTPException(status_code=409, detail="A worker with submitted work cannot be removed; retain the assignment history.")
    assignment.active = False
    assignment.deactivated_at = utcnow_naive()
    audit(db, membership.organization_id, member.user_id, "task.worker_assignment_removed", "task", task.id, {"user_id": user_id})
    db.commit()
    return None


@router.get("/work/tasks/{task_id}/asset/preview")
def work_task_asset_preview(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    asset = _task_asset(task, db)
    if not asset.preview_key:
        raise HTTPException(status_code=415, detail="This task asset does not have an image preview.")
    path = resolve_storage_key(asset.preview_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset preview file is missing from configured storage.")
    return FileResponse(path, media_type="image/png", filename=f"{asset.id}-preview.png")


@router.get("/work/tasks/{task_id}/asset/content")
def work_task_asset_content(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    asset = _task_asset(task, db)
    path = resolve_storage_key(asset.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file is missing from configured storage.")
    return FileResponse(path, media_type=asset.content_type, filename=asset.original_filename, content_disposition_type="inline")


@router.get("/annotator/tasks/{task_id}/asset")
def legacy_annotator_asset_preview(task_id: str, annotator_id: str = Depends(get_current_annotator), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not task.asset_id:
        raise HTTPException(status_code=404, detail="This task has no uploaded asset.")
    asset = db.query(Asset).filter(Asset.id == task.asset_id).first()
    if not asset or not asset.preview_key:
        raise HTTPException(status_code=404, detail="This task asset has no raster preview.")
    path = resolve_storage_key(asset.preview_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset preview file is missing from configured storage.")
    return FileResponse(path, media_type="image/png", filename=f"{asset.id}-preview.png")


@router.post("/work/tasks/{task_id}/annotations")
def submit_org_annotation(task_id: str, payload: dict, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    require_roles(membership, "owner", "admin", "annotator")
    if task.task_type == "video":
        raise HTTPException(status_code=415, detail="Video tasks use the temporal video-segments endpoint.")
    _require_task_assignment(task, membership, member, db, check_reservation=False)
    if task.reserved_by_user_id and task.reserved_until and task.reserved_until > utcnow_naive() and task.reserved_by_user_id != member.user_id and membership.role not in {"owner", "admin"}:
        raise HTTPException(status_code=409, detail="Another worker currently holds this task reservation.")
    if task.review_status in {"accepted", "rejected"}:
        raise HTTPException(status_code=409, detail="This task has been closed by review.")
    geojson = _check_annotation_geojson(task, payload.get("geojson") if isinstance(payload, dict) else {}, db)
    existing = db.query(Annotation).filter_by(task_id=task.id, annotator_id=member.user_id).first()
    if existing:
        if task.review_status != "rework" and existing.review_status != "rework":
            raise HTTPException(status_code=409, detail="This account has already submitted an annotation; edits require a reviewer rework request.")
        previous_revisions = db.query(AnnotationRevision).filter_by(annotation_id=existing.id).count()
        db.add(AnnotationRevision(
            annotation_id=existing.id, version=previous_revisions + 1,
            geojson_data=existing.geojson_data, review_status=existing.review_status,
            submitted_at=existing.submitted_at or utcnow_naive(),
        ))
        existing.geojson = geojson
        existing.submitted_at = utcnow_naive()
        existing.review_status = "pending"
        existing.reviewed_by_user_id = None
        existing.reviewed_at = None
        existing.review_comment = None
    else:
        existing = Annotation(task_id=task.id, annotator_id=member.user_id, review_status="pending")
        existing.geojson = geojson
        db.add(existing)
    task.status = "in_progress"
    task.review_status = "not_started"
    task.updated_at = utcnow_naive()
    db.flush()
    annotations = db.query(Annotation).filter(Annotation.task_id == task.id).all()
    if len(annotations) >= task.target_annotator_count and all(row.review_status == "pending" for row in annotations):
        task.status = "completed"
        task.review_status = "pending_review"
        task.completed_at = utcnow_naive()
        if len(annotations) >= 2:
            ann_dicts = [{"annotator_id": row.annotator_id, "geojson": row.geojson} for row in annotations]
            task.iaa_score, task.iaa_type = compute_task_iaa(ann_dicts, task.taxonomy, crs=task.crs)
            task.scoring_version = SCORER_VERSION
            task.scoring_config_json = json.dumps(scoring_configuration(), sort_keys=True, separators=(",", ":"))
    task.reserved_by_user_id = None
    task.reserved_until = None
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if task.review_status == "pending_review":
        _notify_reviewers(db, project.organization_id, member.user_id, task, "Annotation ready for review", f"{task.title or task.id} has all required annotations ready for review.")
    audit(db, project.organization_id, member.user_id, "annotation.submitted", "task", task.id, {"feature_count": len(geojson["features"])})
    draft = db.query(AnnotationDraft).filter_by(task_id=task.id, user_id=member.user_id).first()
    if draft:
        db.delete(draft)
    db.commit()
    db.refresh(task)
    return _task_response(task, db)


@router.get("/work/tasks/{task_id}/annotations")
def list_task_annotations(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    rows = db.query(Annotation).filter(Annotation.task_id == task.id).order_by(Annotation.submitted_at.asc()).all()
    return [{"id": row.id, "annotator_id": row.annotator_id, "geojson": row.geojson, "submitted_at": row.submitted_at,
             "review_status": row.review_status, "review_comment": row.review_comment} for row in rows]


@router.get("/work/tasks/{task_id}/annotation-history")
def list_annotation_history(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    if membership.role == "annotator":
        _require_task_assignment(task, membership, member, db)
        annotations = db.query(Annotation).filter_by(task_id=task.id, annotator_id=member.user_id).all()
    else:
        require_roles(membership, "owner", "admin", "reviewer", "analyst")
        annotations = db.query(Annotation).filter_by(task_id=task.id).all()
    history = []
    for annotation in annotations:
        revisions = db.query(AnnotationRevision).filter_by(annotation_id=annotation.id).order_by(AnnotationRevision.version.asc()).all()
        for revision in revisions:
            history.append({"annotation_id": annotation.id, "annotator_id": annotation.annotator_id,
                            "version": revision.version, "current": False, "geojson": json.loads(revision.geojson_data),
                            "review_status": revision.review_status, "submitted_at": revision.submitted_at})
        current_version = max((revision.version for revision in revisions), default=0) + 1
        history.append({"annotation_id": annotation.id, "annotator_id": annotation.annotator_id,
                        "version": current_version, "current": True, "geojson": annotation.geojson,
                        "review_status": annotation.review_status, "review_comment": annotation.review_comment,
                        "submitted_at": annotation.submitted_at})
    history.sort(key=lambda row: (row["annotator_id"], row["version"]))
    return {"task_id": task.id, "history": history,
            "history_scope": "submitted versions only; transient undo and unsent drafts are separate"}


@router.get("/work/tasks/{task_id}/draft")
def get_task_draft(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    require_roles(membership, "owner", "admin", "annotator")
    row = db.query(AnnotationDraft).filter_by(task_id=task.id, user_id=member.user_id).first()
    if not row:
        return {"available": False, "version": 0}
    return {"available": True, "draft": json.loads(row.draft_json), "version": row.version,
            "updated_at": row.updated_at}


@router.put("/work/tasks/{task_id}/draft")
def save_task_draft(task_id: str, payload: AnnotationDraftSave, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    _require_task_assignment(task, membership, member, db)
    require_roles(membership, "owner", "admin", "annotator")
    if task.review_status in {"accepted", "rejected"}:
        raise HTTPException(status_code=409, detail="This task has been closed by review.")

    if task.task_type == "video":
        if payload.draft.get("type") != "GeoLabelVideoDraft" or not isinstance(payload.draft.get("segments"), list):
            raise HTTPException(status_code=422, detail="Video drafts must contain type GeoLabelVideoDraft and a segments array.")
        asset = _task_asset(task, db)
        try:
            video_payload = VideoSegmentsSubmit.model_validate({
                "segments": payload.draft["segments"], "tracks": payload.draft.get("tracks", [])
            })
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors(include_context=False)) from exc
        normalized = {
            "type": "GeoLabelVideoDraft",
            "segments": _check_video_segments(task, asset, video_payload.segments),
            "tracks": _check_video_tracks(task, asset, video_payload.tracks),
        }
        existing_submission = db.query(VideoSegmentSubmission).filter_by(task_id=task.id, user_id=member.user_id).order_by(VideoSegmentSubmission.version.desc()).first()
        if existing_submission and task.review_status != "rework" and existing_submission.review_status != "rework":
            raise HTTPException(status_code=409, detail="This account has already submitted video segments; drafts require reviewer rework.")
    else:
        normalized = _check_annotation_geojson(task, payload.draft, db)
        existing_annotation = db.query(Annotation).filter_by(task_id=task.id, annotator_id=member.user_id).first()
        if existing_annotation and task.review_status != "rework" and existing_annotation.review_status != "rework":
            raise HTTPException(status_code=409, detail="This account has already submitted an annotation; drafts require reviewer rework.")

    encoded = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > max(1, settings.MAX_ANNOTATION_DRAFT_BYTES):
        raise HTTPException(status_code=413, detail="Draft exceeds the configured MAX_ANNOTATION_DRAFT_BYTES limit.")
    row = db.query(AnnotationDraft).filter_by(task_id=task.id, user_id=member.user_id).with_for_update().first()
    if row:
        if payload.version != row.version:
            raise HTTPException(status_code=409, detail=f"Draft version conflict; the current server version is {row.version}. Reload or recover it before saving.")
        row.draft_json = encoded
        row.version += 1
        row.updated_at = utcnow_naive()
    else:
        if payload.version != 0:
            raise HTTPException(status_code=409, detail="No server draft exists at the supplied version. Reload the task before saving.")
        row = AnnotationDraft(task_id=task.id, user_id=member.user_id, draft_json=encoded, version=1)
        db.add(row)
    db.commit()
    db.refresh(row)
    return {"available": True, "version": row.version, "updated_at": row.updated_at}


@router.delete("/work/tasks/{task_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_draft(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    require_roles(membership, "owner", "admin", "annotator")
    row = db.query(AnnotationDraft).filter_by(task_id=task.id, user_id=member.user_id).first()
    if row:
        db.delete(row)
        db.commit()


@router.post("/work/tasks/{task_id}/review")
def review_task(task_id: str, payload: ReviewDecision, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    require_roles(membership, "owner", "admin", "reviewer")
    annotations = db.query(Annotation).filter(Annotation.task_id == task.id).all()
    videos = db.query(VideoSegmentSubmission).filter(VideoSegmentSubmission.task_id == task.id).all()
    if not annotations and not videos:
        raise HTTPException(status_code=409, detail="A task needs at least one submitted annotation before review.")
    decision_map = {"accept": "accepted", "reject": "rejected", "rework": "rework"}
    task.review_status = {"accept": "accepted", "reject": "rejected", "rework": "rework"}[payload.decision]
    task.status = {"accept": "completed", "reject": "rejected", "rework": "revision_requested"}[payload.decision]
    task.updated_at = utcnow_naive()
    for annotation in annotations:
        annotation.review_status = decision_map[payload.decision]
        annotation.reviewed_by_user_id = member.user_id
        annotation.reviewed_at = utcnow_naive()
        annotation.review_comment = payload.comment.strip() or None
    for video in videos:
        video.review_status = decision_map[payload.decision]
        video.reviewed_by_user_id = member.user_id
        video.reviewed_at = utcnow_naive()
    project = db.query(Project).filter(Project.id == task.project_id).first()
    recipients = {row.annotator_id for row in annotations}
    recipients.update(row.user_id for row in videos)
    for recipient in recipients:
        if db.query(UserAccount).filter(UserAccount.id == recipient).first():
            title = {"accept": "Annotation accepted", "reject": "Annotation rejected", "rework": "Annotation returned for rework"}[payload.decision]
            notify(db, recipient, title, payload.comment.strip() or f"Review decision: {payload.decision}.", "task", task.id)
    audit(db, project.organization_id, member.user_id, f"task.review.{payload.decision}", "task", task.id, {"comment": payload.comment.strip()})
    db.commit()
    return _task_response(task, db)


@router.post("/work/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
def add_task_comment(task_id: str, payload: CommentCreate, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    comment = TaskComment(task_id=task.id, author_user_id=member.user_id, body=payload.body.strip(),
                          issue_status=payload.kind, status="open" if payload.kind == "issue" else "not_applicable")
    db.add(comment)
    project = db.query(Project).filter(Project.id == task.project_id).first()
    for assigned_user_id in _assigned_user_ids(task, db) - {member.user_id}:
        notify(db, assigned_user_id, "Task discussion updated", payload.body.strip()[:240], "task", task.id)
    _notify_reviewers(db, project.organization_id, member.user_id, task, "Task discussion updated", payload.body.strip()[:240])
    audit(db, project.organization_id, member.user_id, f"task.{payload.kind}.created", "task", task.id)
    db.commit()
    db.refresh(comment)
    return {"id": comment.id, "task_id": comment.task_id, "author_user_id": comment.author_user_id, "body": comment.body,
            "kind": comment.issue_status, "status": comment.status, "created_at": comment.created_at}


@router.get("/work/tasks/{task_id}/comments")
def list_task_comments(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    rows = db.query(TaskComment).filter(TaskComment.task_id == task.id).order_by(TaskComment.created_at.asc()).all()
    return [{"id": row.id, "author_user_id": row.author_user_id, "body": row.body, "kind": row.issue_status,
             "status": row.status, "resolved_by_user_id": row.resolved_by_user_id, "resolved_at": row.resolved_at,
             "created_at": row.created_at} for row in rows]


@router.post("/work/comments/{comment_id}/status")
def update_issue_status(comment_id: str, payload: IssueStatusUpdate, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    comment = db.query(TaskComment).filter(TaskComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Task comment or issue not found.")
    if comment.issue_status != "issue":
        raise HTTPException(status_code=409, detail="Only issue records have open/resolved state.")
    task, membership = _task_for_member(db, comment.task_id, member)
    require_roles(membership, "owner", "admin", "reviewer")
    comment.status = payload.status
    comment.resolved_by_user_id = member.user_id if payload.status == "resolved" else None
    comment.resolved_at = utcnow_naive() if payload.status == "resolved" else None
    project = db.query(Project).filter(Project.id == task.project_id).first()
    audit(db, project.organization_id, member.user_id, f"task.issue.{payload.status}", "task_comment", comment.id)
    if comment.author_user_id and comment.author_user_id != member.user_id:
        notify(db, comment.author_user_id, "Issue status updated", f"The issue on {task.title or task.id} is now {payload.status}.", "task", task.id)
    db.commit()
    return {"id": comment.id, "status": comment.status, "resolved_by_user_id": comment.resolved_by_user_id, "resolved_at": comment.resolved_at}


@router.put("/work/tasks/{task_id}/gold-standard")
def set_gold_standard(task_id: str, payload: GoldStandardInput, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    require_roles(membership, "owner", "admin", "reviewer")
    if task.task_type == "video":
        raise HTTPException(status_code=415, detail="Gold-standard time segments are not supported for video tasks in this release.")
    geojson = _check_annotation_geojson(task, payload.geojson, db)
    item = db.query(GoldStandard).filter_by(task_id=task.id).first()
    if not item:
        item = GoldStandard(task_id=task.id, created_by_user_id=member.user_id)
        db.add(item)
    item.geojson_data = json.dumps(geojson)
    item.created_by_user_id = member.user_id
    item.updated_at = utcnow_naive()
    project = db.query(Project).filter(Project.id == task.project_id).first()
    audit(db, project.organization_id, member.user_id, "gold_standard.updated", "task", task.id, {"feature_count": len(geojson["features"])})
    db.commit()
    return {"task_id": task.id, "feature_count": len(geojson["features"]), "updated_at": item.updated_at}


@router.get("/work/tasks/{task_id}/quality")
def get_task_quality(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    _, membership = _task_for_member(db, task_id, member)
    require_roles(membership, "owner", "admin", "reviewer", "analyst")
    task = db.query(Task).filter(Task.id == task_id).first()
    return {"task_id": task.id, **_quality_scores(db, task)}


@router.get("/work/tasks/{task_id}/consensus")
def get_task_consensus(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    require_roles(membership, "owner", "admin", "reviewer", "analyst")
    rows = db.query(Annotation).filter(Annotation.task_id == task.id).order_by(Annotation.submitted_at.asc()).all()
    ann_dicts = [{"annotator_id": row.annotator_id, "geojson": row.geojson} for row in rows]
    available = task.task_type != "video" and len(ann_dicts) >= 2
    score, iaa_type = (None, "insufficient_annotations")
    empty = {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": task.crs}}, "features": []}
    consensus = empty
    if available:
        score, iaa_type = compute_task_iaa(ann_dicts, task.taxonomy, crs=task.crs)
        consensus = build_consensus_geojson(ann_dicts, iaa_score=score, crs=task.crs)
    return {"task_id": task.id, "available": available, "annotation_count": len(ann_dicts),
            "required_support": len(ann_dicts) // 2 + 1 if available else None,
            "iaa_score": score, "iaa_type": iaa_type, "geojson": consensus,
            "scorer_version": SCORER_VERSION, "scorer_configuration": scoring_configuration(),
            "reference_source": "independent worker submissions; agreement is not an accuracy guarantee"}


@router.post("/work/tasks/{task_id}/preannotations", status_code=status.HTTP_201_CREATED)
def create_preannotation(task_id: str, payload: PreAnnotationInput, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    require_roles(membership, "owner", "admin", "reviewer")
    if task.task_type == "video":
        raise HTTPException(status_code=415, detail="Vector pre-annotations use the geospatial annotation endpoint; video inference is provider-dependent.")
    geojson = _check_annotation_geojson(task, payload.geojson, db)
    item = PreAnnotation(task_id=task.id, source=payload.source.strip(), model_version=payload.model_version,
                         geojson_data=json.dumps(geojson), status="pending", created_by_user_id=member.user_id)
    db.add(item)
    db.flush()
    project = db.query(Project).filter(Project.id == task.project_id).first()
    audit(db, project.organization_id, member.user_id, "preannotation.imported", "preannotation", item.id,
          {"source": item.source, "model_version": item.model_version, "feature_count": len(geojson["features"])})
    db.commit()
    db.refresh(item)
    return {"id": item.id, "task_id": task.id, "source": item.source, "model_version": item.model_version,
            "geojson": item.geojson, "status": item.status, "created_at": item.created_at}


@router.get("/work/tasks/{task_id}/preannotations")
def list_preannotations(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    rows = db.query(PreAnnotation).filter(PreAnnotation.task_id == task.id).order_by(PreAnnotation.created_at.desc()).all()
    return [{"id": row.id, "source": row.source, "model_version": row.model_version, "geojson": row.geojson,
             "status": row.status, "created_at": row.created_at} for row in rows]


@router.post("/work/preannotations/{preannotation_id}/decision")
def decide_preannotation(preannotation_id: str, payload: PreAnnotationDecision, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    item = db.query(PreAnnotation).filter(PreAnnotation.id == preannotation_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pre-annotation not found.")
    task, membership = _task_for_member(db, item.task_id, member)
    require_roles(membership, "owner", "admin", "reviewer")
    if item.status != "pending":
        raise HTTPException(status_code=409, detail="This pre-annotation has already been reviewed.")
    item.status = "accepted" if payload.decision == "accept" else "rejected"
    item.reviewed_by_user_id = member.user_id
    item.reviewed_at = utcnow_naive()
    project = db.query(Project).filter(Project.id == task.project_id).first()
    audit(db, project.organization_id, member.user_id, f"preannotation.{payload.decision}ed", "preannotation", item.id)
    db.commit()
    return {"id": item.id, "status": item.status, "reviewed_at": item.reviewed_at}


@router.post("/work/tasks/{task_id}/video-segments", status_code=status.HTTP_201_CREATED)
def submit_video_segments(task_id: str, payload: VideoSegmentsSubmit, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    task = _locked_task(db, task_id)
    _require_task_assignment(task, membership, member, db)
    require_roles(membership, "owner", "admin", "annotator")
    asset = _task_asset(task, db)
    if asset.kind != "video" or task.task_type != "video":
        raise HTTPException(status_code=415, detail="Temporal segments can only be submitted for an uploaded video task.")
    if task.review_status in {"accepted", "rejected"}:
        raise HTTPException(status_code=409, detail="This video task has been closed by review.")
    checked_segments = _check_video_segments(task, asset, payload.segments)
    checked_tracks = _check_video_tracks(task, asset, payload.tracks)
    previous = db.query(VideoSegmentSubmission).filter_by(task_id=task.id, user_id=member.user_id).order_by(VideoSegmentSubmission.version.desc()).first()
    if previous and task.review_status != "rework" and previous.review_status != "rework":
        raise HTTPException(status_code=409, detail="This account has already submitted video segments; edits require reviewer rework.")
    version = (previous.version + 1) if previous else 1
    submission = VideoSegmentSubmission(task_id=task.id, user_id=member.user_id, version=version,
                                        segments_json=json.dumps(checked_segments), tracks_json=json.dumps(checked_tracks),
                                        review_status="pending")
    db.add(submission)
    db.flush()
    task.review_status = "not_started"
    task.status = "in_progress"
    task.updated_at = utcnow_naive()
    submissions = db.query(VideoSegmentSubmission).filter(VideoSegmentSubmission.task_id == task.id).order_by(
        VideoSegmentSubmission.user_id.asc(), VideoSegmentSubmission.version.desc()
    ).all()
    latest_submissions = {}
    for row in submissions:
        latest_submissions.setdefault(row.user_id, row)
    if len(latest_submissions) >= task.target_annotator_count and all(row.review_status == "pending" for row in latest_submissions.values()):
        task.status = "completed"
        task.review_status = "pending_review"
        task.completed_at = utcnow_naive()
    task.reserved_by_user_id = None
    task.reserved_until = None
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if task.review_status == "pending_review":
        _notify_reviewers(db, project.organization_id, member.user_id, task, "Video segments ready for review", f"{task.title or task.id} has all required video submissions ready for review.")
    audit(db, project.organization_id, member.user_id, "video_segments.submitted", "task", task.id, {"segment_count": len(payload.segments), "version": version})
    draft = db.query(AnnotationDraft).filter_by(task_id=task.id, user_id=member.user_id).first()
    if draft:
        db.delete(draft)
    db.commit()
    db.refresh(submission)
    return {"id": submission.id, "task_id": task.id, "version": submission.version, "segments": submission.segments,
            "tracks": submission.tracks,
            "review_status": submission.review_status, "submitted_at": submission.submitted_at}


@router.get("/work/tasks/{task_id}/video-segments")
def list_video_segments(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    _require_task_assignment(task, membership, member, db)
    submissions = db.query(VideoSegmentSubmission).filter(VideoSegmentSubmission.task_id == task.id).order_by(
        VideoSegmentSubmission.user_id.asc(), VideoSegmentSubmission.version.desc()
    ).all()
    latest = {}
    for item in submissions:
        latest.setdefault(item.user_id, item)
    return [{"user_id": item.user_id, "version": item.version, "segments": item.segments, "tracks": item.tracks,
             "review_status": item.review_status, "submitted_at": item.submitted_at} for item in latest.values()]


@router.get("/work/tasks/{task_id}/video-segments/history")
def list_video_segment_history(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    if membership.role == "annotator":
        _require_task_assignment(task, membership, member, db)
        rows = db.query(VideoSegmentSubmission).filter_by(task_id=task.id, user_id=member.user_id).order_by(
            VideoSegmentSubmission.user_id.asc(), VideoSegmentSubmission.version.asc()
        ).all()
    else:
        require_roles(membership, "owner", "admin", "reviewer", "analyst")
        rows = db.query(VideoSegmentSubmission).filter_by(task_id=task.id).order_by(
            VideoSegmentSubmission.user_id.asc(), VideoSegmentSubmission.version.asc()
        ).all()
    return [{"user_id": item.user_id, "version": item.version, "segments": item.segments, "tracks": item.tracks,
             "review_status": item.review_status, "submitted_at": item.submitted_at,
             "reviewed_at": item.reviewed_at} for item in rows]


@router.get("/annotator/tasks/{task_id}/asset/content")
def legacy_annotator_asset_content(task_id: str, annotator_id: str = Depends(get_current_annotator), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not task.asset_id:
        raise HTTPException(status_code=404, detail="This task has no uploaded asset.")
    asset = db.query(Asset).filter(Asset.id == task.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="This task asset is missing.")
    path = resolve_storage_key(asset.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file is missing from configured storage.")
    return FileResponse(path, media_type=asset.content_type, filename=asset.original_filename, content_disposition_type="inline")


def _analysis_asset(asset_id: str, member: MemberContext, db: Session, organization_id: str | None = None):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Raster asset not found.")
    _, project = _dataset_for_member(db, asset.dataset_id, member)
    if organization_id and project.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Raster asset not found in this organization.")
    membership = membership_for(db, member.user_id, project.organization_id)
    require_roles(membership, "owner", "admin", "reviewer", "analyst")
    if asset.kind != "image" or (asset.asset_metadata or {}).get("driver") != "GeoTIFF":
        raise HTTPException(status_code=415, detail="This analysis requires a readable GeoTIFF asset with embedded raster metadata.")
    try:
        path = resolve_storage_key(asset.storage_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="The asset storage key is invalid.") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Raster file is missing from configured storage.")
    return asset, project, path


@router.patch("/assets/{asset_id}/georeference")
def repair_asset_georeference(asset_id: str, payload: GeoreferenceRepair, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    _, project = _dataset_for_member(db, asset.dataset_id, member)
    membership = membership_for(db, member.user_id, project.organization_id)
    require_roles(membership, "owner", "admin", "reviewer")
    if asset.kind != "image" or (asset.asset_metadata or {}).get("driver") == "GeoTIFF":
        raise HTTPException(status_code=415, detail="Manual bounds repair is limited to ordinary images; embedded raster affine transforms require a dedicated raster workflow.")
    if db.query(Task.id).filter(Task.asset_id == asset.id).first():
        raise HTTPException(status_code=409, detail="Georeference cannot be changed after this asset is linked to a task; create a corrected asset to preserve existing annotation semantics.")
    metadata = asset.asset_metadata or {}
    old = {"crs": asset.crs, "bounds": asset.bounds,
           "affine_transform": metadata.get("affine_transform")}
    history = list(metadata.get("georeference_history", []))
    now = utcnow_naive()
    history.append({"source": "manual_repair", "actor_user_id": member.user_id,
                    "rationale": payload.rationale.strip(), "previous": old,
                    "crs": payload.crs, "bounds": payload.bounds, "updated_at": now.isoformat()})
    metadata["georeference_history"] = history[-50:]
    metadata["georeference"] = "manual_repair"
    xmin, ymin, xmax, ymax = payload.bounds
    metadata["affine_transform"] = [
        (xmax - xmin) / asset.width, 0.0, xmin,
        0.0, -(ymax - ymin) / asset.height, ymax,
    ]
    asset.crs = payload.crs
    asset.bounds_json = json.dumps(payload.bounds, separators=(",", ":"))
    asset.metadata_json = json.dumps(metadata, separators=(",", ":"))
    audit(db, project.organization_id, member.user_id, "asset.georeference.repaired", "asset", asset.id,
          {"previous": old, "crs": payload.crs, "bounds": payload.bounds, "rationale": payload.rationale.strip()})
    db.commit()
    db.refresh(asset)
    return _asset_response(asset)


@router.post("/organizations/{organization_id}/gis/spatial-join")
def run_spatial_join(organization_id: str, payload: SpatialJoinRequest, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    membership = membership_for(db, member.user_id, organization_id)
    require_roles(membership, "owner", "admin", "reviewer", "analyst")
    try:
        matches = spatial_join(payload.source_geojson, payload.target_geojson,
                               payload.source_crs, payload.target_crs, payload.predicate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit(db, organization_id, member.user_id, "gis.spatial_join", "organization", organization_id,
          {"predicate": payload.predicate, "match_count": len(matches)})
    db.commit()
    return {"source_crs": pyproj.CRS.from_user_input(payload.source_crs).to_string(),
            "target_crs": pyproj.CRS.from_user_input(payload.target_crs).to_string(),
            "predicate": payload.predicate, "match_count": len(matches), "matches": matches}


@router.post("/assets/{asset_id}/raster/statistics")
def get_raster_statistics(asset_id: str, payload: RasterStatsRequest, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    asset, project, path = _analysis_asset(asset_id, member, db)
    try:
        result = raster_band_statistics(path, max_pixels=payload.max_pixels)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit(db, project.organization_id, member.user_id, "gis.raster_statistics", "asset", asset.id,
          {"max_pixels": payload.max_pixels})
    db.commit()
    return {"asset_id": asset.id, **result}


@router.post("/organizations/{organization_id}/gis/raster-change")
def analyze_raster_change(organization_id: str, payload: RasterChangeRequest, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    first, first_project, first_path = _analysis_asset(payload.first_asset_id, member, db, organization_id)
    second, second_project, second_path = _analysis_asset(payload.second_asset_id, member, db, organization_id)
    if first_project.organization_id != second_project.organization_id:
        raise HTTPException(status_code=404, detail="Both rasters must belong to the same organization.")
    try:
        result = raster_change_analysis(first_path, second_path, threshold=payload.threshold, max_pixels=payload.max_pixels)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit(db, organization_id, member.user_id, "gis.raster_change", "asset", first.id,
          {"second_asset_id": second.id, "threshold": payload.threshold, "max_pixels": payload.max_pixels})
    db.commit()
    return {"first_asset_id": first.id, "second_asset_id": second.id, **result}


@router.get("/organizations/{organization_id}/export")
def export_organization(organization_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    """Create a private, bounded ZIP export; credentials and active sessions are never included."""
    membership = membership_for(db, member.user_id, organization_id)
    require_roles(membership, "owner", "admin")
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found.")

    projects = db.query(Project).filter(Project.organization_id == organization_id).order_by(Project.created_at.asc()).all()
    project_ids = [row.id for row in projects]
    datasets = db.query(Dataset).filter(Dataset.project_id.in_(project_ids)).order_by(Dataset.created_at.asc()).all() if project_ids else []
    dataset_ids = [row.id for row in datasets]
    assets = db.query(Asset).filter(Asset.dataset_id.in_(dataset_ids)).order_by(Asset.created_at.asc()).all() if dataset_ids else []
    tasks = db.query(Task).filter(Task.project_id.in_(project_ids)).order_by(Task.created_at.asc()).all() if project_ids else []
    task_ids = [row.id for row in tasks]

    asset_files = []
    uncompressed_bytes = 0
    for asset in assets:
        try:
            path = resolve_storage_key(asset.storage_key)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=f"Asset {asset.id} has an invalid local storage key.") from exc
        if not path.is_file():
            raise HTTPException(status_code=409, detail=f"Asset {asset.id} is missing from local storage; export was not created.")
        file_size = path.stat().st_size
        uncompressed_bytes += file_size
        asset_files.append((asset, path, f"assets/{asset.id}/{safe_filename(asset.original_filename)}"))

    def as_json(raw, fallback):
        try:
            return json.loads(raw) if raw else fallback
        except (TypeError, json.JSONDecodeError):
            return fallback

    def dt(value):
        return value.isoformat() if hasattr(value, "isoformat") else value

    memberships = db.query(OrganizationMembership).filter(OrganizationMembership.organization_id == organization_id).all()
    user_ids = [row.user_id for row in memberships]
    users = db.query(UserAccount).filter(UserAccount.id.in_(user_ids)).all() if user_ids else []
    user_by_id = {row.id: row for row in users}
    assignment_rows = db.query(TaskAssignment).filter(TaskAssignment.task_id.in_(task_ids)).all() if task_ids else []
    annotation_rows = db.query(Annotation).filter(Annotation.task_id.in_(task_ids)).all() if task_ids else []
    annotation_ids = [row.id for row in annotation_rows]
    revisions = db.query(AnnotationRevision).filter(AnnotationRevision.annotation_id.in_(annotation_ids)).all() if annotation_ids else []
    comments = db.query(TaskComment).filter(TaskComment.task_id.in_(task_ids)).all() if task_ids else []
    gold_rows = db.query(GoldStandard).filter(GoldStandard.task_id.in_(task_ids)).all() if task_ids else []
    preannotations = db.query(PreAnnotation).filter(PreAnnotation.task_id.in_(task_ids)).all() if task_ids else []
    videos = db.query(VideoSegmentSubmission).filter(VideoSegmentSubmission.task_id.in_(task_ids)).all() if task_ids else []
    audits = db.query(AuditEvent).filter(AuditEvent.organization_id == organization_id).order_by(AuditEvent.created_at.asc()).all()

    task_assignment_ids: dict[str, list[str]] = {}
    for row in assignment_rows:
        if row.active:
            task_assignment_ids.setdefault(row.task_id, []).append(row.user_id)
    manifest = {
        "schema_version": "geolabel-organization-export-v1",
        "generated_at": utcnow_naive().isoformat(),
        "organization": {"id": organization.id, "name": organization.name, "created_at": dt(organization.created_at)},
        "projects": [{"id": x.id, "name": x.name, "description": x.description, "created_at": dt(x.created_at)} for x in projects],
        "datasets": [{"id": x.id, "project_id": x.project_id, "name": x.name, "description": x.description, "created_at": dt(x.created_at)} for x in datasets],
        "assets": [{"id": x.id, "dataset_id": x.dataset_id, "filename": x.original_filename,
                    "archive_path": arc, "content_type": x.content_type, "kind": x.kind,
                    "size_bytes": x.size_bytes, "width": x.width, "height": x.height,
                    "crs": x.crs, "bounds": x.bounds, "metadata": x.asset_metadata,
                    "created_at": dt(x.created_at)} for x, _, arc in asset_files],
        "tasks": [{"id": x.id, "project_id": x.project_id, "dataset_id": x.dataset_id,
                   "asset_id": x.asset_id, "title": x.title, "task_type": x.task_type,
                   "crs": x.crs, "taxonomy": x.taxonomy, "status": x.status,
                   "review_status": x.review_status, "priority": x.priority,
                   "target_annotator_count": x.target_annotator_count,
                   "assigned_user_id": x.assigned_user_id,
                   "assigned_user_ids": task_assignment_ids.get(x.id, []),
                   "scoring_version": x.scoring_version,
                   "scoring_configuration": as_json(x.scoring_config_json, None),
                   "iaa_score": x.iaa_score, "iaa_type": x.iaa_type,
                   "created_at": dt(x.created_at), "updated_at": dt(x.updated_at),
                   "completed_at": dt(x.completed_at)} for x in tasks],
        "members": [{"user_id": x.user_id, "email": user_by_id[x.user_id].email,
                     "display_name": user_by_id[x.user_id].display_name,
                     "is_active": user_by_id[x.user_id].is_active, "role": x.role,
                     "joined_at": dt(x.created_at)} for x in memberships if x.user_id in user_by_id],
        "annotations": [{"id": x.id, "task_id": x.task_id, "annotator_id": x.annotator_id,
                         "geojson": x.geojson, "review_status": x.review_status,
                         "reviewed_by_user_id": x.reviewed_by_user_id,
                         "reviewed_at": dt(x.reviewed_at), "review_comment": x.review_comment,
                         "submitted_at": dt(x.submitted_at)} for x in annotation_rows],
        "annotation_revisions": [{"id": x.id, "annotation_id": x.annotation_id, "version": x.version,
                                   "geojson": as_json(x.geojson_data, {}), "review_status": x.review_status,
                                   "submitted_at": dt(x.submitted_at), "created_at": dt(x.created_at)} for x in revisions],
        "task_assignments": [{"task_id": x.task_id, "user_id": x.user_id, "active": x.active,
                              "assigned_by_user_id": x.assigned_by_user_id, "assigned_at": dt(x.assigned_at),
                              "deactivated_at": dt(x.deactivated_at)} for x in assignment_rows],
        "comments_and_issues": [{"id": x.id, "task_id": x.task_id, "author_user_id": x.author_user_id,
                                 "author_annotator_id": x.author_annotator_id, "body": x.body,
                                 "kind": x.issue_status, "status": x.status,
                                 "resolved_by_user_id": x.resolved_by_user_id,
                                 "resolved_at": dt(x.resolved_at), "created_at": dt(x.created_at)} for x in comments],
        "gold_standards": [{"task_id": x.task_id, "geojson": as_json(x.geojson_data, {}),
                            "created_by_user_id": x.created_by_user_id, "updated_at": dt(x.updated_at)} for x in gold_rows],
        "preannotations": [{"id": x.id, "task_id": x.task_id, "source": x.source,
                            "model_version": x.model_version, "geojson": x.geojson,
                            "status": x.status, "created_by_user_id": x.created_by_user_id,
                            "reviewed_by_user_id": x.reviewed_by_user_id,
                            "created_at": dt(x.created_at), "reviewed_at": dt(x.reviewed_at)} for x in preannotations],
        "video_segment_submissions": [{"id": x.id, "task_id": x.task_id, "user_id": x.user_id,
                                       "version": x.version, "segments": x.segments,
                                       "review_status": x.review_status, "reviewed_by_user_id": x.reviewed_by_user_id,
                                       "submitted_at": dt(x.submitted_at), "reviewed_at": dt(x.reviewed_at)} for x in videos],
        "audit_events": [{"id": x.id, "actor_user_id": x.actor_user_id, "actor_kind": x.actor_kind,
                          "action": x.action, "resource_type": x.resource_type, "resource_id": x.resource_id,
                          "details": x.details, "created_at": dt(x.created_at)} for x in audits],
        "exclusions": ["password hashes, API keys, session tokens, invitation token hashes, and runtime secrets"],
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    uncompressed_bytes += len(manifest_bytes)
    limit_bytes = max(1, settings.MAX_ORGANIZATION_EXPORT_MB) * 1024 * 1024
    if uncompressed_bytes > limit_bytes:
        raise HTTPException(status_code=413, detail=f"Organization export exceeds the configured {max(1, settings.MAX_ORGANIZATION_EXPORT_MB)} MB uncompressed-size limit.")

    export_dir = storage_root() / ".exports"
    export_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        os.chmod(export_dir, 0o700)
    except OSError:
        pass
    fd, export_name = tempfile.mkstemp(prefix=f"{organization_id}-", suffix=".zip", dir=export_dir)
    os.close(fd)
    export_path = Path(export_name)
    try:
        with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
            archive.writestr("manifest.json", manifest_bytes)
            for _, path, archive_name in asset_files:
                archive.write(path, archive_name)
        audit(db, organization_id, member.user_id, "organization.exported", "organization", organization_id,
              {"asset_count": len(asset_files), "task_count": len(tasks), "uncompressed_bytes": uncompressed_bytes})
        db.commit()
        return FileResponse(export_path, media_type="application/zip",
                            filename=f"geolabel-{safe_filename(organization.name)}-export.zip",
                            background=BackgroundTask(os.unlink, export_path))
    except Exception:
        export_path.unlink(missing_ok=True)
        db.rollback()
        raise


@router.get("/work/tasks/{task_id}/inference/status")
def task_inference_status(task_id: str, member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    task, membership = _task_for_member(db, task_id, member)
    if membership.role == "annotator":
        _require_task_assignment(task, membership, member, db)
    else:
        require_roles(membership, "owner", "admin", "reviewer", "analyst")
    return {
        "available": False,
        "provider_configured": False,
        "model_configured": False,
        "external_data_transfer": False,
        "human_review_required": True,
        "reason_code": "provider_and_approval_not_configured",
        "message": (
            "AI suggestions are unavailable: GeoLabel has no approved inference provider or model configured. "
            "No asset imagery is sent to an external service. Provider, data-transfer, and spend approval are "
            "required before provider-backed suggestions can be enabled; any suggestions must remain reviewable."
        ),
    }
