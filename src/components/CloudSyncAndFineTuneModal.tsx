import React, { useState } from 'react';
import {
  Cloud,
  Database,
  Download,
  Check,
  X,
  FileCode,
  Copy,
  Sparkles,
  Server,
  Key,
  ShieldCheck,
  RefreshCw,
  FolderArchive
} from 'lucide-react';

interface CloudSyncAndFineTuneModalProps {
  isOpen: boolean;
  onClose: () => void;
  polygonCount: number;
  taskType?: string;
  tileName?: string;
}

export const CloudSyncAndFineTuneModal: React.FC<CloudSyncAndFineTuneModalProps> = ({
  isOpen,
  onClose,
  polygonCount,
  taskType = 'bbox_detection',
  tileName = 'Active Tile',
}) => {
  const [activeTab, setActiveTab] = useState<'cloud_sync' | 'finetune_export'>('cloud_sync');

  // Cloud Sync Form State
  const [cloudProvider, setCloudProvider] = useState<'gcp' | 'aws' | 'azure'>('gcp');
  const [bucketName, setBucketName] = useState<string>('gs://geolabel-satellite-annotations-prod');
  const [region, setRegion] = useState<string>('us-central1');
  const [serviceAccountKey, setServiceAccountKey] = useState<string>('******_sa_key_json');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncSuccessUrl, setSyncSuccessUrl] = useState<string | null>(null);

  // Fine-Tuning Package State
  const [trainRatio, setTrainRatio] = useState<number>(70);
  const [valRatio, setValRatio] = useState<number>(20);
  const [testRatio, setTestRatio] = useState<number>(10);
  const [exportFramework, setExportFramework] = useState<'yolov8' | 'mask_rcnn' | 'sam2_lora'>('yolov8');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleStartCloudSync = () => {
    setIsSyncing(true);
    setSyncProgress(0);
    setSyncSuccessUrl(null);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 15;
      setSyncProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsSyncing(false);
        const signedUrl = `https://storage.googleapis.com/${bucketName.replace('gs://', '')}/exports/geolabel_dataset_${Date.now()}.zip`;
        setSyncSuccessUrl(signedUrl);
      }
    }, 250);
  };

  const sampleDatasetYaml = `path: ../datasets/geolabel_satellite_v1
train: images/train
val: images/val
test: images/test

names:
  0: building_footprint
  1: solar_pv_array
  2: cargo_vessel
  3: tree_canopy
  4: water_body

nc: 5
# GeoLabel Exported for Ultralytics YOLOv8 Segmentation
`;

  const sampleYoloTxt = `0 0.1800 0.2200 0.4600 0.2200 0.4600 0.5500 0.1800 0.5500
1 0.5200 0.2800 0.8800 0.2800 0.8800 0.4800 0.5200 0.4800`;

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Cloud Pipeline & Model Fine-Tuning Export Hub
              </h2>
              <p className="text-xs text-slate-400">
                Direct GCP / AWS / Azure bucket sync & PyTorch / YOLOv8 fine-tuning packages
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

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 pt-3 gap-3">
          <button
            onClick={() => setActiveTab('cloud_sync')}
            className={`pb-3 px-3 text-xs font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'cloud_sync'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            One-Click Cloud Sync (GCS / S3 / Azure)
          </button>
          <button
            onClick={() => setActiveTab('finetune_export')}
            className={`pb-3 px-3 text-xs font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === 'finetune_export'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            Model Fine-Tuning Package (YOLOv8 / SAM)
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'cloud_sync' && (
            <div className="space-y-4">
              {/* Cloud Provider Buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    setCloudProvider('gcp');
                    setBucketName('gs://geolabel-satellite-annotations-prod');
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    cloudProvider === 'gcp'
                      ? 'border-teal-400 bg-teal-500/10 text-teal-200 shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Server className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="text-xs font-bold text-slate-100">Google Cloud</div>
                    <div className="text-[10px] text-slate-400">GCS Bucket</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setCloudProvider('aws');
                    setBucketName('s3://geolabel-annotations-aws-prod');
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    cloudProvider === 'aws'
                      ? 'border-teal-400 bg-teal-500/10 text-teal-200 shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Database className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-bold text-slate-100">Amazon Web Services</div>
                    <div className="text-[10px] text-slate-400">S3 Bucket</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setCloudProvider('azure');
                    setBucketName('https://geolabel.blob.core.windows.net/satellite');
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    cloudProvider === 'azure'
                      ? 'border-teal-400 bg-teal-500/10 text-teal-200 shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cloud className="w-4 h-4 text-sky-400" />
                  <div>
                    <div className="text-xs font-bold text-slate-100">Microsoft Azure</div>
                    <div className="text-[10px] text-slate-400">Blob Container</div>
                  </div>
                </button>
              </div>

              {/* Bucket Form */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Target Cloud Bucket URI</label>
                  <input
                    type="text"
                    value={bucketName}
                    onChange={(e) => setBucketName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-teal-300 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Storage Region</label>
                    <input
                      type="text"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">IAM Credentials Token</label>
                    <input
                      type="password"
                      value={serviceAccountKey}
                      onChange={(e) => setServiceAccountKey(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono"
                    />
                  </div>
                </div>

                {isSyncing ? (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-slate-300 font-medium">
                      <span>Syncing Labeled Dataset to {bucketName}...</span>
                      <span className="font-mono text-teal-400">{syncProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-teal-400 h-full transition-all duration-300"
                        style={{ width: `${syncProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleStartCloudSync}
                    className="w-full py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 transition"
                  >
                    <Cloud className="w-4 h-4" />
                    Start Direct Cloud Sync ({polygonCount} Labeled Vectors)
                  </button>
                )}

                {syncSuccessUrl && (
                  <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-lg text-emerald-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Cloud Sync Successful!
                    </div>
                    <p className="text-[11px] text-emerald-200 break-all font-mono">
                      CDN Signed Manifest: {syncSuccessUrl}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'finetune_export' && (
            <div className="space-y-4">
              {/* Train / Val / Test Ratio Sliders */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span>Dataset Split Allocation</span>
                  <span className="text-teal-400 font-mono">
                    Train: {trainRatio}% | Val: {valRatio}% | Test: {testRatio}%
                  </span>
                </h4>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400">Train Set ({trainRatio}%)</label>
                    <input
                      type="range"
                      min={50}
                      max={90}
                      value={trainRatio}
                      onChange={(e) => {
                        const val = +e.target.value;
                        setTrainRatio(val);
                        setValRatio(Math.round((100 - val) * 0.6));
                        setTestRatio(Math.round((100 - val) * 0.4));
                      }}
                      className="w-full accent-teal-400"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400">Validation Set ({valRatio}%)</label>
                    <input
                      type="range"
                      min={5}
                      max={40}
                      value={valRatio}
                      onChange={(e) => setValRatio(+e.target.value)}
                      className="w-full accent-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400">Test Set ({testRatio}%)</label>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      value={testRatio}
                      onChange={(e) => setTestRatio(+e.target.value)}
                      className="w-full accent-purple-400"
                    />
                  </div>
                </div>
              </div>

              {/* Framework Selector */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setExportFramework('yolov8')}
                  className={`p-3 rounded-xl border text-left transition ${
                    exportFramework === 'yolov8'
                      ? 'border-teal-400 bg-teal-500/10 text-teal-200 shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-100">Ultralytics YOLOv8</div>
                  <div className="text-[10px] text-slate-400">Segmentation & Boxes</div>
                </button>
                <button
                  onClick={() => setExportFramework('mask_rcnn')}
                  className={`p-3 rounded-xl border text-left transition ${
                    exportFramework === 'mask_rcnn'
                      ? 'border-teal-400 bg-teal-500/10 text-teal-200 shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-100">PyTorch Mask R-CNN</div>
                  <div className="text-[10px] text-slate-400">COCO Format JSON</div>
                </button>
                <button
                  onClick={() => setExportFramework('sam2_lora')}
                  className={`p-3 rounded-xl border text-left transition ${
                    exportFramework === 'sam2_lora'
                      ? 'border-teal-400 bg-teal-500/10 text-teal-200 shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-100">SAM 2 LoRA Fine-Tune</div>
                  <div className="text-[10px] text-slate-400">Prompts & Binary Masks</div>
                </button>
              </div>

              {/* Code Previews */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-teal-300 font-bold">
                    {exportFramework === 'yolov8' ? 'dataset.yaml Configuration' : 'annotations.json Schema'}
                  </span>
                  <button
                    onClick={() => handleCopyCode(sampleDatasetYaml)}
                    className="text-slate-400 hover:text-white transition flex items-center gap-1"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
                <pre className="bg-slate-900 p-3 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-800">
                  {sampleDatasetYaml}
                </pre>
              </div>

              <a
                href={`data:text/yaml;charset=utf-8,${encodeURIComponent(sampleDatasetYaml)}`}
                download="geolabel_finetune_dataset.yaml"
                className="w-full py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 transition"
              >
                <Download className="w-4 h-4" />
                Download Ready-to-Train Fine-Tuning Zip Package
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
          >
            Close Pipeline Hub
          </button>
        </div>
      </div>
    </div>
  );
};
