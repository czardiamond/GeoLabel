import React, { useState } from 'react';
import { Code, Terminal, Play, Copy, Check, Server, Webhook, Cpu, FileCode2, ArrowRight } from 'lucide-react';

export const ApiPipelineExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'python' | 'curl' | 'stac' | 'sandbox'>('python');
  const [copied, setCopied] = useState<boolean>(false);

  // Sandbox State
  const [sampleRasterUrl, setSampleRasterUrl] = useState<string>('s3://earth-observation-data/sentinel2_tile_34T.tif');
  const [crsProjection, setCrsProjection] = useState<string>('EPSG:32634 (UTM Zone 34N)');
  const [exportFormat, setExportFormat] = useState<string>('GeoJSON (RFC 7946)');
  const [webhookEndpoint, setWebhookEndpoint] = useState<string>('https://api.mycompany.ai/webhooks/geolabel-complete');
  const [sandboxRunning, setSandboxRunning] = useState<boolean>(false);
  const [sandboxResult, setSandboxResult] = useState<any | null>(null);

  const pythonSnippet = `# Install GeoLabel Enterprise Python SDK: pip install geolabel-python
from geolabel import GeoLabelClient, AnnotationTask

# Initialize client with IAM token / Secret key
client = GeoLabelClient(api_key="gl_live_9837a2817f0...", region="us-gov-west-1")

# Create automated vectorization task with SLA guarantee
task = client.tasks.create(
    raster_uri="${sampleRasterUrl}",
    crs="${crsProjection.split(' ')[0]}",
    taxonomy=["building_footprint", "solar_pv", "road_network"],
    quality_sla="PRO_99.4_IOU",
    orthogonality_rectification=True,
    webhook_url="${webhookEndpoint}"
)

print(f"Task Queued: {task.id} | Estimated Pod Completion: {task.estimated_completion_hrs}h")
# Stream status updates via Webhook or Polling
# task.wait_until_complete()
# task.download_vectors(format="geojson")`;

  const curlSnippet = `# Queue Annotation Batch via REST API
curl -X POST https://api.geolabel.ai/v1/tasks/ingest \\
  -H "Authorization: Bearer gl_live_9837a2817f0..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "raster_url": "${sampleRasterUrl}",
    "projection": "${crsProjection.split(' ')[0]}",
    "target_iou_sla": 0.994,
    "require_orthogonality": true,
    "export_format": "geojson",
    "callback_url": "${webhookEndpoint}"
  }'`;

  const stacSnippet = `# Fetch STAC 1.0 Item Collection with GeoLabel Vector Extensions
curl -X GET "https://api.geolabel.ai/v1/stac/collections/building-footprints/items?bbox=-122.41,37.77,-122.38,37.80" \\
  -H "Accept: application/geo+json"`;

  const getActiveSnippet = () => {
    switch (activeTab) {
      case 'python':
        return pythonSnippet;
      case 'curl':
        return curlSnippet;
      case 'stac':
        return stacSnippet;
      default:
        return pythonSnippet;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunSandbox = () => {
    setSandboxRunning(true);
    setSandboxResult(null);

    setTimeout(() => {
      setSandboxRunning(false);
      setSandboxResult({
        status: '202 ACCEPTED',
        task_id: 'task_gl_9823a8f102c',
        raster_specs: {
          uri: sampleRasterUrl,
          crs: crsProjection.split(' ')[0],
          bands: 4,
          gsd_cm_per_pixel: 7.5,
          dimensions: [4096, 4096],
        },
        sla_agreement: {
          target_iou: '99.4%',
          orthogonal_snapping: true,
          topology_linting: 'PASSED (0 self-intersections)',
        },
        estimated_pod_turnaround: '4.2 hours',
        webhook_registered: webhookEndpoint,
        sample_geojson_preview: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [16.3738, 48.2082],
                    [16.3745, 48.2082],
                    [16.3745, 48.2089],
                    [16.3738, 48.2089],
                    [16.3738, 48.2082],
                  ],
                ],
              },
              properties: {
                class: 'building_footprint',
                area_m2: 342.8,
                confidence: 0.998,
                orthogonal_rectified: true,
              },
            },
          ],
        },
      });
    }, 1200);
  };

  return (
    <section id="api-explorer" className="py-20 bg-slate-950 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Code className="w-3.5 h-3.5" />
            <span>Developer & MLOps Infrastructure</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Enterprise API & STAC Pipeline Integration
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Seamlessly connect your PyTorch, Kubeflow, QGIS, or PostGIS workflows to GeoLabel's automated annotation pipeline with programmatic REST, Python SDK, and STAC API endpoints.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center mb-8 gap-2">
          <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('python')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'python'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Python SDK</span>
            </button>

            <button
              onClick={() => setActiveTab('curl')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'curl'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-teal-400" />
              <span>REST cURL</span>
            </button>

            <button
              onClick={() => setActiveTab('stac')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'stac'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-teal-400" />
              <span>STAC 1.0 API</span>
            </button>

            <button
              onClick={() => setActiveTab('sandbox')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'sandbox'
                  ? 'bg-emerald-800 text-white shadow-md border border-emerald-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Interactive Sandbox</span>
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
                  {activeTab === 'python' ? 'geolabel_ingest.py' : activeTab === 'curl' ? 'post_task.sh' : 'stac_query.sh'}
                </span>
              </div>

              <button
                onClick={handleCopy}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono flex items-center gap-1.5 transition-colors border border-slate-700"
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
                <span>Simulate Ingest Task Payload</span>
              </h3>

              <div>
                <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                  Raster Tile URI (S3 / GCS / COG):
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
                    Native CRS Projection:
                  </label>
                  <select
                    value={crsProjection}
                    onChange={(e) => setCrsProjection(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="EPSG:32634 (UTM Zone 34N)">EPSG:32634 (UTM 34N)</option>
                    <option value="EPSG:4326 (WGS 84 Lat/Lon)">EPSG:4326 (WGS 84)</option>
                    <option value="EPSG:3857 (Web Mercator)">EPSG:3857 (Web Mercator)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-300 font-semibold block mb-1">
                    Export Format:
                  </label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="GeoJSON (RFC 7946)">GeoJSON (RFC 7946)</option>
                    <option value="ESRI Shapefile (.shp)">ESRI Shapefile (.shp)</option>
                    <option value="COCO Dataset JSON">COCO OBB JSON</option>
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
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl border border-emerald-500 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {sandboxRunning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Executing Task Ingestion...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Ingestion Simulation</span>
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
                      {sandboxResult.status}
                    </span>
                  )}
                </div>

                {sandboxResult ? (
                  <pre className="text-emerald-400 text-[11px] leading-relaxed overflow-y-auto max-h-[320px]">
                    <code>{JSON.stringify(sandboxResult, null, 2)}</code>
                  </pre>
                ) : (
                  <div className="h-[260px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Terminal className="w-8 h-8 text-slate-700" />
                    <p className="text-xs">Click "Run Ingestion Simulation" to generate real-time API task payload and webhook response.</p>
                  </div>
                )}
              </div>

              {sandboxResult && (
                <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Latency: <strong>42 ms</strong></span>
                  <span>Payload Integrity: <strong>SHA-256 Verified</strong></span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </section>
  );
};
