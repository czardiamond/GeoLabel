import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewOverlayLayers, toggleReviewOverlay } from './reviewOverlays.ts';

test('builds independently addressable consensus and worker overlay layers', () => {
  const first = { type: 'Feature', id: 'first' };
  const second = { type: 'Feature', id: 'second' };
  const layers = buildReviewOverlayLayers(
    [
      { id: 'submission-a', annotator_id: 'user-a', geojson: { features: [first] } },
      { id: 'submission-b', annotator_id: 'user-b', geojson: { features: [second] } },
    ],
    { available: true, geojson: { features: [first] } },
  );

  assert.deepEqual(layers.map(({ id, label }) => [id, label]), [
    ['consensus', 'Consensus'],
    ['annotation:submission-a', 'Worker 1'],
    ['annotation:submission-b', 'Worker 2'],
  ]);
  assert.notEqual(layers[0].color, layers[1].color);
  assert.deepEqual(layers[1].features, [first]);
  assert.deepEqual(layers[2].features, [second]);
});

test('omits unavailable consensus but keeps submitted worker overlays', () => {
  const layers = buildReviewOverlayLayers([{ id: 'submission-a' }], { available: false });
  assert.deepEqual(layers.map(({ id }) => id), ['annotation:submission-a']);
  assert.deepEqual(layers[0].features, []);
});

test('toggles overlay visibility without mutating or reordering existing layers', () => {
  const original = ['consensus', 'annotation:a'];
  const shown = toggleReviewOverlay(original, 'annotation:b');
  assert.deepEqual(shown, ['consensus', 'annotation:a', 'annotation:b']);
  assert.deepEqual(toggleReviewOverlay(shown, 'consensus'), ['annotation:a', 'annotation:b']);
  assert.deepEqual(original, ['consensus', 'annotation:a']);
});
