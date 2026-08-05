import React, { useState } from 'react';
import {
  Briefcase,
  DollarSign,
  UserCheck,
  Target,
  GraduationCap,
  ShieldCheck,
  Award,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  FileText,
  Building2,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';

export const CommercialStrategy: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pricing' | 'recruitment' | 'gtm'>('pricing');

  return (
    <section id="commercial-strategy" className="py-20 bg-slate-950 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Commercial Operations & Scaling Blueprint</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Commercial Strategy & Operational Execution
          </h2>
          <p className="text-base text-slate-300 leading-relaxed">
            Transparent enterprise pricing structures, rigorous 5-stage GIS analyst vetting pipeline, and a systematic 90-day execution roadmap to land our initial anchor clients.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 bg-slate-900 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('pricing')}
              className={`px-5 py-2.5 text-xs font-mono font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'pricing'
                  ? 'bg-teal-700 text-white shadow-lg border border-teal-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <DollarSign className="w-4 h-4 text-teal-400" />
              <span>1. Commercial Pricing Model</span>
            </button>

            <button
              onClick={() => setActiveTab('recruitment')}
              className={`px-5 py-2.5 text-xs font-mono font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'recruitment'
                  ? 'bg-teal-700 text-white shadow-lg border border-teal-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4 text-teal-400" />
              <span>2. Annotator Vetting Pipeline</span>
            </button>

            <button
              onClick={() => setActiveTab('gtm')}
              className={`px-5 py-2.5 text-xs font-mono font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'gtm'
                  ? 'bg-teal-700 text-white shadow-lg border border-teal-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Target className="w-4 h-4 text-teal-400" />
              <span>3. Go-to-Market & Landing 1st Client</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Pricing Models */}
        {activeTab === 'pricing' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Card 1: Dedicated GIS Pod */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between space-y-6 hover:border-teal-600 transition-all shadow-xl relative">
              <div className="space-y-4">
                <span className="px-3 py-1 text-[10px] font-mono font-bold bg-teal-950 text-teal-300 border border-teal-800 rounded-full inline-block">
                  MOST POPULAR FOR ENTERPRISE
                </span>

                <h3 className="text-xl font-bold text-white">Dedicated GIS Analyst Pod</h3>
                <div className="font-mono text-3xl font-extrabold text-teal-400">
                  $3,800 <span className="text-xs font-normal text-slate-400">/ analyst / month</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Full-time dedicated GIS professionals assigned exclusively to your taxonomy guidelines and continuous ML ingestion pipeline.
                </p>

                <ul className="space-y-2.5 text-xs text-slate-300 font-mono">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>40 hrs/week per dedicated analyst</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Dual-pass senior GIS auditor QA included</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Air-gapped SOC 2 Type II VDI workstation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Direct Slack / Teams & API webhook sync</span>
                  </li>
                </ul>
              </div>

              <a
                href="#intake-quote"
                className="w-full py-3 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold text-center block transition-colors border border-teal-500"
              >
                Reserve Dedicated Pod
              </a>
            </div>

            {/* Card 2: SLA Volume Pass */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between space-y-6 hover:border-teal-600 transition-all shadow-xl">
              <div className="space-y-4">
                <span className="px-3 py-1 text-[10px] font-mono font-bold bg-slate-950 text-slate-300 border border-slate-800 rounded-full inline-block">
                  PAY-AS-YOU-GO SLAS
                </span>

                <h3 className="text-xl font-bold text-white">SLA Volume Pass</h3>
                <div className="font-mono text-3xl font-extrabold text-teal-400">
                  $0.08 - $0.22 <span className="text-xs font-normal text-slate-400">/ feature vector</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Pay strictly for verified ground-truth vectors with contractual IoU guarantees and financial SLA credit backing.
                </p>

                <ul className="space-y-2.5 text-xs text-slate-300 font-mono">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Basic footprints: $0.08 per polygon</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Defense OBB / Maritime: $0.22 per vector</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Contractual ≥0.88 IoU SLA backing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Automated STAC & PostGIS ingestion</span>
                  </li>
                </ul>
              </div>

              <a
                href="#intake-quote"
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-xl text-xs font-semibold text-center block transition-colors border border-slate-700"
              >
                Estimate Volume Rate
              </a>
            </div>

            {/* Card 3: Fixed Pilot Batch */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between space-y-6 hover:border-teal-600 transition-all shadow-xl">
              <div className="space-y-4">
                <span className="px-3 py-1 text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 rounded-full inline-block">
                  RAPID RISK-FREE TRIAL
                </span>

                <h3 className="text-xl font-bold text-white">500-Tile Calibration Pilot</h3>
                <div className="font-mono text-3xl font-extrabold text-amber-400">
                  $2,500 <span className="text-xs font-normal text-slate-400">/ fixed pilot</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Test our speed, topology regularizing algorithms, and taxonomy accuracy on 500 of your actual satellite or aerial scenes.
                </p>

                <ul className="space-y-2.5 text-xs text-slate-300 font-mono">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>500 tiles annotated & QA verified</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>48-hour SLA turnaround time</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>100% money-back accuracy guarantee</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Full GeoJSON & COCO export package</span>
                  </li>
                </ul>
              </div>

              <a
                href="#intake-quote"
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-xl text-xs font-semibold text-center block transition-colors border border-slate-700"
              >
                Launch 500-Tile Pilot
              </a>
            </div>

          </div>
        )}

        {/* Tab 2: Annotator Recruitment & Vetting Pipeline */}
        {activeTab === 'recruitment' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-8 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-teal-400" />
                  <span>5-Stage GIS Analyst Qualification Funnel</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  We reject 94% of generic crowdsourced applicants. Every GeoLabel annotator holds a formal GIS/Surveying background.
                </p>
              </div>

              <div className="px-3 py-1 bg-teal-950 text-teal-300 border border-teal-800 rounded-lg text-xs font-mono font-bold shrink-0">
                ACCEPTANCE RATE: 5.8%
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
              
              {/* Stage 1 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative group hover:border-teal-700 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-teal-950 text-teal-400 border border-teal-800 font-mono font-bold text-xs flex items-center justify-center">
                  01
                </div>
                <h4 className="text-xs font-bold text-white">Academic Degree Verification</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Verification of B.Tech in Surveying & Geoinformatics, Geography, or Esri GIS certifications.
                </p>
              </div>

              {/* Stage 2 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative group hover:border-teal-700 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-teal-950 text-teal-400 border border-teal-800 font-mono font-bold text-xs flex items-center justify-center">
                  02
                </div>
                <h4 className="text-xs font-bold text-white">Spatial & CRS Aptitude Exam</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Rigorous testing on EPSG projections, UTM grid systems, GSD scale factor calculations, and photogrammetry.
                </p>
              </div>

              {/* Stage 3 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative group hover:border-teal-700 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-teal-950 text-teal-400 border border-teal-800 font-mono font-bold text-xs flex items-center justify-center">
                  03
                </div>
                <h4 className="text-xs font-bold text-white">90° Corner Regularizing Test</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Timed practical digitizing evaluation enforcing orthogonal roof snapping and zero self-intersecting polygon lines.
                </p>
              </div>

              {/* Stage 4 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative group hover:border-teal-700 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-teal-950 text-teal-400 border border-teal-800 font-mono font-bold text-xs flex items-center justify-center">
                  04
                </div>
                <h4 className="text-xs font-bold text-white">Dual-Pass QA Shadowing</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  100 benchmark tiles annotated side-by-side with a senior GIS operations lead to calibrate IoU agreement above 0.90.
                </p>
              </div>

              {/* Stage 5 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative group hover:border-teal-700 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-teal-950 text-teal-400 border border-teal-800 font-mono font-bold text-xs flex items-center justify-center">
                  05
                </div>
                <h4 className="text-xs font-bold text-white">SOC 2 & ITAR Vetting</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Background check, non-disclosure agreements, biometric workstation VDI authentication, and security protocol training.
                </p>
              </div>

            </div>
          </div>
        )}

        {/* Tab 3: Go-To-Market & Landing First Client */}
        {activeTab === 'gtm' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-8 shadow-2xl">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-teal-400" />
                <span>90-Day Go-to-Market Execution Plan (Landing Anchor Clients)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                A structured 3-phase commercial strategy targeting Earth Observation AI companies, defense dual-use startups, and commercial remote sensing operators.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Phase 1 */}
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-teal-400">PHASE 1: DAYS 1 - 30</span>
                  <span className="px-2 py-0.5 text-[10px] bg-teal-950 text-teal-300 border border-teal-800 rounded">Benchmark Proof</span>
                </div>

                <h4 className="text-sm font-bold text-white">Open Benchmark Differentiation</h4>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Publish open benchmark datasets with expert ground truth (Solar PV, Urban Footprints, SAR Vessels) demonstrating superior IoU precision compared to crowdsourced providers.
                </p>

                <div className="pt-3 border-t border-slate-900 text-[11px] font-mono text-slate-400 space-y-1">
                  <div>• Deliverable: 5 Open GeoJSON Benchmark Packs</div>
                  <div>• Metric: Establish &gt;0.88 IoU quality baseline</div>
                </div>
              </div>

              {/* Phase 2 */}
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-teal-400">PHASE 2: DAYS 31 - 60</span>
                  <span className="px-2 py-0.5 text-[10px] bg-teal-950 text-teal-300 border border-teal-800 rounded">Target Outreach</span>
                </div>

                <h4 className="text-sm font-bold text-white">Audit Campaign vs Incumbents</h4>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Offer Earth Observation AI engineering leads a complimentary 50-tile QA audit comparing GeoLabel's orthogonal snapping and zero-sliver vectors against their current vendors.
                </p>

                <div className="pt-3 border-t border-slate-900 text-[11px] font-mono text-slate-400 space-y-1">
                  <div>• Target: 40 Remote Sensing AI Engineering Leads</div>
                  <div>• Pitch: "Test 50 Tiles Free — Zero Slivers Guaranteed"</div>
                </div>
              </div>

              {/* Phase 3 */}
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-teal-400">PHASE 3: DAYS 61 - 90</span>
                  <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded">Contract Conversion</span>
                </div>

                <h4 className="text-sm font-bold text-white">Pilot Conversion to Annual Pods</h4>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Convert successful 50-tile audit trials into 12-month dedicated pod retainer agreements ($3.8k/mo per analyst) backed by contractual SLA financial credit guarantees.
                </p>

                <div className="pt-3 border-t border-slate-900 text-[11px] font-mono text-slate-400 space-y-1">
                  <div>• Goal: 3 Anchor Enterprise Retainers</div>
                  <div>• Contract: SLA Financial Guarantee Policy</div>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </section>
  );
};
