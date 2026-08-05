import React, { useState } from 'react';
import { Award, Building2, CheckCircle, ArrowRight, Star, TrendingUp, ShieldCheck, Zap, Globe, FileText } from 'lucide-react';

interface CaseStudy {
  id: string;
  clientType: string;
  industry: string;
  title: string;
  challenge: string;
  solution: string;
  results: {
    metric1: string;
    label1: string;
    metric2: string;
    label2: string;
  };
  testimonial: {
    quote: string;
    author: string;
    role: string;
  };
  tags: string[];
}

const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'solar-utility',
    clientType: 'Fortune 500 Clean Energy Operator',
    industry: 'Renewable Infrastructure',
    title: 'Rapid 1,800 km² Solar PV Panel Vectorization with Sub-10cm Precision',
    challenge: 'Offshore crowdsourced annotators produced sloppy, non-orthogonal polygons that failed automated solar panel tilt angle & capacity algorithms.',
    solution: 'Deployed a dedicated 8-person GeoLabel Pod with automated 90° corner squaring and COCO oriented bounding box (OBB) export formatting.',
    results: {
      metric1: '4.5x',
      label1: 'Faster Delivery than In-House',
      metric2: '99.4%',
      label2: 'IoU Annotation SLA',
    },
    testimonial: {
      quote: "GeoLabel's dedicated GIS pod delivered clean, perfectly orthogonalized solar panel vectors with zero topology errors. Our ML model training converged twice as fast.",
      author: 'VP of Spatial Analytics',
      role: 'Global Renewable Energy Utility',
    },
    tags: ['Solar PV', 'OBB Vector', 'Sub-10cm Aerial'],
  },
  {
    id: 'defense-sar',
    clientType: 'Defense & Aerospace Systems Integrator',
    industry: 'Defense & Intelligence',
    title: 'Air-Gapped SAR Maritime Vessel Classification across 50,000 Radar Scenes',
    challenge: 'Strict ITAR regulations prohibited sending Sentinel-1 & ICEYE Synthetic Aperture Radar feeds outside private cloud boundaries.',
    solution: 'Provisioned an air-gapped GeoLabel annotation pod inside AWS GovCloud with multi-factor biometric workstation VDIs.',
    results: {
      metric1: '50,000+',
      label1: 'SAR Targets Tagged',
      metric2: '0',
      label2: 'Data Spill Violations',
    },
    testimonial: {
      quote: "Working in an air-gapped GovCloud setup was seamless with GeoLabel. Their team understands defense CRS projections and radar incidence angles better than any vendor we tested.",
      author: 'Director of Geospatial Intelligence',
      role: 'Defense Systems Integrator',
    },
    tags: ['SAR Radar', 'Air-Gapped GovCloud', 'Defense'],
  },
  {
    id: 'urban-muni',
    clientType: 'Metropolitan Planning Commission',
    industry: 'Smart City & Municipal GIS',
    title: '120,000 Building Footprints Regularized with 90° Corner Squaring',
    challenge: 'Raw machine learning outputs had jagged edges and overlapping parcel boundaries that violated municipal GIS database schemas.',
    solution: 'GeoLabel analysts executed automated topological cleaning, vertex snapping, and 90° orthogonality regularization.',
    results: {
      metric1: '120,000',
      label1: 'Building Footprints Cleaned',
      metric2: '100%',
      label2: 'Zero Overlap Verification',
    },
    testimonial: {
      quote: "The zero-overlap guarantee was real. We ingested all 120,000 footprints directly into PostGIS without a single topological error flag.",
      author: 'Chief Enterprise Architect',
      role: 'Regional Spatial Authority',
    },
    tags: ['Building Footprints', 'PostGIS Ready', 'Orthogonality'],
  },
  {
    id: 'ag-canopy',
    clientType: 'AgTech Machine Learning Scale-up',
    industry: 'Precision Agriculture',
    title: '4,000 km² Multispectral Crop Health & Irrigation Masking',
    challenge: 'Seasonal vegetation shifts required rapid turnarounds on NDVI multi-band polygon extraction to catch drought stress windows.',
    solution: 'Scalable 12-analyst pod operating in shifts delivered daily batch processing of 5-band Rapideye & PlanetScope tiles.',
    results: {
      metric1: '48 Hours',
      label1: 'Turnaround for 4,000 km²',
      metric2: '98.6%',
      label2: 'Vegetation Boundary Precision',
    },
    testimonial: {
      quote: "GeoLabel's ability to handle multi-band NIR/NDVI channels directly in native EPSG projections saved our engineering team weeks of preprocessing.",
      author: 'Head of Computer Vision',
      role: 'Precision Ag Tech Enterprise',
    },
    tags: ['NDVI Bands', 'Multi-Spectral', 'AgTech'],
  },
];

export const CaseStudies: React.FC = () => {
  const [activeId, setActiveId] = useState<string>(CASE_STUDIES[0].id);

  const selectedStudy = CASE_STUDIES.find((cs) => cs.id === activeId) || CASE_STUDIES[0];

  return (
    <section id="case-studies" className="py-20 bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Award className="w-3.5 h-3.5" />
            <span>Enterprise Case Studies & Metrics</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Proven Results for Geospatial AI Leaders
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Discover how global utilities, defense contractors, and municipal planning leads use GeoLabel to scale high-accuracy spatial model training.
          </p>
        </div>

        {/* Navigation Selector Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {CASE_STUDIES.map((study) => (
            <button
              key={study.id}
              onClick={() => setActiveId(study.id)}
              className={`p-4 rounded-xl text-left transition-all border ${
                activeId === study.id
                  ? 'bg-teal-950/90 border-teal-500 shadow-lg'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[10px] font-mono text-teal-400 block uppercase font-semibold">
                {study.industry}
              </span>
              <span className="text-xs font-bold text-white block mt-1 line-clamp-1">
                {study.clientType}
              </span>
            </button>
          ))}
        </div>

        {/* Selected Case Study Detail Card */}
        <div className="bg-slate-950 p-6 sm:p-10 rounded-2xl border border-slate-800 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Details */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-teal-950 text-teal-300 border border-teal-800 rounded-lg text-xs font-mono font-bold">
                {selectedStudy.industry}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Client: <strong>{selectedStudy.clientType}</strong>
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug">
              {selectedStudy.title}
            </h3>

            {/* Problem / Solution Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-xs font-mono text-rose-400 font-bold block mb-1">THE CHALLENGE</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedStudy.challenge}
                </p>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-xs font-mono text-teal-400 font-bold block mb-1">GEOLABEL SOLUTION</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedStudy.solution}
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedStudy.tags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 text-[11px] bg-slate-900 text-slate-300 border border-slate-800 rounded-lg font-mono">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right Metrics & Testimonial Box */}
          <div className="lg:col-span-5 bg-slate-900 border border-teal-800/80 rounded-2xl p-6 space-y-6 shadow-xl">
            
            {/* Key Outcomes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                <div className="text-3xl font-extrabold text-teal-400 font-mono">
                  {selectedStudy.results.metric1}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {selectedStudy.results.label1}
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                <div className="text-3xl font-extrabold text-emerald-400 font-mono">
                  {selectedStudy.results.metric2}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {selectedStudy.results.label2}
                </div>
              </div>
            </div>

            {/* Testimonial Quote */}
            <div className="bg-slate-950/80 p-5 rounded-xl border border-slate-800 space-y-3 relative">
              <div className="flex items-center gap-1 text-amber-400">
                <Star className="w-4 h-4 fill-amber-400" />
                <Star className="w-4 h-4 fill-amber-400" />
                <Star className="w-4 h-4 fill-amber-400" />
                <Star className="w-4 h-4 fill-amber-400" />
                <Star className="w-4 h-4 fill-amber-400" />
              </div>

              <p className="text-xs text-slate-200 italic leading-relaxed">
                "{selectedStudy.testimonial.quote}"
              </p>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">
                    {selectedStudy.testimonial.author}
                  </div>
                  <div className="text-[10px] text-teal-400 font-mono">
                    {selectedStudy.testimonial.role}
                  </div>
                </div>
                <ShieldCheck className="w-5 h-5 text-teal-400" />
              </div>
            </div>

            <a
              href="#quote-section"
              className="w-full py-3 px-4 bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs rounded-xl border border-teal-500/80 shadow transition-all flex items-center justify-center gap-2 group text-center"
            >
              <span>Request Similar Project SLA</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>

          </div>

        </div>

      </div>
    </section>
  );
};
