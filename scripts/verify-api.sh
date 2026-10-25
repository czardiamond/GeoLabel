#!/usr/bin/env bash
# GeoLabel API verifier. `schema` is read-only; `smoke` writes only synthetic
# task/annotation records and must be run against a disposable or staging DB.
# The current hardened backend has no simulate-completion route.
set -euo pipefail

command_name="${1:-}"
BASE="${GEOLABEL_BASE_URL:-}"
BASE="${BASE%/}"
if [[ -z "$BASE" || "$BASE" == */docs ]]; then
  printf '%s\n' 'Set GEOLABEL_BASE_URL to the backend origin, without /docs.' >&2
  exit 2
fi
case "$BASE" in
  https://*) ;;
  http://localhost|http://localhost:*|http://127.0.0.1|http://127.0.0.1:*) ;;
  *) printf '%s\n' 'Use an HTTPS backend origin (HTTP is allowed only for localhost testing).' >&2; exit 2 ;;
esac
for tool in curl python3; do
  command -v "$tool" >/dev/null || { printf 'Missing required command: %s\n' "$tool" >&2; exit 2; }
done

case "$command_name" in
  schema)
    # READ-ONLY: show the actual live API schema before any writes.
    curl -sS --fail-with-body --connect-timeout 10 --max-time 30 \
      "$BASE/openapi.json" | python3 -c '
import json,sys
spec=json.load(sys.stdin)
print("API:",spec.get("info",{}))
print("Security schemes:",json.dumps(spec.get("components",{}).get("securitySchemes",{}),indent=2))
for path,method in [("/tasks","post"),("/annotators/register","post"),("/tasks/{task_id}/annotations","post"),("/tasks/{task_id}/results","get"),("/tasks/{task_id}/simulate-completion","post")]:
    operation=spec.get("paths",{}).get(path,{}).get(method)
    print(method.upper(),path,"MISSING" if operation is None else "security="+json.dumps(operation.get("security",spec.get("security",[]))))
'
    exit 0
    ;;
  create|simulate|score|smoke) ;;
  *) printf 'Usage: GEOLABEL_BASE_URL=https://api.example.com bash %s {schema|smoke|create|simulate TASK_ID|score TASK_ID}\n' "$0" >&2; exit 2 ;;
esac

if [[ "$command_name" == simulate ]]; then
  TASK_ID="${2:-}"
  if [[ ! "$TASK_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
    printf '%s\n' 'Supply the exact task id returned by create.' >&2
    exit 2
  fi
  # Guard the legacy write route before asking for a key or making a request.
  if ! curl -fsS --connect-timeout 10 --max-time 30 "$BASE/openapi.json" | python3 -c 'import json,sys; sys.exit(0 if "/tasks/{task_id}/simulate-completion" in json.load(sys.stdin).get("paths",{}) else 1)'; then
    printf '%s\n' 'This backend does not expose simulate-completion. Use the synthetic smoke command on a disposable/staging service.' >&2
    exit 2
  fi
fi

if [[ "$command_name" == score ]]; then
  TASK_ID="${2:-}"
  if [[ ! "$TASK_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
    printf '%s\n' 'Supply the exact task id returned by create.' >&2
    exit 2
  fi
fi

SERVICE_KEY="${GEOLABEL_API_KEY:-}"
if [[ -z "$SERVICE_KEY" ]]; then
  read -r -s -p 'Raw service/admin GEOLABEL_API_KEY (not Bearer or gl_ann_): ' SERVICE_KEY
  printf '\n' >&2
fi
if [[ -z "$SERVICE_KEY" || ${#SERVICE_KEY} -lt 32 || "$SERVICE_KEY" == gl_ann_* || "$SERVICE_KEY" == [Bb][Ee][Aa][Rr][Ee][Rr]\ * ]]; then
  printf '%s\n' 'Use only the raw configured service key (at least 32 characters), not Bearer or a task-scoped annotator key.' >&2
  exit 2
fi

case "$command_name" in
  create)
    # WRITES one task record; the raster URI is not fetched.
    curl -sS --fail-with-body --connect-timeout 10 --max-time 60 \
      --write-out '\nHTTP %{http_code}\n' \
      -X POST "$BASE/tasks" \
      -H "Authorization: Bearer $SERVICE_KEY" \
      -H 'Content-Type: application/json' \
      --data '{"raster_url":"s3://geolabel-smoke-test/example.tif","crs":"EPSG:4326","taxonomy":["building_footprint"],"target_annotator_count":2}'
    ;;
  simulate)
    # Legacy-only route; guarded above by live OpenAPI inspection.
    curl -sS --fail-with-body --connect-timeout 10 --max-time 60 \
      --write-out '\nHTTP %{http_code}\n' \
      -X POST "$BASE/tasks/$TASK_ID/simulate-completion" \
      -H "Authorization: Bearer $SERVICE_KEY"
    ;;
  score)
    # READ-ONLY: this task may be real; no annotation changes are made.
    curl -sS --fail-with-body --connect-timeout 10 --max-time 60 \
      --write-out '\nHTTP %{http_code}\n' \
      "$BASE/tasks/$TASK_ID/results" \
      -H "Authorization: Bearer $SERVICE_KEY"
    ;;
  smoke)
    # WRITES one synthetic task, two worker credentials, and two identical
    # synthetic annotations. Does not fetch imagery and never prints worker keys.
    GEOLABEL_VERIFY_BASE_URL="$BASE" GEOLABEL_VERIFY_SERVICE_KEY="$SERVICE_KEY" python3 - <<'PY'
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

base = os.environ["GEOLABEL_VERIFY_BASE_URL"]
service_key = os.environ["GEOLABEL_VERIFY_SERVICE_KEY"]

def request(method, path, payload=None, service=False, annotator_key=None):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if service:
        headers["Authorization"] = f"Bearer {service_key}"
    if annotator_key:
        headers["X-Annotator-API-Key"] = annotator_key
    req = Request(base + path, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=45) as response:
            body = response.read()
            return response.status, json.loads(body) if body else None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"{method} {path} failed with HTTP {exc.code}: {detail}") from None
    except URLError as exc:
        raise RuntimeError(f"Could not reach {method} {path}: {exc.reason}") from None

try:
    _, spec = request("GET", "/openapi.json")
    required = {
        ("/tasks", "post"),
        ("/annotators/register", "post"),
        ("/tasks/{task_id}/annotations", "post"),
        ("/tasks/{task_id}/results", "get"),
    }
    missing = sorted(f"{method.upper()} {path}" for path, method in required
                     if method not in spec.get("paths", {}).get(path, {}))
    if missing:
        raise RuntimeError("Backend is missing required smoke-test routes: " + ", ".join(missing))
    print("GET /openapi.json: API and required routes found")

    status, task = request("POST", "/tasks", {
        "raster_url": "s3://geolabel-smoke-test/example.tif",
        "crs": "EPSG:4326",
        "taxonomy": ["building_footprint"],
        "target_annotator_count": 2,
    }, service=True)
    if status != 201 or not task or task.get("status") != "queued":
        raise RuntimeError(f"POST /tasks returned HTTP {status} without a queued task")
    task_id = task["id"]
    print(f"POST /tasks: HTTP 201; synthetic task {task_id} queued")

    worker_keys = []
    for _ in range(2):
        status, registered = request("POST", "/annotators/register", {"task_id": task_id}, service=True)
        if status != 201 or not registered.get("api_key", "").startswith("gl_ann_"):
            raise RuntimeError(f"POST /annotators/register returned HTTP {status} without an annotator key")
        worker_keys.append(registered["api_key"])
    print("POST /annotators/register: two task-scoped keys issued (values hidden)")

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": [{
            "type": "Feature",
            "properties": {"category": "building_footprint"},
            "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]]},
        }],
    }
    for key in worker_keys:
        status, _ = request("POST", f"/tasks/{task_id}/annotations", {"geojson": geojson}, annotator_key=key)
        if status != 200:
            raise RuntimeError(f"POST /tasks/{task_id}/annotations returned HTTP {status}")
    print("POST /tasks/{id}/annotations: two synthetic annotations accepted")

    status, results = request("GET", f"/tasks/{task_id}/results", service=True)
    if status != 200 or results.get("status") != "completed" or results.get("annotation_count") != 2:
        raise RuntimeError(f"GET /tasks/{task_id}/results did not show completed/2 annotations (HTTP {status})")
    print("GET /tasks/{id}/results: HTTP 200; completed with 2 annotations")
    print("Synthetic IAA:", json.dumps({"iaa_type": results.get("iaa_type"), "iaa_score": results.get("iaa_score")}))
    print("Smoke test passed. The synthetic task and its records remain in the configured database.")
except (RuntimeError, KeyError, TypeError, ValueError) as exc:
    print(f"Smoke test stopped: {exc}", file=sys.stderr)
    sys.exit(1)
PY
    ;;
esac
