import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReviewFocusPlan, geometryScreenBounds, unionReviewBounds } from './reviewFocus.ts';

const identity = (point: [number, number]): [number, number] => point;

test('finds screen bounds for points, multipart geometries, and closed polygons', () => {
  assert.deepEqual(geometryScreenBounds({ type: 'Point', coordinates: [12, 34] }, identity), {
    minX: 12, minY: 34, maxX: 12, maxY: 34,
  });
  assert.deepEqual(geometryScreenBounds({ type: 'MultiPoint', coordinates: [[10, 20], [40, 60]] }, identity), {
    minX: 10, minY: 20, maxX: 40, maxY: 60,
  });
  assert.deepEqual(geometryScreenBounds({
    type: 'Polygon', coordinates: [[[20, 30], [80, 30], [80, 90], [20, 30]]],
  }, identity), { minX: 20, minY: 30, maxX: 80, maxY: 90 });
  assert.deepEqual(geometryScreenBounds({
    type: 'MultiLineString', coordinates: [[[5, 8], [15, 18]], [[25, 28], [35, 38]]],
  }, identity), { minX: 5, minY: 8, maxX: 35, maxY: 38 });
});

test('unions submitted and reference bounds and clips partial geometries to the image', () => {
  const submitted = geometryScreenBounds({ type: 'MultiPoint', coordinates: [[-5, 20], [10, 25]] }, identity);
  const reference = geometryScreenBounds({ type: 'Point', coordinates: [30, 40] }, identity);
  assert.deepEqual(submitted, { minX: 0, minY: 20, maxX: 10, maxY: 25 });
  assert.deepEqual(unionReviewBounds(submitted, reference), { minX: 0, minY: 20, maxX: 30, maxY: 40 });
  assert.equal(geometryScreenBounds({ type: 'Point', coordinates: [1200, 20] }, identity), null);
  assert.equal(unionReviewBounds(null, undefined), null);
});

test('malformed, non-finite, unsupported, and unprojectable geometry safely returns no focus bounds', () => {
  assert.equal(geometryScreenBounds({ type: 'GeometryCollection', geometries: [] }, identity), null);
  assert.equal(geometryScreenBounds({ type: 'Point', coordinates: [Number.NaN, 2] }, identity), null);
  assert.equal(geometryScreenBounds({ type: 'LineString', coordinates: [[1, 2], ['x', 3]] }, identity), null);
  assert.equal(geometryScreenBounds({ type: 'Point', coordinates: [1, 2] }, () => [Number.NaN, 0]), null);
  assert.equal(geometryScreenBounds({ type: 'Polygon', coordinates: [] }, identity), null);
});

test('focus plans zoom toward small findings and clamp scrolling to image edges', () => {
  const viewport = {
    viewportWidth: 200, viewportHeight: 140,
    contentWidth: 1000, contentHeight: 700,
    scrollLeft: 0, scrollTop: 0, currentZoom: 1,
  };
  const edgePlan = calculateReviewFocusPlan({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, viewport);
  assert.ok(edgePlan);
  assert.equal(edgePlan.zoom, 3.15);
  assert.equal(edgePlan.scrollLeft, 0);
  assert.equal(edgePlan.scrollTop, 0);

  const oppositeEdgePlan = calculateReviewFocusPlan({ minX: 990, minY: 690, maxX: 1000, maxY: 700 }, viewport);
  assert.ok(oppositeEdgePlan);
  assert.equal(oppositeEdgePlan.zoom, 3.15);
  assert.equal(oppositeEdgePlan.scrollLeft, 2950);
  assert.equal(oppositeEdgePlan.scrollTop, 2065);
});

test('focus plan respects the minimum zoom for full-scene findings and rejects unusable viewports', () => {
  const viewport = {
    viewportWidth: 500, viewportHeight: 350,
    contentWidth: 1000, contentHeight: 700,
    scrollLeft: 250, scrollTop: 175, currentZoom: 1,
  };
  assert.deepEqual(calculateReviewFocusPlan({ minX: 0, minY: 0, maxX: 1000, maxY: 700 }, viewport), {
    zoom: 1, scrollLeft: 250, scrollTop: 175,
  });
  assert.equal(calculateReviewFocusPlan({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { ...viewport, viewportWidth: 0 }), null);
  assert.equal(calculateReviewFocusPlan({ minX: 2, minY: 0, maxX: 1, maxY: 1 }, viewport), null);
});
