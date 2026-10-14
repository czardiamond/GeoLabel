# GeoLabel

**GeoLabel is a GeoJSON-first geospatial annotation API MVP.** It provides a real task record API, per-task annotator credentials, GeoJSON submission and CRS reprojection, an initial inter-annotator agreement/consensus implementation, and persisted project-scoping requests.

It is **not yet a complete annotation service or marketplace**. This repository does not upload, store, tile, or display raster imagery; provide interactive drawing or AI labeling; operate a human annotator team; send intake email; calculate a quote; or provide customer accounts, tenant isolation, compliance certification, or a service-level guarantee. The web app presents only the API-backed workflows in this build and identifies these boundaries.

## What works today

- Service-key-protected task creation and owner task/result reads.
- Owner provisioning and revocation of annotator API credentials. New credentials are bound to one task; the raw key is returned only at creation.
- Annotator-key-protected task metadata reads and one annotation submission per assigned key.
- GeoJSON FeatureCollection intake with a CRS default of EPSG:4326 and reprojection to the task CRS.
- Agreement/consensus computation after the task reaches its configured annotation count. Treat these as **initial, heuristic outputs, not validated quality guarantees**; test them on representative data before operational use.
- A scoping form that saves submitted contact/project fields and returns a database receipt. It does not email or price the request.
- Optional best-effort HTTPS webhooks, disabled unless the exact destination host is allowlisted.

## Current security and operational boundaries

- `GEOLABEL_API_KEY` is one shared service key for a deployment, not an account or tenant system. Protected routes fail closed unless it is at least 32 characters. Anyone with it can use owner endpoints. Keep it server-side and never give it to annotators.
- Annotator keys contain 256 random bits and are stored as SHA-256 hashes; only their raw value is returned when issued. Revoke a key if it is exposed. Reissuing a task credential consumes an assignment slot until the previous key is revoked.
- Browser workflows accept HTTPS API URLs and allow plain HTTP only for loopback development. Keys, contact details, and annotations are not sent to a remote HTTP origin by the built-in forms.
- The public `/quotes` route stores personal contact details. There is no built-in rate limiter, email confirmation, retention schedule, or admin console for those requests. Apply privacy review, rate limiting, access controls, and a retention policy before collecting real customer data.
- Task `raster_url` values are references only. GeoLabel does not fetch them. Do not put cloud credentials or signed secrets in a URL; use an access-controlled viewer/storage design before handling private imagery.
- The agreement implementation uses greedy geometry matching and category agreement. It is not a benchmarked or independently validated geospatial QA system.
- Webhook delivery is best-effort with no retries. `WEBHOOK_ALLOWED_HOSTS` must contain the exact HTTPS hostnames you intentionally permit. Redirects are not followed.
- HTTPS termination, secret rotation, database backups, monitoring, rate limits, tenant isolation, and incident response must be provided by the deployment environment before production use.

## Local development

### Requirements

- Python 3.10+
- Node.js 22+ and npm
- A local SQLite database for development; PostgreSQL is supported through `DATABASE_URL`.

### Start the API

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Set a private service secret in `.env` (generate one with `openssl rand -hex 32`), then run the schema migration and API:

```bash
alembic upgrade head
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The OpenAPI page is at `http://localhost:8000/docs`. `/health` is a liveness check; `/health/ready` also checks database connectivity.

The Alembic bootstrap migration creates a new schema or adds the annotator assignment field to the earlier unversioned schema without recreating existing task/annotation tables. Existing unassigned annotator keys remain unassigned and cannot use the new scoped worker routes; create replacement task-bound keys. Back up any production database before applying migrations. Automatic downgrade is intentionally disabled because dropping the new schema can discard user data.

### Start the web app

In a second terminal from the repository root:

```bash
npm ci
# Optional: create .env.local and set VITE_GEOLABEL_API_URL to the API origin.
npm run dev
```

The frontend defaults to `http://localhost:8000`. Only `VITE_`-prefixed values are exposed to the browser; never put a service secret in a `VITE_` variable. The service key and annotator key fields are kept in page memory and sent only to the API URL shown in the form.

## End-to-end task flow

1. In **Task-owner console**, enter the trusted API URL and service key, then create a task using an HTTPS, `s3://`, or `gs://` imagery reference, CRS, taxonomy, and target annotator count.
2. Issue the required number of annotator credentials. Copy each raw key when shown; the API will not return it again. Give each key only to its assigned worker. The owner console can revoke a key.
3. A worker opens **Annotator workspace**, enters the task ID and assigned key, loads the task record, imports or edits a GeoJSON FeatureCollection, and submits once.
4. The service enforces the configured target count. After enough valid submissions arrive, the task status and current agreement output can be read by the service key.

The annotator workspace is a GeoJSON submission editor, **not** a raster drawing tool. Coordinates should match the CRS declared in the FeatureCollection's legacy `crs` member; when omitted, the API assumes EPSG:4326. Each feature needs a valid, non-empty geometry and a `properties.category` value matching one of the task's taxonomy labels; represent a no-detection result with an empty `features` array. The API reprojects geometries to the task CRS. Review the transformed result against your source imagery before use.

## Python SDK

The SDK uses only the Python standard library. Install the package from the repository:

```bash
pip install -e .
```

Example owner/worker flow (use real values from your environment; this example does not create synthetic completions):

```python
import os
from geolabel_sdk import GeoLabelClient

base_url = os.environ.get("GEOLABEL_API_URL", "http://localhost:8000")
owner = GeoLabelClient(api_key=os.environ["GEOLABEL_API_KEY"], base_url=base_url)

task = owner.tasks.create(
    raster_uri="https://storage.example.org/imagery/scene.tif",
    crs="EPSG:4326",
    taxonomy=["building", "road"],
    target_annotator_count=2,
)

# Each raw credential is displayed once; protect it and assign it to one worker.
assignment = owner.tasks.register_annotator(task.id)
worker = GeoLabelClient(base_url=base_url, annotator_api_key=assignment["api_key"])
worker_task = worker.tasks.get_for_annotator(task.id)

collection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"category": "building"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
            },
        }
    ],
}
worker_task.submit_annotation(collection)

# Repeat key issuance and submission with a different worker for a target count of 2.
current = owner.tasks.get(task.id)
print(current.current_status, current.iaa_score, current.iaa_type)
print(owner.tasks.get_results(task.id))
```

`owner.tasks.revoke_annotator(assignment["annotator_id"])` invalidates a worker key without deleting annotations already submitted. Webhook callbacks require the host allowlist below.

## API routes

| Method | Route | Credential | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Liveness check |
| `GET` | `/health/ready` | None | Database readiness check |
| `POST` | `/quotes` | None | Persist a scoping request and return a receipt |
| `POST` | `/tasks` | `Authorization: Bearer <service-key>` | Create task metadata; does not ingest imagery |
| `POST` | `/annotators/register` | Service key | Issue a task-bound worker key (`{"task_id":"…"}`) |
| `DELETE` | `/annotators/{annotator_id}` | Service key | Revoke a key; preserve submitted annotation records |
| `GET` | `/tasks/{task_id}` | Service key | Read task metadata |
| `GET` | `/tasks/{task_id}/results` | Service key | Read current consensus GeoJSON and agreement metadata |
| `POST` | `/tasks/{task_id}/webhook` | Service key | Set an allowlisted HTTPS callback |
| `GET` | `/annotator/tasks/{task_id}` | Assigned annotator key | Read only the assigned task metadata |
| `POST` | `/tasks/{task_id}/annotations` | Assigned annotator key | Submit one GeoJSON FeatureCollection |

Service authentication uses `Authorization: Bearer <key>`. Annotator routes accept `X-Annotator-API-Key: <key>` (the SDK uses this header).

## Webhook configuration

Webhooks are optional. To enable one, set `WEBHOOK_ALLOWED_HOSTS` to a comma-separated list of exact hostnames, such as `hooks.example.org`. Requests must use HTTPS and target one of those hosts. Completion callbacks are asynchronous, time out after ten seconds, do not follow redirects, and are not retried. Leave the setting empty to disable callbacks.

## Database and deployments

Configure `DATABASE_URL` before running `alembic upgrade head`. SQLite is useful for local development; production deployments should use a managed, durable database with tested backups and restore procedures. The Docker, Procfile, Render, and Nixpacks start commands run the migration before starting the API. Review resource sizing, persistent storage, TLS, secrets, CORS origins, and provider-specific behavior before deploying; **no production deployment is performed by this repository task**.

`CORS_ORIGINS` is a comma-separated allowlist of browser origins. Replace local defaults with the exact deployed frontend origins. Keep `WEBHOOK_ALLOWED_HOSTS` empty unless outbound callbacks are intentionally required.

## Verification

```bash
# Python API, migration, and scoring tests
pip install -r requirements-dev.txt
pytest -q

# Frontend type-check and production bundle
npm ci
npm run lint
npm run build
```
