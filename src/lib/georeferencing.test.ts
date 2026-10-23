import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetPixelAffine, geoToScreen, screenToGeo } from './georeferencing.ts';

test('screen/source pixel coordinates round-trip through rotated and sheared affine transforms', () => {
  const asset = { width: 400, height: 300, metadata: { affine_transform: [2, 0.5, 10, 0.25, -3, 20] } };
  const screen: [number, number] = [312.5, 280];
  const geo = screenToGeo(screen[0], screen[1], asset);
  assert.notDeepEqual(geo, [10 + screen[0] / 1000 * 400 * 2, 20 - screen[1] / 700 * 300 * 3]);
  const returned = geoToScreen(geo, asset);
  assert.ok(Math.abs(returned[0] - screen[0]) < 1e-9);
  assert.ok(Math.abs(returned[1] - screen[1]) < 1e-9);
});

test('bounds derive a north-up affine and malformed explicit transforms fail closed', () => {
  const boundsAsset = { width: 4, height: 3, bounds: [10, 14, 18, 20] as [number, number, number, number] };
  assert.deepEqual(assetPixelAffine(boundsAsset), [2, 0, 10, 0, -2, 20]);
  assert.deepEqual(screenToGeo(500, 350, boundsAsset), [14, 17]);
  assert.equal(assetPixelAffine({ ...boundsAsset, metadata: { affine_transform: [1, 2] } }), null);
});
