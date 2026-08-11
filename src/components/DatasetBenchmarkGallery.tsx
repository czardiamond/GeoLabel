import React, { useState } from 'react';
import { Database, Download, Eye, Layers, Filter, CheckCircle, ShieldCheck, Sparkles, FileCode2, CheckSquare, Square, FileJson, Check } from 'lucide-react';

interface BenchmarkDataset {
  id: string;
  title: string;
  category: 'satellite' | 'aerial' | 'sar' | 'multispectral';
  resolutionGsd: string;
  featureCount: string;
  accuracyIou: string;
  description: string;
  imageUrl: string;
  tags: string[];
  geoJsonSample: string;
}

const DATASETS: BenchmarkDataset[] = [
  {
    id: 'solar-pv-us',
    title: 'North American Solar Photovoltaic Grid',
    category: 'aerial',
    resolutionGsd: '7.5 cm / px',
    featureCount: '142,500 Panels',
    accuracyIou: '99.4% IoU',
    description: 'Ultra-high resolution oriented bounding boxes (OBB) and sub-panel polygons capturing commercial and utility-scale solar arrays.',
    imageUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80',
    tags: ['OBB Vector', 'Solar Energy', 'Clean Tech'],
    geoJsonSample: `{
  "dataset": "GeoLabel Solar Grid v2",
  "crs": "EPSG:4326",
  "sample_feature": {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[-115.17, 36.10], [-115.16, 36.10], [-115.16, 36.11], [-115.17, 36.11], [-115.17, 36.10]]] },
    "properties": { "class": "solar_panel_array", "kw_est": 320, "tilt_angle_deg": 24, "soiling_factor": 0.02 }
  }
}`
  },
  {
    id: 'urban-ortho-footprints',
    title: 'High-Density Urban Building Footprints',
    category: 'satellite',
    resolutionGsd: '30 cm / px',
    featureCount: '85,000 Buildings',
    accuracyIou: '99.1% IoU',
    description: 'Orthogonalized 90° snapped building polygons with zero overlapping vertices across 12 major metropolitan zones.',
    imageUrl: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=800&q=80',
    tags: ['Building Footprints', '90° Squared', 'Urban Planning'],
    geoJsonSample: `{
  "dataset": "GeoLabel Urban Footprints v4",
  "crs": "EPSG:3857",
  "sample_feature": {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[-122.41, 37.77], [-122.40, 37.77], [-122.40, 37.78], [-122.41, 37.78], [-122.41, 37.77]]] },
    "properties": { "class": "commercial_structure", "orthogonality_verified": true, "height_est_m": 42.5 }
  }
}`
  },
  {
    id: 'sar-maritime-vessels',
    title: 'SAR Maritime Vessel & Port Detection',
    category: 'sar',
    resolutionGsd: '1.0 m / px (Sentinel-1 / Iceye)',
    featureCount: '28,400 Vessels',
    accuracyIou: '98.8% IoU',
    description: 'Synthetic Aperture Radar (SAR) oriented bounding box labels with incidence angle attributes for all-weather maritime tracking.',
    imageUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&q=80',
    tags: ['SAR Radar', 'Maritime', 'Defense'],
    geoJsonSample: `{
  "dataset": "GeoLabel SAR Maritime v1",
  "crs": "EPSG:4326",
  "sample_feature": {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[141.25, 38.12], [141.26, 38.12], [141.26, 38.13], [141.25, 38.13], [141.25, 38.12]]] },
    "properties": { "class": "cargo_vessel", "sar_polarization": "VV+VH", "heading_deg": 142.5 }
  }
}`
  },
  {
    id: 'canopy-wildfire-fuel',
    title: 'Multi-Spectral Canopy & Wildfire Fuel Bed',
    category: 'multispectral',
    resolutionGsd: '10 m / px (Sentinel-2)',
    featureCount: '52,000 Land Tiles',
    accuracyIou: '97.9% IoU',
    description: 'NDVI multi-band polygon masks delineating dead wood accumulation, forest canopy density, and urban-wildland interface risk.',
    imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
    tags: ['Forestry', 'Wildfire Risk', 'NDVI Bands'],
    geoJsonSample: `{
  "dataset": "GeoLabel Forestry Risk v3",
  "crs": "EPSG:32610",
  "sample_feature": {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[500000, 4100000], [500100, 4100000], [500100, 4100100], [500000, 4100100], [500000, 4100000]]] },
    "properties": { "class": "high_fuel_canopy", "ndvi_avg": 0.72, "moisture_index": 0.31 }
  }
}`
  }
];

export const DatasetBenchmarkGallery: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGeoJson, setSelectedGeoJson] = useState<BenchmarkDataset | null>(null);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>(
    DATASETS.map((d) => d.id)
  );
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const filteredDatasets = selectedCategory === 'all'
    ? DATASETS
    : DATASETS.filter(d => d.category === selectedCategory);

  const toggleSelectDataset = (id: string) => {
    setSelectedDatasetIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDatasetIds.length === DATASETS.length) {
      setSelectedDatasetIds([]);
    } else {
      setSelectedDatasetIds(DATASETS.map(d => d.id));
    }
  };

  const handleDownloadSample = (dataset: BenchmarkDataset) => {
    const blob = new Blob([dataset.geoJsonSample], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.id}_sample.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportBulkManifest = () => {
    const datasetsToExport = DATASETS.filter(d => selectedDatasetIds.includes(d.id));
    if (datasetsToExport.length === 0) {
      alert('Please select at least one benchmark dataset to export.');
      return;
    }

    const manifest = {
      repository: 'GeoLabel Benchmark Dataset Catalog',
      version: '2.1.0-manifest',
      exportedAt: new Date().toISOString(),
      totalSelectedDatasets: datasetsToExport.length,
      datasets: datasetsToExport.map(ds => {
        let parsedGeoJson = null;
        try {
          parsedGeoJson = JSON.parse(ds.geoJsonSample);
        } catch (e) {
          parsedGeoJson = ds.geoJsonSample;
        }

        return {
          id: ds.id,
          title: ds.title,
          category: ds.category,
          resolutionGsd: ds.resolutionGsd,
          featureCount: ds.featureCount,
          accuracyIou: ds.accuracyIou,
          description: ds.description,
          sampleImageryUrl: ds.imageUrl,
          tags: ds.tags,
          geoJsonSampleSpec: parsedGeoJson,
        };
      })
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    const blob = new Blob([manifestJson], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geolabel_benchmark_manifest_${datasetsToExport.length}_datasets.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportNotice(`Exported structured JSON manifest for ${datasetsToExport.length} dataset(s)!`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <section id="datasets" className="py-20 bg-slate-950 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Database className="w-3.5 h-3.5" />
            <span>Pre-Annotated Benchmark Datasets</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Geospatial Benchmark Dataset Library
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Explore sample geospatial training sets curated by GeoLabel for defense, renewable energy, and urban infrastructure ML models.
          </p>
        </div>

        {/* Category Filters & Bulk Download Actions */}
        <div className="space-y-4 mb-10">
          <div className="flex justify-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 text-xs font-mono rounded-xl transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-teal-800 text-white font-bold border border-teal-600 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All Datasets ({DATASETS.length})
            </button>
            <button
              onClick={() => setSelectedCategory('aerial')}
              className={`px-4 py-2 text-xs font-mono rounded-xl transition-all cursor-pointer ${
                selectedCategory === 'aerial'
                  ? 'bg-teal-800 text-white font-bold border border-teal-600 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Aerial Sub-10cm GSD
            </button>
            <button
              onClick={() => setSelectedCategory('satellite')}
              className={`px-4 py-2 text-xs font-mono rounded-xl transition-all cursor-pointer ${
                selectedCategory === 'satellite'
                  ? 'bg-teal-800 text-white font-bold border border-teal-600 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Optical Satellite 30cm
            </button>
            <button
              onClick={() => setSelectedCategory('sar')}
              className={`px-4 py-2 text-xs font-mono rounded-xl transition-all cursor-pointer ${
                selectedCategory === 'sar'
                  ? 'bg-teal-800 text-white font-bold border border-teal-600 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              SAR Radar
            </button>
          </div>

          {/* Bulk Download Manifest Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition border border-slate-700 cursor-pointer"
              >
                {selectedDatasetIds.length === DATASETS.length ? (
                  <CheckSquare className="w-4 h-4 text-teal-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>
                  {selectedDatasetIds.length === DATASETS.length ? 'Deselect All' : 'Select All'}
                </span>
              </button>
              <span className="text-xs text-slate-300 font-mono">
                <strong className="text-teal-300">{selectedDatasetIds.length}</strong> of {DATASETS.length} Datasets Selected for Bulk Export
              </span>
            </div>

            <div className="flex items-center gap-3">
              {exportNotice && (
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/80 px-3 py-1 rounded-lg border border-emerald-500/40">
                  <Check className="w-3.5 h-3.5" />
                  {exportNotice}
                </span>
              )}

              <button
                onClick={handleExportBulkManifest}
                disabled={selectedDatasetIds.length === 0}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center gap-2 cursor-pointer"
              >
                <FileJson className="w-4 h-4" />
                <span>Bulk Download JSON Manifest ({selectedDatasetIds.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dataset Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredDatasets.map((ds) => {
            const isSelected = selectedDatasetIds.includes(ds.id);
            return (
              <div
                key={ds.id}
                className={`bg-slate-900 border rounded-2xl p-6 flex flex-col justify-between transition-all group hover:shadow-xl relative ${
                  isSelected ? 'border-teal-500/80 bg-slate-900/95' : 'border-slate-800'
                }`}
              >
                {/* Selection Checkbox Pill */}
                <button
                  onClick={() => toggleSelectDataset(ds.id)}
                  className={`absolute top-4 right-4 z-10 px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer border ${
                    isSelected
                      ? 'bg-teal-500 text-slate-950 border-teal-300 font-bold'
                      : 'bg-slate-950/80 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>{isSelected ? 'Manifest Selected' : 'Select'}</span>
                </button>

                {/* Real Satellite Imagery Thumbnail Banner with Ground Truth Overlays */}
                <div className="relative h-44 my-4 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 group/img">
                  <img
                    src={ds.imageUrl}
                    alt={ds.title}
                    className="w-full h-full object-cover opacity-80 group-hover/img:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/30" />
                  
                  {/* Vector Ground Truth Overlay Illustration */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <rect x="25%" y="25%" width="45%" height="35%" fill="rgba(20, 184, 166, 0.2)" stroke="#14b8a6" strokeWidth="2" strokeDasharray="4 2" />
                    <circle cx="25%" cy="25%" r="4" fill="#14b8a6" />
                    <circle cx="70%" cy="25%" r="4" fill="#14b8a6" />
                    <circle cx="70%" cy="60%" r="4" fill="#14b8a6" />
                    <circle cx="25%" cy="60%" r="4" fill="#14b8a6" />

                    <rect x="55%" y="45%" width="35%" height="40%" fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth="2" />
                  </svg>

                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-slate-950/90 border border-teal-500 text-[10px] font-mono text-teal-300 flex items-center gap-1 shadow-md">
                    <ShieldCheck className="w-3 h-3 text-teal-400" />
                    <span>Verified Ground Truth Vector</span>
                  </div>
                </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-1 text-[11px] font-mono font-bold bg-teal-950 text-teal-300 border border-teal-800/80 rounded-lg">
                    {ds.resolutionGsd}
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> {ds.accuracyIou}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors">
                  {ds.title}
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {ds.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {ds.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] bg-slate-950 text-slate-300 border border-slate-800 rounded font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800/80">
                <span className="text-xs font-mono text-slate-400">
                  Volume: <strong className="text-white">{ds.featureCount}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedGeoJson(ds)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>View GeoJSON</span>
                  </button>

                  <button
                    onClick={() => handleDownloadSample(ds)}
                    className="px-3 py-1.5 text-xs font-medium bg-teal-800 hover:bg-teal-700 text-white rounded-lg border border-teal-600 flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        </div>

        {/* Modal for viewing GeoJSON sample */}
        {selectedGeoJson && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-5 h-5 text-teal-400" />
                  <h4 className="text-base font-bold text-white font-mono">{selectedGeoJson.title} (GeoJSON Spec)</h4>
                </div>
                <button
                  onClick={() => setSelectedGeoJson(null)}
                  className="text-slate-400 hover:text-white text-xs font-mono px-2 py-1 bg-slate-800 rounded"
                >
                  Close [ESC]
                </button>
              </div>

              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-teal-300 overflow-x-auto max-h-[300px]">
                <code>{selectedGeoJson.geoJsonSample}</code>
              </pre>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => handleDownloadSample(selectedGeoJson)}
                  className="px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-600 text-white rounded-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download .geojson File
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
};
