import { ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react';
import { adjacentReviewDiagnostic, reviewDiagnosticIndex, reviewDiagnosticKey, type ReviewFeatureDiagnostic } from '../lib/reviewDiagnostics.ts';

type Props = {
  findings: readonly ReviewFeatureDiagnostic[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onFocus: () => void;
  focusAnnouncement: string;
};

const buttonClass = 'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export function ReviewDiagnosticNavigator({ findings, selectedKey, onSelect, onFocus, focusAnnouncement }: Props) {
  if (!findings.length) return null;
  const selectedIndex = reviewDiagnosticIndex(findings, selectedKey);
  const move = (direction: -1 | 1) => {
    const next = adjacentReviewDiagnostic(findings, selectedKey, direction);
    if (next) onSelect(reviewDiagnosticKey(next));
  };
  const selectedStatus = selectedIndex < 0 ? '' : findings[selectedIndex].status.replaceAll('_', ' ');
  const position = selectedIndex < 0
    ? `${findings.length} flagged finding${findings.length === 1 ? '' : 's'}`
    : `Finding ${selectedIndex + 1} of ${findings.length} · ${selectedStatus}`;

  return (
    <section aria-label="Diagnostic finding navigation" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
        <LocateFixed size={17} aria-hidden="true" className="shrink-0 text-amber-700" />
        <span aria-live="polite" aria-atomic="true" className="font-medium">{position}</span>
        <span className="hidden text-xs text-slate-500 sm:inline">Step through each flagged object; the selected finding is highlighted on the image.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedIndex >= 0 && <button type="button" className={buttonClass} onClick={onFocus}>Focus finding</button>}
        <button type="button" className={buttonClass} aria-label="Previous diagnostic finding" onClick={() => move(-1)} disabled={selectedIndex === 0}>
          <ChevronLeft size={16} aria-hidden="true" />Previous
        </button>
        <button type="button" className={buttonClass} aria-label="Next diagnostic finding" onClick={() => move(1)} disabled={selectedIndex === findings.length - 1}>
          Next<ChevronRight size={16} aria-hidden="true" />
        </button>
        <span className="sr-only" aria-live="polite" aria-atomic="true">{focusAnnouncement}</span>
      </div>
    </section>
  );
}
