import React, { useState } from 'react';
import { Calculator, Compass, Code2, Copy, Check, Download, Layers, Shield, RefreshCw } from 'lucide-react';

export const GisToolsCalculator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'gsd' | 'bbox' | 'schema'>('gsd');

  // GSD Calculator State
  const [flightAltitude, setFlightAltitude] = useState<number>(120); // meters
  const [focalLength, setFocalLength] = useState<number>(24); // mm
  const [sensorWidth, setSensorWidth] = useState<number>(13.2); // mm
  const [imageWidthPx, setImageWidthPx] = useState<number>(4000); // px

  // Calculate GSD: GSD = (Flight Altitude (m) * Sensor Width (mm) * 100) / (Focal Length (mm) * Image Width (px))
  const gsdCmPx = ((flightAltitude * sensorWidth * 100) / (focalLength * imageWidthPx)).toFixed(2);
  const tileWidthMeters = ((parseFloat(gsdCmPx) * 1024) / 100).toFixed(1);
  const tileAreaSqM = (parseFloat(tileWidthMeters) * parseFloat(tileWidthMeters)).toFixed(0);

  // Bounding Box Transformer State
  const [minLat, setMinLat] = useState<number>(37.7749);
  const [minLon, setMinLon] = useState<number>(-122.4194);
  const [maxLat, setMaxLat] = useState<number>(37.7850);
  const [maxLon, setMaxLon] = useState<number>(-122.4080);
  const [copiedBbox, setCopiedBbox] = useState<string | null>(null);

  // Convert WGS84 to Web Mercator (EPSG:3857) approximation
  const lonToMercator = (lon: number) => (lon * 20037508.34) / 180;
  const latToMercator = (lat: number) => {
    let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    return (y * 20037508.34) / 180;
  };

  const mercatorMinX = lonToMercator(minLon).toFixed(1);
  const mercatorMinY = latToMercator(minLat).toFixed(1);
  const mercatorMaxX = lonToMercator(maxLon).toFixed(1);
  const mercatorMaxY = latToMercator(maxLat).toFixed(1);

  const geoJsonBboxStr = `[${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${maxLon.toFixed(6)}, ${maxLat.toFixed(6)}]`;
  const epsg3857Str = `EPSG:3857 BBOX: [${mercatorMinX}, ${mercatorMinY}, ${mercatorMaxX}, ${mercatorMaxY}]`;
  const cocoBboxStr = `[${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${(maxLon - minLon).toFixed(6)}, ${(maxLat - minLat).toFixed(6)}]`;

  // GeoJSON Schema State
  const [schemaType, setSchemaType] = useState<'geojson' | 'coco' | 'yolo'>('geojson');
  const [copiedSchema, setCopiedSchema] = useState<boolean>(false);

  const sampleGeoJson = `{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" }
  },
  "features": [
    {
      "type": "Feature",
      "id": "building_footprint_0942",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-122.4182, 37.7751],
            [-122.4178, 37.7751],
            [-122.4178, 37.7758],
            [-122.4182, 37.7758],
            [-122.4182, 37.7751]
          ]
        ]
      },
      "properties": {
        "class": "commercial_building",
        "height_est_m": 18.5,
        "roof_type": "flat_tar",
        "solar_pv_present": true,
        "solar_capacity_kw": 45.2,
        "vector_confidence": 0.998,
        "annotator_id": "GEO_QUAL_88",
        "qa_verified": true
      }
    }
  ]
}`;

  const sampleCoco = `{
  "images": [
    {
      "id": 1,
      "file_name": "tile_37.7751_-122.4182_z19.tif",
      "width": 1024,
      "height": 1024,
      "gsd_cm": 7.5,
      "crs": "EPSG:3857"
    }
  ],
  "annotations": [
    {
      "id": 101,
      "image_id": 1,
      "category_id": 4,
      "segmentation": [[120, 340, 120, 520, 380, 520, 380, 340]],
      "area": 46800.0,
      "bbox": [120, 340, 260, 180],
      "iscrowd": 0,
      "attributes": {
        "roof_material": "metal_standing_seam",
        "condition": "good"
      }
    }
  ],
  "categories": [
    { "id": 1, "name": "residential_building" },
    { "id": 2, "name": "road_asphalt" },
    { "id": 3, "name": "tree_canopy" },
    { "id": 4, "name": "commercial_building" }
  ]
}`;

  const sampleYolo = `# YOLOv8 OBB Format (Oriented Bounding Box) for Remote Sensing
# class_id x_center y_center width height angle_degrees
0 0.4821 0.6102 0.2104 0.1852 42.5
1 0.1205 0.3391 0.0842 0.0911 15.0
3 0.8912 0.7712 0.3120 0.2840 0.0`;

  const getActiveSchemaText = () => {
    if (schemaType === 'geojson') return sampleGeoJson;
    if (schemaType === 'coco') return sampleCoco;
    return sampleYolo;
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(getActiveSchemaText());
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  const handleDownloadSchema = () => {
    const text = getActiveSchemaText();
    const ext = schemaType === 'geojson' ? 'geojson' : schemaType === 'coco' ? 'json' : 'txt';
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geolabel_sample_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBbox(label);
    setTimeout(() => setCopiedBbox(null), 2000);
  };

  return (
    <section id="gis-tools" className="py-20 bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-400 text-xs font-mono mb-4">
            <Compass className="w-3.5 h-3.5" />
            <span>Interactive GIS & ML Data Tools</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Geospatial Resolution & Coordinate Utilities
          </h2>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Essential tools for GIS leads and ML engineers to compute Ground Sample Distance (GSD), 
            transform CRS bounding boxes, and test GeoLabel’s standardized export formats.
          </p>
        </div>

        {/* Tool Selector Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800/80 shadow-inner">
            <button
              onClick={() => setActiveTab('gsd')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                activeTab === 'gsd'
                  ? 'bg-teal-800/80 text-white shadow-md border border-teal-600/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Calculator className="w-4 h-4 text-teal-400" />
              <span>GSD & Pixel Resolution</span>
            </button>

            <button
              onClick={() => setActiveTab('bbox')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                activeTab === 'bbox'
                  ? 'bg-teal-800/80 text-white shadow-md border border-teal-600/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Compass className="w-4 h-4 text-teal-400" />
              <span>CRS & BBOX Transformer</span>
            </button>

            <button
              onClick={() => setActiveTab('schema')}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                activeTab === 'schema'
                  ? 'bg-teal-800/80 text-white shadow-md border border-teal-600/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Code2 className="w-4 h-4 text-teal-400" />
              <span>Sample Export Schemas</span>
            </button>
          </div>
        </div>

        {/* TAB 1: GSD CALCULATOR */}
        {activeTab === 'gsd' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-xl">
            {/* Input Controls */}
            <div className="lg:col-span-7 space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-teal-400" />
                <span>Camera & Drone Flight Inputs</span>
              </h3>

              {/* Altitude Slider */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label className="text-slate-300 font-medium">Flight Altitude (m):</label>
                  <span className="font-mono text-teal-400 font-semibold">{flightAltitude} meters</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="500"
                  step="5"
                  value={flightAltitude}
                  onChange={(e) => setFlightAltitude(Number(e.target.value))}
                  className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1">
                  <span>30m (Micro-Drone)</span>
                  <span>120m (Standard FAA)</span>
                  <span>500m (High-Altitude Survey)</span>
                </div>
              </div>

              {/* Focal Length Slider */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label className="text-slate-300 font-medium">Focal Length (mm):</label>
                  <span className="font-mono text-teal-400 font-semibold">{focalLength} mm</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="80"
                  step="1"
                  value={focalLength}
                  onChange={(e) => setFocalLength(Number(e.target.value))}
                  className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Sensor Width and Image Width */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Sensor Width (mm):</label>
                  <select
                    value={sensorWidth}
                    onChange={(e) => setSensorWidth(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                  >
                    <option value={13.2}>13.2 mm (1" CMOS - Phantom 4 Pro)</option>
                    <option value={17.3}>17.3 mm (Micro 4/3 - Matrice 300)</option>
                    <option value={23.5}>23.5 mm (APS-C Crop Sensor)</option>
                    <option value={36.0}>36.0 mm (Full Frame 35mm)</option>
                    <option value={6.17}>6.17 mm (Standard 1/2.3" Drone)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Image Width (Pixels):</label>
                  <select
                    value={imageWidthPx}
                    onChange={(e) => setImageWidthPx(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                  >
                    <option value={4000}>4,000 px (20 Megapixel Camera)</option>
                    <option value={5472}>5,472 px (Standard 24MP Sensor)</option>
                    <option value={8000}>8,000 px (Ultra-High Res 48MP)</option>
                    <option value={11600}>11,600 px (Medium Format Photogrammetry)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Calculated Output Card */}
            <div className="lg:col-span-5 bg-slate-900/90 border border-teal-800/60 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <span className="text-xs font-mono text-teal-400 uppercase tracking-wider font-semibold">
                    Calculated GSD Metric
                  </span>
                  <span className="px-2 py-0.5 text-[10px] bg-teal-950 text-teal-300 border border-teal-800 rounded font-mono">
                    AUTONOMIC CALC
                  </span>
                </div>

                <div className="mb-6">
                  <div className="text-xs text-slate-400 font-medium">Ground Sample Distance (GSD):</div>
                  <div className="text-4xl font-extrabold text-white font-mono mt-1 tracking-tight">
                    {gsdCmPx} <span className="text-lg font-normal text-teal-400">cm / px</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Each image pixel represents a {gsdCmPx}cm × {gsdCmPx}cm square on the ground.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-mono">Tile Width (1024px):</span>
                    <span className="text-base font-bold text-white font-mono">{tileWidthMeters} meters</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-mono">Tile Coverage:</span>
                    <span className="text-base font-bold text-white font-mono">{tileAreaSqM} m²</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-3 bg-teal-950/50 border border-teal-800/40 rounded-lg text-xs text-teal-300/90 flex items-start gap-2">
                <Shield className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>
                  GeoLabel precision guidelines require sub-{Math.max(1, Math.round(Number(gsdCmPx)))}cm vector snapping for optimal ML polygon extraction.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CRS & BBOX TRANSFORMER */}
        {activeTab === 'bbox' && (
          <div className="bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-400" />
              <span>Bounding Box (BBOX) Coordinate Transformer</span>
            </h3>

            {/* Input Coordinates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Min Longitude (WGS84):</label>
                <input
                  type="number"
                  step="0.0001"
                  value={minLon}
                  onChange={(e) => setMinLon(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Min Latitude (WGS84):</label>
                <input
                  type="number"
                  step="0.0001"
                  value={minLat}
                  onChange={(e) => setMinLat(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Max Longitude (WGS84):</label>
                <input
                  type="number"
                  step="0.0001"
                  value={maxLon}
                  onChange={(e) => setMaxLon(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Max Latitude (WGS84):</label>
                <input
                  type="number"
                  step="0.0001"
                  value={maxLat}
                  onChange={(e) => setMaxLat(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-teal-500"
                />
              </div>
            </div>

            {/* Transformed Outputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
              {/* GeoJSON Format */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-teal-400 font-semibold">Standard GeoJSON BBOX</span>
                  <button
                    onClick={() => handleCopyText(geoJsonBboxStr, 'geojson')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                  >
                    {copiedBbox === 'geojson' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBbox === 'geojson' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-xs font-mono text-slate-200 break-all">
                  {geoJsonBboxStr}
                </div>
              </div>

              {/* Web Mercator EPSG:3857 */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-teal-400 font-semibold">Web Mercator (EPSG:3857)</span>
                  <button
                    onClick={() => handleCopyText(epsg3857Str, 'epsg')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                  >
                    {copiedBbox === 'epsg' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBbox === 'epsg' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-xs font-mono text-slate-200 break-all">
                  [{mercatorMinX}, {mercatorMinY}, {mercatorMaxX}, {mercatorMaxY}]
                </div>
              </div>

              {/* COCO Format */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-teal-400 font-semibold">COCO BBOX [x, y, w, h]</span>
                  <button
                    onClick={() => handleCopyText(cocoBboxStr, 'coco')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                  >
                    {copiedBbox === 'coco' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBbox === 'coco' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-xs font-mono text-slate-200 break-all">
                  {cocoBboxStr}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SAMPLE EXPORT SCHEMAS */}
        {activeTab === 'schema' && (
          <div className="bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSchemaType('geojson')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                    schemaType === 'geojson'
                      ? 'bg-teal-800/80 text-white font-semibold border border-teal-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  GeoJSON (RFC 7946)
                </button>
                <button
                  onClick={() => setSchemaType('coco')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                    schemaType === 'coco'
                      ? 'bg-teal-800/80 text-white font-semibold border border-teal-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  COCO Dataset JSON
                </button>
                <button
                  onClick={() => setSchemaType('yolo')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                    schemaType === 'yolo'
                      ? 'bg-teal-800/80 text-white font-semibold border border-teal-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  YOLOv8 OBB Format
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySchema}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {copiedSchema ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSchema ? 'Copied to Clipboard' : 'Copy Spec'}</span>
                </button>

                <button
                  onClick={handleDownloadSchema}
                  className="px-3 py-1.5 text-xs font-medium bg-teal-800 hover:bg-teal-700 text-white border border-teal-600 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample</span>
                </button>
              </div>
            </div>

            {/* Code Highlight Box */}
            <pre className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-xs font-mono text-teal-300 overflow-x-auto max-h-[380px] leading-relaxed">
              <code>{getActiveSchemaText()}</code>
            </pre>
          </div>
        )}
      </div>
    </section>
  );
};
