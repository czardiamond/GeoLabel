import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  MapPin,
  Maximize2,
  Crosshair,
  Sparkles,
  ShieldAlert,
  Code2,
  Compass,
  Zap,
  Globe
} from 'lucide-react';

interface HeroProps {
  onQuoteClick: () => void;
  onDemoClick: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onQuoteClick, onDemoClick }) => {
  const [activeLayer, setActiveLayer] = useState<'rgb' | 'vectors' | 'multispectral' | 'crs'>('vectors');
  const [selectedFeature, setSelectedFeature] = useState<string | null>('bldg-1');

  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 bg-slate-950 overflow-hidden border-b border-slate-800/60">
      {/* Background Geospatial SVG Motifs (Grid, Contour Lines, Lat/Long Crosshairs) */}
      <div className="absolute inset-0 opacity-15 pointer-events-none select-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#3E6D63" strokeWidth="0.75" opacity="0.6" />
              <circle cx="0" cy="0" r="1.5" fill="#3E6D63" />
            </pattern>
            <pattern id="subgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#3E6D63" strokeWidth="0.3" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#subgrid)" />
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          
          {/* Subtle Contour SVG Lines */}
          <path
            d="M -100,200 Q 200,100 500,300 T 1200,150 T 1800,400"
            fill="none"
            stroke="#3E6D63"
            strokeWidth="1.2"
            strokeDasharray="4,4"
            opacity="0.5"
          />
          <path
            d="M -100,350 Q 300,250 700,450 T 1400,280 T 2000,500"
            fill="none"
            stroke="#4E8579"
            strokeWidth="1.5"
            opacity="0.4"
          />
          <path
            d="M 100,-50 Q 400,300 800,100 T 1600,350"
            fill="none"
            stroke="#3E6D63"
            strokeWidth="1"
            opacity="0.3"
          />
        </svg>
      </div>

      {/* Lat / Long Axis Overlay Indicators */}
      <div className="absolute top-20 left-4 hidden xl:block font-mono text-[10px] text-teal-600/60 select-none space-y-24">
        <div>37.7749° N</div>
        <div>37.7612° N</div>
        <div>37.7480° N</div>
      </div>
      <div className="absolute bottom-4 left-32 hidden xl:flex gap-32 font-mono text-[10px] text-teal-600/60 select-none">
        <div>122.4194° W</div>
        <div>122.3980° W</div>
        <div>122.3750° W</div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Hero Text Column */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Niche Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-950/80 border border-teal-700/60 text-teal-300 text-xs font-mono font-medium tracking-wide shadow-inner">
              <Compass className="w-3.5 h-3.5 text-teal-400 animate-spin-slow" />
              <span>THE SPECIALIST SERVICE FOR GIS & SATELLITE ML</span>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              Geospatial Data Annotation, <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-400 to-emerald-400">
                Done by People Who Understand Terrain.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
              Generalist labeling platforms don’t understand coordinate reference systems (CRS), multispectral bands, or land cover taxonomy. <strong className="text-white font-semibold">GeoLabel</strong> connects AI/ML teams with degree-trained GIS analysts to deliver pixel-perfect, topologically valid training datasets.
            </p>

            {/* Call To Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                onClick={onQuoteClick}
                className="px-6 py-3.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-600 border border-teal-500/80 rounded-lg shadow-lg shadow-teal-900/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Get a Quote</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onDemoClick}
                className="px-5 py-3.5 text-sm font-semibold text-slate-200 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Code2 className="w-4 h-4 text-teal-400" />
                <span>See Our Work & Schema</span>
              </button>
            </div>

            {/* Micro Trust Indicators */}
            <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-0.5">
                <div className="text-xs text-slate-400 font-mono">ACCURACY SLA</div>
                <div className="text-sm font-bold text-teal-300 font-mono">≥ 0.88 IoU</div>
                <div className="text-[11px] text-slate-400">Enforced Threshold</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-slate-400 font-mono">ANNOTATORS</div>
                <div className="text-sm font-bold text-teal-300 font-mono">100% GIS-Trained</div>
                <div className="text-[11px] text-slate-400">B.Tech & GISP Leads</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-slate-400 font-mono">COORDINATES</div>
                <div className="text-sm font-bold text-teal-300 font-mono">Native CRS</div>
                <div className="text-[11px] text-slate-400">EPSG:4326 / 3857</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-slate-400 font-mono">EXPORTS</div>
                <div className="text-sm font-bold text-teal-300 font-mono">GeoJSON / COCO</div>
                <div className="text-[11px] text-slate-400">Shapefile & Mask</div>
              </div>
            </div>

          </div>

          {/* Hero Right Column: Interactive Geospatial Inspection Canvas Preview */}
          <div className="lg:col-span-5">
            <div className="relative rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-2xl overflow-hidden backdrop-blur-md">
              
              {/* Simulator Header */}
              <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-mono text-slate-200 font-medium">
                    INSPECTOR_POD_01 // 0.15m Aerial
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-800">
                    EPSG:3857
                  </span>
                </div>
              </div>

              {/* Layer Toggle Tabs */}
              <div className="bg-slate-900/90 px-3 py-1.5 border-b border-slate-800 flex items-center gap-1 text-[11px] font-mono">
                <button
                  onClick={() => setActiveLayer('vectors')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    activeLayer === 'vectors'
                      ? 'bg-teal-800/60 text-white font-semibold border border-teal-600/60'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Vector Annotations
                </button>
                <button
                  onClick={() => setActiveLayer('multispectral')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    activeLayer === 'multispectral'
                      ? 'bg-teal-800/60 text-white font-semibold border border-teal-600/60'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Multispectral
                </button>
                <button
                  onClick={() => setActiveLayer('crs')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    activeLayer === 'crs'
                      ? 'bg-teal-800/60 text-white font-semibold border border-teal-600/60'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Topology QA
                </button>
              </div>

              {/* Simulated Map View Container */}
              <div className="relative h-[320px] bg-slate-950 overflow-hidden group select-none">
                
                {/* Synthetic Imagery Layer (Stylized Satellite Canvas) */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                  {/* Grid Roads */}
                  <svg className="w-full h-full opacity-40" xmlns="http://www.w3.org/2000/svg">
                    {/* Main Arterial Roads */}
                    <path d="M 0,160 L 400,160" stroke="#64748B" strokeWidth="18" fill="none" />
                    <path d="M 0,160 L 400,160" stroke="#F1F5F9" strokeWidth="2" strokeDasharray="6,6" fill="none" />
                    <path d="M 180,0 L 180,320" stroke="#64748B" strokeWidth="14" fill="none" />
                    
                    {/* Secondary Streets */}
                    <path d="M 60,0 L 60,320" stroke="#475569" strokeWidth="8" fill="none" />
                    <path d="M 300,0 L 300,320" stroke="#475569" strokeWidth="8" fill="none" />
                    <path d="M 0,80 L 400,80" stroke="#475569" strokeWidth="8" fill="none" />
                    <path d="M 0,250 L 400,250" stroke="#475569" strokeWidth="8" fill="none" />
                  </svg>

                  {/* Synthetic Buildings / Terrain Blocks */}
                  <div className="absolute top-6 left-8 w-20 h-14 bg-slate-700/80 rounded border border-slate-600"></div>
                  <div className="absolute top-6 left-32 w-12 h-14 bg-slate-700/80 rounded border border-slate-600"></div>
                  <div className="absolute top-24 left-8 w-36 h-20 bg-slate-700/80 rounded border border-slate-600"></div>
                  <div className="absolute top-6 right-8 w-24 h-24 bg-emerald-950/60 border border-emerald-800/40 rounded-full"></div>
                  <div className="absolute bottom-8 right-8 w-32 h-16 bg-slate-700/80 rounded border border-slate-600"></div>
                  <div className="absolute bottom-8 left-8 w-24 h-16 bg-slate-700/80 rounded border border-slate-600"></div>
                </div>

                {/* Multispectral False Color Band Overlay */}
                {activeLayer === 'multispectral' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-red-900/30 via-emerald-800/30 to-teal-900/30 mix-blend-color-dodge transition-opacity duration-300">
                    <div className="absolute top-2 left-2 bg-slate-900/90 border border-red-500/40 px-2 py-1 rounded text-[10px] font-mono text-red-300">
                      BAND CONFIG: NIR-Red-Green (False Color Vegetation)
                    </div>
                  </div>
                )}

                {/* Vector Annotations Layer Overlay */}
                {(activeLayer === 'vectors' || activeLayer === 'crs') && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {/* Polygon 1: Building Footprint */}
                    <polygon
                      points="32,24 176,24 176,104 32,104"
                      fill="rgba(62, 109, 99, 0.25)"
                      stroke="#4E8579"
                      strokeWidth="2"
                    />
                    {/* Vertices */}
                    <circle cx="32" cy="24" r="3.5" fill="#3E6D63" stroke="#FFF" strokeWidth="1" />
                    <circle cx="176" cy="24" r="3.5" fill="#3E6D63" stroke="#FFF" strokeWidth="1" />
                    <circle cx="176" cy="104" r="3.5" fill="#3E6D63" stroke="#FFF" strokeWidth="1" />
                    <circle cx="32" cy="104" r="3.5" fill="#3E6D63" stroke="#FFF" strokeWidth="1" />

                    {/* Polygon 2: Green Canopy */}
                    <polygon
                      points="260,24 350,14 360,110 280,100"
                      fill="rgba(16, 185, 129, 0.2)"
                      stroke="#10B981"
                      strokeWidth="2"
                      strokeDasharray="4,2"
                    />

                    {/* Oriented Bounding Box (Vehicle) */}
                    <g transform="rotate(15 200 200)">
                      <rect
                        x="190"
                        y="190"
                        width="30"
                        height="50"
                        fill="rgba(245, 158, 11, 0.25)"
                        stroke="#F59E0B"
                        strokeWidth="2"
                      />
                    </g>
                  </svg>
                )}

                {/* Topology QA Overlay */}
                {activeLayer === 'crs' && (
                  <div className="absolute inset-0 bg-teal-950/20 pointer-events-none flex items-center justify-center">
                    <div className="bg-slate-900/95 border border-teal-500/80 px-3 py-2 rounded-md shadow-lg text-center space-y-1">
                      <div className="flex items-center gap-1.5 text-teal-300 font-mono text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>TOPOLOGY PASSED (100%)</span>
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono">
                        No Self-Intersections | 0 Sliver Gaps | Shared Snapping Rules
                      </div>
                    </div>
                  </div>
                )}

                {/* Floating Label Tags */}
                <div className="absolute top-7 left-10 pointer-events-auto">
                  <div className="bg-slate-900/90 border border-teal-500/80 px-2 py-0.5 rounded text-[10px] font-mono text-teal-200 shadow-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                    <span>Building Footprint [IoU 0.94]</span>
                  </div>
                </div>

                <div className="absolute top-[28px] right-14 pointer-events-auto">
                  <div className="bg-slate-900/90 border border-emerald-500/80 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-300 shadow-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Tree Canopy [Class 04]</span>
                  </div>
                </div>

                <div className="absolute bottom-12 left-36 pointer-events-auto">
                  <div className="bg-slate-900/90 border border-amber-500/80 px-2 py-0.5 rounded text-[10px] font-mono text-amber-300 shadow-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>Vehicle OBB [Heading 15°]</span>
                  </div>
                </div>

                {/* Interactive Crosshairs */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
                  <div className="w-full h-[1px] bg-teal-500"></div>
                  <div className="h-full w-[1px] bg-teal-500 absolute"></div>
                </div>

                {/* Live Coordinates Footer inside Inspector */}
                <div className="absolute bottom-2 right-2 bg-slate-900/90 border border-slate-700/80 px-2 py-1 rounded text-[10px] font-mono text-slate-300 flex items-center gap-2">
                  <Crosshair className="w-3 h-3 text-teal-400" />
                  <span>37.774921° N, -122.419415° W</span>
                </div>
              </div>

              {/* Inspector Attributes Panel */}
              <div className="bg-slate-900 p-3 border-t border-slate-800 text-xs font-mono text-slate-300 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>SELECTED ATTR</span>
                  <span className="text-teal-400 font-semibold">VERIFIED BY SENIOR GIS AUDITOR</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-500">Geometry:</span> <span className="text-slate-200">Regularized Polygon</span>
                  </div>
                  <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-500">Sub-Pixel Error:</span> <span className="text-emerald-400">0.02 px</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
