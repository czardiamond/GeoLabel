export type CategorizedFeature = {
  properties?: Record<string, unknown> | null;
};

export type InvalidFeatureCategory = {
  featureIndex: number;
  category: string | null;
};

/** Return feature indexes whose category is missing or outside the task taxonomy. */
export function findInvalidFeatureCategories(
  features: readonly CategorizedFeature[],
  taxonomy: readonly string[],
): InvalidFeatureCategory[] {
  const allowed = new Set(taxonomy);
  const invalid: InvalidFeatureCategory[] = [];

  features.forEach((feature, featureIndex) => {
    const value = feature?.properties?.category;
    if (typeof value !== 'string' || !allowed.has(value)) {
      invalid.push({ featureIndex, category: typeof value === 'string' ? value : null });
    }
  });

  return invalid;
}

export function describeInvalidFeatureCategories(
  invalid: readonly InvalidFeatureCategory[],
  taxonomy: readonly string[],
): string {
  if (invalid.length === 0) return '';
  const examples = invalid.slice(0, 5).map(({ featureIndex, category }) =>
    `#${featureIndex + 1}${category ? ` (“${category}”)` : ' (missing or invalid)'}`,
  ).join(', ');
  const more = invalid.length > 5 ? `, and ${invalid.length - 5} more` : '';
  const allowed = taxonomy.length ? taxonomy.join(', ') : 'no task labels configured';
  return `${invalid.length} feature(s) need a valid task taxonomy label: ${examples}${more}. Choose from: ${allowed}.`;
}
