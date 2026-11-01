import test from 'node:test';
import assert from 'node:assert/strict';
import { describeInvalidFeatureCategories, findInvalidFeatureCategories } from './annotationTaxonomy.ts';

test('accepts feature categories that are present in the task taxonomy', () => {
  assert.deepEqual(
    findInvalidFeatureCategories(
      [{ properties: { category: 'building' } }, { properties: { category: 'road' } }],
      ['building', 'road'],
    ),
    [],
  );
});

test('reports missing, non-string, and unsupported categories with stable feature indexes', () => {
  assert.deepEqual(
    findInvalidFeatureCategories(
      [
        { properties: { category: 'building' } },
        { properties: { category: 'vegetation' } },
        { properties: {} },
        { properties: { category: 3 } },
      ],
      ['building', 'road'],
    ),
    [
      { featureIndex: 1, category: 'vegetation' },
      { featureIndex: 2, category: null },
      { featureIndex: 3, category: null },
    ],
  );
});

test('treats an empty taxonomy as invalid for every feature', () => {
  assert.deepEqual(
    findInvalidFeatureCategories([{ properties: { category: 'building' } }], []),
    [{ featureIndex: 0, category: 'building' }],
  );
});

test('describes a bounded list of feature label issues and allowed task labels', () => {
  const invalid = Array.from({ length: 6 }, (_, featureIndex) => ({ featureIndex, category: 'other' }));
  assert.equal(
    describeInvalidFeatureCategories(invalid, ['building', 'road']),
    '6 feature(s) need a valid task taxonomy label: #1 (“other”), #2 (“other”), #3 (“other”), #4 (“other”), #5 (“other”), and 1 more. Choose from: building, road.',
  );
  assert.equal(describeInvalidFeatureCategories([], ['building']), '');
});
