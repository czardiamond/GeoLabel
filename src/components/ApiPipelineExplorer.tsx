import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Clipboard, KeyRound, LoaderCircle, Plus, Server, ShieldCheck } from 'lucide-react';
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
};

type IssuedCredential = { annotator_id: string; task_id: string; api_key: string; created_at: string };
type Notice = { tone: 'success' | 'error'; text: string };

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const initialApiBase = (env?.VITE_GEOLABEL_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

async function readResponse(response: Response) {
  const raw = await response.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* Keep the plain response body. */ }
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || raw || response.statusText;
    throw new Error(`HTTP ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return payload;
}

export const ApiPipelineExplorer: React.FC = () => {
  const [apiBase, setApiBase] = useState(initialApiBase);
  const [serviceKey, setServiceKey] = useState('');
  const [rasterUrl, setRasterUrl] = useState('');
  const [crs, setCrs] = useState('EPSG:4326');
  const [taxonomyText, setTaxonomyText] = useState('building, road, water');
  const [targetCount, setTargetCount] = useState('2');
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [credentials, setCredentials] = useState<IssuedCredential[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const taxonomy = useMemo(
    () => taxonomyText.split(',').map((label) => label.trim()).filter(Boolean),
    [taxonomyText],
  );

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setNotice({ tone: 'error', text: 'Clipboard access was denied by this browser. Select and copy the value manually.' });
    }
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setTask(null);
    setCredentials([]);
    let base: string;
    try {
      base = normalizeApiBase(apiBase);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Invalid API URL.' });
      return;
    }
    if (!serviceKey.trim()) {
      setNotice({ tone: 'error', text: 'Enter the backend URL and service API key first.' });
      return;
    }
    if (!taxonomy.length || new Set(taxonomy).size !== taxonomy.length) {
      setNotice({ tone: 'error', text: 'Enter at least one unique taxonomy label, separated by commas.' });
      return;
    }
    setIsCreating(true);
    try {
      const response = await fetch(`${base}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raster_url: rasterUrl.trim(),
          crs: crs.trim(),
          taxonomy,
          target_annotator_count: Number(targetCount),
        }),
      });
      const created = await readResponse(response) as TaskRecord;
      setTask(created);
      setNotice({ tone: 'success', text: `Task ${created.id} was created by the configured API.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Task creation failed.' });
    } finally {
      setIsCreating(false);
    }
  };

  const provisionAnnotator = async () => {
    if (!task || !serviceKey.trim()) return;
    setNotice(null);
    setIsRegistering(true);
    try {
      const response = await fetch(`${normalizeApiBase(apiBase)}/annotators/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id }),
      });
      const issued = await readResponse(response) as IssuedCredential;
      setCredentials((current) => [...current, issued]);
      setNotice({ tone: 'success', text: `Credential ${issued.annotator_id} was created for task ${issued.task_id}. Copy it now; the API does not return it again.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Credential provisioning failed.' });
    } finally {
      setIsRegistering(false);
    }
  };

  const revokeAnnotator = async (annotatorId: string) => {
    setNotice(null);
    setRevokingId(annotatorId);
    try {
      const response = await fetch(`${normalizeApiBase(apiBase)}/annotators/${encodeURIComponent(annotatorId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${serviceKey.trim()}` },
      });
      await readResponse(response);
      setCredentials((current) => current.filter((credential) => credential.annotator_id !== annotatorId));
      setNotice({ tone: 'success', text: `Credential ${annotatorId} was revoked by the API. Submitted annotations remain stored.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Credential revocation failed.' });
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section id="api-explorer" className="scroll-mt-24 border-y border-slate-800 bg-slate-900/50 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-teal-300">
            <Server className="h-4 w-4" /> Task-owner console
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Create a real task. Issue keys scoped to it.</h2>
          <p className="mt-4 text-slate-300">These controls call the configured GeoLabel API. A successful response is shown directly; this page does not synthesize tasks, credentials, completion, or quality scores.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <form onSubmit={createTask} className="space-y-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">New annotation task</h3>
            <label className="block text-sm text-slate-300">
              API base URL
              <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} autoComplete="url" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="https://api.example.com" />
              <span className="mt-1 block text-xs text-slate-500">The service key is sent to this origin. Use only an API host you trust.</span>
            </label>
            <label className="block text-sm text-slate-300">
              Service API key
              <input type="password" value={serviceKey} onChange={(e) => setServiceKey(e.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="Enter the configured service key" />
              <span className="mt-1 block text-xs text-slate-500">Kept only in this page's memory; do not share this key with annotators.</span>
            </label>
            <label className="block text-sm text-slate-300">
              Imagery URI
              <input required value={rasterUrl} onChange={(e) => setRasterUrl(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="https://… or s3://… or gs://…" />
              <span className="mt-1 block text-xs text-slate-500">The API stores this URI; it does not upload, copy, or render the imagery.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">
                Coordinate reference system
                <input required value={crs} onChange={(e) => setCrs(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" placeholder="EPSG:4326" />
              </label>
              <label className="block text-sm text-slate-300">
                Required annotators (1–10)
                <input required type="number" min="1" max="10" value={targetCount} onChange={(e) => setTargetCount(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-teal-500" />
              </label>
            </div>
            <label className="block text-sm text-slate-300">
              Taxonomy labels (comma-separated)
              <input required value={taxonomyText} onChange={(e) => setTaxonomyText(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500" placeholder="building, road, water" />
            </label>
            <button disabled={isCreating} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-wait disabled:opacity-60">
              {isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isCreating ? 'Calling GeoLabel API…' : 'Create task through API'}
            </button>
          </form>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-teal-300" />Live API response</div>
              {notice ? (
                <div className={`mb-4 rounded-lg border p-3 text-sm ${notice.tone === 'success' ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-rose-800 bg-rose-950/40 text-rose-200'}`}>{notice.text}</div>
              ) : <p className="mb-4 text-sm text-slate-400">Create a task to show the server response here.</p>}
              {task && (
                <>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-slate-500">Task ID</dt><dd className="mt-1 break-all font-mono text-teal-200">{task.id}</dd></div>
                    <div><dt className="text-slate-500">Server status</dt><dd className="mt-1 text-white">{task.status}</dd></div>
                    <div><dt className="text-slate-500">CRS</dt><dd className="mt-1 text-white">{task.crs}</dd></div>
                    <div><dt className="text-slate-500">Annotator target</dt><dd className="mt-1 text-white">{task.target_annotator_count}</dd></div>
                  </dl>
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <button type="button" onClick={provisionAnnotator} disabled={isRegistering || credentials.length >= task.target_annotator_count} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-700 bg-teal-950/60 px-4 py-2.5 font-semibold text-teal-100 transition hover:bg-teal-900/70 disabled:cursor-not-allowed disabled:opacity-50">
                      {isRegistering ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      {isRegistering ? 'Provisioning…' : 'Issue task-scoped annotator key'}
                    </button>
                    <p className="mt-2 text-xs text-slate-500">Issued in this browser session: {credentials.length} / {task.target_annotator_count}. The API enforces the target limit.</p>
                  </div>
                </>
              )}
            </div>

            {credentials.map((credential) => (
              <div key={credential.annotator_id} className="rounded-2xl border border-amber-800/70 bg-amber-950/20 p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-100"><AlertTriangle className="h-4 w-4" />Copy this credential now</div>
                <p className="mb-3 text-xs text-amber-200/80">This raw key is returned only once. Give it only to the worker assigned to task {credential.task_id}.</p>
                <div className="flex gap-2">
                  <input readOnly type="password" value={credential.api_key} aria-label={`Credential for ${credential.annotator_id}`} className="min-w-0 flex-1 rounded-lg border border-amber-900 bg-slate-950 px-3 py-2 font-mono text-xs text-amber-100" />
                  <button type="button" onClick={() => copyText(credential.api_key, credential.annotator_id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-800 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/40">
                    {copied === credential.annotator_id ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                    {copied === credential.annotator_id ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button type="button" onClick={() => revokeAnnotator(credential.annotator_id)} disabled={revokingId !== null} className="mt-3 text-xs font-semibold text-rose-300 underline decoration-rose-800 underline-offset-4 hover:text-rose-200 disabled:opacity-50">
                  {revokingId === credential.annotator_id ? 'Revoking…' : 'Revoke this key'}
                </button>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
};
