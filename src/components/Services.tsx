import React, { useState } from 'react';
import { GEO_SERVICES } from '../data/geospatialData';
import { ServiceCategory } from '../types';
import {
  Cpu,
  Map,
  Building2,
  Sprout,
  ShieldAlert,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FileCode,
  Layers,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Code2,
  Tag
} from 'lucide-react';

interface ServicesProps {
  onSelectCategoryForQuote: (categoryId: string) => void;
  onOpenStudioWithSample?: (demoId: string) => void;
}

export const Services: React.FC<ServicesProps> = ({ onSelectCategoryForQuote, onOpenStudioWithSample }) => {
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>('ai-ml-training');

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Cpu':
        return <Cpu className="w-5 h-5 text-teal-400" />;
      case 'Map':
        return <Map className="w-5 h-5 text-teal-400" />;
      case 'Building2':
        return <Building2 className="w-5 h-5 text-teal-400" />;
      case 'Sprout':
        return <Sprout className="w-5 h-5 text-teal-400" />;
      case 'ShieldAlert':
        return <ShieldAlert className="w-5 h-5 text-teal-400" />;
      case 'TrendingUp':
        return <TrendingUp className="w-5 h-5 text-teal-400" />;
      default:
        return <Layers className="w-5 h-5 text-teal-400" />;
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedCategoryId === id) {
      setExpandedCategoryId(null);
    } else {
      setExpandedCategoryId(id);
    }
  };

  return (
    <section id="services" className="py-20 bg-slate-950 border-b border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            <span>SPECIALIZED DOMAIN SERVICES</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Geospatial Annotation Capabilities
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Six tailored annotation tracks for satellite, drone, multispectral, and SAR radar imagery. Click any category card to expand annotation taxonomies, schema examples, and supported exports.
          </p>
        </div>

        {/* 6 Category Cards Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GEO_SERVICES.map((service) => {
            const isExpanded = expandedCategoryId === service.id;

            return (
              <div
                key={service.id}
                className={`bg-slate-900 border transition-all duration-300 rounded-xl overflow-hidden flex flex-col ${
                  isExpanded
                    ? 'border-teal-500 shadow-xl shadow-teal-950/40 ring-1 ring-teal-500/50 lg:col-span-3 md:col-span-2'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                {/* Collapsed Header View */}
                <div
                  onClick={() => toggleExpand(service.id)}
                  className="p-6 cursor-pointer space-y-4 flex-1 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-lg bg-teal-950/80 border border-teal-700/60 flex items-center justify-center">
                        {getIcon(service.iconName)}
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono text-teal-300 bg-teal-950 border border-teal-800">
                        {service.sampleStats.typicalAccuracy}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors">
                        {service.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{service.subtitle}</p>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {service.description}
                    </p>
                  </div>

                  {/* Tags Preview */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {service.annotationTypes.slice(0, 2).map((type) => (
                        <span key={type} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {type}
                        </span>
                      ))}
                      {service.annotationTypes.length > 2 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          +{service.annotationTypes.length - 2}
                        </span>
                      )}
                    </div>

                    <button className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 font-mono">
                      <span>{isExpanded ? 'Collapse' : 'Expand Schema'}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="bg-slate-950 p-6 border-t border-teal-800/60 animate-in fade-in slide-in-from-top-2 space-y-6">
                    
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      
                      {/* Left: Detailed Key Use Cases */}
                      <div className="lg:col-span-6 space-y-4">
                        <div>
                          <h4 className="text-xs font-mono text-teal-400 tracking-wider">ANNOTATION USE CASES</h4>
                          <h5 className="text-sm font-bold text-white mt-1">Specific Tasks & Feature Extraction</h5>
                        </div>

                        <ul className="space-y-2.5">
                          {service.keyUseCases.map((useCase) => (
                            <li key={useCase} className="flex items-start gap-2.5 text-xs text-slate-300">
                              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{useCase}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="pt-2">
                          <span className="text-xs font-mono text-slate-400 block mb-2">SUPPORTED EXPORT FORMATS:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {service.supportedFormats.map((fmt) => (
                              <span key={fmt} className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-teal-300">
                                {fmt}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Taxonomy Schema & Code Attribute Preview */}
                      <div className="lg:col-span-6 space-y-4">
                        <div>
                          <h4 className="text-xs font-mono text-teal-400 tracking-wider">TAXONOMY SCHEMA SAMPLE</h4>
                          <h5 className="text-sm font-bold text-white mt-1">{service.taxonomyExample.label}</h5>
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-300 space-y-2">
                          <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-slate-800">
                            <span>ATTRIBUTE TAXONOMY SPECS</span>
                            <span className="text-teal-400">JSON ATTRIBUTE TREE</span>
                          </div>
                          
                          {Object.entries(service.taxonomyExample.attributes).map(([key, val]) => (
                            <div key={key} className="flex items-center justify-between py-0.5">
                              <span className="text-teal-400">{key}:</span>
                              <span className="text-slate-200 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                "{val}"
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="bg-teal-950/40 border border-teal-800/60 p-3 rounded-lg flex items-center justify-between text-xs font-mono text-teal-300">
                          <span>TYPICAL VOLUME CAPACITY:</span>
                          <span className="font-bold text-white">{service.sampleStats.sampleVolume}</span>
                        </div>
                      </div>

                    </div>

                    {/* Bottom CTA Action for expanded card */}
                    <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs text-slate-400 font-mono">
                        Guaranteed SLA: <span className="text-teal-300 font-semibold">{service.sampleStats.typicalAccuracy}</span> across all delivery batches
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                          onClick={() => onSelectCategoryForQuote(service.id)}
                          className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-md transition-colors flex items-center justify-center gap-2"
                        >
                          <span>Scope {service.title} Quote</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
