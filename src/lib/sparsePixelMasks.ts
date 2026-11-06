export type PixelPoint = [number, number];
export type PixelRun = [y: number, start: number, end: number];
export type SparsePixelMask = {
  version: 2;
  encoding: 'application/vnd.geolabel.pixel-runs+json';
  width: number;
  height: number;
  rows: PixelRun[];
};

type Interval = [start: number, end: number];
const MAX_SPARSE_EDGE = 100_000;
export const MAX_SPARSE_PIXEL_MASK_PIXELS = 500_000_000;
export const MAX_SPARSE_MASK_PAINTED_PIXELS = 25_000_000;
export const MAX_SPARSE_MASK_RUNS = 250_000;
const MAX_STROKE_POINTS = 50_000;
const MAX_STROKE_RADIUS = 512;
const MAX_STROKE_CANDIDATE_PIXELS = 25_000_000;
export const MAX_SPARSE_MASK_BYTES = 2_000_000;

export function isSparsePixelMask(value: unknown): value is SparsePixelMask {
  if (!value || typeof value !== 'object') return false;
  const mask = value as Partial<SparsePixelMask>;
  return mask.version === 2 && mask.encoding === 'application/vnd.geolabel.pixel-runs+json'
    && Number.isInteger(mask.width) && Number.isInteger(mask.height) && Array.isArray(mask.rows);
}

function checkDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
      || width > MAX_SPARSE_EDGE || height > MAX_SPARSE_EDGE
      || width * height > MAX_SPARSE_PIXEL_MASK_PIXELS) {
    throw new Error('Sparse mask dimensions are invalid or exceed the bounded source-pixel limit.');
  }
}

function checkedRows(mask: SparsePixelMask): Map<number, Interval[]> {
  checkDimensions(mask.width, mask.height);
  if (!Array.isArray(mask.rows) || mask.rows.length > MAX_SPARSE_MASK_RUNS) {
    throw new Error(`Sparse mask exceeds the ${MAX_SPARSE_MASK_RUNS.toLocaleString()} run limit.`);
  }
  const rows = new Map<number, Interval[]>();
  let previousY = -1, previousEnd = -1, paintedPixels = 0;
  for (const run of mask.rows) {
    if (!Array.isArray(run) || run.length !== 3 || run.some(value => !Number.isSafeInteger(value))) {
      throw new Error('Sparse mask runs must be integer [row, start, end] triples.');
    }
    const [y, start, end] = run;
    if (y < 0 || y >= mask.height || start < 0 || start >= end || end > mask.width
        || y < previousY || (y === previousY && start <= previousEnd)) {
      throw new Error('Sparse mask runs must be sorted, in bounds, non-overlapping, and non-adjacent.');
    }
    paintedPixels += end - start;
    if (paintedPixels > MAX_SPARSE_MASK_PAINTED_PIXELS) {
      throw new Error(`Sparse mask exceeds the ${MAX_SPARSE_MASK_PAINTED_PIXELS.toLocaleString()} painted-pixel limit.`);
    }
    const intervals = rows.get(y) || [];
    intervals.push([start, end]);
    rows.set(y, intervals);
    previousY = y;
    previousEnd = end;
  }
  return rows;
}

function fromRows(width: number, height: number, rows: Map<number, Interval[]>): SparsePixelMask {
  const runs: PixelRun[] = [];
  let paintedPixels = 0;
  for (const [y, intervals] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    for (const [start, end] of mergeIntervals(intervals)) {
      paintedPixels += end - start;
      if (paintedPixels > MAX_SPARSE_MASK_PAINTED_PIXELS) {
        throw new Error(`Sparse mask exceeds the ${MAX_SPARSE_MASK_PAINTED_PIXELS.toLocaleString()} painted-pixel limit.`);
      }
      runs.push([y, start, end]);
    }
  }
  if (runs.length > MAX_SPARSE_MASK_RUNS) {
    throw new Error(`Sparse mask exceeds the ${MAX_SPARSE_MASK_RUNS.toLocaleString()} run limit.`);
  }
  const result: SparsePixelMask = {
    version: 2,
    encoding: 'application/vnd.geolabel.pixel-runs+json',
    width,
    height,
    rows: runs,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_SPARSE_MASK_BYTES) {
    throw new Error('This sparse mask exceeds the 2 MB per-mask limit. Reduce or split the painted area.');
  }
  return result;
}

function mergeIntervals(values: Interval[]): Interval[] {
  if (!values.length) return [];
  const sorted = values.map(([start, end]) => [start, end] as Interval).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result: Interval[] = [sorted[0]];
  for (const [start, end] of sorted.slice(1)) {
    const last = result[result.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

function unionIntervals(a: Interval[], b: Interval[]): Interval[] {
  return mergeIntervals([...a, ...b]);
}

function subtractIntervals(source: Interval[], cuts: Interval[]): Interval[] {
  if (!cuts.length) return source.map(([start, end]) => [start, end]);
  const result: Interval[] = [];
  const mergedCuts = mergeIntervals(cuts);
  let cutIndex = 0;
  for (const [start, end] of source) {
    let cursor = start;
    while (cutIndex < mergedCuts.length && mergedCuts[cutIndex][1] <= cursor) cutIndex++;
    let index = cutIndex;
    while (index < mergedCuts.length && mergedCuts[index][0] < end) {
      const [cutStart, cutEnd] = mergedCuts[index];
      if (cutStart > cursor) result.push([cursor, Math.min(cutStart, end)]);
      cursor = Math.max(cursor, cutEnd);
      if (cursor >= end) break;
      index++;
    }
    if (cursor < end) result.push([cursor, end]);
  }
  return result;
}

function checkedPath(points: PixelPoint[], radius: number): PixelPoint[] {
  if (!Array.isArray(points) || points.length < 1 || points.length > MAX_STROKE_POINTS
      || points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value)))) {
    throw new Error('Mask stroke must contain finite pixel coordinates.');
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_STROKE_RADIUS) {
    throw new Error('Brush radius must be between 0 and 512 source pixels.');
  }
  return points;
}

function strokeIntervals(width: number, height: number, points: PixelPoint[], radius: number): Map<number, Interval[]> {
  checkDimensions(width, height);
  checkedPath(points, radius);
  const segments: Array<[PixelPoint, PixelPoint]> = points.length === 1
    ? [[points[0], points[0]]]
    : points.slice(1).map((point, index) => [points[index], point]);
  const result = new Map<number, Interval[]>();
  let candidateWork = 0;
  for (const [[x1, y1], [x2, y2]] of segments) {
    const rawMinX = Math.min(x1, x2) - radius - 1, rawMaxX = Math.max(x1, x2) + radius;
    const rawMinY = Math.min(y1, y2) - radius - 1, rawMaxY = Math.max(y1, y2) + radius;
    if (rawMaxX < 0 || rawMaxY < 0 || rawMinX >= width || rawMinY >= height) continue;
    const minX = Math.max(0, Math.floor(Math.max(-1, rawMinX)));
    const maxX = Math.min(width - 1, Math.ceil(Math.min(width, rawMaxX)));
    const minY = Math.max(0, Math.floor(Math.max(-1, rawMinY)));
    const maxY = Math.min(height - 1, Math.ceil(Math.min(height, rawMaxY)));
    candidateWork += Math.max(0, maxX - minX + 1) * Math.max(0, maxY - minY + 1);
    if (candidateWork > MAX_STROKE_CANDIDATE_PIXELS) {
      throw new Error(`Mask stroke exceeds the ${MAX_STROKE_CANDIDATE_PIXELS.toLocaleString()} candidate-pixel processing limit.`);
    }
    const dx = x2 - x1, dy = y2 - y1, lengthSquared = dx * dx + dy * dy;
    for (let y = minY; y <= maxY; y++) {
      let intervalStart = -1;
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const t = lengthSquared ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)) : 0;
        const nearestX = x1 + t * dx, nearestY = y1 + t * dy;
        const covered = (px - nearestX) ** 2 + (py - nearestY) ** 2 <= radius ** 2;
        if (covered && intervalStart < 0) intervalStart = x;
        if (!covered && intervalStart >= 0) {
          const row = result.get(y) || [];
          row.push([intervalStart, x]);
          result.set(y, row);
          intervalStart = -1;
        }
      }
      if (intervalStart >= 0) {
        const row = result.get(y) || [];
        row.push([intervalStart, maxX + 1]);
        result.set(y, row);
      }
    }
  }
  return result;
}

function editStroke(mask: SparsePixelMask, points: PixelPoint[], radius: number, erase: boolean): SparsePixelMask {
  const existing = checkedRows(mask);
  const edits = strokeIntervals(mask.width, mask.height, points, radius);
  const result = new Map<number, Interval[]>();
  for (const y of new Set([...existing.keys(), ...edits.keys()])) {
    const before = existing.get(y) || [], stroke = edits.get(y) || [];
    const next = erase ? subtractIntervals(before, stroke) : unionIntervals(before, stroke);
    if (next.length) result.set(y, next);
  }
  return fromRows(mask.width, mask.height, result);
}

export function emptySparsePixelMask(width: number, height: number): SparsePixelMask {
  checkDimensions(width, height);
  return { version: 2, encoding: 'application/vnd.geolabel.pixel-runs+json', width, height, rows: [] };
}

export function paintSparseStroke(mask: SparsePixelMask, points: PixelPoint[], radius: number): SparsePixelMask {
  return editStroke(mask, points, radius, false);
}

export function eraseSparseStroke(mask: SparsePixelMask, points: PixelPoint[], radius: number): SparsePixelMask {
  return editStroke(mask, points, radius, true);
}

export function mergeSparseMasks(masks: SparsePixelMask[]): SparsePixelMask {
  if (masks.length < 2) throw new Error('Select at least two masks to merge.');
  if (masks.length > 8) throw new Error('Merge at most 8 masks at once.');
  const first = masks[0];
  const merged = new Map<number, Interval[]>();
  for (const mask of masks) {
    if (mask.width !== first.width || mask.height !== first.height) throw new Error('Sparse mask dimensions do not match.');
    for (const [y, intervals] of checkedRows(mask)) merged.set(y, unionIntervals(merged.get(y) || [], intervals));
  }
  if (!merged.size) throw new Error('Empty masks cannot be merged.');
  return fromRows(first.width, first.height, merged);
}

class DisjointSet {
  private readonly parent: number[];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, index) => index); }
  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[value] !== value) { const next = this.parent[value]; this.parent[value] = root; value = next; }
    return root;
  }
  union(a: number, b: number): void {
    const rootA = this.find(a), rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

type IntervalNode = { y: number; start: number; end: number; id: number };
function connectAdjacentRows(previous: IntervalNode[], current: IntervalNode[], sets: DisjointSet): void {
  let a = 0, b = 0;
  while (a < previous.length && b < current.length) {
    const upper = previous[a], lower = current[b];
    if (Math.max(upper.start, lower.start) < Math.min(upper.end, lower.end)) sets.union(upper.id, lower.id);
    if (upper.end <= lower.end) a++;
    else b++;
  }
}

export function fillSparseEnclosed(mask: SparsePixelMask, seed: PixelPoint): SparsePixelMask {
  const painted = checkedRows(mask);
  if (!Array.isArray(seed) || seed.length !== 2 || seed.some(value => !Number.isFinite(value))) {
    throw new Error('Fill location must be a finite source-pixel coordinate.');
  }
  const x = Math.floor(seed[0]), y = Math.floor(seed[1]);
  if (x < 0 || x >= mask.width || y < 0 || y >= mask.height) throw new Error('Fill location is outside the source image.');
  const paintedAtSeed = (painted.get(y) || []).some(([start, end]) => start <= x && x < end);
  if (paintedAtSeed) return mask;

  const backgroundRows: IntervalNode[][] = Array.from({ length: mask.height }, () => []);
  let id = 0;
  for (let row = 0; row < mask.height; row++) {
    let cursor = 0;
    for (const [start, end] of painted.get(row) || []) {
      if (cursor < start) backgroundRows[row].push({ y: row, start: cursor, end: start, id: id++ });
      cursor = end;
    }
    if (cursor < mask.width) backgroundRows[row].push({ y: row, start: cursor, end: mask.width, id: id++ });
    if (id > MAX_SPARSE_MASK_RUNS) throw new Error('Fill would inspect too many sparse pixel regions.');
  }
  const seedNode = backgroundRows[y].find(run => run.start <= x && x < run.end);
  if (!seedNode) return mask;
  const sets = new DisjointSet(id);
  for (let row = 1; row < mask.height; row++) connectAdjacentRows(backgroundRows[row - 1], backgroundRows[row], sets);
  const target = sets.find(seedNode.id);
  const region: Map<number, Interval[]> = new Map();
  let touchesBoundary = false;
  for (const row of backgroundRows) for (const run of row) {
    if (sets.find(run.id) !== target) continue;
    const intervals = region.get(run.y) || [];
    intervals.push([run.start, run.end]);
    region.set(run.y, intervals);
    if (run.start === 0 || run.end === mask.width || run.y === 0 || run.y === mask.height - 1) touchesBoundary = true;
  }
  if (touchesBoundary) throw new Error('Fill region reaches the image boundary; paint a closed outline first.');
  const output = new Map<number, Interval[]>([...painted.entries()].map(([row, intervals]) => [row, intervals.map(([start, end]) => [start, end]) as Interval[]]));
  for (const [row, intervals] of region) output.set(row, unionIntervals(output.get(row) || [], intervals));
  return fromRows(mask.width, mask.height, output);
}

export function splitSparseMaskComponents(mask: SparsePixelMask): SparsePixelMask[] {
  const painted = checkedRows(mask);
  const rows: IntervalNode[][] = Array.from({ length: mask.height }, () => []);
  let id = 0;
  for (const [y, intervals] of painted) {
    rows[y] = intervals.map(([start, end]) => ({ y, start, end, id: id++ }));
  }
  if (id > MAX_SPARSE_MASK_RUNS) throw new Error('Sparse mask has too many runs to split safely.');
  const sets = new DisjointSet(id);
  for (let row = 1; row < mask.height; row++) connectAdjacentRows(rows[row - 1], rows[row], sets);
  const components = new Map<number, Map<number, Interval[]>>();
  for (const row of rows) for (const run of row) {
    const root = sets.find(run.id), component = components.get(root) || new Map<number, Interval[]>();
    const intervals = component.get(run.y) || [];
    intervals.push([run.start, run.end]);
    component.set(run.y, intervals);
    components.set(root, component);
  }
  if (components.size > 100) throw new Error('A mask may be split into at most 100 four-connected components at once.');
  return [...components.values()].map(rowsForPart => fromRows(mask.width, mask.height, rowsForPart));
}
