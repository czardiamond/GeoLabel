export type ReviewOverlayAnnotation<T> = {
  id: string;
  annotator_id?: string;
  geojson?: { features?: T[] };
};

export type ReviewOverlayConsensus<T> = {
  available?: boolean;
  geojson?: { features?: T[] };
};

export type ReviewOverlayLayer<T> = {
  id: string;
  label: string;
  color: string;
  features: T[];
};

const WORKER_COLORS = ['#f97316', '#2563eb', '#a855f7', '#e11d48', '#0891b2'];

/** Build read-only comparison layers without touching the editable annotation draft. */
export function buildReviewOverlayLayers<T>(
  annotations: readonly ReviewOverlayAnnotation<T>[],
  consensus?: ReviewOverlayConsensus<T> | null,
): ReviewOverlayLayer<T>[] {
  const layers: ReviewOverlayLayer<T>[] = [];
  if (consensus?.available) {
    layers.push({
      id: 'consensus',
      label: 'Consensus',
      color: '#16a34a',
      features: consensus.geojson?.features || [],
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
