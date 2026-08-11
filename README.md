# GeoLabel — Specialist Geospatial Annotation Platform & Python SDK

GeoLabel is a two-sided marketplace for human-in-the-loop specialist geospatial data annotation (building footprints, solar PV, SAR radar feature extraction, land cover vectorization).

This repository contains the complete **FastAPI Backend REST Server** and the **Official Python Client SDK** (`geolabel-sdk`), along with deployment manifests for **Railway** and **Render**.

---

## 🚀 Quick Start (Local Backend & Python SDK)

### 1. Install Dependencies & Start FastAPI Server
```bash
# Install backend & SDK requirements
pip install -r requirements.txt
pip install -e .

# Run local FastAPI backend on http://localhost:8000
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
Interactive OpenAPI documentation will be accessible at `http://localhost:8000/docs`.

### 2. Execute Python SDK Against Backend
```python
from geolabel_sdk import GeoLabelClient

# Initialize client
client = GeoLabelClient(
    api_key="gl_live_secret_key_12345",
    base_url="http://localhost:8000"
)

# 1. Create an Annotation Task
task = client.tasks.create(
    raster_uri="s3://earth-observation-data/sentinel2_tile_34T.tif",
    crs="EPSG:32634",
    taxonomy=["building_footprint", "solar_pv"],
    target_annotator_count=2,
    webhook_url="https://api.mycompany.ai/webhooks/geolabel-complete"
)
print(f"Task Queued: {task.id} | Initial Status: {task.status()}")

# 2. Simulate Specialist Annotators Submitting Work (End-to-End Test)
task.simulate_completion()

# 3. Check Updated Task Status & Inter-Annotator Agreement (IAA)
print(f"Updated Status: {task.current_status}")
print(f"Inter-Annotator Agreement Score ({task.iaa_type}): {task.iaa_score}")

# 4. Download Completed Annotations as GeoJSON
results = task.download_results(format="geojson", filename="completed_buildings.geojson")
print(f"Downloaded {results['annotation_count']} vector feature collections!")
```

---

## ☁️ Deploying Backend to Railway or Render

The backend relies on **SQLite by default** (simple, file-based, zero extra infrastructure) but uses SQLAlchemy ORM so you can swap in **PostgreSQL** anytime simply by supplying `DATABASE_URL=postgresql://user:pass@host/dbname`.

### Option A: Railway Deployment
1. Connect your GitHub repository to [Railway.app](https://railway.app).
2. Railway auto-detects `railway.json` and `Procfile`.
3. Set the following Environment Variables in Railway Dashboard:
   - `GEOLABEL_API_KEY`: Set your secret bearer key (e.g. `gl_live_8923a1098b...`)
   - `DATABASE_URL`: `sqlite:///./geolabel.db` (or attach a Railway Postgres database)
4. Click **Deploy**. Your app will publish on `https://<your-app>.up.railway.app`.

### Option B: Render Deployment
1. Go to [Render.com](https://render.com) -> New -> Web Service.
2. Select your repository. Render automatically reads `render.yaml`.
3. Verify settings:
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Set Environment Variables:
   - `GEOLABEL_API_KEY`: Set your secret API key.
   - `DATABASE_URL`: `sqlite:///./geolabel.db`
5. Click **Create Web Service**. Your live backend URL will be `https://<your-service>.onrender.com`.

---

## 🛠️ REST API Specification

| Endpoint | Method | Description | Auth Header |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | Health check probe | None |
| `/tasks` | `POST` | Ingest new annotation task | `Authorization: Bearer <key>` |
| `/tasks/{id}` | `GET` | Retrieve task status & metadata | `Authorization: Bearer <key>` |
| `/tasks/{id}/results` | `GET` | Download GeoJSON vectors + IAA score | `Authorization: Bearer <key>` |
| `/tasks/{id}/webhook` | `POST` | Register callback webhook URL | `Authorization: Bearer <key>` |
| `/tasks/{id}/annotations` | `POST` | Submit human specialist annotation | `Authorization: Bearer <key>` |
| `/tasks/{id}/simulate-completion` | `POST` | End-to-end simulation helper | `Authorization: Bearer <key>` |

---

## 📋 Out-of-Scope Roadmap & Explicit TODOs

To keep the system honest and transparent:
1. **Automated Computer Vision Models**: Annotation is strictly human-in-the-loop (specialist annotators). Automated ML models are not included by design.
2. **True SLA Guarantee Logic**: Turnaround time metrics reflect historical specialist pod averages; contractual SLA enforcement functions require enterprise contract bindings.
3. **Polygon IoU Topology Merging**: `scoring.py` computes Cohen's and Fleiss' Kappa on category presence and geometry counts. Full polygon union / IoU spatial geometry clipping is marked as `TODO` in `scoring.py`.
4. **Webhook Exponential Backoff**: Webhook delivery runs in background tasks. Distributed retry queues (e.g. Celery / Redis) are marked as `TODO`.
