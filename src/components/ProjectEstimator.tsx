import React, { useState } from 'react';
import { Calculator, Users, Clock, ShieldCheck, ArrowRight, CheckCircle, Sparkles, Building2, Save, BookmarkCheck } from 'lucide-react';
import { savePodEstimateRecord } from '../utils/storage';

interface ProjectEstimatorProps {
  onApplyToQuote?: (scopeDetails: {
    volume: string;
    accuracy: string;
    budget: string;
    description: string;
  }) => void;
}

export const ProjectEstimator: React.FC<ProjectEstimatorProps> = ({ onApplyToQuote }) => {
  const [areaSqKm, setAreaSqKm] = useState<number>(250);
  const [objectDensity, setObjectDensity] = useState<'sparse' | 'medium' | 'dense'>('medium');
  const [resolutionGsd, setResolutionGsd] = useState<'high' | 'ultra' | 'medium'>('high');
  const [qualityTier, setQualityTier] = useState<'standard' | 'gold'>('standard');
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  // Multipliers for calculations
  const densityMultiplier = objectDensity === 'sparse' ? 0.6 : objectDensity === 'medium' ? 1.0 : 1.8;
  const resolutionMultiplier = resolutionGsd === 'ultra' ? 1.5 : resolutionGsd === 'high' ? 1.0 : 0.7;
  const qualityMultiplier = qualityTier === 'gold' ? 1.4 : 1.0;

  // Total Estimated Hours
  const baseHours = (areaSqKm * 0.15) * densityMultiplier * resolutionMultiplier * qualityMultiplier;
  const estimatedHours = Math.round(Math.max(15, baseHours));
  
  // Turnaround Days with 3-person pod
  const podSize = areaSqKm > 1000 ? 6 : areaSqKm > 300 ? 4 : 2;
  const turnaroundDays = Math.ceil(estimatedHours / (podSize * 7));

  // Estimated Cost Bracket
  const estMinCost = Math.round(estimatedHours * 35);
  const estMaxCost = Math.round(estimatedHours * 48);

  const formatCost = (val: number) => {
    return `$${val.toLocaleString()}`;
  };

  const handleSaveEstimate = () => {
    savePodEstimateRecord({
      podSize,
      imageryType: `${resolutionGsd} (${objectDensity} density)`,
      areaKm2: areaSqKm,
      estimatedHours,
      monthlyCostUsd: estMaxCost,
    });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  const handleTransferToQuote = () => {
    const scopeStr = `${areaSqKm} sq km (${objectDensity} density, ${
      resolutionGsd === 'ultra' ? '<10cm' : resolutionGsd === 'high' ? '15-30cm' : '30cm+'
    } GSD)`;

    const budgetStr = estMaxCost < 5000 ? '< $5,000' : estMaxCost < 25000 ? '$5,000 - $25,000' : estMaxCost < 100000 ? '$25,000 - $100,000' : '> $100,000';

    const slaStr = qualityTier === 'gold' ? '≥ 0.95 IoU SLA' : '≥ 0.88 IoU SLA';

    const descStr = `Project Scope Estimate: ${areaSqKm} sq km survey area. Object density: ${objectDensity}. Resolution: ${resolutionGsd}. Quality SLA: ${qualityTier === 'gold' ? '99.5% Gold Double-Blind QA' : '95% Standard Single-Pass QA'}. Estimated workload: ~${estimatedHours} annotator hours.`;

    if (onApplyToQuote) {
      onApplyToQuote({
        volume: scopeStr,
        accuracy: slaStr,
        budget: budgetStr,
        description: descStr,
      });
    } else {
      const quoteElem = document.getElementById('quote-section');
      if (quoteElem) {
        quoteElem.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section id="estimator" className="py-20 bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Calculator className="w-3.5 h-3.5" />
            <span>Interactive Pod Sizing & Estimator</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Estimate Your Annotation Pod & SLA
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Adjust area volume, object density, and spatial resolution to calculate dedicated GIS pod staffing, turnaround timeline, and projected budget bracket.
          </p>
        </div>

        {/* Estimator Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-950 p-6 sm:p-10 rounded-2xl border border-slate-800 shadow-2xl">
          
          {/* Left Column: Sliders & Controls */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Area Slider */}
            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <label className="text-slate-200 font-semibold flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-teal-400" /> Survey Area (Square Kilometers):
                </label>
                <span className="font-mono text-teal-400 font-bold text-base">{areaSqKm.toLocaleString()} sq km</span>
              </div>
              <input
                type="range"
                min="10"
                max="2500"
                step="10"
                value={areaSqKm}
                onChange={(e) => setAreaSqKm(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1">
                <span>10 km² (Pilot)</span>
                <span>500 km² (City)</span>
                <span>2,500 km² (Regional Campaign)</span>
              </div>
            </div>

            {/* Object Density Selector */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-2">Target Feature Density:</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setObjectDensity('sparse')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    objectDensity === 'sparse'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block">Sparse Rural</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Agriculture, Forests, Open Terrain</span>
                </button>

                <button
                  type="button"
                  onClick={() => setObjectDensity('medium')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    objectDensity === 'medium'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block">Suburban Mixed</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Residential Roofs, Roads, Solar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setObjectDensity('dense')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    objectDensity === 'dense'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block">Dense Urban</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">High-rise Buildings, Complex Infrastructure</span>
                </button>
              </div>
            </div>

            {/* Resolution GSD Selector */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-2">Imagery Spatial Resolution (GSD):</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setResolutionGsd('medium')}
                  className={`p-2.5 rounded-xl text-xs font-mono border transition-all ${
                    resolutionGsd === 'medium'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  30cm+ GSD (Satellite)
                </button>

                <button
                  type="button"
                  onClick={() => setResolutionGsd('high')}
                  className={`p-2.5 rounded-xl text-xs font-mono border transition-all ${
                    resolutionGsd === 'high'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  15cm - 30cm GSD (High-Res)
                </button>

                <button
                  type="button"
                  onClick={() => setResolutionGsd('ultra')}
                  className={`p-2.5 rounded-xl text-xs font-mono border transition-all ${
                    resolutionGsd === 'ultra'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  &lt; 10cm GSD (Aerial/Drone)
                </button>
              </div>
            </div>

            {/* Quality SLA Tier */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-2">Quality & QA Protocol SLA:</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setQualityTier('standard')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    qualityTier === 'standard'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>95% Standard SLA</span>
                    <span className="text-[10px] font-mono text-teal-400">IoU ≥ 0.88</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Senior GIS lead single-pass review + topology automated linting.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setQualityTier('gold')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    qualityTier === 'gold'
                      ? 'bg-teal-950/80 border-teal-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>99.5% Gold SLA</span>
                    <span className="text-[10px] font-mono text-teal-400">IoU ≥ 0.95</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Double-blind dual-annotation consensus + 100% lead audit.
                  </div>
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Calculated Pod Results */}
          <div className="lg:col-span-5 bg-slate-900 border border-teal-800/80 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-mono text-teal-400 uppercase tracking-wider font-semibold">
                  Calculated Pod Recommendation
                </span>
                <span className="px-2 py-0.5 text-[10px] bg-teal-950 text-teal-300 border border-teal-800 rounded font-mono">
                  SLA SCOPED
                </span>
              </div>

              {/* Estimated Workload */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />
                    <span>Est. Label Hours:</span>
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">
                    ~{estimatedHours} <span className="text-xs font-normal text-slate-400">hrs</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Users className="w-3.5 h-3.5 text-teal-400" />
                    <span>Est. Turnaround:</span>
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">
                    ~{turnaroundDays} <span className="text-xs font-normal text-slate-400">days</span>
                  </div>
                </div>
              </div>

              {/* Recommended Pod Structure */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-mono text-teal-400 block uppercase">Recommended Team Pod</span>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-400" />
                  <span>{podSize} Dedicated GIS Analysts + 1 Senior QA Lead</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Includes full-time GIS workflow manager, EPSG topology verifier, and custom export packaging in your target schema.
                </p>
              </div>

              {/* Price Bracket Estimate */}
              <div className="bg-teal-950/40 border border-teal-800/80 p-4 rounded-xl space-y-1">
                <span className="text-xs text-slate-400 block font-mono">Projected Budget Bracket:</span>
                <div className="text-2xl font-extrabold text-teal-300 font-mono">
                  {formatCost(estMinCost)} – {formatCost(estMaxCost)}
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Includes pilot test batch, dataset quality guarantee, and post-delivery revision guarantee.
                </span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleSaveEstimate}
                className="py-3 px-3 bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                title="Save this estimate to browser memory"
              >
                {savedFeedback ? (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-emerald-400" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-teal-400" />
                    <span>Save to Memory</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleTransferToQuote}
                className="flex-1 py-3 px-4 bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs rounded-xl border border-teal-500/80 shadow-lg transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Apply Metrics to Quote Request</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
