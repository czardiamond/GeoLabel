import { ANNOTATION_CANVAS_HEIGHT, ANNOTATION_CANVAS_WIDTH } from './georeferencing.ts';
import { clampImageZoom } from './imageViewport.ts';

export type ReviewScreenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ReviewViewport = {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  scrollLeft: number;
  scrollTop: number;
  currentZoom: number;
};

export type ReviewFocusPlan = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

const SUPPORTED_GEOMETRIES = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]);

/** Project a supported GeoJSON geometry into the annotation canvas and return its visible bounds. */
export function geometryScreenBounds(
  geometry: unknown,
  project: (point: [number, number]) => [number, number],
): ReviewScreenBounds | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (typeof candidate.type !== 'string' || !SUPPORTED_GEOMETRIES.has(candidate.type)) return null;

  let invalid = false;
  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || !Array.isArray(value) || value.length === 0) {
      invalid = true;
      return;
    }
    if (typeof value[0] === 'number' || typeof value[1] === 'number') {
      if (typeof value[0] !== 'number' || typeof value[1] !== 'number'
          || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
        invalid = true;
        return;
      }
      let point: [number, number];
      try {
        point = project([value[0], value[1]]);
      } catch {
        invalid = true;
        return;
      }
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
        invalid = true;
        return;
      }
      count += 1;
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
      return;
    }
    for (const child of value) visit(child, depth + 1);
  };

  visit(candidate.coordinates, 0);
  if (invalid || count === 0) return null;

  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(ANNOTATION_CANVAS_WIDTH, maxX);
  maxY = Math.min(ANNOTATION_CANVAS_HEIGHT, maxY);
  if (minX > maxX || minY > maxY) return null;
  return { minX, minY, maxX, maxY };
}

/** Combine submitted and reference geometry bounds, ignoring only unavailable sides. */
export function unionReviewBounds(
  ...bounds: Array<ReviewScreenBounds | null | undefined>
): ReviewScreenBounds | null {
  const valid = bounds.filter((item): item is ReviewScreenBounds => Boolean(item));
  if (!valid.length) return null;
  return {
    minX: Math.min(...valid.map(item => item.minX)),
    minY: Math.min(...valid.map(item => item.minY)),
    maxX: Math.max(...valid.map(item => item.maxX)),
    maxY: Math.max(...valid.map(item => item.maxY)),
  };
}

/** Fit a selected finding with margin and clamp the resulting pan to image boundaries. */
export function calculateReviewFocusPlan(
  bounds: ReviewScreenBounds,
  viewport: ReviewViewport,
): ReviewFocusPlan | null {
  const measurements = [
    viewport.viewportWidth, viewport.viewportHeight, viewport.contentWidth, viewport.contentHeight,
    viewport.scrollLeft, viewport.scrollTop, viewport.currentZoom,
    bounds.minX, bounds.minY, bounds.maxX, bounds.maxY,
  ];
  if (measurements.some(value => !Number.isFinite(value))
      || viewport.viewportWidth <= 0 || viewport.viewportHeight <= 0
      || viewport.contentWidth <= 0 || viewport.contentHeight <= 0
      || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) return null;

  const widthInView = Math.max(
    (bounds.maxX - bounds.minX) / ANNOTATION_CANVAS_WIDTH * viewport.contentWidth,
    32,
  );
  const heightInView = Math.max(
    (bounds.maxY - bounds.minY) / ANNOTATION_CANVAS_HEIGHT * viewport.contentHeight,
    32,
  );
  const scaleToFit = Math.min(
    viewport.viewportWidth * 0.72 / widthInView,
    viewport.viewportHeight * 0.72 / heightInView,
  );
  const currentZoom = clampImageZoom(viewport.currentZoom);
  const zoom = clampImageZoom(currentZoom * scaleToFit);
  const zoomScale = zoom / currentZoom;
  const targetContentWidth = viewport.contentWidth * zoomScale;
  const targetContentHeight = viewport.contentHeight * zoomScale;
  const centerX = ((bounds.minX + bounds.maxX) / 2) / ANNOTATION_CANVAS_WIDTH * targetContentWidth;
  const centerY = ((bounds.minY + bounds.maxY) / 2) / ANNOTATION_CANVAS_HEIGHT * targetContentHeight;
  const maxScrollLeft = Math.max(0, targetContentWidth - viewport.viewportWidth);
  const maxScrollTop = Math.max(0, targetContentHeight - viewport.viewportHeight);

  return {
    zoom,
    scrollLeft: Math.min(maxScrollLeft, Math.max(0, centerX - viewport.viewportWidth / 2)),
    scrollTop: Math.min(maxScrollTop, Math.max(0, centerY - viewport.viewportHeight / 2)),
  };
}
