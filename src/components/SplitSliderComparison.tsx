import React, { useState } from 'react';
import { Sliders, Sparkles, CheckCircle2, AlertTriangle, Layers, Eye, ShieldCheck, Zap } from 'lucide-react';

export const SplitSliderComparison: React.FC = () => {
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [bandSpectrum, setBandSpectrum] = useState<'rgb' | 'nir' | 'thermal' | 'sar'>('rgb');

  // Spectrum Background Gradients
  const spectrumStyles = {
    rgb: 'bg-gradient-to-tr from-slate-950 via-slate-900 to-emerald-950/40',
    nir: 'bg-gradient-to-tr from-rose-950/80 via-slate-900 to-indigo-950',
    thermal: 'bg-gradient-to-tr from-amber-950/80 via-slate-900 to-purple-950',
    sar: 'bg-gradient-to-tr from-gray-950 via-slate-900 to-teal-950',
  };

  return (
    <section id="before-after" className="py-20 bg-slate-950 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Sliders className="w-3.5 h-3.5" />
            <span>Interactive Vector Alignment Engine</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Generic Crowdsourced vs. GeoLabel Precision
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Drag the split-slider to compare generic offshore crowdsourced masks against GeoLabel’s GIS-engineered vector outputs with 90° orthogonality snapping and zero topological overlaps.
          </p>
        </div>

        {/* Band Spectrum Selectors */}
        <div className="flex justify-center items-center gap-2 mb-8 flex-wrap">
          <span className="text-xs font-mono text-slate-400 mr-2 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-teal-400" /> Sensor Imagery Spectrum:
          </span>
          <button
            onClick={() => setBandSpectrum('rgb')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              bandSpectrum === 'rgb'
                ? 'bg-teal-800 text-white font-semibold border border-teal-600'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            RGB High-Res (5cm)
          </button>
          <button
            onClick={() => setBandSpectrum('nir')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              bandSpectrum === 'nir'
                ? 'bg-rose-900 text-white font-semibold border border-rose-600'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            False Color InfraRed (NIR)
          </button>
          <button
            onClick={() => setBandSpectrum('thermal')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              bandSpectrum === 'thermal'
                ? 'bg-amber-900 text-white font-semibold border border-amber-600'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Thermal LWIR Night Heat
          </button>
          <button
            onClick={() => setBandSpectrum('sar')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              bandSpectrum === 'sar'
                ? 'bg-indigo-900 text-white font-semibold border border-indigo-600'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Synthetic Aperture Radar (SAR)
          </button>
        </div>

        {/* Visual Split-Slider Canvas Container */}
        <div className="relative w-full h-[480px] sm:h-[520px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 select-none">
          {/* Base Simulated Satellite Canvas Background */}
          <div className={`absolute inset-0 ${spectrumStyles[bandSpectrum]} transition-colors duration-500`}>
            {/* Grid Lines simulating GIS Tile Coordinates */}
            <svg className="w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="gis_grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0d9488" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#gis_grid)" />
            </svg>
          </div>

          {/* LEFT SIDE: Generic Sloppy Annotation (Masked by Slider) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-slate-950/80 overflow-hidden"
            style={{ width: `${sliderPosition}%` }}
          >
            <div className="absolute inset-0 w-full min-w-[700px] sm:min-w-[1000px] p-8 flex items-center justify-center">
              {/* Sloppy SVG Overlay */}
              <svg className="w-full h-full max-w-3xl" viewBox="0 0 800 500">
                {/* Sloppy Building Footprints (Not squared, overlapping, crooked) */}
                <polygon
                  points="120,110 240,125 220,240 105,210"
                  fill="rgba(239, 68, 68, 0.25)"
                  stroke="#ef4444"
                  strokeWidth="3"
                  strokeDasharray="4 2"
                />
                <circle cx="240" cy="125" r="5" fill="#ef4444" />
                <text x="130" y="170" fill="#fca5a5" fontSize="12" fontFamily="monospace">
                  MISALIGNED (IoU: 68.2%)
                </text>

                {/* Overlapping Sloppy Road */}
                <polygon
                  points="200,220 380,240 410,290 180,270"
                  fill="rgba(245, 158, 11, 0.25)"
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
                <text x="220" y="255" fill="#fde68a" fontSize="11" fontFamily="monospace">
                  TOPOLOGY OVERLAP ERROR
                </text>

                {/* Crooked Solar Array */}
                <polygon
                  points="450,110 610,135 590,210 440,180"
                  fill="rgba(239, 68, 68, 0.2)"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                />
                <text x="470" y="150" fill="#fca5a5" fontSize="11" fontFamily="monospace">
                  NON-ORTHOGONAL CORNERS
                </text>
              </svg>

              {/* Label Badge Left */}
              <div className="absolute top-6 left-6 px-3.5 py-1.5 rounded-lg bg-rose-950/90 border border-rose-700 text-rose-300 text-xs font-mono font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>GENERIC OFFSHORE OUTPUT (Sloppy)</span>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: GeoLabel GIS Precision Annotation (Revealed as slider moves left) */}
          <div className="absolute inset-0 pointer-events-none p-8 flex items-center justify-center">
            <svg className="w-full h-full max-w-3xl" viewBox="0 0 800 500">
              {/* Perfect Orthogonalized Building Footprint */}
              <polygon
                points="110,100 230,100 230,220 110,220"
                fill="rgba(20, 184, 166, 0.3)"
                stroke="#14b8a6"
                strokeWidth="2.5"
              />
              <rect x="106" y="96" width="8" height="8" fill="#2dd4bf" />
              <rect x="226" y="96" width="8" height="8" fill="#2dd4bf" />
              <rect x="226" y="216" width="8" height="8" fill="#2dd4bf" />
              <rect x="106" y="216" width="8" height="8" fill="#2dd4bf" />
              <text x="120" y="160" fill="#5eead4" fontSize="12" fontFamily="monospace" fontWeight="bold">
                GEOLABEL (90° Ortho / IoU: 99.4%)
              </text>

              {/* Clean Cleaned Road Line */}
              <polygon
                points="240,230 420,230 420,280 240,280"
                fill="rgba(56, 189, 248, 0.25)"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <text x="250" y="260" fill="#bae6fd" fontSize="11" fontFamily="monospace">
                TOPOLOGY CLEANED & SNAPPED
              </text>

              {/* Precise Solar Panel Regularized Grid */}
              <polygon
                points="450,100 610,100 610,190 450,190"
                fill="rgba(168, 85, 247, 0.25)"
                stroke="#a855f7"
                strokeWidth="2"
              />
              <line x1="450" y1="130" x2="610" y2="130" stroke="#c084fc" strokeWidth="1" strokeDasharray="2 2" />
              <line x1="450" y1="160" x2="610" y2="160" stroke="#c084fc" strokeWidth="1" strokeDasharray="2 2" />
              <text x="460" y="120" fill="#e9d5ff" fontSize="11" fontFamily="monospace">
                PANEL SUB-OBB REGULARIZED
              </text>
            </svg>

            {/* Label Badge Right */}
            <div className="absolute top-6 right-6 px-3.5 py-1.5 rounded-lg bg-teal-950/90 border border-teal-600 text-teal-300 text-xs font-mono font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span>GEOLABEL REGULARIZED GIS OUTPUT</span>
            </div>
          </div>

          {/* DRAGGABLE SLIDER DIVIDER BAR */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-teal-400 shadow-[0_0_15px_#2dd4bf] cursor-ew-resize z-30"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-slate-900 border-2 border-teal-400 flex items-center justify-center text-teal-300 shadow-xl">
              <Sliders className="w-4 h-4" />
            </div>
          </div>

          {/* Interactive Invisible Input Range Overlay */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPosition}
            onChange={(e) => setSliderPosition(Number(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-40"
          />
        </div>

        {/* Feature Comparison Cards Below Slider */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-teal-950 border border-teal-800 text-teal-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">90° Corner Orthogonality</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Automated corner squaring ensures building footprint edges are mathematically parallel or perpendicular, eliminating jagged polygon noise.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-teal-950 border border-teal-800 text-teal-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Zero Topological Overlaps</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Adjacent parcels, property lines, and road boundaries share exact vertex coordinates with zero gaps or intersecting line segment violations.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-teal-950 border border-teal-800 text-teal-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">COGS & CRS Tag Preservation</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                All output geometry coordinate pairs maintain native EPSG spatial projection integrity ready for direct ingestion into QGIS, ArcGIS, or PostGIS.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
