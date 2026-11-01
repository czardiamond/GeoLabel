import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assetPixelAffine,
  clientToAnnotationCanvas,
  geoToScreen,
  screenToGeo,
} from './georeferencing.ts';

test('screen/source pixel coordinates round-trip through rotated and sheared affine transforms', () => {
  const asset = { width: 400, height: 300, metadata: { affine_transform: [2, 0.5, 10, 0.25, -3, 20] } };
  const screen: [number, number] = [312.5, 280];
  const geo = screenToGeo(screen[0], screen[1], asset);
  assert.notDeepEqual(geo, [10 + screen[0] / 1000 * 400 * 2, 20 - screen[1] / 700 * 300 * 3]);
  const returned = geoToScreen(geo, asset);
  assert.ok(Math.abs(returned[0] - screen[0]) < 1e-9);
  assert.ok(Math.abs(returned[1] - screen[1]) < 1e-9);
});

test('wide and tall image viewports map pointer positions to the same annotation and CRS coordinates', () => {
  const asset = { width: 4000, height: 2000, metadata: { affine_transform: [0.25, 0.05, 100, -0.02, -0.25, 500] } };
  const wideViewport = { left: 10, top: 20, width: 1200, height: 600 };
  const tallViewport = { left: 50, top: 30, width: 400, height: 800 };
  const widePoint = clientToAnnotationCanvas(310, 320, wideViewport);
  const tallPoint = clientToAnnotationCanvas(150, 430, tallViewport);

  assert.deepEqual(widePoint, [250, 350]);
  assert.deepEqual(tallPoint, widePoint);
  assert.deepEqual(screenToGeo(...widePoint, asset), [400, 230]);
  assert.deepEqual(screenToGeo(...tallPoint, asset), [400, 230]);
  assert.deepEqual(geoToScreen([400, 230], asset), widePoint);
});

test('zoomed and scroll-panned imagery maps the pointer to its original source location', () => {
  const fitPoint = clientToAnnotationCanvas(250, 175, { left: 0, top: 0, width: 1000, height: 700 });
  const zoomedPannedPoint = clientToAnnotationCanvas(0, 0, { left: -500, top: -350, width: 2000, height: 1400 });
  assert.deepEqual(zoomedPannedPoint, fitPoint);
});

test('pointer mapping clamps to the viewport and safely handles a collapsed surface', () => {
  assert.deepEqual(clientToAnnotationCanvas(-10, 900, { left: 0, top: 0, width: 400, height: 800 }), [0, 700]);
  assert.deepEqual(clientToAnnotationCanvas(10, 20, { left: 10, top: 20, width: 0, height: 100 }), [0, 0]);
});

test('bounds derive a north-up affine and malformed explicit transforms fail closed', () => {
  const boundsAsset = { width: 4, height: 3, bounds: [10, 14, 18, 20] as [number, number, number, number] };
  assert.deepEqual(assetPixelAffine(boundsAsset), [2, 0, 10, 0, -2, 20]);
  assert.deepEqual(screenToGeo(500, 350, boundsAsset), [14, 17]);
  assert.equal(assetPixelAffine({ ...boundsAsset, metadata: { affine_transform: [1, 2] } }), null);
});
