import React, { useState } from 'react';
import { ShieldCheck, Lock, FileText, Server, Eye, Download, CheckCircle, ShieldAlert, Cpu } from 'lucide-react';

export const TrustCenterModal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'security' | 'airgap' | 'nda'>('security');
  const [downloadedNda, setDownloadedNda] = useState<boolean>(false);

  const sampleNdaText = `GEOLABEL MUTUAL NON-DISCLOSURE AGREEMENT (PREVIEW TEMPLATE)

1. CONFIDENTIAL INFORMATION
"Confidential Information" refers to proprietary geospatial imagery, satellite raster data, vector coordinates, ML model weights, and labeling taxonomies shared between Client and GeoLabel.

2. SECURITY & DATA HANDLING PROTOCOLS
- Air-Gapped Storage: Client imagery shall remain strictly isolated in client-dedicated encrypted S3/GCS buckets or on-premises storage.
- Zero External AI Retention: No client raster or vector data shall be used to train public foundational AI models.
- Access Control: Multi-factor biometric authentication and IP-whitelisted VPN gateway access.

3. COMPLIANCE & DEFENSE STANDARDS
GeoLabel enforces SOC 2 Type II controls, ISO/IEC 27001 guidelines, and ITAR compliance for defense-related satellite feeds.`;

  const handleDownloadNda = () => {
    const blob = new Blob([sampleNdaText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GeoLabel_Mutual_NDA_Standard_Template.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedNda(true);
    setTimeout(() => setDownloadedNda(false), 3000);
  };

  return (
    <section id="trust-center" className="py-20 bg-slate-950 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Defense-Grade Data Protection</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Security & Defense Trust Center
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Engineered for defense contractors, government agencies, and proprietary spatial AI teams with strict data sovereignty mandates.
          </p>
        </div>

        {/* Tabs Header */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('security')}
              className={`px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'security'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-4 h-4 text-teal-400" />
              <span>Security Specs</span>
            </button>

            <button
              onClick={() => setActiveTab('airgap')}
              className={`px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'airgap'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-4 h-4 text-teal-400" />
              <span>Air-Gapped Deployment</span>
            </button>

            <button
              onClick={() => setActiveTab('nda')}
              className={`px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'nda'
                  ? 'bg-teal-800 text-white shadow-md border border-teal-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 text-teal-400" />
              <span>Mutual NDA Agreement</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Security Specs */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-950 border border-teal-800 flex items-center justify-center text-teal-400 mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">AES-256 Encryption at Rest & Transit</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                All COGs, GeoTIFFs, and vector databases are encrypted with TLS 1.3 in transit and KMS-managed AES-256 keys at rest.
              </p>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-950 border border-teal-800 flex items-center justify-center text-teal-400 mb-2">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Zero Public AI Model Training</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your imagery feeds and custom vector annotations are strictly isolated and never ingested into foundation models.
              </p>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-teal-950 border border-teal-800 flex items-center justify-center text-teal-400 mb-2">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Biometric Workstation VDI Controls</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Annotator virtual desktops enforce screen capture blocking, disabled local USB storage, and IP-restricted VPN gateways.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Air-Gapped Pipeline */}
        {activeTab === 'airgap' && (
          <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-teal-400" />
                  <span>On-Premises & Private Cloud Air-Gapped Workflows</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Deploy GeoLabel dedicated annotation nodes inside your AWS GovCloud, GCP VPC, or localized on-prem network.
                </p>
              </div>

              <span className="px-3 py-1 bg-teal-950 text-teal-300 border border-teal-800 rounded-lg text-xs font-mono">
                GovCloud & Defense Ready
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-mono text-teal-400 font-bold block">1. Private S3 / Bucket Peering</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  GeoLabel analysts connect via IAM cross-account roles directly to your storage bucket. Imagery never leaves your cloud boundary.
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-mono text-teal-400 font-bold block">2. Self-Hosted CVAT Instance</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  We deploy an isolated CVAT/Label Studio container instance within your Kubernetes cluster with automated vector sync.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Mutual NDA */}
        {activeTab === 'nda' && (
          <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-400" />
                  <span>Standard Mutual Non-Disclosure Agreement (mNDA)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Preview and download our pre-vetted mutual NDA template before starting project discussions.
                </p>
              </div>

              <button
                onClick={handleDownloadNda}
                className="px-4 py-2 bg-teal-800 hover:bg-teal-700 text-white rounded-xl text-xs font-medium border border-teal-600 flex items-center gap-2 transition-colors shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>{downloadedNda ? 'Downloaded NDA' : 'Download NDA Template'}</span>
              </button>
            </div>

            <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed max-h-[220px] overflow-y-auto">
              <code>{sampleNdaText}</code>
            </pre>
          </div>
        )}

      </div>
    </section>
  );
};
