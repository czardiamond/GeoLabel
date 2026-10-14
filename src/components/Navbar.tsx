import React, { useEffect, useState } from 'react';
import { ArrowRight, Layers, Menu, X } from 'lucide-react';

interface NavbarProps {
  onQuoteClick: () => void;
  onDemoClick: () => void;
}

const links = [
  { label: 'Overview', id: 'overview' },
  { label: 'Current status', id: 'product-status' },
  { label: 'Task-owner console', id: 'api-explorer' },
  { label: 'Annotator workspace', id: 'interactive-studio' },
  { label: 'Scoping request', id: 'quote-section' },
];

export const Navbar: React.FC<NavbarProps> = ({ onQuoteClick, onDemoClick }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b border-slate-800/80 transition-colors ${scrolled ? 'bg-slate-950/95 shadow-lg backdrop-blur' : 'bg-slate-950/75 backdrop-blur-sm'}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <button onClick={() => jump('overview')} className="flex items-center gap-3 text-left" aria-label="GeoLabel home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-700/70 bg-teal-950 text-teal-300"><Layers className="h-5 w-5" /></span>
          <span><span className="block text-lg font-bold tracking-tight text-white">Geo<span className="text-teal-300">Label</span></span><span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">GeoJSON-first API</span></span>
        </button>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {links.map((link) => <button key={link.id} onClick={() => jump(link.id)} className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white">{link.label}</button>)}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button onClick={onDemoClick} className="text-sm font-medium text-slate-300 hover:text-white">Annotator workspace</button>
          <button onClick={onQuoteClick} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500">Send scoping request <ArrowRight className="h-4 w-4" /></button>
        </div>

        <button onClick={() => setMobileOpen((open) => !open)} className="rounded-lg border border-slate-700 p-2 text-slate-300 md:hidden" aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileOpen}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && <nav className="border-t border-slate-800 bg-slate-950 px-4 py-3 md:hidden" aria-label="Mobile navigation">
        <div className="mx-auto grid max-w-7xl gap-1">{links.map((link) => <button key={link.id} onClick={() => jump(link.id)} className="rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white">{link.label}</button>)}
          <button onClick={() => { setMobileOpen(false); onQuoteClick(); }} className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white">Send scoping request <ArrowRight className="h-4 w-4" /></button>
        </div>
      </nav>}
    </header>
  );
};
