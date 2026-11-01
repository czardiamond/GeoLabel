import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, BarChart3, Download, GitCompareArrows, Layers3 } from 'lucide-react';

type RasterAsset = {
  id: string;
  filename?: string;
  name?: string;
  kind?: string;
  crs?: string;
  metadata?: { driver?: string; acquisition_date?: string };
};
type Props = {
  assets: RasterAsset[];
  organizationId: string;
  request: (path: string, init?: RequestInit) => Promise<any>;
};
type Mode = 'compare' | 'bands' | 'zonal';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const MAX_PIXELS = 25_000_000;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function displayName(asset?: RasterAsset) {
  return asset?.filename || asset?.name || asset?.id || 'Raster';
}

function displayRasterName(asset?: RasterAsset) {
  return `${displayName(asset)}${asset?.metadata?.acquisition_date ? ` · ${asset.metadata.acquisition_date}` : ''}`;
}

function formatNumber(value: unknown) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toPrecision(5);
}

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function RasterAnalysisPanel({ assets, organizationId, request }: Props) {
  const rasters = useMemo(() => assets.filter(asset => asset.kind === 'image' && asset.metadata?.driver === 'GeoTIFF'), [assets]);
  const [mode, setMode] = useState<Mode>('compare');
  const [firstAssetId, setFirstAssetId] = useState('');
  const [secondAssetId, setSecondAssetId] = useState('');
  const [profileAssetId, setProfileAssetId] = useState('');
  const [zonesAssetId, setZonesAssetId] = useState('');
  const [zonesText, setZonesText] = useState('');
  const [zonesCrs, setZonesCrs] = useState('');
  const [band, setBand] = useState(1);
  const [maxPixels, setMaxPixels] = useState(2_000_000);
  const [threshold, setThreshold] = useState('');
  const [allTouched, setAllTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const available = new Set(rasters.map(asset => asset.id));
    if (firstAssetId && !available.has(firstAssetId)) setFirstAssetId('');
    if (secondAssetId && !available.has(secondAssetId)) setSecondAssetId('');
    if (profileAssetId && !available.has(profileAssetId)) setProfileAssetId('');
    if (zonesAssetId && !available.has(zonesAssetId)) setZonesAssetId('');
  }, [rasters, firstAssetId, secondAssetId, profileAssetId, zonesAssetId]);

  const resetResult = () => { setResult(null); setError(''); };
  const runComparison = async (event: FormEvent) => {
    event.preventDefault();
    if (!firstAssetId || !secondAssetId) return;
    setBusy(true);
    resetResult();
    try {
      const firstDate = rasters.find(asset => asset.id === firstAssetId)?.metadata?.acquisition_date;
      const secondDate = rasters.find(asset => asset.id === secondAssetId)?.metadata?.acquisition_date;
      if (firstDate && secondDate && firstDate > secondDate) {
        throw new Error('The selected baseline date is later than the comparison date. Reverse the selected rasters.');
      }
      const body: Record<string, unknown> = { first_asset_id: firstAssetId, second_asset_id: secondAssetId, max_pixels: maxPixels };
      if (threshold.trim()) {
        const parsed = Number(threshold);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Change threshold must be a finite number greater than or equal to zero.');
        body.threshold = parsed;
      }
      setResult(await request(`/organizations/${encodeURIComponent(organizationId)}/gis/raster-change`, {
        method: 'POST', body: JSON.stringify(body),
      }));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const runBandProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileAssetId) return;
    setBusy(true);
    resetResult();
    try {
      setResult(await request(`/assets/${encodeURIComponent(profileAssetId)}/raster/statistics`, {
        method: 'POST', body: JSON.stringify({ max_pixels: maxPixels }),
      }));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const runZonalAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    if (!zonesAssetId) return;
    setBusy(true);
    resetResult();
    try {
      const zones = JSON.parse(zonesText);
      if (!zonesCrs.trim()) throw new Error('Enter the CRS for the polygon coordinates; GeoLabel will not guess it.');
      if (!Number.isInteger(band) || band < 1) throw new Error('Band must be a positive whole number.');
      const response = await request(`/assets/${encodeURIComponent(zonesAssetId)}/raster/zonal-statistics`, {
        method: 'POST',
        body: JSON.stringify({ zones_geojson: zones, zones_crs: zonesCrs, band, max_pixels: maxPixels, all_touched: allTouched }),
      });
      setResult(response);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const modeButton = (value: Mode, icon: typeof Activity, label: string) => {
    const Icon = icon;
    return <button type="button" className={mode === value ? buttonClass : secondaryClass} onClick={() => { setMode(value); resetResult(); }} aria-pressed={mode === value}><Icon size={15}/>{label}</button>;
  };

  return <section className="rounded-xl border bg-white p-5">
    <div className="mb-2 flex items-center gap-2"><Activity size={18} className="text-indigo-600"/><h2 className="font-bold">Raster analysis</h2></div>
    <p className="mb-4 text-sm text-slate-600">Inspect uploaded GeoTIFF bands, compare aligned raster acquisitions, or calculate per-polygon summaries. Processing is performed on the server with explicit pixel limits.</p>
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Raster analysis tools">
      {modeButton('compare', GitCompareArrows, 'Compare rasters')}
      {modeButton('bands', BarChart3, 'Band statistics')}
      {modeButton('zonal', Layers3, 'Zonal statistics')}
    </div>

    {rasters.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No GeoTIFF is loaded in the selected dataset. Go to Overview, open a dataset, and upload a GeoTIFF first.</p> : <>
      {mode === 'compare' && <form onSubmit={runComparison} className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950 lg:col-span-2"><b>Compare an earlier and a later raster.</b> When both assets have analyst-verified acquisition dates, GeoLabel checks the order; otherwise, choose the temporal order yourself. Dates are never inferred from filenames. The original pixel grids must match exactly—there is no reprojection, resampling, or alignment correction.</div>
        <label className="block text-sm font-medium">Earlier raster (baseline)<select className={`${inputClass} mt-1`} value={firstAssetId} onChange={event => { setFirstAssetId(event.target.value); resetResult(); }} required><option value="">Choose baseline GeoTIFF</option>{rasters.filter(asset => asset.id !== secondAssetId).map(asset => <option key={asset.id} value={asset.id}>{displayRasterName(asset)} · {asset.crs || 'CRS unavailable'}</option>)}</select></label>
        <label className="block text-sm font-medium">Later raster (comparison)<select className={`${inputClass} mt-1`} value={secondAssetId} onChange={event => { setSecondAssetId(event.target.value); resetResult(); }} required><option value="">Choose later GeoTIFF</option>{rasters.filter(asset => asset.id !== firstAssetId).map(asset => <option key={asset.id} value={asset.id}>{displayRasterName(asset)} · {asset.crs || 'CRS unavailable'}</option>)}</select></label>
        <label className="block text-sm font-medium">Change threshold (optional)<input className={`${inputClass} mt-1`} type="number" min="0" step="any" value={threshold} onChange={event => { setThreshold(event.target.value); resetResult(); }} placeholder="e.g. 5"/><span className="mt-1 block text-xs font-normal text-slate-500">When set, pixels with absolute difference greater than this value are counted. Interpret thresholds using the source band units.</span></label>
        <label className="block text-sm font-medium">Maximum raster pixels<input className={`${inputClass} mt-1`} type="number" min="1" max={MAX_PIXELS} step="1" value={maxPixels} onChange={event => { setMaxPixels(Number(event.target.value)); resetResult(); }} required/><span className="mt-1 block text-xs font-normal text-slate-500">Server limit: {MAX_PIXELS.toLocaleString()} pixels per request.</span></label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 lg:col-span-2" role="alert">{error}</p>}
        <div className="lg:col-span-2"><button className={buttonClass} disabled={busy || !firstAssetId || !secondAssetId || firstAssetId === secondAssetId}>{busy ? 'Comparing…' : 'Compare raster acquisitions'}</button></div>
      </form>}

      {mode === 'bands' && <form onSubmit={runBandProfile} className="grid gap-3 lg:grid-cols-2">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 lg:col-span-2">Calculate valid-pixel count, minimum, maximum, mean, and standard deviation for every band. This reads the selected raster and does not modify it.</p>
        <label className="block text-sm font-medium">Raster asset<select className={`${inputClass} mt-1`} value={profileAssetId} onChange={event => { setProfileAssetId(event.target.value); resetResult(); }} required><option value="">Choose a GeoTIFF</option>{rasters.map(asset => <option key={asset.id} value={asset.id}>{displayName(asset)} · {asset.crs || 'CRS unavailable'}</option>)}</select></label>
        <label className="block text-sm font-medium">Maximum raster pixels<input className={`${inputClass} mt-1`} type="number" min="1" max={MAX_PIXELS} step="1" value={maxPixels} onChange={event => { setMaxPixels(Number(event.target.value)); resetResult(); }} required/></label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 lg:col-span-2" role="alert">{error}</p>}
        <div className="lg:col-span-2"><button className={buttonClass} disabled={busy || !profileAssetId}>{busy ? 'Inspecting…' : 'Calculate band statistics'}</button></div>
      </form>}

      {mode === 'zonal' && <form onSubmit={runZonalAnalysis} className="grid gap-3 lg:grid-cols-2">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 lg:col-span-2">Calculate real per-polygon summaries from an uploaded GeoTIFF band. Values come from valid raster pixels; no CRS is inferred, and the pixel-window budget is enforced by the server.</p>
        <label className="block text-sm font-medium">Raster asset<select className={`${inputClass} mt-1`} value={zonesAssetId} onChange={event => { setZonesAssetId(event.target.value); resetResult(); }} required><option value="">Choose a GeoTIFF</option>{rasters.map(asset => <option key={asset.id} value={asset.id}>{displayName(asset)} · {asset.crs || 'CRS unavailable'}</option>)}</select></label>
        <label className="block text-sm font-medium">Zone coordinate reference system<input className={`${inputClass} mt-1`} value={zonesCrs} onChange={event => setZonesCrs(event.target.value)} placeholder="For example EPSG:4326" required/><span className="mt-1 block text-xs font-normal text-slate-500">Required explicitly. Zones are reprojected to the raster CRS when needed.</span></label>
        <label className="block text-sm font-medium">Raster band<input className={`${inputClass} mt-1`} type="number" min="1" step="1" value={band} onChange={event => setBand(Number(event.target.value))} required/></label>
        <label className="block text-sm font-medium">Maximum raster-window pixels<input className={`${inputClass} mt-1`} type="number" min="1" max={MAX_PIXELS} step="1" value={maxPixels} onChange={event => setMaxPixels(Number(event.target.value))} required/><span className="mt-1 block text-xs font-normal text-slate-500">Server limit: {MAX_PIXELS.toLocaleString()} pixels across zone windows.</span></label>
        <label className="flex items-start gap-2 text-sm lg:col-span-2"><input className="mt-1" type="checkbox" checked={allTouched} onChange={event => setAllTouched(event.target.checked)}/><span>Include every pixel touched by polygon edges. Off uses pixel-center inclusion.</span></label>
        <label className="block text-sm font-medium lg:col-span-2">Polygon zones (GeoJSON FeatureCollection)<textarea className={`${inputClass} mt-1 font-mono text-xs`} rows={8} value={zonesText} onChange={event => setZonesText(event.target.value)} placeholder={'{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"zone-1"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}]}'} required/><span className="mt-1 block text-xs font-normal text-slate-500">Up to 500 valid Polygon/MultiPolygon features and 2 MB of GeoJSON. Replace the sample coordinates with your zones and verify their CRS; each result preserves input feature properties.</span></label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 lg:col-span-2" role="alert">{error}</p>}
        <div className="lg:col-span-2"><button className={buttonClass} disabled={busy || !zonesAssetId}>{busy ? 'Calculating…' : 'Calculate zonal statistics'}</button></div>
      </form>}
    </>}

    {result && <div className="mt-5 border-t pt-4">
      {mode === 'compare' && <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Raster comparison results</h3><p className="text-xs text-slate-500">{displayRasterName(rasters.find(asset => asset.id === result.first_asset_id))} → {displayRasterName(rasters.find(asset => asset.id === result.second_asset_id))} · {result.crs || 'CRS unavailable'} · {result.width} × {result.height} pixels{result.threshold == null ? '' : ` · changed-pixel threshold ${result.threshold}`}</p></div><button className={secondaryClass} onClick={() => downloadJson(result, `geolabel-raster-change-${result.first_asset_id}-${result.second_asset_id}.json`)}><Download size={15}/>Download JSON</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Band</th><th className="p-2">Valid pixels</th><th className="p-2">Min absolute difference</th><th className="p-2">Max</th><th className="p-2">Mean</th><th className="p-2">Std dev</th>{result.threshold != null && <><th className="p-2">Changed pixels</th><th className="p-2">Changed bounds</th></>}</tr></thead><tbody>{result.bands.map((item: any) => <tr key={item.band} className="border-b"><td className="p-2">{item.band}</td><td className="p-2">{Number(item.valid_pixel_count).toLocaleString()}</td><td className="p-2">{formatNumber(item.min)}</td><td className="p-2">{formatNumber(item.max)}</td><td className="p-2">{formatNumber(item.mean)}</td><td className="p-2">{formatNumber(item.std)}</td>{result.threshold != null && <><td className="p-2">{Number(item.changed_pixel_count || 0).toLocaleString()}</td><td className="p-2 font-mono text-xs">{item.changed_bounds ? JSON.stringify(item.changed_bounds) : '—'}</td></>}</tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-500">Differences are absolute numeric pixel values; they do not establish semantic change or physical units. No-data pixels are excluded. Comparisons require identical dimensions, band counts, CRS, and affine transform; no resampling is performed.</p>
      </>}
      {mode === 'bands' && <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Band statistics</h3><p className="text-xs text-slate-500">{displayName(rasters.find(asset => asset.id === result.asset_id))} · {result.crs || 'CRS unavailable'} · {result.width} × {result.height} pixels · {result.band_count} band(s)</p></div><button className={secondaryClass} onClick={() => downloadJson(result, `geolabel-raster-statistics-${result.asset_id}.json`)}><Download size={15}/>Download JSON</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Band</th><th className="p-2">Valid pixels</th><th className="p-2">Min</th><th className="p-2">Max</th><th className="p-2">Mean</th><th className="p-2">Std dev</th></tr></thead><tbody>{result.bands.map((item: any) => <tr key={item.band} className="border-b"><td className="p-2">{item.band}</td><td className="p-2">{Number(item.valid_pixel_count).toLocaleString()}</td><td className="p-2">{formatNumber(item.min)}</td><td className="p-2">{formatNumber(item.max)}</td><td className="p-2">{formatNumber(item.mean)}</td><td className="p-2">{formatNumber(item.std)}</td></tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-500">Statistics exclude masked and non-finite pixels. Values retain source band units; GeoLabel does not assign physical meaning.</p>
      </>}
      {mode === 'zonal' && <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Zonal analysis results</h3><p className="text-xs text-slate-500">Raster CRS {result.crs} · band {result.band} · {Number(result.window_pixels_read).toLocaleString()} window pixels read · {result.all_touched ? 'all-touched' : 'pixel-center'} inclusion</p></div><button className={secondaryClass} onClick={() => downloadJson(result, `geolabel-zonal-statistics-${result.asset_id}.json`)}><Download size={15}/>Download JSON</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Zone</th><th className="p-2">Valid pixels</th><th className="p-2">Min</th><th className="p-2">Max</th><th className="p-2">Mean</th><th className="p-2">Sum</th><th className="p-2">Std dev</th></tr></thead><tbody>{result.zones.map((zone: any) => <tr key={zone.zone_index} className="border-b"><td className="p-2">{String(zone.properties?.name ?? zone.properties?.id ?? `Zone ${zone.zone_index + 1}`)}</td><td className="p-2">{Number(zone.valid_pixel_count).toLocaleString()}</td>{['min', 'max', 'mean', 'sum', 'std'].map(key => <td key={key} className="p-2">{formatNumber(zone[key])}</td>)}</tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-500">A zone with no valid raster pixels returns a count of 0 and null statistics. Summaries do not imply physical units or semantic correctness; interpret values using raster band metadata.</p>
      </>}
    </div>}
  </section>;
}
