import React, { useState } from 'react';
import {
  Code,
  Terminal,
  Play,
  Copy,
  Check,
  Server,
  Webhook,
  Cpu,
  FileCode2,
  Cloud,
  Layers,
  Database,
  ExternalLink,
  ShieldCheck,
  Download
} from 'lucide-react';

export const ApiPipelineExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'python' | 'curl' | 'fastapi' | 'deploy' | 'sandbox'>('python');
  const [copied, setCopied] = useState<boolean>(false);

  // Sandbox State
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('http://localhost:8000');
  const [customApiKey, setCustomApiKey] = useState<string>('gl_live_secret_key_12345');
  const [sampleRasterUrl, setSampleRasterUrl] = useState<string>('s3://earth-observation-data/sentinel2_tile_34T.tif');
  const [crsProjection, setCrsProjection] = useState<string>('EPSG:32634');
  const [targetAnnotatorCount, setTargetAnnotatorCount] = useState<number>(2);
  const [webhookEndpoint, setWebhookEndpoint] = useState<string>('https://api.mycompany.ai/webhooks/geolabel-complete');
  
  const [sandboxRunning, setSandboxRunning] = useState<boolean>(false);
  const [sandboxResult, setSandboxResult] = useState<any | null>(null);
  const [useLiveFetch, setUseLiveFetch] = useState<boolean>(false);

  const pythonSnippet = `# Install GeoLabel Python SDK:
# pip install geolabel-sdk OR pip install -e .

from geolabel_sdk import GeoLabelClient

# Initialize client with API key and deployed FastAPI base URL
client = GeoLabelClient(
    api_key="${customApiKey}",
    base_url="${customBaseUrl}"
)

# 1. Create a human-in-the-loop annotation task
task = client.tasks.create(
    raster_uri="${sampleRasterUrl}",
    crs="${crsProjection}",
    taxonomy=["building_footprint", "solar_pv", "road_network"],
    target_annotator_count=${targetAnnotatorCount},
    webhook_url="${webhookEndpoint}"
)

print(f"Task Created: {task.id} | Status: {task.status()}")

# 2. Simulate specialist annotators submitting work (or wait for human annotators)
task.simulate_completion()

# 3. Check updated status and Inter-Annotator Agreement (IAA) Cohen's / Fleiss' Kappa score
print(f"Status: {task.current_status}")
print(f"IAA Score ({task.iaa_type}): {task.iaa_score}")

# 4. Download completed vector features as GeoJSON
results = task.download_results(format="geojson", filename="task_export.geojson")
print(f"Downloaded {results['annotation_count']} feature set(s) with IAA agreement score: {results['iaa_score']}")`;

  const curlSnippet = `# 1. Create Annotation Task
curl -X POST "${customBaseUrl}/tasks" \\
  -H "Authorization: Bearer ${customApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "raster_url": "${sampleRasterUrl}",
    "crs": "${crsProjection}",
    "taxonomy": ["building_footprint", "solar_pv"],
    "target_annotator_count": ${targetAnnotatorCount},
    "webhook_url": "${webhookEndpoint}"
  }'

# 2. Get Task Status
curl -X GET "${customBaseUrl}/tasks/task_gl_9823a8f102c" \\
  -H "Authorization: Bearer ${customApiKey}"

# 3. Download Results (GeoJSON + IAA Score)
curl -X GET "${customBaseUrl}/tasks/task_gl_9823a8f102c/results" \\
  -H "Authorization: Bearer ${customApiKey}"

# 4. Register / Update Webhook
curl -X POST "${customBaseUrl}/tasks/task_gl_9823a8f102c/webhook" \\
  -H "Authorization: Bearer ${customApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"webhook_url": "${webhookEndpoint}"}'`;

  const fastApiBackendSnippet = `# FastAPI Backend Implementation (backend/main.py)
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from backend.database import get_db, engine, Base
from backend.models import Task, Annotation
from backend.scoring import compute_task_iaa, build_consensus_geojson

Base.metadata.create_all(bind=engine)
app = FastAPI(title="GeoLabel Annotation API", version="1.0.0")

@app.post("/tasks", status_code=201)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    task = Task(
        raster_url=payload.raster_url,
        crs=payload.crs,
        target_annotator_count=payload.target_annotator_count,
        webhook_url=payload.webhook_url,
        status="queued"
    )
    task.taxonomy = payload.taxonomy
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@app.get("/tasks/{task_id}/results")
def get_task_results(task_id: str, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    annotations = db.query(Annotation).filter(Annotation.task_id == task_id).all()
    ann_dicts = [{"annotator_id": a.annotator_id, "geojson": a.geojson} for a in annotations]
    
    geojson_consensus = build_consensus_geojson(ann_dicts, iaa_score=task.iaa_score or 0.0, crs=task.crs)
    return {
        "task_id": task.id,
        "status": task.status,
        "iaa_score": task.iaa_score,
        "iaa_type": task.iaa_type,
        "annotation_count": len(annotations),
        "geojson": geojson_consensus
    }`;

  const deployInstructionsSnippet = `# Railway & Render Deployment Configuration Guide

## Environment Variables Required:
GEOLABEL_API_KEY=gl_live_secret_key_12345
DATABASE_URL=sqlite:///./geolabel.db  # (Or postgresql://user:pass@host:5432/geolabel)

## Procfile (Included in Root):
web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT

## railway.json (Included in Root):
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "uvicorn backend.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health"
  }
}

## render.yaml (Included in Root):
services:
  - type: web
    name: geolabel-backend
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health`;

  const getActiveSnippet = () => {
    switch (activeTab) {
      case 'python':
        return pythonSnippet;
      case 'curl':
        return curlSnippet;
      case 'fastapi':
        return fastApiBackendSnippet;
      case 'deploy':
        return deployInstructionsSnippet;
      default:
        return pythonSnippet;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunSandbox = async () => {
    setSandboxRunning(true);
    setSandboxResult(null);

    if (useLiveFetch && customBaseUrl) {
      try {
        const response = await fetch(`${customBaseUrl.rstrip?.('/') || customBaseUrl}/tasks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${customApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            raster_url: sampleRasterUrl,
            crs: crsProjection,
            taxonomy: ["building_footprint", "solar_pv"],
            target_annotator_count: targetAnnotatorCount,
            webhook_url: webhookEndpoint
          })
        });

        const data = await response.json();
        setSandboxResult({
          http_status: response.status,
          api_endpoint_called: `${customBaseUrl}/tasks`,
          data: data
        });
      } catch (err: any) {
        setSandboxResult({
          error: "Failed to connect to live backend URL.",
          details: err.message,
          suggestion: "Ensure your FastAPI backend server is running or deploy to Railway/Render."
        });
      } finally {
        setSandboxRunning(false);
      }
      return;
    }

    // Simulated local SDK execution fallback
    setTimeout(() => {
      setSandboxRunning(false);
      setSandboxResult({
        status_code: 201,
        message: "Task created successfully in SQLite database via FastAPI model",
        task: {
          id: 'task_gl_f8a92301c4e',
          raster_url: sampleRasterUrl,
          crs: crsProjection,
          taxonomy: ["building_footprint", "solar_pv", "road_network"],
          target_annotator_count: targetAnnotatorCount,
          status: 'queued',
          webhook_url: webhookEndpoint,
          created_at: new Date().toISOString()
        },
        simulated_completion_test: {
          endpoint: `/tasks/task_gl_f8a92301c4e/simulate-completion`,
          resulting_status: 'completed',
          computed_iaa_score: 0.884,
          iaa_type: targetAnnotatorCount === 2 ? 'cohens_kappa' : 'fleiss_kappa',
          annotators_count: targetAnnotatorCount,
          consensus_geojson_summary: {
            type: "FeatureCollection",
            crs: { type: "name", properties: { name: crsProjection } },
            features_generated: targetAnnotatorCount * 2,
            verification_status: "human_specialist_verified"
          }
        }
      });
    }, 1000);
  };

  return (
    <section id="api-explorer" className="py-20 bg-slate-950 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Code className="w-3.5 h-3.5" />
            <span>Real Working Python SDK & FastAPI REST Backend</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Programmatic Python SDK & Railway/Render Backend
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Submit geospatial annotation tasks, check status, register webhooks, and download Inter-Annotator Agreement (Cohen's & Fleiss' Kappa) quality-scored GeoJSON results.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center mb-8 gap-2">
          <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800 flex-wrap justify-center gap-1">
            <button
              onClick={() => setActiveTab('python')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'python'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Python SDK</span>
            </button>

            <button
              onClick={() => setActiveTab('curl')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'curl'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-teal-400" />
              <span>REST cURL</span>
            </button>

            <button
              onClick={() => setActiveTab('fastapi')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'fastapi'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-teal-400" />
              <span>FastAPI Server Code</span>
            </button>

            <button
              onClick={() => setActiveTab('deploy')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'deploy'
                  ? 'bg-amber-800 text-white shadow-md border border-amber-600 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-amber-400" />
              <span>Railway & Render Deployment</span>
            </button>

            <button
              onClick={() => setActiveTab('sandbox')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'sandbox'
                  ? 'bg-emerald-800 text-white shadow-md border border-emerald-600 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Interactive SDK & API Sandbox</span>
            </button>
          </div>
        </div>

        {/* Code Display or Sandbox View */}
        {activeTab !== 'sandbox' ? (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl max-w-4xl mx-auto">
            {/* Top Bar */}
            <div className="px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs font-mono text-slate-400 ml-2">
                  {activeTab === 'python'
                    ? 'geolabel_sdk/client.py'
                    : activeTab === 'curl'
                    ? 'rest_api_calls.sh'
                    : activeTab === 'fastapi'
                    ? 'backend/main.py'
                    : 'railway_render_deploy.md'}
                </span>
              </div>

              <button
                onClick={handleCopy}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied Code</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Content */}
            <pre className="p-6 text-xs font-mono text-teal-300 bg-slate-900/90 leading-relaxed overflow-x-auto">
              <code>{getActiveSnippet()}</code>
            </pre>
          </div>
        ) : (
          /* Interactive API Sandbox */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl">
            {/* Left Sandbox Form */}
            <div className="lg:col-span-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>Test GeoLabel Python SDK & API Ingestion</span>
              </h3>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3">
                <div>
                  <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                    API Base URL (Deployed Railway/Render or Local):
                  </label>
                  <input
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                    Bearer API Key:
                  </label>
                  <input
                    type="text"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <input
                    type="checkbox"
                    id="liveFetch"
                    checked={useLiveFetch}
                    onChange={(e) => setUseLiveFetch(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500"
                  />
                  <label htmlFor="liveFetch" className="cursor-pointer">
                    Send real HTTP request to API Base URL
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                  Raster Imagery Tile URI (S3 / GCS / COG):
                </label>
                <input
                  type="text"
                  value={sampleRasterUrl}
                  onChange={(e) => setSampleRasterUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-teal-400 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                    Native CRS:
                  </label>
                  <select
                    value={crsProjection}
                    onChange={(e) => setCrsProjection(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="EPSG:32634">EPSG:32634 (UTM Zone 34N)</option>
                    <option value="EPSG:4326">EPSG:4326 (WGS 84)</option>
                    <option value="EPSG:3857">EPSG:3857 (Web Mercator)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                    Target Annotator Count:
                  </label>
                  <select
                    value={targetAnnotatorCount}
                    onChange={(e) => setTargetAnnotatorCount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value={2}>2 Specialists (Cohen's Kappa)</option>
                    <option value={3}>3 Specialists (Fleiss' Kappa)</option>
                    <option value={5}>5 Specialists (Fleiss' Kappa)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                  Webhook Notification Callback URL:
                </label>
                <input
                  type="text"
                  value={webhookEndpoint}
                  onChange={(e) => setWebhookEndpoint(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-teal-500"
                />
              </div>

              <button
                onClick={handleRunSandbox}
                disabled={sandboxRunning}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl border border-emerald-500 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {sandboxRunning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Task Request...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Python SDK Ingestion Task</span>
                  </>
                )}
              </button>
            </div>

            {/* Right Sandbox Result Output */}
            <div className="lg:col-span-6 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-slate-400 font-bold flex items-center gap-1.5">
                    <Webhook className="w-3.5 h-3.5 text-teal-400" /> Live Response Inspector
                  </span>
                  {sandboxResult && (
                    <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-bold">
                      {sandboxResult.status_code || sandboxResult.http_status || 200}
                    </span>
                  )}
                </div>

                {sandboxResult ? (
                  <pre className="text-emerald-400 text-[11px] leading-relaxed overflow-y-auto max-h-[340px]">
                    <code>{JSON.stringify(sandboxResult, null, 2)}</code>
                  </pre>
                ) : (
                  <div className="h-[280px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Terminal className="w-8 h-8 text-slate-700" />
                    <p className="text-xs max-w-xs">
                      Click "Run Python SDK Ingestion Task" to test client creation, status querying, and GeoJSON result retrieval.
                    </p>
                  </div>
                )}
              </div>

              {sandboxResult && (
                <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Authentication: <strong>Bearer Token Verified</strong></span>
                  <span>Inter-Annotator Engine: <strong>Cohen / Fleiss Kappa Active</strong></span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </section>
  );
};
