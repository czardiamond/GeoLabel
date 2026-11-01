import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentReviewDiagnostic, reviewDiagnosticIndex, type ReviewFeatureDiagnostic } from './reviewDiagnostics.ts';

const findings: ReviewFeatureDiagnostic[] = [
  { annotation_id: 'a1', status: 'category_mismatch', feature_index: 0, reference_feature_index: 0, submitted_category: 'building', reference_category: 'road', overlap_score: 0.9 },
  { annotation_id: 'a1', status: 'unmatched_submission', feature_index: 1, reference_feature_index: null, submitted_category: 'building', reference_category: null, overlap_score: 0.1 },
  { annotation_id: 'a2', status: 'unmatched_reference', feature_index: null, reference_feature_index: 2, submitted_category: null, reference_category: 'water', overlap_score: null },
];

const key = (finding: ReviewFeatureDiagnostic) => [finding.annotation_id, finding.status, finding.feature_index ?? 'none', finding.reference_feature_index ?? 'none'].join(':');

test('moves to neighboring findings and stops at list boundaries', () => {
  assert.equal(reviewDiagnosticIndex(findings, key(findings[1])), 1);
  assert.equal(adjacentReviewDiagnostic(findings, key(findings[0]), 1), findings[1]);
  assert.equal(adjacentReviewDiagnostic(findings, key(findings[1]), -1), findings[0]);
  assert.equal(adjacentReviewDiagnostic(findings, key(findings[0]), -1), null);
  assert.equal(adjacentReviewDiagnostic(findings, key(findings[2]), 1), null);
});

test('starts at the requested end when no current finding is selected', () => {
  assert.equal(adjacentReviewDiagnostic(findings, '', 1), findings[0]);
  assert.equal(adjacentReviewDiagnostic(findings, '', -1), findings[2]);
  assert.equal(adjacentReviewDiagnostic(findings, 'stale-key', 1), findings[0]);
});

test('returns no finding for an empty list', () => {
  assert.equal(adjacentReviewDiagnostic([], '', 1), null);
});
