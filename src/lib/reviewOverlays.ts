export type ReviewOverlayAnnotation<T> = {
  id: string;
  annotator_id?: string;
  geojson?: { features?: T[] };
};

export type ReviewDiagnosticReference = 'consensus' | 'gold';

export type ReviewDiagnosticsPayload<T> = {
  available?: boolean;
  reference?: string;
  reference_geojson?: { features?: T[] };
};

export type ReviewOverlayReference<T> = {
  available: true;
  label: string;
  color: string;
  geojson?: { features?: T[] };
};

export type ReviewOverlayLayer<T> = {
  id: string;
  label: string;
  color: string;
  features: T[];
};

const WORKER_COLORS = ['#f97316', '#2563eb', '#a855f7', '#e11d48', '#0891b2'];

/** Only expose a reference overlay when it matches the currently selected diagnostics. */
export function selectReviewOverlayReference<T>(
  diagnostics: ReviewDiagnosticsPayload<T> | null | undefined,
  selectedReference: ReviewDiagnosticReference,
): ReviewOverlayReference<T> | null {
  if (!diagnostics?.available || diagnostics.reference !== selectedReference) return null;
  return selectedReference === 'gold'
    ? { available: true, label: 'Gold reference', color: '#0891b2', geojson: diagnostics.reference_geojson }
    : { available: true, label: 'Worker consensus', color: '#16a34a', geojson: diagnostics.reference_geojson };
}

/** Build read-only comparison layers without touching the editable annotation draft. */
export function buildReviewOverlayLayers<T>(
  annotations: readonly ReviewOverlayAnnotation<T>[],
  reference?: ReviewOverlayReference<T> | null,
): ReviewOverlayLayer<T>[] {
  const layers: ReviewOverlayLayer<T>[] = [];
  if (reference?.available) {
    layers.push({
      id: 'reference',
      label: reference.label,
      color: reference.color,
      features: reference.geojson?.features || [],
    });
  }
  annotations.forEach((annotation, index) => {
    layers.push({
      id: `annotation:${annotation.id}`,
      label: `Worker ${index + 1}`,
      color: WORKER_COLORS[index % WORKER_COLORS.length],
      features: annotation.geojson?.features || [],
    });
  });
  return layers;
}

/** Return a new visible-layer list, preserving the order of layers already shown. */
export function toggleReviewOverlay(visibleIds: readonly string[], id: string): string[] {
  if (visibleIds.includes(id)) return visibleIds.filter((visibleId) => visibleId !== id);
  return [...visibleIds, id];
}
