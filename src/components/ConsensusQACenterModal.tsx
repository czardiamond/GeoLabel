import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  Award,
  AlertTriangle,
  CheckCircle2,
  X,
  Flame,
  Activity,
  Layers,
  Check,
  TrendingUp,
  BarChart3,
  SlidersHorizontal
} from 'lucide-react';

interface ConsensusQACenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  showIouHeatmap: boolean;
  setShowIouHeatmap: (show: boolean) => void;
  showErrorHeatmap: boolean;
  setShowErrorHeatmap: (show: boolean) => void;
  activeAnnotatorView: 'senior' | 'annotator_a' | 'annotator_b' | 'consensus';
  setActiveAnnotatorView: (view: 'senior' | 'annotator_a' | 'annotator_b' | 'consensus') => void;
}

export const ConsensusQACenterModal: React.FC<ConsensusQACenterModalProps> = ({
  isOpen,
  onClose,
  showIouHeatmap,
  setShowIouHeatmap,
  showErrorHeatmap,
  setShowErrorHeatmap,
  activeAnnotatorView,
  setActiveAnnotatorView,
}) => {
  const [resolvedDiscrepancies, setResolvedDiscrepancies] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const ANNOTATORS = [
    {
      id: 'senior',
      name: 'Dr. Sarah Jenkins (Senior GIS Auditor)',
      role: 'Lead Benchmark',
      iou: '100%',
      precision: '99.4%',
      recall: '99.1%',
      f1: '0.992',
      color: '#10b981',
      pixelVariance: '± 2.1 cm',
    },
    {
      id: 'annotator_a',
      name: 'Elena Rostova (Junior Annotator)',
      role: 'Human Labeler A',
      iou: '92.4%',
      precision: '94.2%',
      recall: '91.8%',
      f1: '0.930',
      color: '#3b82f6',
      pixelVariance: '± 8.4 cm',
    },
    {
      id: 'annotator_b',
      name: 'GeoAI SAM2 Pre-Annotation Engine',
      role: 'Automated Model',
      iou: '88.7%',
      precision: '91.0%',
      recall: '87.5%',
      f1: '0.892',
      color: '#a855f7',
      pixelVariance: '± 12.6 cm',
    },
  ];

  const DISCREPANCIES = [
    {
      id: 'disc-1',
      location: 'Tile Sector [X: 42%, Y: 28%]',
      feature: 'Roof Overhang vs Tree Shade',
      issue: 'Annotator A included tree shadow inside Building Footprint polygon.',
      iouValue: 0.62,
      recommendation: 'Truncate polygon boundary along north eave line using Infrared NDVI Band.',
    },
    {
      id: 'disc-2',
      location: 'Tile Sector [X: 78%, Y: 44%]',
      feature: 'Solar Panel String Gap',
      issue: 'GeoAI Model merged two solar strings across 0.5m service walkway.',
      iouValue: 0.74,
      recommendation: 'Split into two distinct Bounding Box vectors.',
    },
  ];

  const handleResolve = (id: string) => {
    setResolvedDiscrepancies((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Multi-Annotator Consensus & Quality Control (QA/QC) Studio
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
                  SLA Grade A+
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Compare multi-annotator agreement matrices, edge-pixel error heatmaps, and audit IoU variance
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

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Canvas Overlay Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  IoU Overlap Heatmap Overlay
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Visualizes consensus agreement (Green &gt;85%, Yellow 50-85%, Red &lt;50%)
                </p>
              </div>
              <button
                onClick={() => setShowIouHeatmap(!showIouHeatmap)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  showIouHeatmap
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {showIouHeatmap ? 'Heatmap ON' : 'Heatmap OFF'}
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-400" />
                  Edge-Pixel Displacement Error Heatmap
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Highlights sub-pixel boundary shift hotspots (&gt;10cm displacement)
                </p>
              </div>
              <button
                onClick={() => setShowErrorHeatmap(!showErrorHeatmap)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  showErrorHeatmap
                    ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {showErrorHeatmap ? 'Hotspots ON' : 'Hotspots OFF'}
              </button>
            </div>
          </div>

          {/* Active Layer View Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Active Studio Canvas View Layer
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={() => setActiveAnnotatorView('consensus')}
                className={`p-2.5 rounded-xl border text-xs text-left transition ${
                  activeAnnotatorView === 'consensus'
                    ? 'border-teal-400 bg-teal-500/20 text-teal-200 font-semibold shadow-lg'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-slate-100">Consensus Overlap</div>
                <div className="text-[10px] text-slate-400">Combined Multi-User View</div>
              </button>
              {ANNOTATORS.map((ann) => (
                <button
                  key={ann.id}
                  onClick={() => setActiveAnnotatorView(ann.id as any)}
                  className={`p-2.5 rounded-xl border text-xs text-left transition ${
                    activeAnnotatorView === ann.id
                      ? 'border-teal-400 bg-teal-500/20 text-teal-200 font-semibold shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-slate-100 truncate">{ann.name.split(' ')[0]} {ann.name.split(' ')[1]}</div>
                  <div className="text-[10px] text-slate-400">{ann.role}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Annotator Scorecard Metrics Matrix */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Team SLA & Precision Breakdown
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {ANNOTATORS.map((ann) => (
                <div key={ann.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">{ann.name}</h4>
                      <p className="text-[10px] text-slate-400">{ann.role}</p>
                    </div>
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: ann.color }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Mean IoU</div>
                      <div className="font-mono font-bold text-teal-300">{ann.iou}</div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">F1 Score</div>
                      <div className="font-mono font-bold text-emerald-300">{ann.f1}</div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Precision</div>
                      <div className="font-mono font-bold text-blue-300">{ann.precision}</div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Boundary Error</div>
                      <div className="font-mono font-bold text-amber-300">{ann.pixelVariance}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Discrepancy Flagging & Resolution */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Flagged Boundary Discrepancies ({DISCREPANCIES.length - Object.keys(resolvedDiscrepancies).length} Open)</span>
            </h3>
            <div className="space-y-2">
              {DISCREPANCIES.map((disc) => {
                const isResolved = resolvedDiscrepancies[disc.id];
                return (
                  <div
                    key={disc.id}
                    className={`p-4 rounded-xl border transition flex items-center justify-between gap-4 ${
                      isResolved
                        ? 'bg-slate-950/40 border-slate-800/80 opacity-60'
                        : 'bg-slate-950 border-amber-500/30'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-4 h-4 ${isResolved ? 'text-slate-500' : 'text-amber-400'}`} />
                        <span className="text-xs font-bold text-slate-100">{disc.feature}</span>
                        <span className="text-[10px] bg-slate-800 font-mono text-slate-300 px-2 py-0.5 rounded">
                          {disc.location}
                        </span>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono px-2 py-0.5 rounded">
                          IoU: {disc.iouValue}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{disc.issue}</p>
                      <p className="text-[11px] text-teal-400 italic">Audit Action: {disc.recommendation}</p>
                    </div>

                    <button
                      onClick={() => handleResolve(disc.id)}
                      disabled={isResolved}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        isResolved
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      {isResolved ? 'Resolved' : 'Accept Fix'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
          >
            Close QA Center
          </button>
        </div>
      </div>
    </div>
  );
};
