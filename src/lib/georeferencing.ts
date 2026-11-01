export type AffineTransform = [number, number, number, number, number, number];
export type PixelAssetGeometry = {
  width?: number;
  height?: number;
  bounds?: [number, number, number, number];
  metadata?: { affine_transform?: number[] };
};

/** Logical overlay coordinate plane shared by raster rendering and pointer input. */
export const ANNOTATION_CANVAS_WIDTH = 1000;
export const ANNOTATION_CANVAS_HEIGHT = 700;
export type ClientViewportRect = { left: number; top: number; width: number; height: number };

/** Map a browser pointer into the full logical annotation plane, independent of viewport aspect ratio. */
export function clientToAnnotationCanvas(
  clientX: number,
  clientY: number,
  rect: ClientViewportRect,
): [number, number] {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)
      || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)
      || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
      || rect.width <= 0 || rect.height <= 0) return [0, 0];
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return [x * ANNOTATION_CANVAS_WIDTH, y * ANNOTATION_CANVAS_HEIGHT];
}

/** Convert logical overlay coordinates to source-image pixel-corner coordinates. */
export function annotationCanvasToSourcePixel(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  if (width <= 0 || height <= 0) return [x, y];
  return [x / ANNOTATION_CANVAS_WIDTH * width, y / ANNOTATION_CANVAS_HEIGHT * height];
}

/** Convert source-image pixel-corner coordinates to the logical overlay plane. */
export function sourcePixelToAnnotationCanvas(
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
): [number, number] {
  if (width <= 0 || height <= 0) return [pixelX, pixelY];
  return [pixelX / width * ANNOTATION_CANVAS_WIDTH, pixelY / height * ANNOTATION_CANVAS_HEIGHT];
}

/** Return the exact source-pixel-corner affine, or a north-up affine from bounds. */
export function assetPixelAffine(asset?: PixelAssetGeometry): AffineTransform | null {
  const width = asset?.width ?? 0;
  const height = asset?.height ?? 0;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  const supplied = asset?.metadata?.affine_transform;
  if (supplied != null) {
    if (!Array.isArray(supplied) || supplied.length !== 6 || supplied.some(value => !Number.isFinite(value))) return null;
    const transform = supplied as AffineTransform;
    const [a, b, , d, e] = transform;
    if (!Number.isFinite(a * e - b * d) || Math.abs(a * e - b * d) < 1e-15) return null;
    return transform;
  }
  const bounds = asset?.bounds;
  if (!bounds || bounds.length !== 4 || bounds.some(value => !Number.isFinite(value))) return null;
  const [xmin, ymin, xmax, ymax] = bounds;
  if (xmin >= xmax || ymin >= ymax) return null;
  return [(xmax - xmin) / width, 0, xmin, 0, -(ymax - ymin) / height, ymax];
}

export function sourcePixelToGeo(pixelX: number, pixelY: number, asset?: PixelAssetGeometry): [number, number] {
  const transform = assetPixelAffine(asset);
  if (!transform) return [pixelX, pixelY];
  const [a, b, c, d, e, f] = transform;
  return [a * pixelX + b * pixelY + c, d * pixelX + e * pixelY + f];
}

export function geoToSourcePixel(point: [number, number], asset?: PixelAssetGeometry): [number, number] {
  const transform = assetPixelAffine(asset);
  if (!transform) return point;
  const [a, b, c, d, e, f] = transform;
  const determinant = a * e - b * d;
  const dx = point[0] - c;
  const dy = point[1] - f;
  return [(e * dx - b * dy) / determinant, (-d * dx + a * dy) / determinant];
}

export function screenToGeo(x: number, y: number, asset?: PixelAssetGeometry): [number, number] {
  const width = asset?.width ?? 0;
  const height = asset?.height ?? 0;
  if (width <= 0 || height <= 0) return [x, y];
  if (!assetPixelAffine(asset)) {
    const bounds = asset?.bounds;
    if (bounds && bounds.length === 4 && bounds[0] < bounds[2] && bounds[1] < bounds[3]) {
      return [bounds[0] + x / ANNOTATION_CANVAS_WIDTH * (bounds[2] - bounds[0]), bounds[3] - y / ANNOTATION_CANVAS_HEIGHT * (bounds[3] - bounds[1])];
    }
    return [x, y];
  }
  const [pixelX, pixelY] = annotationCanvasToSourcePixel(x, y, width, height);
  return sourcePixelToGeo(pixelX, pixelY, asset);
}

export function geoToScreen(point: [number, number], asset?: PixelAssetGeometry): [number, number] {
  const width = asset?.width ?? 0;
  const height = asset?.height ?? 0;
  if (width <= 0 || height <= 0) return point;
  if (!assetPixelAffine(asset)) {
    const bounds = asset?.bounds;
    if (bounds && bounds.length === 4 && bounds[0] < bounds[2] && bounds[1] < bounds[3]) {
      return [(point[0] - bounds[0]) / (bounds[2] - bounds[0]) * ANNOTATION_CANVAS_WIDTH, (bounds[3] - point[1]) / (bounds[3] - bounds[1]) * ANNOTATION_CANVAS_HEIGHT];
    }
    return point;
  }
  const [pixelX, pixelY] = geoToSourcePixel(point, asset);
  return sourcePixelToAnnotationCanvas(pixelX, pixelY, width, height);
}
