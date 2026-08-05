import React, { useState, useEffect } from 'react';
import { Layers, Menu, X, ArrowRight, ShieldCheck, FileSpreadsheet, Globe, ChevronDown, Database } from 'lucide-react';
import { SavedRecordsModal } from './SavedRecordsModal';

interface NavbarProps {
  onQuoteClick: () => void;
  onDemoClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onQuoteClick, onDemoClick }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentLang, setCurrentLang] = useState<'EN' | 'FR' | 'ES' | 'DE'>('EN');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }

      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const currentProgress = (window.scrollY / totalHeight) * 100;
        setScrollProgress(Math.min(100, Math.max(0, currentProgress)));
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Why GeoLabel', href: '#why-niche' },
    { name: 'Services', href: '#services' },
    { name: 'Annotation Studio', href: '#interactive-studio' },
    { name: 'GIS Tools', href: '#gis-tools' },
    { name: 'Pod Estimator', href: '#estimator' },
    { name: 'API Pipeline', href: '#api-explorer' },
    { name: 'Compliance', href: '#compliance' },
    { name: 'Case Studies', href: '#case-studies' },
    { name: 'Benchmark Datasets', href: '#datasets' },
    { name: 'ROI Model', href: '#roi-calculator' },
    { name: 'Trust Center', href: '#trust-center' },
    { name: 'Quality & QA', href: '#quality' },
    { name: 'Credentials', href: '#credentials' },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 shadow-lg py-3'
          : 'bg-slate-900/80 backdrop-blur-sm border-b border-slate-800/40 py-4'
      }`}
    >
      {/* Scroll Progress Bar at Top of Viewport */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800/80 z-50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400 transition-all duration-100 ease-out shadow-[0_0_8px_#2dd4bf]"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a
            href="#"
            className="flex items-center gap-3 group focus:outline-none"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <div className="relative w-10 h-10 rounded-lg bg-teal-800/40 border border-teal-600/40 flex items-center justify-center text-teal-400 group-hover:bg-teal-700/50 group-hover:border-teal-500 transition-all">
              <Layers className="w-5 h-5 text-teal-300" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xl tracking-tight text-white font-mono">
                  Geo<span className="text-teal-400">Label</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono tracking-wider text-teal-300 bg-teal-950/80 border border-teal-800/60 rounded">
                  GIS-AI
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block -mt-1 tracking-wider">
                EPSG:4326 READY
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="px-3 py-1.5 text-xs lg:text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-md transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="px-2.5 py-1.5 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
                title="Select Geospatial Interface Language"
              >
                <Globe className="w-3.5 h-3.5 text-teal-400" />
                <span>{currentLang}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {langMenuOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1 z-50 text-xs font-mono">
                  <button
                    onClick={() => { setCurrentLang('EN'); setLangMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                      currentLang === 'EN' ? 'bg-teal-950 text-teal-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>English</span>
                    <span className="text-[10px] text-slate-400">EN</span>
                  </button>
                  <button
                    onClick={() => { setCurrentLang('FR'); setLangMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                      currentLang === 'FR' ? 'bg-teal-950 text-teal-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Français</span>
                    <span className="text-[10px] text-slate-400">FR</span>
                  </button>
                  <button
                    onClick={() => { setCurrentLang('ES'); setLangMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                      currentLang === 'ES' ? 'bg-teal-950 text-teal-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Español</span>
                    <span className="text-[10px] text-slate-400">ES</span>
                  </button>
                  <button
                    onClick={() => { setCurrentLang('DE'); setLangMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                      currentLang === 'DE' ? 'bg-teal-950 text-teal-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Deutsch</span>
                    <span className="text-[10px] text-slate-400">DE</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setMemoryModalOpen(true)}
              className="px-2.5 py-1.5 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
              title="Open Persistent Session Memory & History"
            >
              <Database className="w-3.5 h-3.5 text-teal-400" />
              <span>Memory Log</span>
            </button>

            <button
              onClick={onDemoClick}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
              <span>Sample Demo</span>
            </button>

            <button
              onClick={onQuoteClick}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 border border-teal-500/60 rounded-md shadow-sm transition-all flex items-center gap-1.5 group cursor-pointer"
            >
              <span>Get a Quote</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white bg-slate-800/80 rounded-lg border border-slate-700 focus:outline-none"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-3 pb-6 space-y-3 mt-3 animate-in fade-in slide-in-from-top-2">
          <div className="grid grid-cols-1 gap-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onDemoClick();
              }}
              className="w-full py-2.5 text-xs font-medium text-slate-300 bg-slate-800 rounded-md border border-slate-700 flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-400" />
              <span>Inspect Sample GeoJSON</span>
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onQuoteClick();
              }}
              className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-md flex items-center justify-center gap-2"
            >
              <span>Get a Quote</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Saved Records Memory Modal */}
      <SavedRecordsModal
        isOpen={memoryModalOpen}
        onClose={() => setMemoryModalOpen(false)}
      />
    </header>
  );
};
