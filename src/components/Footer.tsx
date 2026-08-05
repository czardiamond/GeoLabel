import React from 'react';
import { Layers, Mail, Phone, MapPin, Linkedin, ArrowUp, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 text-xs font-mono py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Top Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Brand Info */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-teal-900/60 border border-teal-700/60 flex items-center justify-center text-teal-300">
                <Layers className="w-4 h-4 text-teal-300" />
              </div>
              <span className="font-bold text-lg text-white font-mono">
                Geo<span className="text-teal-400">Label</span>
              </span>
            </div>

            <p className="text-slate-300 leading-relaxed text-xs font-normal max-w-sm">
              The specialized data annotation platform connecting computer vision & ML teams with degree-trained GIS analysts. Precise, topologically valid training datasets for satellite, drone, and aerial models.
            </p>

            <div className="flex flex-wrap gap-2 text-[10px] font-mono text-teal-400">
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">EPSG:4326</span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">EPSG:3857</span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">COCO JSON</span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">GeoTIFF Mask</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-white font-bold text-xs uppercase tracking-wider">Navigation</h4>
            <ul className="space-y-2 text-xs font-sans">
              <li>
                <a href="#why-niche" className="hover:text-teal-300 transition-colors">
                  Why Niche Geospatial
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-teal-300 transition-colors">
                  Services & Taxonomies
                </a>
              </li>
              <li>
                <a href="#interactive-studio" className="hover:text-teal-300 transition-colors">
                  Annotation Studio Inspector
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-teal-300 transition-colors">
                  Pipeline Process
                </a>
              </li>
              <li>
                <a href="#quality" className="hover:text-teal-300 transition-colors">
                  Quality & IoU SLAs
                </a>
              </li>
              <li>
                <a href="#credentials" className="hover:text-teal-300 transition-colors">
                  Founder Credentials
                </a>
              </li>
              <li>
                <a href="#quote-section" className="hover:text-teal-300 transition-colors">
                  Get a Quote
                </a>
              </li>
            </ul>
          </div>

          {/* Contact & Social Info */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="text-white font-bold text-xs uppercase tracking-wider">Contact & Inquiries</h4>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-teal-400 shrink-0" />
                <a href="mailto:intake@geolabel.ai" className="text-slate-300 hover:text-white transition-colors">
                  intake@geolabel.ai
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-teal-400 shrink-0" />
                <span className="text-slate-300">+1 (800) 555-GEO1</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Linkedin className="w-4 h-4 text-teal-400 shrink-0" />
                <a
                  href="https://linkedin.com/company/geolabel-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-300 hover:underline"
                >
                  linkedin.com/company/geolabel-ai
                </a>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-400">
              Operations Enclave: San Francisco, CA & GIS Hub Labs
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
          <div>
            © {new Date().getFullYear()} GeoLabel AI. All rights reserved. Precision Geospatial Data Annotation.
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-teal-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SOC 2 & ISO 27001 READY</span>
            </span>

            <button
              onClick={scrollToTop}
              className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Back to Top"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
