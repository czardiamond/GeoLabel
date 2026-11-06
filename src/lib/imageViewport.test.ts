import test from 'node:test';
import assert from 'node:assert/strict';
import { clampImageZoom, IMAGE_ZOOM_STEP, MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, stepImageZoom } from './imageViewport.ts';

test('clamps image zoom to the supported range and handles non-finite input', () => {
  assert.equal(clampImageZoom(0.2), MIN_IMAGE_ZOOM);
  assert.equal(clampImageZoom(2.345), 2.35);
  assert.equal(clampImageZoom(99), MAX_IMAGE_ZOOM);
  assert.equal(clampImageZoom(Number.NaN), MIN_IMAGE_ZOOM);
  assert.equal(clampImageZoom(Number.POSITIVE_INFINITY), MIN_IMAGE_ZOOM);
});

test('steps image zoom in quarter increments without crossing either bound', () => {
  assert.equal(stepImageZoom(1, -1), MIN_IMAGE_ZOOM);
  assert.equal(stepImageZoom(1, 1), 1 + IMAGE_ZOOM_STEP);
  assert.equal(stepImageZoom(15.75, 1), MAX_IMAGE_ZOOM);
  assert.equal(stepImageZoom(16, 1), MAX_IMAGE_ZOOM);
});
