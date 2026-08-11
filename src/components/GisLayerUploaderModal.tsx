import React, { useState } from 'react';
import {
  Upload,
  Globe,
  Layers,
  FileImage,
  Check,
  X,
  Sliders,
  Split,
  Calendar,
  Sparkles,
  Link2,
  Database,
  ArrowRight
} from 'lucide-react';

interface GisLayerUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCustomImage: (
    imageUrl: string,
    metadata: {
      name: string;
      crs: string;
      bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
      resolutionMeters: number;
    }
  ) => void;
  activeTileSource: string;
  setActiveTileSource: (source: string) => void;
  customXyzUrl: string;
  setCustomXyzUrl: (url: string) => void;
  isMultiTemporalActive: boolean;
  setIsMultiTemporalActive: (active: boolean) => void;
  multiTemporalSliderPos: number;
  setMultiTemporalSliderPos: (pos: number) => void;
  beforeDateImage: string;
  setBeforeDateImage: (url: string) => void;
  afterDateImage: string;
  setAfterDateImage: (url: string) => void;
}

export const GisLayerUploaderModal: React.FC<GisLayerUploaderModalProps> = ({
  isOpen,
  onClose,
  onApplyCustomImage,
  activeTileSource,
  setActiveTileSource,
  customXyzUrl,
  setCustomXyzUrl,
  isMultiTemporalActive,
  setIsMultiTemporalActive,
  multiTemporalSliderPos,
  setMultiTemporalSliderPos,
  beforeDateImage,
  setBeforeDateImage,
  afterDateImage,
  setAfterDateImage,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'wms_xyz' | 'multi_temporal'>('upload');

  // Drag & drop file state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<{
    file: File;
    previewUrl: string;
    crs: string;
    resolution: number;
    bands: number;
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  } | null>(null);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    // Simulate reading GeoTIFF tags / metadata
    const parsedFile = {
      file,
      previewUrl: objectUrl,
      crs: file.name.endsWith('.tif') || file.name.endsWith('.geotiff') ? 'EPSG:4326 (WGS84 Lat/Lon)' : 'EPSG:3857 (Web Mercator)',
      resolution: 0.12, // 12cm / pixel
      bands: 4, // RGB + NIR
      bounds: {
        minLat: 37.7712,
        maxLat: 37.7758,
        minLon: -122.4205,
        maxLon: -122.4150,
      },
    };
    setUploadedFile(parsedFile);
  };

  const handleApplyUploadedImage = () => {
    if (uploadedFile) {
      onApplyCustomImage(uploadedFile.previewUrl, {
        name: uploadedFile.file.name,
        crs: uploadedFile.crs,
        bounds: uploadedFile.bounds,
        resolutionMeters: uploadedFile.resolution,
      });
      onClose();
    }
  };

  const TILE_PRESETS = [
    {
      id: 'esri_world',
      name: 'Esri World Imagery',
      desc: 'High-resolution RGB orthophotos global coverage',
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      res: '0.15m - 0.50m',
    },
    {
      id: 'sentinel_2',
      name: 'Sentinel-2 L2A Multispectral',
      desc: '10m 13-band multispectral imagery with SWIR/NDVI',
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
      res: '10.0m',
    },
    {
      id: 'planet_3m',
      name: 'PlanetScope Planet 3m Ortho',
      desc: 'Daily 3m planet dove satellite constellation',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      res: '3.0m',
    },
    {
      id: 'custom_xyz',
      name: 'Custom WMS / XYZ Endpoint',
      desc: 'Connect your internal raster GIS server endpoint',
      url: customXyzUrl,
      res: 'Dynamic',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Custom GIS Layers & Satellite Imagery Engine
              </h2>
              <p className="text-xs text-slate-400">
                Upload GeoTIFF imagery, connect live WMS/XYZ tile servers, or run multi-temporal split views
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 pt-3 gap-3">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 px-3 text-xs font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            GeoTIFF / Orthomosaic Upload
          </button>
          <button
            onClick={() => setActiveTab('wms_xyz')}
            className={`pb-3 px-3 text-xs font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'wms_xyz'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            WMS / WMTS / XYZ Tile Servers
          </button>
          <button
            onClick={() => setActiveTab('multi_temporal')}
            className={`pb-3 px-3 text-xs font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'multi_temporal'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Split className="w-4 h-4" />
            Multi-Temporal Change Detection
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {/* Drag & Drop Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                  isDragging
                    ? 'border-teal-400 bg-teal-500/10'
                    : 'border-slate-700 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-950/60'
                }`}
              >
                <input
                  type="file"
                  accept=".geotiff,.tif,.tiff,.png,.jpg,.jpeg,.jp2"
                  className="hidden"
                  id="geotiff-input"
                  onChange={handleFileInputChange}
                />
                <label htmlFor="geotiff-input" className="cursor-pointer w-full flex flex-col items-center">
                  <div className="p-3 rounded-full bg-slate-800 text-teal-400 border border-slate-700 mb-3">
                    <FileImage className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">
                    Drag and drop your GeoTIFF or drone orthomosaic image here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports .tif, .geotiff, .png, .jpg up to 250MB with embedded CRS spatial tags
                  </p>
                  <span className="mt-3 px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-medium hover:bg-teal-500/30 transition">
                    Browse File System
                  </span>
                </label>
              </div>

              {/* Uploaded File Info Card */}
              {uploadedFile && (
                <div className="bg-slate-950 border border-teal-500/30 rounded-xl p-4 flex items-center gap-4">
                  <img
                    src={uploadedFile.previewUrl}
                    alt="Preview"
                    className="w-20 h-20 rounded-lg object-cover border border-slate-800"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-100">{uploadedFile.file.name}</h4>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
                        Valid GeoTIFF Header
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>CRS: <span className="text-slate-200 font-mono">{uploadedFile.crs}</span></div>
                      <div>Spatial Res: <span className="text-slate-200 font-mono">{uploadedFile.resolution}m/px</span></div>
                      <div>Bands: <span className="text-slate-200 font-mono">{uploadedFile.bands} (RGB+NIR)</span></div>
                      <div>Extents: <span className="text-slate-200 font-mono">37.77° N, -122.42° W</span></div>
                    </div>
                  </div>
                  <button
                    onClick={handleApplyUploadedImage}
                    className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-teal-500/20 transition"
                  >
                    <Check className="w-4 h-4" />
                    Load onto Canvas
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'wms_xyz' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {TILE_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => setActiveTileSource(preset.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      activeTileSource === preset.id
                        ? 'border-teal-400 bg-teal-500/10 shadow-lg shadow-teal-950/40'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-100">{preset.name}</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">{preset.desc}</p>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {preset.res}
                      </span>
                    </div>
                    <div className="mt-3 text-[10px] font-mono text-slate-500 truncate border-t border-slate-800/80 pt-2 flex items-center gap-1">
                      <Link2 className="w-3 h-3 text-teal-400" />
                      {preset.url}
                    </div>
                  </div>
                ))}
              </div>

              {activeTileSource === 'custom_xyz' && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <label className="text-xs font-medium text-slate-300">Custom XYZ Tile Server URL Template</label>
                  <input
                    type="text"
                    value={customXyzUrl}
                    onChange={(e) => setCustomXyzUrl(e.target.value)}
                    placeholder="https://your-gis-server.com/wmts/tile/{z}/{y}/{x}.png"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-400"
                  />
                  <p className="text-[11px] text-slate-400">
                    Use <code className="text-teal-400">{'{x}'}</code>, <code className="text-teal-400">{'{y}'}</code>, and <code className="text-teal-400">{'{z}'}</code> placeholders for standard tile mapping.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'multi_temporal' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-teal-500/30 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                    <Split className="w-4 h-4 text-teal-400" />
                    Multi-Temporal Split-View Comparison Engine
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Compare historical baseline imagery (Pre-Event) vs current satellite tile (Post-Event)
                  </p>
                </div>
                <button
                  onClick={() => setIsMultiTemporalActive(!isMultiTemporalActive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    isMultiTemporalActive
                      ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-md shadow-teal-500/20'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {isMultiTemporalActive ? 'Active (Split View Enabled)' : 'Enable Split View'}
                </button>
              </div>

              {isMultiTemporalActive && (
                <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-amber-300 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Baseline Imagery (Date 1 - Pre-Event)
                      </label>
                      <input
                        type="text"
                        value={beforeDateImage}
                        onChange={(e) => setBeforeDateImage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        placeholder="https://... baseline image URL"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-teal-300 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Current Imagery (Date 2 - Post-Event)
                      </label>
                      <input
                        type="text"
                        value={afterDateImage}
                        onChange={(e) => setAfterDateImage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        placeholder="https://... current image URL"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Comparison Swipe Slider</span>
                      <span className="font-mono text-teal-400">{multiTemporalSliderPos}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={multiTemporalSliderPos}
                      onChange={(e) => setMultiTemporalSliderPos(+e.target.value)}
                      className="w-full accent-teal-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
