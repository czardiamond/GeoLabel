export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 4;
export const IMAGE_ZOOM_STEP = 0.25;

export function clampImageZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_IMAGE_ZOOM;
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, Math.round(value * 100) / 100));
}

export function stepImageZoom(value: number, direction: -1 | 1): number {
  return clampImageZoom(value + direction * IMAGE_ZOOM_STEP);
}
