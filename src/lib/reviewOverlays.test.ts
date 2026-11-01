import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewOverlayLayers, selectReviewOverlayReference, toggleReviewOverlay } from './reviewOverlays.ts';

test('builds a consensus reference layer and independent worker overlays', () => {
  const first = { type: 'Feature', id: 'first' };
  const second = { type: 'Feature', id: 'second' };
  const reference = selectReviewOverlayReference({
    available: true,
    reference: 'consensus',
    reference_geojson: { features: [first] },
  }, 'consensus');
  const layers = buildReviewOverlayLayers(
    [
      { id: 'submission-a', annotator_id: 'user-a', geojson: { features: [first] } },
      { id: 'submission-b', annotator_id: 'user-b', geojson: { features: [second] } },
    ],
    reference,
  );

  assert.deepEqual(layers.map(({ id, label }) => [id, label]), [
    ['reference', 'Worker consensus'],
    ['annotation:submission-a', 'Worker 1'],
    ['annotation:submission-b', 'Worker 2'],
  ]);
  assert.notEqual(layers[0].color, layers[1].color);
  assert.deepEqual(layers[0].features, [first]);
  assert.deepEqual(layers[1].features, [first]);
  assert.deepEqual(layers[2].features, [second]);
});

test('selecting gold swaps the visible reference geometry and label', () => {
  const consensusFeature = { type: 'Feature', id: 'consensus' };
  const goldFeature = { type: 'Feature', id: 'gold' };
  const diagnostics = {
    available: true,
    reference: 'gold',
    reference_geojson: { features: [goldFeature] },
  };

  const reference = selectReviewOverlayReference(diagnostics, 'gold');
  const layers = buildReviewOverlayLayers([], reference);

  assert.equal(reference?.label, 'Gold reference');
  assert.notEqual(reference?.color, '#16a34a');
  assert.deepEqual(layers.map(({ id, label }) => [id, label]), [['reference', 'Gold reference']]);
  assert.deepEqual(layers[0].features, [goldFeature]);
  assert.notDeepEqual(layers[0].features, [consensusFeature]);
});

test('hides stale, pending, or unavailable reference data while retaining worker layers', () => {
  const workerFeature = { type: 'Feature', id: 'worker' };
  const staleConsensus = selectReviewOverlayReference({
    available: true,
    reference: 'consensus',
    reference_geojson: { features: [{ type: 'Feature', id: 'consensus' }] },
  }, 'gold');
  const unavailableGold = selectReviewOverlayReference({
    available: false,
    reference: 'gold',
    reference_geojson: { features: [] },
  }, 'gold');

  assert.equal(staleConsensus, null);
  assert.equal(unavailableGold, null);
  const layers = buildReviewOverlayLayers([{ id: 'submission-a', geojson: { features: [workerFeature] } }], staleConsensus);
  assert.deepEqual(layers.map(({ id }) => id), ['annotation:submission-a']);
  assert.deepEqual(layers[0].features, [workerFeature]);
});

test('toggles overlay visibility without mutating or reordering existing layers', () => {
  const original = ['reference', 'annotation:a'];
  const shown = toggleReviewOverlay(original, 'annotation:b');
  assert.deepEqual(shown, ['reference', 'annotation:a', 'annotation:b']);
  assert.deepEqual(toggleReviewOverlay(shown, 'reference'), ['annotation:a', 'annotation:b']);
  assert.deepEqual(original, ['reference', 'annotation:a']);
});
