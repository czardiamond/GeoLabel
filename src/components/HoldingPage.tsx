import { AlertTriangle, Check, CircleOff, Map, ShieldAlert } from 'lucide-react';

const verifiedItems = [
  {
    title: 'Task API prototype',
    detail: 'The repository includes FastAPI endpoints for creating annotation tasks and retrieving results.',
  },
  {
    title: 'GeoJSON and CRS utilities',
    detail: 'Backend code parses coordinate reference systems and can reproject GeoJSON feature geometry.',
  },
  {
    title: 'Python client',
    detail: 'A Python SDK is included for calling the prototype API.',
  },
];

const limits = [
  'This public preview is not a verified production annotation service. Production operations, data persistence, backups, recovery, access controls, and monitoring still require review.',
  'AI-generated suggestions are not offered here. This page accepts no imagery and sends no image data to an AI provider.',
  'No SOC 2, ISO 27001, ITAR, or other independent certification or audit status is claimed.',
  'No pixel-perfect or accuracy guarantee, topology/IoU guarantee, contractual SLA, customer case study, or outcome metric is represented.',
  'Sign-up, file upload, subscriptions, and checkout are not available on this page. Billing is deferred.',
];

export default function HoldingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07110f] text-slate-100 selection:bg-teal-300 selection:text-[#07110f]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(ellipse at 72% 8%, rgba(20,184,166,.16), transparent 38%), linear-gradient(rgba(148,163,184,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.045) 1px, transparent 1px)', backgroundSize: 'auto, 44px 44px, 44px 44px' }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-slate-950">Skip to content</a>

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
        <div className="flex items-center gap-3" aria-label="GeoLabel">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-teal-300/30 bg-teal-300/10 text-teal-200">
            <Map aria-hidden="true" size={22} strokeWidth={1.7} />
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">GeoLabel</span>
            <span className="block text-xs text-slate-400">Geospatial annotation prototype</span>
          </span>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
          Release review
        </span>
      </header>

      <main id="main" className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:px-10 sm:pt-16">
        <section aria-labelledby="page-title" className="max-w-4xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">Interim product notice</p>
          <h1 id="page-title" className="max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-6xl">
            GeoLabel is under review before production use.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
            We are checking the software, data-handling boundaries, and operational readiness before making production-service claims. The capabilities below describe code present in the repository, not a service-level commitment.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            <AlertTriangle aria-hidden="true" className="shrink-0 text-amber-200" size={18} />
            Do not use this public preview for production or sensitive-data workflows.
          </div>
        </section>

        <section aria-label="Current product status" className="mt-16 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-300/10 text-teal-200"><Check aria-hidden="true" size={20} /></span>
              <div>
                <h2 className="text-lg font-semibold text-white">Present in the repository</h2>
                <p className="mt-1 text-sm text-slate-400">Prototype capabilities, not production guarantees</p>
              </div>
            </div>
            <ul className="space-y-5">
              {verifiedItems.map((item) => (
                <li key={item.title} className="border-t border-slate-800 pt-4">
                  <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">{item.detail}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-amber-200/20 bg-slate-900/60 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-200/10 text-amber-100"><ShieldAlert aria-hidden="true" size={20} /></span>
              <div>
                <h2 className="text-lg font-semibold text-white">Not available or not verified</h2>
                <p className="mt-1 text-sm text-slate-400">Boundaries for this interim release</p>
              </div>
            </div>
            <ul className="space-y-4">
              {limits.map((item) => (
                <li key={item} className="flex gap-3 border-t border-slate-800 pt-4 text-sm leading-6 text-slate-300">
                  <CircleOff aria-hidden="true" className="mt-1 shrink-0 text-amber-100/80" size={15} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section aria-labelledby="data-notice" className="mt-6 rounded-2xl border border-slate-700/80 bg-[#0b1715]/90 p-6 sm:flex sm:items-start sm:gap-4 sm:p-8">
          <span className="mb-4 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-200 sm:mb-0"><Map aria-hidden="true" size={19} /></span>
          <div>
            <h2 id="data-notice" className="font-semibold text-white">Data-use notice</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
              This interim page has no upload, sign-up, payment, or inference flow. Until a reviewed release is available, do not submit controlled, regulated, export-restricted, or otherwise sensitive imagery, and do not rely on this preview for contractual deliverables.
            </p>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-slate-800/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <span>GeoLabel · Interim release notice</span>
          <span className="inline-flex items-center gap-2"><CircleOff aria-hidden="true" size={13} /> No uploads · No AI transfer · No checkout</span>
        </div>
      </footer>
    </div>
  );
}
