import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotationCanvasToSourcePixel, clientToAnnotationCanvas } from './georeferencing.ts';
import { componentMask, eraseStroke, fillEnclosed, mergeMasks, paintStroke, splitMaskComponents } from './pixelMasks.ts';

test('paint and eraser strokes affect source pixel centers and preserve other pixels', () => {
  const empty = new Uint8Array(25);
  const painted = paintStroke(empty, 5, 5, [[2.5, 2.5]], 0.6);
  assert.equal(painted[12], 255);
  assert.equal(painted[11], 0);
  const erased = eraseStroke(painted, 5, 5, [[2.5, 2.5]], 0.6);
  assert.equal(erased[12], 0);
  assert.equal(erased[11], 0);
  const untouched = paintStroke(empty, 5, 5, [[0.5, 0.5]], 0.6);
  assert.equal(untouched[0], 255);
});

test('wide and tall viewport brush points target the expected source pixels', () => {
  const cases = [
    { width: 400, height: 200, rect: { left: 10, top: 20, width: 1200, height: 600 }, client: [310, 320] as [number, number], pixel: [100, 100] as [number, number] },
    { width: 200, height: 400, rect: { left: 50, top: 30, width: 400, height: 800 }, client: [150, 430] as [number, number], pixel: [50, 200] as [number, number] },
  ];

  for (const { width, height, rect, client, pixel } of cases) {
    const canvasPoint = clientToAnnotationCanvas(client[0], client[1], rect);
    const sourcePixel = annotationCanvasToSourcePixel(canvasPoint[0], canvasPoint[1], width, height);
    assert.deepEqual(sourcePixel, pixel);
    const mask = paintStroke(new Uint8Array(width * height), width, height, [sourcePixel], 1);
    assert.equal(mask[pixel[1] * width + pixel[0]], 255);
  }
});

test('fill adds only an enclosed transparent component', () => {
  const mask = new Uint8Array(25);
  for (let i = 1; i <= 3; i++) {
    mask[1 * 5 + i] = 255;
    mask[3 * 5 + i] = 255;
    mask[i * 5 + 1] = 255;
    mask[i * 5 + 3] = 255;
  }
  const filled = fillEnclosed(mask, 5, 5, [2.5, 2.5]);
  assert.equal(filled[12], 255);
  assert.equal(filled[0], 0);
  assert.equal(mask[12], 0, 'fill does not mutate its input');
  assert.throws(() => fillEnclosed(mask, 5, 5, [0.5, 0.5]), /image boundary/);
  assert.throws(() => fillEnclosed(mask, 5, 5, [9, 9]), /outside/);
});

test('merge unions same-size masks and rejects a single input', () => {
  const left = new Uint8Array(9); left[0] = 255; left[4] = 128;
  const right = new Uint8Array(9); right[8] = 255;
  assert.deepEqual([...mergeMasks([left, right], 3, 3)], [255, 0, 0, 0, 255, 0, 0, 0, 255]);
  assert.throws(() => mergeMasks([left], 3, 3), /at least two/);
  assert.throws(() => mergeMasks([left, new Uint8Array(4)], 3, 3), /dimensions/);
  assert.throws(() => mergeMasks(Array.from({ length: 9 }, () => new Uint8Array(1)), 1, 1), /at most 8/);
});

test('split returns distinct four-connected components as source-pixel indices', () => {
  const mask = new Uint8Array(25);
  mask[0] = 255; mask[1] = 255; mask[6] = 255; mask[24] = 255;
  const components = splitMaskComponents(mask, 5, 5);
  assert.equal(components.length, 2);
  assert.deepEqual([...components[0]], [0, 1, 6]);
  assert.deepEqual([...componentMask(components[1], 25)].flatMap((v, i) => v ? [i] : []), [24]);
});

test('rejects malformed paths and masks beyond the source-pixel limit', () => {
  assert.throws(() => paintStroke(new Uint8Array(4), 2, 2, [[Number.NaN, 1]], 1), /finite/);
  assert.throws(() => splitMaskComponents(new Uint8Array(1), 3000, 3000), /dimensions/);
  const largeImage = new Uint8Array(8_000_000);
  assert.throws(() => paintStroke(largeImage, 2_000_000, 4,
    [[0, 2], [1_999_999, 2], [0, 2], [1_999_999, 2], [0, 2]], 1), /candidate-pixel processing limit/);
});
