export type PixelPoint = [number, number];

export const MAX_PIXEL_MASK_PIXELS = 8_000_000;
export const MAX_SPLIT_COMPONENTS = 100;
export const MAX_MERGE_INPUTS = 8;
export const MAX_STROKE_CANDIDATE_PIXELS = 25_000_000;

function validate(mask: Uint8Array, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
      || width * height > MAX_PIXEL_MASK_PIXELS || mask.length !== width * height) {
    throw new Error('Mask dimensions are invalid or exceed the source-pixel processing limit.');
  }
}

function checkedPath(points: PixelPoint[], radius: number): PixelPoint[] {
  if (!Array.isArray(points) || points.length < 1 || points.length > 50_000
      || points.some(point => !Array.isArray(point) || point.length !== 2
        || point.some(value => !Number.isFinite(value)))) {
    throw new Error('Mask stroke must contain finite pixel coordinates.');
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > 512) {
    throw new Error('Brush radius must be between 0 and 512 source pixels.');
  }
  return points;
}

/** Draw a source-pixel-width capsule stroke into a binary alpha mask. */
export function paintStroke(mask: Uint8Array, width: number, height: number,
                            points: PixelPoint[], radius: number): Uint8Array {
  validate(mask, width, height);
  checkedPath(points, radius);
  const output = mask.slice();
  const segments: Array<[PixelPoint, PixelPoint]> = points.length === 1
    ? [[points[0], points[0]]]
    : points.slice(1).map((point, i) => [points[i], point]);
  const areas = segments.map(([[x1, y1], [x2, y2]]) => {
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 1));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(x1, x2) + radius));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 1));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(y1, y2) + radius));
    return { minX, maxX, minY, maxY };
  });
  const candidateWork = areas.reduce((total, area) => total
    + Math.max(0, area.maxX - area.minX + 1) * Math.max(0, area.maxY - area.minY + 1), 0);
  if (candidateWork > MAX_STROKE_CANDIDATE_PIXELS) {
    throw new Error(`Mask stroke exceeds the ${MAX_STROKE_CANDIDATE_PIXELS.toLocaleString()} candidate-pixel processing limit.`);
  }
  for (const [segmentIndex, [[x1, y1], [x2, y2]]] of segments.entries()) {
    const { minX, maxX, minY, maxY } = areas[segmentIndex];
    const dx = x2 - x1, dy = y2 - y1, lengthSquared = dx * dx + dy * dy;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const t = lengthSquared ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)) : 0;
        const nearestX = x1 + t * dx, nearestY = y1 + t * dy;
        if ((px - nearestX) ** 2 + (py - nearestY) ** 2 <= radius ** 2) output[y * width + x] = 255;
      }
    }
  }
  return output;
}

/** Erase only pixels covered by the stroke; untouched alpha values are preserved. */
export function eraseStroke(mask: Uint8Array, width: number, height: number,
                            points: PixelPoint[], radius: number): Uint8Array {
  validate(mask, width, height);
  const erased = paintStroke(new Uint8Array(mask.length), width, height, points, radius);
  const output = mask.slice();
  for (let index = 0; index < output.length; index++) if (erased[index]) output[index] = 0;
  return output;
}

/** Fill a transparent 4-connected region only when it is enclosed by painted pixels. */
export function fillEnclosed(mask: Uint8Array, width: number, height: number,
                             seed: PixelPoint): Uint8Array {
  validate(mask, width, height);
  if (!Array.isArray(seed) || seed.length !== 2 || seed.some(value => !Number.isFinite(value))) {
    throw new Error('Fill location must be a finite source-pixel coordinate.');
  }
  const x = Math.floor(seed[0]), y = Math.floor(seed[1]);
  if (x < 0 || x >= width || y < 0 || y >= height) throw new Error('Fill location is outside the source image.');
  const start = y * width + x;
  if (mask[start]) return mask.slice();

  const visited = new Uint8Array(mask.length);
  const queue = new Uint32Array(mask.length);
  let head = 0, tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  let touchesBoundary = false;
  while (head < tail) {
    const index = queue[head++], cx = index % width, cy = Math.floor(index / width);
    if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) touchesBoundary = true;
    const neighbors = [cx > 0 ? index - 1 : -1, cx + 1 < width ? index + 1 : -1,
      cy > 0 ? index - width : -1, cy + 1 < height ? index + width : -1];
    for (const next of neighbors) {
      if (next >= 0 && !mask[next] && !visited[next]) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  if (touchesBoundary) throw new Error('Fill region reaches the image boundary; paint a closed outline first.');
  const output = mask.slice();
  for (let i = 0; i < tail; i++) output[queue[i]] = 255;
  return output;
}

/** Union masks from the same source image; input order is preserved only by the caller. */
export function mergeMasks(masks: Uint8Array[], width: number, height: number): Uint8Array {
  if (masks.length < 2) throw new Error('Select at least two masks to merge.');
  if (masks.length > MAX_MERGE_INPUTS) throw new Error(`Merge at most ${MAX_MERGE_INPUTS} masks at once.`);
  for (const mask of masks) validate(mask, width, height);
  const output = new Uint8Array(width * height);
  for (const mask of masks) for (let i = 0; i < output.length; i++) if (mask[i]) output[i] = 255;
  if (!output.some(Boolean)) throw new Error('Empty masks cannot be merged.');
  return output;
}

/** Return the pixel indices for each 4-connected painted component, preserving no empty parts. */
export function splitMaskComponents(mask: Uint8Array, width: number, height: number): Uint32Array[] {
  validate(mask, width, height);
  const visited = new Uint8Array(mask.length);
  const queue = new Uint32Array(mask.length);
  const components: Uint32Array[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width;
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        index >= width ? index - width : -1, index + width < mask.length ? index + width : -1];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    components.push(queue.slice(0, tail));
    if (components.length > MAX_SPLIT_COMPONENTS) {
      throw new Error(`A mask may be split into at most ${MAX_SPLIT_COMPONENTS} components at once.`);
    }
  }
  return components;
}

export function componentMask(pixelIndices: Uint32Array, pixelCount: number): Uint8Array {
  if (!Number.isInteger(pixelCount) || pixelCount <= 0 || pixelCount > MAX_PIXEL_MASK_PIXELS) {
    throw new Error('Mask dimensions exceed the source-pixel processing limit.');
  }
  const output = new Uint8Array(pixelCount);
  for (const index of pixelIndices) {
    if (index >= pixelCount) throw new Error('Split component contains an out-of-range source pixel.');
    output[index] = 255;
  }
  return output;
}
