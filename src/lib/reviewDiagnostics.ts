export type ReviewFeatureDiagnostic = {
  annotation_id: string;
  annotator_id?: string;
  status: 'matched' | 'category_mismatch' | 'unmatched_submission' | 'unmatched_reference';
  feature_index: number | null;
  reference_feature_index: number | null;
  submitted_category: string | null;
  reference_category: string | null;
  overlap_score: number | null;
};

export type ReviewDiagnosticPayload = {
  available?: boolean;
  submissions?: Array<{
    annotation_id: string;
    annotator_id?: string;
    diagnostics?: Array<Omit<ReviewFeatureDiagnostic, 'annotation_id' | 'annotator_id'>>;
  }>;
  reference_geojson?: { features?: unknown[] };
};

type AnnotationLike = { id: string; geojson?: { features?: unknown[] } };

export function flattenReviewDiagnostics(payload: ReviewDiagnosticPayload | null | undefined): ReviewFeatureDiagnostic[] {
  if (!payload?.available || !Array.isArray(payload.submissions)) return [];
  return payload.submissions.flatMap((submission) =>
    (submission.diagnostics || []).map((diagnostic) => ({
      ...diagnostic,
      annotation_id: submission.annotation_id,
      annotator_id: submission.annotator_id,
    })),
  );
}

export function reviewDiagnosticKey(diagnostic: ReviewFeatureDiagnostic): string {
  return [
    diagnostic.annotation_id,
    diagnostic.status,
    diagnostic.feature_index ?? 'none',
    diagnostic.reference_feature_index ?? 'none',
  ].join(':');
}

export function countReviewDiagnosticStatuses(diagnostics: readonly ReviewFeatureDiagnostic[]): Record<ReviewFeatureDiagnostic['status'], number> {
  const counts: Record<ReviewFeatureDiagnostic['status'], number> = {
    matched: 0,
    category_mismatch: 0,
    unmatched_submission: 0,
    unmatched_reference: 0,
  };
  diagnostics.forEach((diagnostic) => { counts[diagnostic.status] += 1; });
  return counts;
}

export function selectReviewDiagnosticFeatures(
  diagnostic: ReviewFeatureDiagnostic | null | undefined,
  annotations: readonly AnnotationLike[],
  referenceGeojson?: { features?: unknown[] } | null,
): { submitted: unknown | null; reference: unknown | null } {
  if (!diagnostic) return { submitted: null, reference: null };
  const annotation = annotations.find((item) => item.id === diagnostic.annotation_id);
  const submittedFeatures = annotation?.geojson?.features || [];
  const referenceFeatures = referenceGeojson?.features || [];
  return {
    submitted: diagnostic.feature_index == null ? null : submittedFeatures[diagnostic.feature_index] ?? null,
    reference: diagnostic.reference_feature_index == null ? null : referenceFeatures[diagnostic.reference_feature_index] ?? null,
  };
}
