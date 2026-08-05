import React, { useState } from 'react';
import { Shield, CheckCircle, FileCheck, Download, Award, Lock, Server, Layers, Cpu, Globe } from 'lucide-react';

interface StandardItem {
  id: string;
  category: 'geospatial' | 'security' | 'privacy';
  name: string;
  code: string;
  description: string;
  status: 'Certified' | 'Compliant' | 'Native Support';
  verifiedBy: string;
}

const STANDARDS: StandardItem[] = [
  {
    id: 'ogc-geotiff',
    category: 'geospatial',
    name: 'OGC Cloud Optimized GeoTIFF (COG)',
    code: 'OGC 19-008r4',
    description: 'Full HTTP range-request compliance for streaming raster pyramids directly from cloud storage buckets.',
    status: 'Native Support',
    verifiedBy: 'OGC Benchmark Suite',
  },
  {
    id: 'stac-spec',
    category: 'geospatial',
    name: 'STAC Specification 1.0.0',
    code: 'SpatioTemporal Asset Catalog',
    description: 'Standardized metadata structure for indexing vector annotations alongside satellite & aerial imagery scenes.',
    status: 'Native Support',
    verifiedBy: 'STAC Ecosystem Validator',
  },
  {
    id: 'geojson-rfc',
    category: 'geospatial',
    name: 'GeoJSON RFC 7946 Specification',
    code: 'IETF RFC 7946',
    description: 'Strict WGS 84 coordinate wrapping, right-hand rule polygon geometry winding, and custom vector properties.',
    status: 'Native Support',
    verifiedBy: 'IETF Standards Validator',
  },
  {
    id: 'soc2-type2',
    category: 'security',
    name: 'SOC 2 Type II Certification',
    code: 'AICPA Trust Services Criteria',
    description: 'Audited annual controls for data security, availability, confidential customer imagery isolation, and privacy.',
    status: 'Certified',
    verifiedBy: 'Independent CPA Auditor',
  },
  {
    id: 'iso-27001',
    category: 'security',
    name: 'ISO/IEC 27001:2022',
    code: 'Information Security Management',
    description: 'Global standard for managing information assets, air-gapped pod VDIs, and biometric workstation access.',
    status: 'Certified',
    verifiedBy: 'BSI Registrar',
  },
  {
    id: 'itar-govcloud',
    category: 'security',
    name: 'ITAR & AWS GovCloud Protocol',
    code: '22 CFR 120-130',
    description: 'US-person restricted annotation pods for sensitive defense imagery, synthetic aperture radar (SAR), and aerial feeds.',
    status: 'Compliant',
    verifiedBy: 'Defense Legal Audit',
  },
  {
    id: 'iso-19115',
    category: 'geospatial',
    name: 'ISO 19115 Geographic Metadata',
    code: 'ISO 19115-1:2014',
    description: 'Standardized lineage, CRS projection transforms, and spatial accuracy audit metadata embedded in vector exports.',
    status: 'Native Support',
    verifiedBy: 'ISO Technical Committee 211',
  },
  {
    id: 'gdpr-ccpa',
    category: 'privacy',
    name: 'GDPR & CCPA Data Sovereignty',
    code: 'EU 2016/679',
    description: 'Guaranteed local region hosting option (US, EU, APAC) with zero cross-border transfer of proprietary imagery.',
    status: 'Compliant',
    verifiedBy: 'Data Protection Officer',
  },
];

export const ComplianceMatrix: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'geospatial' | 'security' | 'privacy'>('all');
  const [downloadedCert, setDownloadedCert] = useState<boolean>(false);

  const filteredStandards = STANDARDS.filter((s) => activeFilter === 'all' || s.category === activeFilter);

  const sampleCertText = `GEOLABEL COMPLIANCE & STANDARDS SPECIFICATION BRIEF (2026 EDITION)

1. GEOSPATIAL STANDARDS COMPLIANCE
- OGC COG (19-008r4): 100% compliant streamable Cloud-Optimized GeoTIFFs.
- STAC 1.0.0: Fully compliant STAC items with vector extension metadata.
- RFC 7946 GeoJSON: Strict right-hand winding rule for polygons with EPSG transform headers.

2. DEFENSE & SECURITY AUDIT CONTROLS
- SOC 2 Type II: Annual audit passed with zero security exceptions.
- ITAR & AWS GovCloud: US Citizen restricted pods with air-gapped VDI isolation.
- ISO/IEC 27001: Encryption key rotation every 90 days via KMS.`;

  const handleDownloadWhitepaper = () => {
    const blob = new Blob([sampleCertText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GeoLabel_Geospatial_Standards_Audit_Whitepaper.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedCert(true);
    setTimeout(() => setDownloadedCert(false), 3000);
  };

  return (
    <section id="compliance" className="py-20 bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Shield className="w-3.5 h-3.5" />
            <span>OGC & Security Governance</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Geospatial Standards & Compliance Matrix
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Engineered from the ground up to satisfy Open Geospatial Consortium (OGC) specifications, STAC metadata protocols, and defense-grade security requirements.
          </p>
        </div>

        {/* Filter Buttons & Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all ${
                activeFilter === 'all' ? 'bg-teal-800 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Standards (8)
            </button>
            <button
              onClick={() => setActiveFilter('geospatial')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all ${
                activeFilter === 'geospatial' ? 'bg-teal-800 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              OGC & STAC (4)
            </button>
            <button
              onClick={() => setActiveFilter('security')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all ${
                activeFilter === 'security' ? 'bg-teal-800 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              SOC 2 & ITAR (3)
            </button>
            <button
              onClick={() => setActiveFilter('privacy')}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-lg transition-all ${
                activeFilter === 'privacy' ? 'bg-teal-800 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Data Sovereignty (1)
            </button>
          </div>

          <button
            onClick={handleDownloadWhitepaper}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-xl text-xs font-mono border border-slate-700 flex items-center gap-2 transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadedCert ? 'Downloaded Specification' : 'Download Standards Brief'}</span>
          </button>
        </div>

        {/* Standards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredStandards.map((item) => (
            <div
              key={item.id}
              className="bg-slate-950 p-6 rounded-2xl border border-slate-800 hover:border-teal-800/80 transition-all flex flex-col justify-between space-y-4 shadow-xl group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-teal-400 uppercase font-bold tracking-wider">
                    {item.code}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-mono font-bold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                    {item.status}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors">
                  {item.name}
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Verified: <strong>{item.verifiedBy}</strong></span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
