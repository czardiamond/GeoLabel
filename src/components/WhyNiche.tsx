import React, { useState } from 'react';
import { COMPARISON_POINTS } from '../data/geospatialData';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Compass,
  Layers,
  Sparkles,
  Zap,
  Globe2,
  ShieldCheck,
  BrainCircuit
} from 'lucide-react';

export const WhyNiche: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);

  return (
    <section id="why-niche" className="py-20 bg-slate-900 border-b border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            <span>DIFFERENTIATION MATRIX</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Why Generic Annotation Platforms Fail at Geospatial Data
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Generalist annotation platforms treat high-resolution satellite, drone, and SAR imagery like web JPEG memes. They assign crowdsourced micro-taskers who don’t understand projection transformations, land cover taxonomy, or multispectral band physics.
          </p>
        </div>

        {/* Visual Graphic comparison: Common Mistake vs GeoLabel Precision */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1: Generic Crowdsourced Failure */}
          <div className="bg-slate-950 border border-red-900/40 rounded-xl p-6 space-y-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 bg-red-950/80 border-b border-l border-red-800/60 px-3 py-1 rounded-bl-lg text-[11px] font-mono text-red-300 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span>Generic Crowdsourced Platform</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-bold text-white">Projection Drift & Slivers</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Crowdsourced workers crop images into flat PNGs, stripping spatial headers (WKT / GeoTIFF tags). The resulting vectors suffer from coordinate drift, overlapping building footprints, and unregularized corners.
            </p>

            {/* Visual Failure Diagram */}
            <div className="relative h-36 bg-slate-900 rounded-lg border border-red-900/30 overflow-hidden flex items-center justify-center">
              <svg className="w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
                {/* Misaligned Overlapping Polygons */}
                <polygon points="40,20 180,35 160,110 20,90" fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeWidth="2" strokeDasharray="3,3" />
                <polygon points="170,30 290,20 310,100 150,115" fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeWidth="2" strokeDasharray="3,3" />
              </svg>
              <div className="absolute top-2 left-2 bg-red-950/90 text-red-300 border border-red-800 px-2 py-0.5 rounded text-[10px] font-mono">
                ERR: Overlapping Polygons & Self-Intersections
              </div>
              <div className="absolute bottom-2 right-2 bg-slate-950 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                CRS Stripped (JPEG)
              </div>
            </div>

            <ul className="space-y-2 text-xs text-slate-300 font-mono pt-1">
              <li className="flex items-center gap-2 text-red-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span>Self-intersecting geometry causes PostGIS ingestion crashes</span>
              </li>
              <li className="flex items-center gap-2 text-red-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span>Misclassifies fallow agricultural fields as urban built-up</span>
              </li>
            </ul>
          </div>

          {/* Card 2: GeoLabel Precision Approach */}
          <div className="bg-slate-950 border border-teal-600/60 rounded-xl p-6 space-y-4 relative overflow-hidden group shadow-xl">
            <div className="absolute top-0 right-0 bg-teal-950/90 border-b border-l border-teal-700/80 px-3 py-1 rounded-bl-lg text-[11px] font-mono text-teal-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
              <span>GeoLabel Precision Engine</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
              <h3 className="text-lg font-bold text-white">Topologically Clean Native Spatial Vectors</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Every image remains in native CRS (EPSG:4326 / EPSG:3857 / UTM). Annotations undergo automated topology checks guaranteeing orthogonal building corners, snapped shared borders, and zero sliver gaps.
            </p>

            {/* Visual Success Diagram */}
            <div className="relative h-36 bg-slate-900 rounded-lg border border-teal-800/50 overflow-hidden flex items-center justify-center">
              <svg className="w-full h-full opacity-80" xmlns="http://www.w3.org/2000/svg">
                {/* Crisp Snapped Polygons */}
                <polygon points="30,25 160,25 160,105 30,105" fill="rgba(62, 109, 99, 0.3)" stroke="#3E6D63" strokeWidth="2" />
                <polygon points="160,25 290,25 290,105 160,105" fill="rgba(16, 185, 129, 0.25)" stroke="#10B981" strokeWidth="2" />
                {/* Snapped vertices */}
                <circle cx="160" cy="25" r="3.5" fill="#10B981" />
                <circle cx="160" cy="105" r="3.5" fill="#10B981" />
              </svg>
              <div className="absolute top-2 left-2 bg-teal-950/90 text-teal-300 border border-teal-700 px-2 py-0.5 rounded text-[10px] font-mono">
                PASS: Orthogonal Corners & Shared Edge Snapping
              </div>
              <div className="absolute bottom-2 right-2 bg-slate-950 text-teal-300 px-2 py-0.5 rounded text-[10px] font-mono border border-teal-800">
                EPSG:4326 Native
              </div>
            </div>

            <ul className="space-y-2 text-xs text-slate-300 font-mono pt-1">
              <li className="flex items-center gap-2 text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                <span>Direct import into QGIS, PostGIS & ESRI Enterprise GeoDB</span>
              </li>
              <li className="flex items-center gap-2 text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                <span>Domain-trained GIS analysts (B.Tech Surveying & Geoinformatics)</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Detailed Comparative Matrix Tabs */}
        <div className="mt-16 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="bg-slate-900/90 px-6 py-4 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">Geospatial Platform Comparison Matrix</h3>
              <p className="text-xs text-slate-400">Comparing technical capability, spatial integrity, and team expertise</p>
            </div>
            <div className="text-xs font-mono text-teal-400 bg-teal-950/80 px-3 py-1 rounded border border-teal-800">
              AUDITED SLA // ISO 27001 READY
            </div>
          </div>

          <div className="divide-y divide-slate-800/80">
            {COMPARISON_POINTS.map((point, index) => (
              <div
                key={point.feature}
                className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start hover:bg-slate-900/40 transition-colors"
              >
                <div className="md:col-span-3 space-y-1">
                  <span className="text-[10px] font-mono text-teal-400 tracking-wider">CRITERIA {index + 1}</span>
                  <h4 className="text-sm font-bold text-white">{point.feature}</h4>
                  <div className="text-[11px] text-slate-400 pt-1 font-mono">{point.impact}</div>
                </div>

                <div className="md:col-span-4 bg-red-950/20 border border-red-900/30 p-3.5 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 font-mono">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Generic Crowdsourced Platforms</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{point.genericPlatforms}</p>
                </div>

                <div className="md:col-span-5 bg-teal-950/30 border border-teal-700/50 p-3.5 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-300 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>GeoLabel Specialist Approach</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{point.geoLabelApproach}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};
