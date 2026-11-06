import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySparsePixelMask,
  eraseSparseStroke,
  fillSparseEnclosed,
  mergeSparseMasks,
  paintSparseStroke,
  splitSparseMaskComponents,
  type SparsePixelMask,
} from './sparsePixelMasks.ts';

const sparse = (width: number, height: number, rows: number[][]): SparsePixelMask => ({
  version: 2,
  encoding: 'application/vnd.geolabel.pixel-runs+json',
  width,
  height,
  rows: rows as SparsePixelMask['rows'],
});

test('10,980 by 10,980 brush strokes edit only sparse source-pixel runs', () => {
  const empty = emptySparsePixelMask(10_980, 10_980);
  const painted = paintSparseStroke(empty, [[5_489.5, 5_489.5]], 0.6);
  assert.deepEqual(painted.rows, [[5_489, 5_489, 5_490]]);
  const extended = paintSparseStroke(painted, [[5_489.5, 5_489.5], [5_492.5, 5_489.5]], 0.6);
  assert.deepEqual(extended.rows, [[5_489, 5_489, 5_493]]);
  const erased = eraseSparseStroke(extended, [[5_490.5, 5_489.5]], 0.6);
  assert.deepEqual(erased.rows, [[5_489, 5_489, 5_490], [5_489, 5_491, 5_493]]);
  assert.equal(JSON.stringify(erased).length < 200, true);
});

test('sparse mask union and four-connected splitting preserve pixel runs', () => {
  const left = sparse(8, 8, [[1, 1, 2], [2, 2, 3]]);
  const right = sparse(8, 8, [[1, 3, 4], [2, 3, 4]]);
  const merged = mergeSparseMasks([left, right]);
  assert.deepEqual(merged.rows, [[1, 1, 2], [1, 3, 4], [2, 2, 4]]);
  const diagonal = sparse(8, 8, [[1, 1, 2], [2, 2, 3]]);
  assert.deepEqual(splitSparseMaskComponents(diagonal).map(part => part.rows), [
    [[1, 1, 2]],
    [[2, 2, 3]],
  ]);
});

test('sparse fill fills an enclosed four-connected region but rejects boundary regions', () => {
  const ring = sparse(5, 5, [[1, 1, 4], [2, 1, 2], [2, 3, 4], [3, 1, 4]]);
  const filled = fillSparseEnclosed(ring, [2.5, 2.5]);
  assert.deepEqual(filled.rows, [[1, 1, 4], [2, 1, 4], [3, 1, 4]]);
  assert.throws(() => fillSparseEnclosed(ring, [0.5, 0.5]), /image boundary/);
});

test('sparse masks reject overlapping, out-of-range, and malformed runs', () => {
  assert.throws(() => paintSparseStroke(sparse(5, 5, [[1, 1, 4], [1, 3, 5]]), [[2.5, 2.5]], 0.6), /sorted|non-overlapping/);
  assert.throws(() => paintSparseStroke(sparse(5, 5, [[5, 1, 2]]), [[2.5, 2.5]], 0.6), /in bounds/);
  assert.throws(() => emptySparsePixelMask(1_000_000, 1_000_000), /bounded source-pixel limit/);
  const overArea = sparse(50_000, 501, Array.from({ length: 501 }, (_, row) => [row, 0, 50_000]));
  assert.throws(() => eraseSparseStroke(overArea, [[1, 1]], 0.6), /painted-pixel limit/);
});
