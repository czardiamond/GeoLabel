import React from 'react';
import { ArrowDown, ArrowRight, Database, KeyRound, Layers3, Workflow } from 'lucide-react';

interface HeroProps {
  onQuoteClick: () => void;
  onDemoClick: () => void;
}

const stages = [
  { icon: Database, label: 'Create task', detail: 'Persist URI, CRS, and taxonomy' },
  { icon: KeyRound, label: 'Assign workers', detail: 'Issue keys scoped to one task' },
  { icon: Layers3, label: 'Submit GeoJSON', detail: 'Validate and reproject coordinates' },
  { icon: Workflow, label: 'Review agreement', detail: 'Inspect server-computed output' },
];

export const Hero: React.FC<HeroProps> = ({ onQuoteClick, onDemoClick }) => (
  <section id="overview" className="relative overflow-hidden pb-20 pt-32 sm:pt-40">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.20),_transparent_55%)]" />
    <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-teal-800 bg-teal-950/60 px-3 py-1.5 text-xs font-semibold tracking-wide text-teal-200">GeoLabel · API-backed MVP</span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">A real workflow for <span className="text-teal-300">geospatial annotations.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Create a task against an imagery URI, provision task-specific annotator credentials, and collect GeoJSON through a secured API. Start with the workflow that is actually implemented—without demo data or invented performance claims.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={onDemoClick} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-3 font-semibold text-white transition hover:bg-teal-500">Open annotator workspace <ArrowRight className="h-4 w-4" /></button>
          <button onClick={onQuoteClick} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800">Send a scoping request <ArrowDown className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-14 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <p className="text-sm font-semibold text-white">Implemented API path</p>
            <p className="mt-1 text-xs text-slate-400">The diagram describes the current API flow; it is not a live task or processing monitor.</p>
          </div>
          <span className="rounded-md border border-slate-700 px-2 py-1 font-mono text-[11px] text-slate-400">illustrative flow</span>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map(({ icon: Icon, label, detail }, index) => (
            <li key={label} className="relative rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-teal-300" /><span className="font-mono text-xs text-slate-600">0{index + 1}</span></div>
              <h2 className="mt-4 text-sm font-semibold text-white">{label}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-relaxed text-slate-500">Current boundaries: GeoLabel does not fetch or render external imagery references. The workspace supports private raster uploads and interactive vector drawing; annotation geometry remains GeoJSON-first, and provider AI is not enabled.</p>
      </div>
    </div>
  </section>
);
