import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countReviewDiagnosticStatuses,
  flattenReviewDiagnostics,
  reviewDiagnosticKey,
  selectReviewDiagnosticFeatures,
} from './reviewDiagnostics.ts';

const workerFeature = { type: 'Feature', properties: { category: 'building' }, geometry: { type: 'Point', coordinates: [1, 2] } };
const referenceFeature = { type: 'Feature', properties: { category: 'road' }, geometry: { type: 'Point', coordinates: [1, 2] } };

const payload = {
  available: true,
  submissions: [{
    annotation_id: 'annotation-1',
    annotator_id: 'worker-1',
    diagnostics: [
      { status: 'category_mismatch' as const, feature_index: 0, reference_feature_index: 0, submitted_category: 'building', reference_category: 'road', overlap_score: 1 },
      { status: 'unmatched_submission' as const, feature_index: 1, reference_feature_index: null, submitted_category: 'building', reference_category: null, overlap_score: 0.1 },
    ],
  }],
  reference_geojson: { features: [referenceFeature] },
};

test('flattens comparison records and returns explicit counts by diagnostic type', () => {
  const diagnostics = flattenReviewDiagnostics(payload);
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].annotation_id, 'annotation-1');
  assert.equal(diagnostics[0].annotator_id, 'worker-1');
  assert.deepEqual(countReviewDiagnosticStatuses(diagnostics), {
    matched: 0,
    category_mismatch: 1,
    unmatched_submission: 1,
    unmatched_reference: 0,
  });
  assert.deepEqual(flattenReviewDiagnostics({ available: false }), []);
});

test('uses annotation and original feature indexes for stable keys and read-only highlights', () => {
  const diagnostics = flattenReviewDiagnostics(payload);
  assert.equal(reviewDiagnosticKey(diagnostics[0]), 'annotation-1:category_mismatch:0:0');
  const selected = selectReviewDiagnosticFeatures(diagnostics[0], [
    { id: 'annotation-1', geojson: { features: [workerFeature] } },
  ], payload.reference_geojson);
  assert.equal(selected.submitted, workerFeature);
  assert.equal(selected.reference, referenceFeature);
  assert.deepEqual(selectReviewDiagnosticFeatures(null, [], null), { submitted: null, reference: null });
});
