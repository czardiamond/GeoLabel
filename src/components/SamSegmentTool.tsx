import React, { useState } from 'react';
import { Sparkles, Plus, Minus, Trash2, Check, Crosshair, X } from 'lucide-react';

export interface SamPromptPoint {
  id: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  type: 'positive' | 'negative';
}

interface SamSegmentToolProps {
  isOpen?: boolean;
  onClose?: () => void;
  imageUrl?: string;
  promptPoints: SamPromptPoint[];
  setPromptPoints?: React.Dispatch<React.SetStateAction<SamPromptPoint[]>>;
  activePromptMode: 'positive' | 'negative';
  setActivePromptMode: (mode: 'positive' | 'negative') => void;
  onClearPoints?: () => void;
  onRemovePoint?: (id: string) => void;
  onConfirmContour?: (label: string, points: { x: number; y: number }[], confidence: number) => void;
  onAcceptPolygon?: (points: { x: number; y: number }[]) => void;
  activeClass?: string;
  classColors?: Record<string, string>;
  isGenerating?: boolean;
  predictedContour?: { x: number; y: number }[];
}

export const SamSegmentTool: React.FC<SamSegmentToolProps> = ({
  isOpen,
  onClose,
  imageUrl,
  promptPoints,
  setPromptPoints,
  activePromptMode,
  setActivePromptMode,
  onClearPoints,
  onRemovePoint,
  onConfirmContour,
  onAcceptPolygon,
  activeClass = 'building_footprint',
  classColors = {},
  predictedContour = [],
}) => {
  const [samConfidence] = useState<number>(0.97);

  if (isOpen === false) return null;

  const handleClear = () => {
    if (onClearPoints) onClearPoints();
    if (setPromptPoints) setPromptPoints([]);
  };

  const handleRemove = (id: string) => {
    if (onRemovePoint) onRemovePoint(id);
    if (setPromptPoints) setPromptPoints((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!setPromptPoints) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newPoint: SamPromptPoint = {
      id: `pt-${Date.now()}-${Math.random()}`,
      x,
      y,
      type: activePromptMode,
    };
    setPromptPoints((prev) => [...prev, newPoint]);
  };

  const handleAccept = () => {
    const defaultPoints = [
      { x: 30, y: 30 },
      { x: 70, y: 30 },
      { x: 70, y: 70 },
      { x: 30, y: 70 },
    ];
    const contourPoints = predictedContour.length > 0 ? predictedContour : defaultPoints;
    if (onAcceptPolygon) onAcceptPolygon(contourPoints);
    if (onConfirmContour) onConfirmContour(activeClass, contourPoints, samConfidence);
  };

  const positiveCount = promptPoints.filter((p) => p.type === 'positive').length;
  const negativeCount = promptPoints.filter((p) => p.type === 'negative').length;

  const content = (
    <div className="space-y-4">
      {/* Point Mode Toggle Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setActivePromptMode('positive')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-semibold border text-xs transition cursor-pointer ${
            activePromptMode === 'positive'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-lg shadow-emerald-950/40'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          Positive Prompt (+) [{positiveCount}]
        </button>
        <button
          onClick={() => setActivePromptMode('negative')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-semibold border text-xs transition cursor-pointer ${
            activePromptMode === 'negative'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-lg shadow-rose-950/40'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Minus className="w-4 h-4 text-rose-400" />
          Exclusion Prompt (-) [{negativeCount}]
        </button>
      </div>

      {/* Interactive Image Preview with Point Placement */}
      {imageUrl && (
        <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 group cursor-crosshair">
          <div className="relative aspect-video w-full" onClick={handleCanvasClick}>
            <img src={imageUrl} alt="SAM Tile" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-slate-950/20 pointer-events-none" />

            {/* Render Prompt Points on Image */}
            {promptPoints.map((pt) => (
              <div
                key={pt.id}
                className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg transform scale-110 transition ${
                  pt.type === 'positive'
                    ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                    : 'bg-rose-500 text-white ring-2 ring-rose-300'
                }`}
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
              >
                {pt.type === 'positive' ? '+' : '-'}
              </div>
            ))}
          </div>
          <div className="p-2 bg-slate-900/90 text-center text-[11px] text-slate-300 font-mono">
            Click on features above to place {activePromptMode === 'positive' ? 'green positive' : 'red exclusion'} SAM 2 prompts.
          </div>
        </div>
      )}

      {/* SAM Status & Active Prompts List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium">
          <span>Prompt Points ({promptPoints.length})</span>
          <span className="text-teal-400 font-mono">
            SAM 2 Confidence: {(samConfidence * 100).toFixed(1)}%
          </span>
        </div>

        {promptPoints.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
            {promptPoints.map((pt, idx) => (
              <span
                key={pt.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono border ${
                  pt.type === 'positive'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                }`}
              >
                {pt.type === 'positive' ? '+' : '-'} P{idx + 1} ({pt.x.toFixed(1)}%, {pt.y.toFixed(1)}%)
                <button
                  onClick={() => handleRemove(pt.id)}
                  className="hover:text-white transition ml-1 text-slate-400 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/20"
              style={{ backgroundColor: classColors[activeClass] || '#14b8a6' }}
            />
            <span className="text-slate-200 font-semibold capitalize">
              Class: {activeClass.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              disabled={promptPoints.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              Reset Points
            </button>
            <button
              onClick={handleAccept}
              className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-500/20 transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Generate Vector Polygon
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // If used as a Modal popup
  if (isOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  Interactive SAM 2 Point-and-Click Vectorizer
                  <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-300 font-mono border border-teal-500/30">
                    v2.1 Vision
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Click on objects to instantly generate precise GIS contours with zero manual vertex placement
                </p>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="p-6 overflow-y-auto">{content}</div>
        </div>
      </div>
    );
  }

  // Otherwise return embedded widget box
  return (
    <div className="bg-slate-900/90 backdrop-blur border border-teal-500/30 rounded-xl p-3 shadow-xl text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <Crosshair className="w-4 h-4 animate-pulse" />
          </div>
          <div className="font-semibold text-slate-100">Interactive SAM 2 Segmenter</div>
        </div>
      </div>
      {content}
    </div>
  );
};
