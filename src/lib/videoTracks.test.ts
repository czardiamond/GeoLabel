import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolateTrack, type VideoTrack } from './videoTracks.ts';

test('interpolates bounding boxes linearly between authored timestamps', () => {
  const track: VideoTrack = { id: 'track-1', category: 'car', kind: 'bbox', keyframes: [
    { timestamp_ms: 0, coordinates: [0.1, 0.2, 0.2, 0.3] },
    { timestamp_ms: 1000, coordinates: [0.3, 0.4, 0.2, 0.3] },
  ] };
  assert.deepEqual(interpolateTrack(track, 500), [0.2, 0.3, 0.2, 0.3]);
  assert.deepEqual(interpolateTrack(track, 0), [0.1, 0.2, 0.2, 0.3]);
  assert.equal(interpolateTrack(track, -1), null);
  assert.equal(interpolateTrack(track, 1001), null);
});

test('interpolates point tracks and every polyline vertex', () => {
  const point: VideoTrack = { id: 'point-1', category: 'person', kind: 'point', keyframes: [
    { timestamp_ms: 0, coordinates: [0, 0] }, { timestamp_ms: 10, coordinates: [1, 0.5] },
  ] };
  const line: VideoTrack = { id: 'line-1', category: 'road', kind: 'polyline', keyframes: [
    { timestamp_ms: 0, coordinates: [[0, 0], [0.2, 0.2]] },
    { timestamp_ms: 10, coordinates: [[1, 0.5], [0.8, 0.6]] },
  ] };
  assert.deepEqual(interpolateTrack(point, 5), [0.5, 0.25]);
  assert.deepEqual(interpolateTrack(line, 5), [[0.5, 0.25], [0.5, 0.4]]);
});

test('a single-frame track appears only at its authored keyframe', () => {
  const track: VideoTrack = { id: 'single', category: 'mark', kind: 'point', keyframes: [
    { timestamp_ms: 42, coordinates: [0.5, 0.5] },
  ] };
  assert.deepEqual(interpolateTrack(track, 42), [0.5, 0.5]);
  assert.equal(interpolateTrack(track, 41), null);
});
