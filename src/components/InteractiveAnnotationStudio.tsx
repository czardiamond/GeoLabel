import React, { useState } from 'react';
import { CheckCircle2, Clipboard, Download, FileJson2, LoaderCircle, LockKeyhole, RefreshCw, Upload } from 'lucide-react';
import { normalizeApiBase } from '../lib/api';

type TaskRecord = {
  id: string;
  raster_url: string;
  crs: string;
  taxonomy: string[];
  target_annotator_count: number;
  status: string;
  iaa_score: number | null;
  iaa_type: string | null;
  created_at: string;
  completed_at: string | null;
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string };

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const defaultApiBase = (env?.VITE_GEOLABEL_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const emptyCollection = JSON.stringify({ type: 'FeatureCollection', features: [] }, null, 2);

async function parseResponse(response: Response) {
  const raw = await response.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* Preserve plain text errors. */ }
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || raw || response.statusText;
    throw new Error(`HTTP ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return payload;
}

function withTaskCrs(task: TaskRecord) {
  return JSON.stringify({
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: task.crs } },
    features: [],
  }, null, 2);
}

export const InteractiveAnnotationStudio: React.FC = () => {
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [taskId, setTaskId] = useState('');
  const [annotatorKey, setAnnotatorKey] = useState('');
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [geojsonText, setGeojsonText] = useState(emptyCollection);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const loadTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setTask(null);
    setHasSubmitted(false);
    const id = taskId.trim();
    let base: string;
    try {
      base = normalizeApiBase(apiBase);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Invalid API URL.' });
      return;
    }
    if (!id || !annotatorKey.trim()) {
      setNotice({ tone: 'error', text: 'Enter the API URL, assigned task ID, and its annotator key.' });
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${base}/annotator/tasks/${encodeURIComponent(id)}`, {
        headers: { 'X-Annotator-API-Key': annotatorKey.trim() },
      });
      const loaded = await parseResponse(response) as TaskRecord;
      setTask(loaded);
      setTaskId(loaded.id);
      setGeojsonText(withTaskCrs(loaded));
      setNotice({ tone: 'success', text: `The API returned task ${loaded.id} for this annotator credential.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Task could not be loaded.' });
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnnotation = async () => {
    if (!task) return;
    setNotice(null);
    let collection: any;
    try {
      collection = JSON.parse(geojsonText);
    } catch (error) {
      setNotice({ tone: 'error', text: `The GeoJSON is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}` });
      return;
    }
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      setNotice({ tone: 'error', text: 'Submit a GeoJSON FeatureCollection with a features array.' });
      return;
    }
    if (collection.features.some((feature: any) => !feature || feature.type !== 'Feature')) {
      setNotice({ tone: 'error', text: 'Each item in features must be a GeoJSON Feature.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${normalizeApiBase(apiBase)}/tasks/${encodeURIComponent(task.id)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Annotator-API-Key': annotatorKey.trim() },
        body: JSON.stringify({ geojson: collection }),
      });
      const updated = await parseResponse(response) as TaskRecord;
      setTask(updated);
      setHasSubmitted(true);
      const score = updated.iaa_score == null ? 'Agreement score is not available yet.' : `Server-reported ${updated.iaa_type || 'agreement'}: ${updated.iaa_score}.`;
      setNotice({ tone: 'success', text: `The API accepted this submission. Task status: ${updated.status}. ${score}` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Submission failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const importGeojson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      try {
        const value = JSON.parse(text);
        if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
          throw new Error('Expected a GeoJSON FeatureCollection.');
        }
        setGeojsonText(JSON.stringify(value, null, 2));
        setNotice({ tone: 'info', text: `Loaded ${file.name}. Check its CRS and task taxonomy before submitting.` });
      } catch (error) {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not parse that GeoJSON file.' });
      }
    };
    reader.onerror = () => setNotice({ tone: 'error', text: 'The selected file could not be read.' });
    reader.readAsText(file);
    event.target.value = '';
  };

  const downloadDraft = () => {
    const blob = new Blob([geojsonText], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${task?.id || 'geolabel-annotation'}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="interactive-studio" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-teal-300"><FileJson2 className="h-4 w-4" /> Annotator workspace</div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Load your assigned task and submit GeoJSON.</h2>
          <p className="mt-4 text-slate-300">Credentials are task-scoped. The workspace submits to the real API; it does not draw on imagery, autosave your work, or invent annotations or quality scores. Your draft stays in this page until you leave or submit it.</p>
        </div>

        <form onSubmit={loadTask} className="grid gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.2fr_auto]">
          <label className="text-sm text-slate-300">API base URL
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="https://api.example.com" />
          </label>
          <label className="text-sm text-slate-300">Assigned task ID
            <input required value={taskId} onChange={(event) => setTaskId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="Enter the task ID" />
          </label>
          <label className="text-sm text-slate-300">Task-scoped annotator key
            <input required type="password" value={annotatorKey} onChange={(event) => setAnnotatorKey(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="Paste your assigned key" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={isLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-wait disabled:opacity-60">
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isLoading ? 'Loading…' : 'Load assigned task'}
            </button>
          </div>
        </form>

        {notice && <div role="status" className={`mt-5 rounded-xl border p-4 text-sm ${notice.tone === 'success' ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : notice.tone === 'error' ? 'border-rose-800 bg-rose-950/40 text-rose-200' : 'border-sky-800 bg-sky-950/40 text-sky-200'}`}>{notice.text}</div>}

        {task && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(250px,0.75fr)_minmax(0,1.25fr)]">
            <aside className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
              <h3 className="font-semibold text-white">Server task record</h3>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-slate-500">Task</dt><dd className="mt-1 break-all font-mono text-teal-200">{task.id}</dd></div>
                <div><dt className="text-slate-500">Status</dt><dd className="mt-1 text-white">{task.status}</dd></div>
                <div><dt className="text-slate-500">Target CRS</dt><dd className="mt-1 font-mono text-white">{task.crs}</dd></div>
                <div><dt className="text-slate-500">Required annotators</dt><dd className="mt-1 text-white">{task.target_annotator_count}</dd></div>
                <div><dt className="text-slate-500">Taxonomy</dt><dd className="mt-2 flex flex-wrap gap-2">{task.taxonomy.map((label) => <span key={label} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">{label}</span>)}</dd></div>
                <div><dt className="text-slate-500">Imagery reference</dt><dd className="mt-1 break-all text-xs text-slate-300">{task.raster_url}</dd></div>
              </dl>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-400">
                GeoLabel stores the imagery URI but does not fetch or render the raster. Use your authorized GIS viewer to inspect it; do not put access credentials in a URL.
              </div>
              {hasSubmitted && <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Submission accepted</div>}
            </aside>

            <div className="min-w-0 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">GeoJSON FeatureCollection</h3>
                  <p className="mt-1 text-xs text-slate-400">Coordinates must use the CRS declared in the GeoJSON `crs` member, or EPSG:4326 when omitted. The API reprojects submitted geometries to {task.crs}.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">
                    <Upload className="h-3.5 w-3.5" /> Import GeoJSON
                    <input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={importGeojson} className="sr-only" />
                  </label>
                  <button type="button" onClick={downloadDraft} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"><Download className="h-3.5 w-3.5" /> Download draft</button>
                </div>
              </div>
              <textarea spellCheck={false} value={geojsonText} onChange={(event) => setGeojsonText(event.target.value)} className="min-h-[360px] w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-teal-100 outline-none focus:border-teal-500" aria-label="GeoJSON annotation" />
              <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="flex items-start gap-2 text-xs text-slate-400"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />One submission per assigned key. Confirm this is the final GeoJSON before sending it to the API.</p>
                <button type="button" onClick={submitAnnotation} disabled={isSubmitting || hasSubmitted} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
                  {isSubmitting ? 'Submitting…' : hasSubmitted ? 'Already submitted' : 'Submit GeoJSON'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
