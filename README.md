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
- Audit records are currently append-only through the API, but there is no retention scheduler or export/deletion workflow.

Initial owner setup uses the configured service key:

```bash
curl -X POST http://localhost:8000/organizations \
  -H 'Authorization: Bearer <GEOLABEL_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Field Operations","owner_email":"owner@example.org","owner_name":"Workspace Owner"}'
```

The response contains a one-time `invitation_token` for the owner. The owner accepts it in the workspace UI or via `POST /auth/invitations/accept` with `token`, `display_name`, and a password of at least 12 characters. Sign-in is then through `POST /auth/login`. Account creation is invitation-only; no public sign-up or password-reset email is provided.

Passwords are hashed with PBKDF2-HMAC-SHA-256 and random salts. Session tokens are random opaque values stored by SHA-256 digest and expire after `USER_SESSION_HOURS` (default 12, capped at 168); logout revokes the current session. Login rate limiting, email verification, password reset, MFA, SSO, LDAP, SCIM, and an external identity-provider adapter are not implemented.

### Projects, datasets, assets, and task queues

- Organization-scoped projects and datasets; uploaded assets are organized in datasets.
- Private local image/raster uploads, GeoTIFF metadata extraction (CRS, bounds, dimensions), and server-generated PNG previews. GeoTIFF content is read with Rasterio; an image upload is decoded and previewed with Pillow.
- PNG/JPEG/WebP/BMP uploads are accepted only when the caller supplies both a valid CRS and `[xmin, ymin, xmax, ymax]` bounds. **GeoLabel does not guess georeferencing.** GeoTIFF embedded georeferencing takes precedence; contradictory supplied metadata is rejected.
- MP4/WebM/MOV assets can be uploaded and streamed privately for browser-native playback. Temporal segments are stored as millisecond ranges, categories, and notes. Actual video playback depends on the end user's browser and codec support.
- Remote HTTPS import is opt-in by exact-host allowlist (`IMAGERY_ALLOWED_HOSTS`). Imports reject embedded credentials, non-public DNS results, redirects, and files over the configured upload limit. Allowlisted remote downloads are copied into local private storage; the source URL is not retained in the asset record.
- Task creation from one asset or a dataset batch; priority ordering, named assignment, time-bounded reservations, and separate annotate/review queues.
- For unassigned tasks with a target greater than one, each annotator submits independently; reservations are released on submission, review is held until the target count is met, and reviewer notifications are sent only when the task is ready.
- Private asset content/previews are served only to a member of the matching organization or to a valid annotator key assigned to that task.

**Storage is local filesystem storage**, configured with `ASSET_STORAGE_DIR` (default `./geolabel-assets`). For any deployed or multi-instance service, mount an access-controlled persistent volume and back it up. This release does not include S3/GCS credentialed adapters, cloud lifecycle management, object-store encryption configuration, distributed locking, or shared-storage health checks. A valid allowlisted public HTTPS object URL can be imported; `s3://` and `gs://` URI imports explicitly return a configuration error rather than pretending to work.

Uploads stream to disk and are limited by `MAX_ASSET_UPLOAD_MB` (default 512 MB). The API validates supported types and image bytes, but the deployment still needs proxy/request limits, malware scanning appropriate to its threat model, disk quotas, and operational cleanup/retention.

### Browser annotation and team review

- Authenticated in-browser raster/image viewing with drawing for bounding boxes, polygons, polylines, points, keypoints, and freehand vector mask outlines (exported as GeoJSON polygons); features can be categorized, removed, imported, and exported. This is not a pixel-level brush-mask editor.
- Temporal video-segment annotation for uploaded video assets, with playhead-derived time ranges, category and notes; reviewers can see each submitter's ranges and seek playback to inspect them.
- Annotation submission remains GeoJSON-first and preserves the task CRS and existing reprojection behavior.
- Reviewer queue with explicit accept/reject/rework decisions. A rework resubmission replaces the current annotation while a prior version is retained in `annotation_revisions`.
- Task discussion comments and issue records, in-app notifications, and notification read state.
- Reviewer-supplied gold FeatureCollections and per-worker precision, recall, F1, and category accuracy; quality can be used to filter the task queue.
- Organization reviewers can inspect majority-supported consensus GeoJSON and inter-annotator agreement from the independent submissions; a consensus requires at least two annotations and uses the existing heuristic spatial matching/support threshold.
- Reviewable pre-annotation records can be imported from an external provider, reviewed/accepted/rejected, and retrieved by workers.

The scoring implementation is **heuristic**, using the existing geospatial feature matcher at its default IoU threshold. Gold-set scores depend on the correctness and representativeness of the gold data; they are not independently validated quality guarantees and should not be used as a compliance attestation. Agreement/consensus outputs remain heuristic too.

The pre-annotation API only stores and reviews provider-supplied candidate GeoJSON. **It does not run AI detection, tracking, or segmentation models.** No GeoLabel inference adapter/model selection, data-transfer approval, inference runtime, or accuracy evaluation plan is configured in this repository task; general-purpose model credentials elsewhere in an environment are not wired to these routes. Do not tell annotators that imported suggestions were generated by GeoLabel itself.

## Roles

| Role | Main permissions |
|---|---|
| `owner` | Organization administration, project/dataset/task setup, assignment, annotation, review, gold data, audit |
| `admin` | Organization administration except changing an owner role, project/task setup, assignment, annotation and review |
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

`IMAGERY_ALLOWED_HOSTS` and `WEBHOOK_ALLOWED_HOSTS` are comma-separated exact hostnames. Leave the imagery list empty to disable remote imports. Do not put cloud credentials in URLs. SSO/LDAP/MFA and cloud object storage require provider selection and credentials/configuration that are not supplied in this branch.

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

The API docs are at `http://localhost:8000/docs`. `/health` is a liveness check; `/health/ready` checks database connectivity. Only `VITE_`-prefixed values are exposed to the browser. Never put the service key in a `VITE_` variable. User sessions are held in component memory by the web UI and are cleared on logout/page close.

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
| `POST` | `/organizations/{id}/projects` | Owner/admin | Create a project |
| `POST` | `/projects/{id}/datasets` | Owner/admin | Create a dataset |
| `POST` | `/datasets/{id}/assets` | Owner/admin | Upload a georeferenced image/raster or video |
| `POST` | `/datasets/{id}/assets/import` | Owner/admin | Import an allowlisted public HTTPS source |
| `GET` | `/datasets/{id}/assets` | Organization member | List dataset assets |
| `POST` | `/projects/{id}/tasks` | Owner/admin | Create a task on one asset |
| `POST` | `/datasets/{id}/tasks/batch` | Owner/admin | Create tasks for an asset batch |
| `GET` | `/organizations/{id}/queue` | Role-scoped | Annotate or review queue with priority/quality filters |
| `POST` | `/work/tasks/{id}/reserve` | Annotator | Lease an eligible task |
| `POST` | `/work/tasks/{id}/assign` | Owner/admin/reviewer | Assign or reassign one worker |
| `POST` | `/work/tasks/{id}/annotations` | Assigned organization user | Submit geospatial annotation |
| `POST` | `/work/tasks/{id}/video-segments` | Assigned organization user | Submit temporal video segments |
| `POST` | `/work/tasks/{id}/review` | Reviewer/admin | Accept, reject or request rework |
| `POST` | `/work/tasks/{id}/comments` | Task organization member | Add comment or issue |
| `PUT` | `/work/tasks/{id}/gold-standard` | Reviewer/admin | Save independent reference data |
| `GET` | `/work/tasks/{id}/quality` | Reviewer/admin/analyst | Per-annotator gold-set metrics |
| `GET` | `/work/tasks/{id}/consensus` | Owner/admin/reviewer/analyst | Majority-supported GeoJSON and inter-annotator agreement |
| `POST` / `GET` | `/work/tasks/{id}/preannotations` | Reviewer/admin / task member | Import/list reviewable provider suggestions |
| `POST` | `/work/preannotations/{id}/decision` | Reviewer/admin | Accept/reject a suggestion |
| `POST` | `/tasks` | Service key | Legacy task creation |
| `POST` | `/annotators/register` | Service key | Legacy task-bound worker key |
| `GET` | `/tasks/{id}/results` | Service key | Legacy heuristic consensus GeoJSON |
| `POST` | `/tasks/{id}/annotations` | Assigned annotator key | Legacy GeoJSON submission |

Both user-session and annotator-key asset routes are protected; browser clients must fetch media with the appropriate Authorization header and must not replace server authorization with public file URLs.

## Backward-compatible migrations

Apply `alembic upgrade head` before starting an upgraded installation. `0002_workspaces_assets_review` is additive: it adds nullable/defaulted project, asset, priority and review columns to existing tasks, adds review metadata to existing annotations, and creates new identity, dataset, asset, revision, notification, audit, gold, pre-annotation and video tables. It does not recreate or delete existing task, credential, quote or annotation rows. The project/dataset/asset columns on legacy tasks remain empty; old task flows continue to use their original fields.

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

The integration tests exercise legacy API compatibility, data-preserving migrations, organization isolation, GeoTIFF CRS/bounds extraction and private previews, private media access across assignment/reassignment, dataset batches, independent multi-annotator submissions and reservation release, consensus/IAA, analyst score filtering and role denial, annotation, gold scoring, comments, pre-annotation decisions, rework history, final review, video timing, and in-app notifications.

## Operational boundaries before production

- Add an explicit identity-provider choice if SSO, LDAP, MFA, SCIM, password recovery, or email delivery is required.
- Configure durable private asset storage shared by all API instances; add backup/restore, encryption, retention/deletion, quotas, malware scanning, and monitoring.
- Add request rate limiting, login/invitation brute-force protection, session/key rotation policy, egress restrictions, production CORS hosts, HTTPS termination, and incident response.
- Decide who may create organizations with the deployment service key; it is deliberately a super-admin bootstrap credential.
- Configure credentials and adapters before enabling S3/GCS private-object ingestion, or an approved inference service before enabling AI-generated predictions.
- Benchmark and independently validate geospatial metrics and consensus thresholds on representative imagery/CRS data.

No billing provider is configured by this code, and it neither charges users nor claims billing as a peer-product feature.
