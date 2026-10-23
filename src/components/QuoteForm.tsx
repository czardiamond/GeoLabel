import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { normalizeApiBase } from '../lib/api';

type FormValues = {
  fullName: string;
  email: string;
  organization: string;
  role: string;
  projectType: string;
  imageryType: string;
  spatialResolution: string;
  estimatedVolume: string;
  timeline: string;
  targetAccuracy: string;
  budgetRange: string;
  requirementsDescription: string;
  acceptsTerms: boolean;
};

type Receipt = { id: string; status: string; submittedAt: string };

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const apiBase = env?.VITE_GEOLABEL_API_URL || 'http://localhost:8000';
const initialValues: FormValues = {
  fullName: '', email: '', organization: '', role: '',
  projectType: 'custom-geospatial-task', imageryType: 'Not specified',
  spatialResolution: 'Not specified', estimatedVolume: 'Not specified',
  timeline: 'No preference', targetAccuracy: 'Not specified', budgetRange: 'No preference',
  requirementsDescription: '', acceptsTerms: false,
};

async function parseResponse(response: Response) {
  const raw = await response.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* Preserve plain response text below. */ }
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || raw || response.statusText;
    throw new Error(`HTTP ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return payload;
}

export const QuoteForm: React.FC = () => {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof FormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${normalizeApiBase(apiBase)}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: values.fullName,
          email: values.email,
          organization: values.organization,
          role: values.role || null,
          project_type: values.projectType,
          imagery_type: values.imageryType,
          spatial_resolution: values.spatialResolution,
          estimated_volume: values.estimatedVolume,
          timeline: values.timeline,
          target_accuracy: values.targetAccuracy,
          budget_range: values.budgetRange,
          requirements_description: values.requirementsDescription,
          accepts_terms: values.acceptsTerms,
        }),
      });
      const saved = await parseResponse(response);
      setReceipt({ id: saved.id, status: saved.status, submittedAt: saved.submitted_at });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reach the configured GeoLabel API.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAnother = () => { setReceipt(null); setValues(initialValues); setError(null); };
  const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-500';
  const labelClass = 'block text-sm font-medium text-slate-300';

  return (
    <section id="quote-section" className="scroll-mt-24 border-t border-slate-800 bg-slate-900/50 py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-teal-300"><Send className="h-4 w-4" /> Scoping request</div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Share your project requirements.</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">Submitting this form stores your contact and project details in the configured database. This build does not calculate a price, send email, or guarantee a human follow-up. All volume, timeline, accuracy, and budget entries are request preferences only.</p>
        </div>

        {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {receipt ? (
          <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-6 sm:p-8">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" /><div>
              <h3 className="text-lg font-semibold text-white">Request saved</h3>
              <p className="mt-2 text-sm text-slate-300">The API returned a successful receipt. No other action is implied.</p>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Reference</dt><dd className="mt-1 break-all font-mono text-emerald-200">{receipt.id}</dd></div>
                <div><dt className="text-slate-500">Stored status</dt><dd className="mt-1 text-white">{receipt.status}</dd></div>
                <div><dt className="text-slate-500">Server timestamp</dt><dd className="mt-1 text-white">{new Date(receipt.submittedAt).toLocaleString()}</dd></div>
              </dl>
              <button type="button" onClick={startAnother} className="mt-6 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900">Submit another request</button>
            </div></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-7 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Name<input required maxLength={160} value={values.fullName} onChange={(e) => update('fullName', e.target.value)} className={inputClass} placeholder="Your name" /></label>
              <label className={labelClass}>Contact email<input required type="email" maxLength={320} value={values.email} onChange={(e) => update('email', e.target.value)} className={inputClass} placeholder="you@example.com" /></label>
              <label className={labelClass}>Organization<input required maxLength={200} value={values.organization} onChange={(e) => update('organization', e.target.value)} className={inputClass} placeholder="Organization name" /></label>
              <label className={labelClass}>Role (optional)<input maxLength={160} value={values.role} onChange={(e) => update('role', e.target.value)} className={inputClass} placeholder="Your role" /></label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Project type
                <select value={values.projectType} onChange={(e) => update('projectType', e.target.value)} className={inputClass}>
                  <option value="custom-geospatial-task">Custom geospatial task</option>
                  <option value="building-footprints">Building footprints</option>
                  <option value="transportation-network">Transportation network</option>
                  <option value="land-cover-or-water">Land cover or water extent</option>
                </select>
              </label>
              <label className={labelClass}>Imagery type
                <select value={values.imageryType} onChange={(e) => update('imageryType', e.target.value)} className={inputClass}>
                  <option>Not specified</option><option>Satellite optical</option><option>Aerial or drone</option><option>SAR</option><option>Other</option>
                </select>
              </label>
              <label className={labelClass}>Ground sampling distance / resolution<input maxLength={120} value={values.spatialResolution} onChange={(e) => update('spatialResolution', e.target.value)} className={inputClass} placeholder="Optional preference" /></label>
              <label className={labelClass}>Estimated volume<input maxLength={120} value={values.estimatedVolume} onChange={(e) => update('estimatedVolume', e.target.value)} className={inputClass} placeholder="Optional preference" /></label>
              <label className={labelClass}>Desired timeline (preference)
                <select value={values.timeline} onChange={(e) => update('timeline', e.target.value)} className={inputClass}>
                  <option>No preference</option><option>Under 2 weeks</option><option>2–4 weeks</option><option>Flexible</option>
                </select>
              </label>
              <label className={labelClass}>Target accuracy (preference, not a guarantee)<input maxLength={120} value={values.targetAccuracy} onChange={(e) => update('targetAccuracy', e.target.value)} className={inputClass} placeholder="Not specified" /></label>
              <label className={`${labelClass} sm:col-span-2`}>Budget range (optional preference)
                <select value={values.budgetRange} onChange={(e) => update('budgetRange', e.target.value)} className={inputClass}>
                  <option>No preference</option><option>To be discussed</option><option>Under $5,000</option><option>$5,000–$25,000</option><option>Over $25,000</option>
                </select>
              </label>
            </div>

            <label className={labelClass}>Project details<textarea required minLength={10} maxLength={10000} value={values.requirementsDescription} onChange={(e) => update('requirementsDescription', e.target.value)} rows={6} className={`${inputClass} resize-y`} placeholder="Describe the task, taxonomy, desired output, coordinate reference system, and constraints." /></label>
            <div className="rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100/80">File uploads are not enabled. Do not include credentials, private imagery links, or sensitive data in the description.</div>
            <label className="flex items-start gap-3 text-sm text-slate-300"><input type="checkbox" checked={values.acceptsTerms} onChange={(e) => update('acceptsTerms', e.target.checked)} className="mt-1 h-4 w-4 accent-teal-500" /><span>I consent to storing and using these contact and project details for this scoping request.</span></label>
            <button type="submit" disabled={isSubmitting || !values.acceptsTerms} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-3 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" />{isSubmitting ? 'Saving request…' : 'Submit scoping request'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
