import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, Download } from 'lucide-react';

type RasterAsset = {
  id: string;
  filename?: string;
  name?: string;
  kind?: string;
  crs?: string;
  metadata?: { driver?: string };
};
type Props = {
  assets: RasterAsset[];
  request: (path: string, init?: RequestInit) => Promise<any>;
};

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function RasterAnalysisPanel({ assets, request }: Props) {
  const rasters = useMemo(() => assets.filter(asset => asset.kind === 'image' && asset.metadata?.driver === 'GeoTIFF'), [assets]);
  const [assetId, setAssetId] = useState('');
  const selected = rasters.find(asset => asset.id === assetId);
  const [zonesText, setZonesText] = useState('');
  const [zonesCrs, setZonesCrs] = useState('');
  const [band, setBand] = useState(1);
  const [maxPixels, setMaxPixels] = useState(2_000_000);
  const [allTouched, setAllTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (assetId && !rasters.some(asset => asset.id === assetId)) setAssetId('');
  }, [assetId, rasters]);

  const runAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const zones = JSON.parse(zonesText);
      if (!zonesCrs.trim()) throw new Error('Enter the CRS for the polygon coordinates; GeoLabel will not guess it.');
      if (!Number.isInteger(band) || band < 1) throw new Error('Band must be a positive whole number.');
      if (!Number.isInteger(maxPixels) || maxPixels < 1) throw new Error('Pixel budget must be a positive whole number.');
      const response = await request(`/assets/${encodeURIComponent(selected.id)}/raster/zonal-statistics`, {
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

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `geolabel-zonal-statistics-${result.asset_id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="rounded-xl border bg-white p-5">
    <div className="mb-2 flex items-center gap-2"><Activity size={18} className="text-indigo-600"/><h2 className="font-bold">Raster analysis · zonal statistics</h2></div>
    <p className="mb-4 text-sm text-slate-600">Calculate real per-polygon summaries from an uploaded GeoTIFF band. Values are computed from valid raster pixels; no CRS is inferred and the pixel-window budget is enforced by the server.</p>
    {rasters.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No GeoTIFF is loaded in the selected dataset. Go to Overview, open a dataset, and select an uploaded GeoTIFF first.</p> : <form onSubmit={runAnalysis} className="grid gap-3 lg:grid-cols-2">
      <label className="block text-sm font-medium">Raster asset<select className={`${inputClass} mt-1`} value={assetId} onChange={event => { setAssetId(event.target.value); setResult(null); setError(''); }} required><option value="">Choose a GeoTIFF</option>{rasters.map(asset => <option key={asset.id} value={asset.id}>{asset.filename || asset.name || asset.id} · {asset.crs || 'CRS unavailable'}</option>)}</select></label>
      <label className="block text-sm font-medium">Zone coordinate reference system<input className={`${inputClass} mt-1`} value={zonesCrs} onChange={event => setZonesCrs(event.target.value)} placeholder="For example EPSG:4326" required/><span className="mt-1 block text-xs font-normal text-slate-500">Required explicitly. Zones are reprojected to the raster CRS when needed.</span></label>
      <label className="block text-sm font-medium">Raster band<input className={`${inputClass} mt-1`} type="number" min="1" step="1" value={band} onChange={event => setBand(Number(event.target.value))} required/></label>
      <label className="block text-sm font-medium">Maximum raster-window pixels<input className={`${inputClass} mt-1`} type="number" min="1" max="25000000" step="1" value={maxPixels} onChange={event => setMaxPixels(Number(event.target.value))} required/><span className="mt-1 block text-xs font-normal text-slate-500">Server limit: 25 million pixels per request across zone windows.</span></label>
      <label className="flex items-start gap-2 text-sm lg:col-span-2"><input className="mt-1" type="checkbox" checked={allTouched} onChange={event => setAllTouched(event.target.checked)}/><span>Include every pixel touched by polygon edges. Off uses pixel-center inclusion.</span></label>
      <label className="block text-sm font-medium lg:col-span-2">Polygon zones (GeoJSON FeatureCollection)<textarea className={`${inputClass} mt-1 font-mono text-xs`} rows={8} value={zonesText} onChange={event => setZonesText(event.target.value)} placeholder={'{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"zone-1"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}]}'} required/><span className="mt-1 block text-xs font-normal text-slate-500">Up to 500 valid Polygon/MultiPolygon features and 2 MB of GeoJSON. Replace the sample coordinates with your zones and verify their CRS; each result preserves the input feature properties.</span></label>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 lg:col-span-2" role="alert">{error}</p>}
      <div className="lg:col-span-2"><button className={buttonClass} disabled={busy || !assetId}>{busy ? 'Calculating…' : 'Calculate zonal statistics'}</button></div>
    </form>}
    {result && <div className="mt-5 border-t pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Analysis results</h3><p className="text-xs text-slate-500">Raster CRS {result.crs} · band {result.band} · {Number(result.window_pixels_read).toLocaleString()} window pixels read · {result.all_touched ? 'all-touched' : 'pixel-center'} inclusion</p></div><button className={secondaryClass} onClick={downloadResult}><Download size={15}/>Download JSON</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Zone</th><th className="p-2">Valid pixels</th><th className="p-2">Min</th><th className="p-2">Max</th><th className="p-2">Mean</th><th className="p-2">Sum</th><th className="p-2">Std dev</th></tr></thead><tbody>{result.zones.map((zone: any) => <tr key={zone.zone_index} className="border-b"><td className="p-2">{String(zone.properties?.name ?? zone.properties?.id ?? `Zone ${zone.zone_index + 1}`)}</td><td className="p-2">{Number(zone.valid_pixel_count).toLocaleString()}</td>{['min', 'max', 'mean', 'sum', 'std'].map(key => <td key={key} className="p-2">{zone[key] == null ? '—' : Number(zone[key]).toPrecision(5)}</td>)}</tr>)}</tbody></table></div>
      <p className="mt-2 text-xs text-slate-500">A zone with no valid raster pixels returns a count of 0 and null statistics. Summaries do not imply physical units or semantic correctness; interpret values using the raster band metadata.</p>
    </div>}
  </section>;
}
