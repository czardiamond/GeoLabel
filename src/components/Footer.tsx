import React from 'react';
import { ArrowUp, Layers } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-10 text-slate-400">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-white"><Layers className="h-5 w-5 text-teal-300" /><span className="font-bold">GeoLabel API</span></div>
            <p className="mt-3 text-sm leading-relaxed">A GeoJSON-first geospatial annotation API foundation. This repository does not claim a staffed annotation operation, certification, audited security program, or production service-level agreement.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed">
            <p className="font-semibold text-slate-200">Production note</p>
            <p className="mt-2 max-w-sm">Configure a durable database, strong service secret, restricted CORS origins, HTTPS, backups, migrations, and operational monitoring before handling customer data.</p>
          </div>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-800 pt-5 text-xs sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} GeoLabel · API-backed MVP</span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"><ArrowUp className="h-3.5 w-3.5" /> Back to top</button>
        </div>
      </div>
    </footer>
  );
};
