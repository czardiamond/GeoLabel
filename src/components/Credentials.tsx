import React from 'react';
import { FOUNDER_INFO } from '../data/geospatialData';
import {
  GraduationCap,
  Award,
  ShieldCheck,
  Lock,
  Globe2,
  CheckCircle2,
  ExternalLink,
  Briefcase
} from 'lucide-react';

export const Credentials: React.FC = () => {
  return (
    <section id="credentials" className="py-20 bg-slate-950 border-b border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
            <span>SPECIALIST DOMAIN EXPERTISE</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Founded & Led by GIS Professionals
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            GeoLabel was built to replace generic crowdsourcing platforms with formal spatial geodesy, remote sensing expertise, and enterprise data security.
          </p>
        </div>

        {/* Founder Bio Card & Operational Security Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Founder Bio & Credentials */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-teal-900/60 border border-teal-600/60 flex items-center justify-center text-teal-300 text-2xl font-mono font-bold shrink-0">
                GIS
              </div>

              <div className="space-y-1">
                <span className="text-xs font-mono text-teal-400 uppercase tracking-wider block">
                  FOUNDER & OPERATIONS LEAD
                </span>
                <h3 className="text-xl font-bold text-white">{FOUNDER_INFO.name}</h3>
                <p className="text-xs text-slate-400 font-mono">{FOUNDER_INFO.credentials}</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              {FOUNDER_INFO.bio}
            </p>

            {/* Certifications Box */}
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              <span className="text-xs font-mono text-teal-400 block tracking-wider">
                CERTIFICATIONS & ACCREDITATIONS
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-300">
                {FOUNDER_INFO.certifications.map((cert) => (
                  <div key={cert} className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded border border-slate-800">
                    <Award className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>{cert}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Placeholder Project Credentials / Portfolio links */}
            <div className="pt-4 border-t border-slate-800/80 space-y-2">
              <span className="text-xs font-mono text-slate-400 block">KEY PROJECT EXPERIENCE HIGHLIGHTS</span>
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-teal-300">
                  Sentinel-2 Agricultural Phenology
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-teal-300">
                  Sub-Decimeter Urban Canopy Mapping
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-teal-300">
                  Port Vessel OBB Detection
                </span>
              </div>
            </div>

          </div>

          {/* Security & Data Privacy Warranties */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-950 border border-teal-700/60 flex items-center justify-center">
                <Lock className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Enterprise Data Security</h3>
                <p className="text-xs text-slate-400 font-mono">SOC 2 & Air-Gapped Enclave Ready</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              We process sensitive commercial satellite and defense imagery under strict data handling controls. Your raw data and generated labels never leave our isolated environment.
            </p>

            <ul className="space-y-3 pt-2">
              {FOUNDER_INFO.securityGuarantees.map((guarantee, idx) => (
                <li key={idx} className="flex items-start gap-3 text-xs text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{guarantee}</span>
                </li>
              ))}
            </ul>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-1 text-xs font-mono text-slate-300">
              <div className="text-teal-400 font-bold">CLIENT DATA PRIVACY MANDATE</div>
              <p className="text-[11px] text-slate-400 leading-normal">
                GeoLabel never aggregates, retains, or re-uses client imagery to train proprietary public models.
              </p>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
