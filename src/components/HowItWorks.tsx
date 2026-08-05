import React from 'react';
import { HOW_IT_WORKS_STEPS } from '../data/geospatialData';
import {
  FileCode2,
  Sliders,
  ShieldCheck,
  Truck,
  ArrowRight,
  CheckCircle2,
  Clock,
  CheckSquare
} from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const getStepIcon = (iconName: string) => {
    switch (iconName) {
      case 'FileCode2':
        return <FileCode2 className="w-5 h-5 text-teal-400" />;
      case 'Sliders':
        return <Sliders className="w-5 h-5 text-teal-400" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-5 h-5 text-teal-400" />;
      case 'Truck':
        return <Truck className="w-5 h-5 text-teal-400" />;
      default:
        return <CheckSquare className="w-5 h-5 text-teal-400" />;
    }
  };

  return (
    <section id="how-it-works" className="py-20 bg-slate-950 border-b border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            <span>RIGOROUS PIPELINE</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            How GeoLabel Delivers Production Data
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            A structured four-step process designed to eliminate edge-case ambiguities and ensure your machine learning models receive clean, ground-truth labels.
          </p>
        </div>

        {/* 4-Step Process Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div
              key={step.stepNumber}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 relative flex flex-col justify-between hover:border-teal-700/60 transition-colors group"
            >
              {/* Step Number Badge */}
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-teal-950/80 border border-teal-700/60 flex items-center justify-center">
                  {getStepIcon(step.icon)}
                </div>

                <span className="text-2xl font-extrabold font-mono text-teal-500/40 group-hover:text-teal-400 transition-colors">
                  0{step.stepNumber}
                </span>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-bold text-white group-hover:text-teal-300 transition-colors">
                  {step.title}
                </h3>
                <p className="text-xs text-teal-400 font-mono">{step.subtitle}</p>
                <p className="text-xs text-slate-300 leading-relaxed pt-1">
                  {step.description}
                </p>
              </div>

              {/* Step Details List */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">
                  Key Actions & SLAs
                </span>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {step.details.map((detail, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] leading-snug">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Step Deliverables */}
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 block">DELIVERABLES:</span>
                <div className="text-[11px] font-mono text-teal-300">
                  {step.deliverables.join(' • ')}
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* Process Guarantee Banner */}
        <div className="bg-teal-950/40 border border-teal-700/60 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white">Need a custom annotation taxonomy or non-standard CRS?</h4>
            <p className="text-xs text-slate-300">
              Our GIS engineering leads co-write annotation guidelines with your ML team before a single frame is processed.
            </p>
          </div>
          <a
            href="#quote-section"
            className="px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-lg transition-colors whitespace-nowrap"
          >
            Schedule Scoping Call
          </a>
        </div>

      </div>
    </section>
  );
};
