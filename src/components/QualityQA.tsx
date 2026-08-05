import React from 'react';
import { QUALITY_METRICS } from '../data/geospatialData';
import {
  ShieldCheck,
  Target,
  CheckCircle2,
  Layers,
  GraduationCap,
  GitPullRequest,
  AlertOctagon,
  FileSpreadsheet,
  Activity
} from 'lucide-react';

export const QualityQA: React.FC = () => {
  const getQualityIcon = (iconName: string) => {
    switch (iconName) {
      case 'Target':
        return <Target className="w-5 h-5 text-teal-400" />;
      case 'CheckCircle2':
        return <CheckCircle2 className="w-5 h-5 text-teal-400" />;
      case 'Layers':
        return <Layers className="w-5 h-5 text-teal-400" />;
      case 'GraduationCap':
        return <GraduationCap className="w-5 h-5 text-teal-400" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-teal-400" />;
    }
  };

  return (
    <section id="quality" className="py-20 bg-slate-900 border-b border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>CODIFIED QA RIGOR</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Engineering Precision Ground Truth
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            We don’t rely on crowdsourced guesswork. Every dataset passes through automated spatial validation scripts, dual-pass consensus audits, and senior GIS auditor sign-off.
          </p>
        </div>

        {/* 4 Quality SLA Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {QUALITY_METRICS.map((metric) => (
            <div
              key={metric.title}
              className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-3 relative overflow-hidden group hover:border-teal-700/60 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-teal-950/80 border border-teal-700/60 flex items-center justify-center">
                  {getQualityIcon(metric.icon)}
                </div>
                <span className="text-xs font-mono text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800">
                  {metric.unit}
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white font-mono group-hover:text-teal-300 transition-colors">
                  {metric.value}
                </div>
                <h3 className="text-sm font-bold text-slate-200 mt-0.5">{metric.title}</h3>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
                {metric.description}
              </p>
            </div>
          ))}
        </div>

        {/* Deep Dive QA Pillars: Ground Truth, Escalations, Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-teal-400 font-mono text-xs">
              <Target className="w-4 h-4" />
              <span>NAMED GROUND-TRUTH SOURCES</span>
            </div>
            <h3 className="text-base font-bold text-white">Cadastral & Ground Calibration</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              When labeling complex boundaries, our GIS leads cross-reference authoritative cadastral surveys, OpenStreetMap vector basemaps, and ground-truth GCP points to resolve ambiguous tree canopies or property lines.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-teal-400 font-mono text-xs">
              <GitPullRequest className="w-4 h-4" />
              <span>DISAGREEMENT ESCALATION</span>
            </div>
            <h3 className="text-base font-bold text-white">Dual-Pass Disagreement Protocols</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              If Annotator A and Annotator B differ by &gt;5% in polygon area or IoU, the sample is automatically escalated to a Senior GIS Auditor (B.Tech Surveying background) for binding resolution.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-teal-400 font-mono text-xs">
              <Activity className="w-4 h-4" />
              <span>REAL-TIME AUDIT DASHBOARD</span>
            </div>
            <h3 className="text-base font-bold text-white">Trackable Quality Analytics</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              ML Leads receive live metrics tracking IoU distributions, class confusion matrices, and topological validation pass rates per delivery batch in our client portal.
            </p>
          </div>

        </div>

      </div>
    </section>
  );
};
