import React, { useState } from 'react';
import { DollarSign, Users, Clock, ShieldCheck, ArrowRight, TrendingUp, CheckCircle, Award } from 'lucide-react';

export const EnterpriseRoiCalculator: React.FC = () => {
  const [annotatorCount, setAnnotatorCount] = useState<number>(5);
  const [avgSalary, setAvgSalary] = useState<number>(75000); // annual salary per annotator
  const [toolingCost, setToolingCost] = useState<number>(24000); // annual CVAT / Labelbox licenses
  const [qaLeadSalary, setQaLeadSalary] = useState<number>(95000); // Senior GIS Lead QA

  // In-House Cost Calculation
  const inHouseSalaries = annotatorCount * avgSalary;
  const inHouseBenefitsOverhead = inHouseSalaries * 0.25; // 25% health/taxes/benefits
  const inHouseRecruitmentCost = annotatorCount * 8000; // one-time recruitment/onboarding
  const inHouseTotalYear1 = inHouseSalaries + inHouseBenefitsOverhead + toolingCost + qaLeadSalary + inHouseRecruitmentCost;

  // GeoLabel Pod Cost Calculation (Outsourced Pod rate based on volume equivalent)
  // GeoLabel provides dedicated team at ~35-40% lower TCO without management burden
  const geoLabelAnnualCost = Math.round(inHouseTotalYear1 * 0.58);
  const totalSavingsAnnual = inHouseTotalYear1 - geoLabelAnnualCost;
  const savingsPercent = Math.round((totalSavingsAnnual / inHouseTotalYear1) * 100);

  const formatUsd = (val: number) => `$${val.toLocaleString()}`;

  return (
    <section id="roi-calculator" className="py-20 bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Financial TCO & ROI Model</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            In-House Team vs. GeoLabel Dedicated Pod
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Compare the total cost of ownership (TCO) of hiring, training, and managing an internal GIS annotation team versus launching an SLA-guaranteed GeoLabel Pod.
          </p>
        </div>

        {/* Calculator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-950 p-6 sm:p-10 rounded-2xl border border-slate-800 shadow-2xl">
          
          {/* Left Inputs Column */}
          <div className="lg:col-span-7 space-y-6">
            
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Users className="w-5 h-5 text-teal-400" />
              <span>In-House Team Assumptions</span>
            </h3>

            {/* Annotators Slider */}
            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <label className="text-slate-200 font-semibold">GIS Annotators Needed:</label>
                <span className="font-mono text-teal-400 font-bold text-base">{annotatorCount} Full-Time Personnel</span>
              </div>
              <input
                type="range"
                min="2"
                max="25"
                step="1"
                value={annotatorCount}
                onChange={(e) => setAnnotatorCount(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1">
                <span>2 Techs</span>
                <span>10 Techs</span>
                <span>25 Techs (Large Scale)</span>
              </div>
            </div>

            {/* Average Salary Input */}
            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <label className="text-slate-200 font-semibold">Average Annotator Salary (Annual):</label>
                <span className="font-mono text-teal-400 font-bold text-base">{formatUsd(avgSalary)}/yr</span>
              </div>
              <input
                type="range"
                min="50000"
                max="120000"
                step="5000"
                value={avgSalary}
                onChange={(e) => setAvgSalary(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Annual Tooling & Software Licenses */}
            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <label className="text-slate-200 font-semibold">GIS Tooling & Software Licenses (Annual):</label>
                <span className="font-mono text-teal-400 font-bold text-base">{formatUsd(toolingCost)}/yr</span>
              </div>
              <input
                type="range"
                min="5000"
                max="60000"
                step="2500"
                value={toolingCost}
                onChange={(e) => setToolingCost(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Senior QA Lead Overhead */}
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-white flex items-center justify-between">
                <span>Includes 1 Senior GIS QA Lead:</span>
                <span className="font-mono text-teal-400">{formatUsd(qaLeadSalary)}/yr</span>
              </div>
              <p className="text-slate-400">
                Required for topology linting, projection verification, and quality audit checks.
              </p>
            </div>

          </div>

          {/* Right Comparison Results Column */}
          <div className="lg:col-span-5 bg-slate-900 border border-teal-800/80 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-6">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-mono text-teal-400 uppercase tracking-wider font-semibold">
                  Annual Cost Breakdown
                </span>
                <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-mono font-bold">
                  {savingsPercent}% TCO SAVINGS
                </span>
              </div>

              {/* In-House Total */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block font-mono">Estimated In-House Year 1 Total:</span>
                <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">
                  {formatUsd(inHouseTotalYear1)}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Includes recruitment, benefits, software licenses, and management overhead.
                </div>
              </div>

              {/* GeoLabel Pod Total */}
              <div className="bg-teal-950/60 p-4 rounded-xl border border-teal-700/80">
                <span className="text-xs text-teal-300 block font-mono font-bold">GeoLabel Dedicated Pod Rate:</span>
                <div className="text-3xl font-extrabold text-teal-300 font-mono mt-1">
                  {formatUsd(geoLabelAnnualCost)} <span className="text-xs font-normal text-teal-400">/ yr</span>
                </div>
                <div className="text-[10px] text-teal-200/80 mt-1">
                  Includes senior GIS QA lead, custom CVAT instance, and SLA IoU guarantee.
                </div>
              </div>

              {/* Net Annual Savings Card */}
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl space-y-1">
                <span className="text-xs text-emerald-300 font-mono block font-bold flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Net Annual Capital Savings:
                </span>
                <div className="text-2xl font-extrabold text-emerald-300 font-mono">
                  {formatUsd(totalSavingsAnnual)} <span className="text-xs font-normal">({savingsPercent}% saved)</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-300 pt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Onboarding Time: <strong>48 Hours</strong> vs. 3 Months hiring</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Zero Management Burden or Turnover Risk</span>
                </div>
              </div>

            </div>

            <a
              href="#quote-section"
              className="mt-6 w-full py-3.5 px-4 bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs rounded-xl border border-teal-500/80 shadow-lg transition-all flex items-center justify-center gap-2 group text-center"
            >
              <span>Lock In Dedicated Pod Pricing</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>

          </div>

        </div>

      </div>
    </section>
  );
};
