# GeoLabel

GeoLabel is a geospatial annotation service with a backward-compatible GeoJSON API and a new organization-scoped workflow for local accounts, datasets, georeferenced media, annotation queues, review, and quality checks. The web application calls the configured backend; it does not fabricate task results or model predictions.

**This branch is a feature implementation, not a production deployment.** Do not merge or deploy it without reviewing storage durability, auth hardening, privacy/retention requirements, and the provider-dependent boundaries listed below.

## Implemented workflows

### Existing GeoJSON API (preserved)

- Service-key-protected task creation and owner task/result reads.
- One-time task-scoped annotator API credentials; keys are stored as SHA-256 hashes and can be revoked.
- GeoJSON FeatureCollection submissions, taxonomy validation, CRS validation/reprojection, and the existing heuristic agreement/consensus output.
- Saved project-scoping requests and optional allowlisted HTTPS webhooks.
- Existing tasks and annotations remain readable after the new additive migration.

### Organization accounts and access

- Organizations, invited users, local password login, expiring/revocable bearer sessions, and roles: `owner`, `admin`, `annotator`, `reviewer`, and `analyst`.
- Organization membership checks on the new project, dataset, asset, queue, review, and quality routes. Legacy service-key routes remain deployment-wide for compatibility and should not be shared with workers.
- Invitation tokens are returned once with `delivery: "manual"`; there is no transactional email provider in this branch. Deliver invitation tokens through an approved channel and treat them as secrets.
- Persistent audit events for organization, invitation, project, dataset, asset, task, annotation, review, gold-standard, and pre-annotation operations. In-app notifications are stored and can be marked read.
- Audit records are append-only through the API. Owner/admins can create a private organization ZIP export with workflow data, media and audit provenance; credentials are excluded. This is not a deletion or retention policy.

Initial owner setup uses the configured service key:

```bash
curl -X POST http://localhost:8000/organizations \
  -H 'Authorization: Bearer <GEOLABEL_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Field Operations","owner_email":"owner@example.org","owner_name":"Workspace Owner"}'
```

The response contains a one-time `invitation_token` for the owner. The owner accepts it in the workspace UI or via `POST /auth/invitations/accept` with `token`, `display_name`, and a password of at least 12 characters. Sign-in is then through `POST /auth/login`. Account creation is invitation-only; no public sign-up or password-reset email is provided.

Passwords are hashed with PBKDF2-HMAC-SHA-256 and random salts. Session tokens are random opaque values stored by SHA-256 digest and expire after `USER_SESSION_HOURS` (default 12, capped at 168); logout revokes the current session. Login attempts are throttled in the database by a privacy-preserving email/IP digest. Email verification, password-reset email, MFA, SSO/OIDC, LDAP, SCIM, and an external identity-provider adapter are not implemented.

### Projects, datasets, assets, and task queues

- Organization-scoped projects and datasets; uploaded assets are organized in datasets.
- Private local image/raster uploads, GeoTIFF metadata extraction (CRS, bounds, dimensions), and server-generated PNG previews. GeoTIFF content is read with Rasterio; an image upload is decoded and previewed with Pillow.
- PNG/JPEG/WebP/BMP uploads require a valid CRS and either explicit `[xmin, ymin, xmax, ymax]` bounds or a standard six-line world file (A,D,B,E,C,F). Pixel-center affine coefficients are converted to an axis-aligned footprint, including rotated transforms. **GeoLabel does not infer coordinates from image pixels.** GeoTIFF embedded georeferencing takes precedence; contradictory metadata is rejected. Ordinary-image CRS/bounds can be repaired before task linkage with required rationale and provenance; embedded GeoTIFF transforms are not overwritten.
- MP4/WebM/MOV assets can be uploaded and streamed privately for browser-native playback. Temporal segments are stored as millisecond ranges, categories, and notes. Contributors can also author normalized bounding-box, point, and polyline tracks at video timestamps; matching keyframes interpolate linearly between authored frames and are stored with each immutable video revision. Actual video playback depends on the end user's browser and codec support.
- Remote HTTPS import is opt-in by exact-host allowlist (`IMAGERY_ALLOWED_HOSTS`). Imports reject embedded credentials, non-public DNS results, redirects, and files over the configured upload limit. Allowlisted remote downloads are copied into local private storage; the source URL is not retained in the asset record.
- Task creation from one asset or a dataset batch; priority ordering, named assignment, multiple explicit worker assignments, time-bounded reservations, and separate annotate/review queues.
- Independently assigned workers submit separately; unassigned tasks can also accept independent submissions. Reservations are released on submission, review is held until the target count is met, and reviewer notifications are sent only when all required workers are ready.
- Private asset content/previews are served only to a member of the matching organization or to a valid annotator key assigned to that task.

**Storage is local filesystem storage**, configured with `ASSET_STORAGE_DIR` (default `./geolabel-assets`). `/health/ready` checks database connectivity and that this local path can write/read/remove a probe; it does not prove consistency across shared mounts or instances. S3/GCS adapters, object lifecycle/encryption configuration, and distributed locking are not configured. A valid allowlisted public HTTPS object URL can be imported; `s3://` and `gs://` imports return a configuration error rather than pretending to work.

Uploads stream to disk and are limited by `MAX_ASSET_UPLOAD_MB` (default 512 MB). Organization exports are capped by `MAX_ORGANIZATION_EXPORT_MB` (default 2048 MB uncompressed). `python -m backend.backup --output /protected/path/geolabel-backup.zip` creates a no-overwrite SQLite plus local-media snapshot and verifies SQLite integrity. The ZIP is unencrypted and contains sensitive database contents; protect it and encrypt it separately if required. PostgreSQL/cloud backups, malware scanning, quotas, retention/deletion, proxy limits, and monitoring still need deployment/provider policy and tooling.

### Browser annotation and team review

- Authenticated in-browser image/raster viewing supports boxes, polygons, polylines, points, keypoints, multipart geometry display, draggable vertices, and source-pixel PNG masks. Masks are size-bounded and polygonized server-side using the asset pixel affine, then reprojected into the task CRS while remaining embedded in the submitted GeoJSON feature for exact pixel recovery. Browser painting is limited to 8 million source pixels per asset and 2 MB per stroke; a submission is limited to 200 strokes and 8 MB decoded mask data.
- Temporal video-segment annotation for uploaded video assets, with playhead-derived time ranges, category and notes. Contributors can author time-indexed bounding-box, point, and polyline tracks, add/update keyframes, seek between authored keyframes, and inspect linear interpolation between them. Reviewers can see each submitter's segments and tracks, seek playback, and inspect immutable versions.
- Contributor tools include bounded undo/redo (100 snapshots) for image features and video tracks, B/P/L/O/K/M drawing shortcuts, Escape cancellation, versioned server autosave and draft recovery, and read-only submitted revision timelines with copy-to-draft. Drafts and accepted submissions preserve existing task CRS and GeoJSON behavior.
- Annotation submission remains GeoJSON-first and preserves the task CRS and existing reprojection behavior.
- Reviewer queue with explicit accept/reject/rework decisions. A rework resubmission replaces the current annotation while a prior version is retained in `annotation_revisions`.
- Task discussion comments and issue records, in-app notifications, and notification read state.
- Reviewer-supplied gold FeatureCollections and per-worker precision, recall, F1, and category accuracy; quality can be used to filter the task queue.
- Organization reviewers can inspect majority-supported consensus GeoJSON and inter-annotator agreement from the independent submissions; a consensus requires at least two annotations and uses the existing heuristic spatial matching/support threshold.
- Reviewable pre-annotation records can be imported from an external provider, reviewed/accepted/rejected, and retrieved by workers.

The scoring implementation is **heuristic**, using the existing geospatial feature matcher at its default IoU threshold. Scorer version/configuration are persisted and category-tie behavior is deterministic. Gold-set scores depend on the correctness and representativeness of supplied gold data; they are not independently validated quality guarantees or a compliance attestation. Agreement/consensus outputs remain heuristic.

The pre-annotation API only stores and reviews provider-supplied candidate GeoJSON. **GeoLabel does not run AI detection, object tracking, video understanding, or segmentation models.** The authenticated `/work/tasks/{id}/inference/status` route and contributor UI explicitly report that suggestions are unavailable: there is no approved inference provider/model, data-transfer authorization, inference runtime, or accuracy evaluation plan. The status check never calls a model or transfers imagery. General-purpose model credentials elsewhere in an environment are not wired to these routes. Do not tell annotators that imported suggestions were generated by GeoLabel itself.

## Roles

| Role | Main permissions |
|---|---|
| `owner` | Organization administration, project/dataset/task setup, assignment, annotation, review, gold data, audit, export |
| `admin` | Organization administration except changing an owner role, project/task setup, assignment, annotation, review, audit and export |
| `annotator` | Read assigned/reserved work, reserve eligible tasks, submit annotation/video segments, discuss issues |
| `reviewer` | Review queue, task assignment/reassignment, accept/reject/rework, gold data, consensus/quality review, imported pre-annotation review, task discussion |
| `analyst` | Read organization data and quality metrics; no task creation, annotation or review actions |

Role checks apply to the new `/organizations`, `/projects`, `/datasets`, `/assets`, and `/work` flows. The legacy `/tasks` and `/annotators` endpoints still use the deployment-wide service key to preserve backward compatibility; keep that key in an owner/admin environment only.

## Configuration

Copy `.env.example` and set a random `GEOLABEL_API_KEY` of at least 32 characters. Important values:

```env
GEOLABEL_API_KEY=<random server-side key>
DATABASE_URL=sqlite:///./geolabel.db
ASSET_STORAGE_DIR=./geolabel-assets
MAX_ASSET_UPLOAD_MB=512
USER_SESSION_HOURS=12
IMAGERY_ALLOWED_HOSTS=
WEBHOOK_ALLOWED_HOSTS=
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

`IMAGERY_ALLOWED_HOSTS` and `WEBHOOK_ALLOWED_HOSTS` are comma-separated exact hostnames. Leave the imagery list empty to disable remote imports. `LOGIN_RATE_LIMIT_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, and `LOGIN_RATE_LIMIT_BLOCK_SECONDS` configure login throttling; `MAX_ORGANIZATION_EXPORT_MB` bounds exports. Do not put cloud credentials in URLs. SSO/LDAP/MFA and cloud storage require provider selection and credentials/configuration not supplied here.

## Local development

Requirements: Python 3.10+, Node.js 22+, and a SQLite database (PostgreSQL is also supported through `DATABASE_URL`).

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Set a private service secret in .env before using protected API routes.
alembic upgrade head
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

In a second terminal:

```bash
npm ci
# Optional: create .env.local and set VITE_GEOLABEL_API_URL to the API origin.
npm run dev
```

The API docs are at `http://localhost:8000/docs`. `/health` is a liveness check; `/health/ready` checks the database and local storage write/read/delete readiness. Only `VITE_`-prefixed values are exposed to the browser. Never put the service key in a `VITE_` variable. User sessions are held in component memory and cleared on logout/page close.

## Main API routes

| Method | Route | Credential | Purpose |
|---|---|---|---|
| `POST` | `/organizations` | Service key | Bootstrap an organization and one-time owner invitation |
| `POST` | `/auth/invitations/accept` | Invitation token | Accept invite, set local password, issue session |
| `POST` | `/auth/login` / `/auth/logout` | Public / session | Start or revoke local session |
| `GET` | `/auth/me` / `/auth/notifications` | User session | Current user, memberships, in-app notifications |
| `POST` | `/organizations/{id}/invitations` | Owner/admin | Create a manual-delivery invitation |
| `GET` | `/organizations/{id}/members` | Owner/admin/reviewer | List organization members needed for task assignment |
| `GET` | `/organizations/{id}/audit` | Owner/admin | List audit events |
| `GET` | `/organizations/{id}/export` | Owner/admin | Create bounded ZIP export with assets and workflow records |
| `POST` | `/organizations/{id}/projects` | Owner/admin | Create a project |
| `POST` | `/projects/{id}/datasets` | Owner/admin | Create a dataset |
| `POST` | `/datasets/{id}/assets` | Owner/admin | Upload a georeferenced image/raster or video |
| `POST` | `/datasets/{id}/assets/import` | Owner/admin | Import an allowlisted public HTTPS source |
| `PATCH` | `/assets/{id}/georeference` | Owner/admin/reviewer | Repair ordinary-image CRS/bounds before task linkage |
| `GET` | `/datasets/{id}/assets` | Organization member | List dataset assets |
| `POST` | `/projects/{id}/tasks` | Owner/admin | Create a task on one asset |
| `POST` | `/datasets/{id}/tasks/batch` | Owner/admin | Create tasks for an asset batch |
| `GET` | `/organizations/{id}/queue` | Role-scoped | Annotate or review queue with priority/quality filters |
| `POST` | `/work/tasks/{id}/reserve` | Annotator | Lease an eligible task |
| `POST` | `/work/tasks/{id}/assign` | Owner/admin/reviewer | Assign or reassign one worker |
| `POST` | `/work/tasks/{id}/assignments` | Owner/admin/reviewer | Add independent task workers |
| `POST` | `/work/tasks/{id}/annotations` | Assigned organization user | Submit geospatial annotation |
| `GET` / `PUT` / `DELETE` | `/work/tasks/{id}/draft` | Assigned organization user | Recover, autosave/version, or discard an unsent contributor draft |
| `GET` | `/work/tasks/{id}/annotation-history` | Task member / reviewer | Read immutable submitted image and video versions |
| `POST` | `/work/tasks/{id}/video-segments` | Assigned organization user | Submit temporal segments and authored keyframe tracks |
| `GET` | `/work/tasks/{id}/video-segments` and `/history` | Assigned contributor / reviewer | Read latest tracks and immutable video versions |
| `GET` | `/work/tasks/{id}/inference/status` | Assigned organization user | Report provider/model availability; never invokes inference |
| `POST` | `/work/tasks/{id}/review` | Reviewer/admin | Accept, reject or request rework |
| `POST` | `/work/tasks/{id}/comments` | Task organization member | Add comment or issue |
| `PUT` | `/work/tasks/{id}/gold-standard` | Reviewer/admin | Save independent reference data |
| `GET` | `/work/tasks/{id}/quality` | Reviewer/admin/analyst | Per-annotator gold-set metrics |
| `GET` | `/work/tasks/{id}/consensus` | Owner/admin/reviewer/analyst | Majority-supported GeoJSON and inter-annotator agreement |
| `POST` | `/organizations/{id}/gis/spatial-join` | Owner/admin/reviewer/analyst | CRS-aware local GeoJSON spatial join |
| `POST` | `/assets/{id}/raster/statistics` | Owner/admin/reviewer/analyst | Bounded local GeoTIFF band statistics |
| `POST` | `/organizations/{id}/gis/raster-change` | Owner/admin/reviewer/analyst | Bounded local GeoTIFF change analysis |
| `POST` / `GET` | `/work/tasks/{id}/preannotations` | Reviewer/admin / task member | Import/list reviewable provider suggestions |
| `POST` | `/work/preannotations/{id}/decision` | Reviewer/admin | Accept/reject a suggestion |
| `POST` | `/tasks` | Service key | Legacy task creation |
| `POST` | `/annotators/register` | Service key | Legacy task-bound worker key |
| `GET` | `/tasks/{id}/results` | Service key | Legacy heuristic consensus GeoJSON |
| `POST` | `/tasks/{id}/annotations` | Assigned annotator key | Legacy GeoJSON submission |

Both user-session and annotator-key asset routes are protected; browser clients must fetch media with the appropriate Authorization header and must not replace server authorization with public file URLs.

## Backward-compatible migrations

Apply `alembic upgrade head` before starting an upgraded installation. `0002_workspaces_assets_review` and `0003_assignments_scoring_auth` are additive: they preserve existing tasks and annotations while adding organization workflows, explicit assignments, scorer provenance, and DB-backed login throttle records. `0004_annotation_drafts` adds recoverable unsent work; `0005_video_keyframe_tracks` adds an empty track array to old video revisions without changing segment history. Legacy task project/dataset/asset columns remain empty; old flows continue to use their original fields.

Automatic downgrade is deliberately disabled because deleting new account/media/review tables or columns could discard user data. Back up the database and asset directory before production migration. Test database restore and migration behavior in a copy of real data first.

## Verification

```bash
pip install -r requirements-dev.txt
pytest -q
npm ci
npm test
npm run lint
npm run build
```

The tests exercise legacy compatibility and migrations, organization isolation, GeoTIFF/world-file ingestion and repair, source-pixel masks and CRS polygonization, private media and multi-worker assignment, independent submissions, scorer provenance, login throttling, GIS joins/statistics/change, export secret exclusion, local readiness, SQLite/media backup integrity, review/rework, versioned draft recovery, undo/redo and interpolation utilities, video keyframe validation/duration/history, inference-disabled status, and notifications.

The official-documentation behavior comparison is recorded in [`docs/competitor-workflow-comparison.md`](docs/competitor-workflow-comparison.md). GeoLabel implements comparable contributor workflow patterns, not the competitors' proprietary code or branding; provider/model-dependent functions remain explicitly unavailable until configured and authorized.

## Operational boundaries before production

- Select email and identity providers for verified invitations, password recovery, MFA, OIDC/SSO, LDAP, or SCIM; local login throttling does not supply those flows.
- Choose durable private storage and supply credentials/permissions before S3/GCS adapters, object encryption/lifecycle, multi-instance consistency checks, or shared locking can be delivered.
- Define retention periods, legal holds, deletion/restore behavior, and export policy before automated retention or destructive deletion. The local backup utility is SQLite-only and unencrypted; production backups need provider-native tooling and tested restore drills.
- Add malware scanning, invitation abuse controls, session/key rotation, egress restrictions, production CORS, HTTPS termination, quotas, monitoring, and incident response.
- Choose an approved vision model/provider or self-hosted runtime, provide credentials/compute and data-transfer approval, and evaluate it before automatic image labeling, tracking, segmentation, or video understanding. No inference credentials are configured here.
- Pixel-level masks, geocoding, and independently validated quality guarantees need the respective editor, geocoder, and representative verified datasets. Current local GIS covers vector spatial joins and bounded raster statistics/change analysis only.
- Decide who may create organizations with the deployment service key; benchmark and independently validate geospatial metrics and consensus thresholds on representative imagery/CRS data.

No billing provider is configured by this code, and it neither charges users nor claims billing as a peer-product feature.
