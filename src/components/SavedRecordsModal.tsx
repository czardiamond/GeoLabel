import React, { useState, useEffect } from 'react';
import { Database, Clock, FileText, Trash2, X, Download, ShieldCheck, CheckCircle2, Bookmark } from 'lucide-react';
import { getSavedQuotes, getSavedEstimates, SavedQuoteRecord, SavedPodEstimate } from '../utils/storage';

interface SavedRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SavedRecordsModal: React.FC<SavedRecordsModalProps> = ({ isOpen, onClose }) => {
  const [quotes, setQuotes] = useState<SavedQuoteRecord[]>([]);
  const [estimates, setEstimates] = useState<SavedPodEstimate[]>([]);
  const [activeTab, setActiveTab] = useState<'quotes' | 'estimates'>('quotes');

  useEffect(() => {
    if (isOpen) {
      setQuotes(getSavedQuotes());
      setEstimates(getSavedEstimates());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClearMemory = () => {
    localStorage.removeItem('geolabel_saved_quotes_v1');
    localStorage.removeItem('geolabel_saved_estimates_v1');
    setQuotes([]);
    setEstimates([]);
  };

  const handleExportJson = () => {
    const memoryDump = {
      app: 'GeoLabel Enterprise Memory Backup',
      exportedAt: new Date().toISOString(),
      savedQuotes: quotes,
      savedPodEstimates: estimates,
    };

    const blob = new Blob([JSON.stringify(memoryDump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GeoLabel_Saved_Memory_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-950 border border-teal-800 flex items-center justify-center text-teal-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Persistent Memory & History Log</span>
                <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-mono">
                  LOCAL PERSISTENCE ACTIVE
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                All saved quote inquiries and pod cost estimates stored in your browser session.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-between items-center">
          <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('quotes')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'quotes' ? 'bg-teal-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Saved Quotes ({quotes.length})
            </button>
            <button
              onClick={() => setActiveTab('estimates')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'estimates' ? 'bg-teal-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Saved Pod Estimates ({estimates.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            {(quotes.length > 0 || estimates.length > 0) && (
              <button
                onClick={handleClearMemory}
                className="px-3 py-1.5 text-xs font-mono bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Memory</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-h-[320px] overflow-y-auto pr-1">
          {activeTab === 'quotes' ? (
            quotes.length === 0 ? (
              <div className="text-center py-10 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-slate-400">
                <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs">No saved quote inquiries in memory yet.</p>
                <p className="text-[11px] text-slate-500">Submit a quote form to save your inquiry specs persistently.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {quotes.map((q) => (
                  <div key={q.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono text-teal-400 font-bold">
                        <span>{q.id}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-300 font-sans font-semibold">{q.fullName} ({q.organization || 'Individual'})</span>
                      </div>
                      <div className="text-slate-400">
                        Project: <strong className="text-white">{q.projectType}</strong> | Volume: <strong className="text-white">{q.estimatedVolume}</strong>
                      </div>
                    </div>
                    <div className="text-right font-mono text-slate-400 shrink-0">
                      <span className="px-2 py-0.5 text-[10px] bg-teal-950 text-teal-300 border border-teal-800 rounded font-bold">
                        {q.status}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {new Date(q.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            estimates.length === 0 ? (
              <div className="text-center py-10 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-slate-400">
                <Bookmark className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs">No saved pod estimates in memory yet.</p>
                <p className="text-[11px] text-slate-500">Use the Pod Estimator to save project workload & cost calculations.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {estimates.map((est) => (
                  <div key={est.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono text-teal-400 font-bold">
                        <span>{est.id}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-white font-bold">{est.areaKm2} sq km ({est.imageryType})</span>
                      </div>
                      <div className="text-slate-400 font-mono">
                        Pod Size: <strong className="text-white">{est.podSize} Techs</strong> | Est. Hours: <strong className="text-white">~{est.estimatedHours} hrs</strong>
                      </div>
                    </div>
                    <div className="text-right font-mono text-teal-300 font-bold shrink-0">
                      <div>${est.monthlyCostUsd.toLocaleString()} MAX</div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                        {new Date(est.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close Memory Inspector
          </button>
        </div>

      </div>
    </div>
  );
};
