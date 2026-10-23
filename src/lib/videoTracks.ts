export type VideoTrackKind = 'bbox' | 'point' | 'polyline';
export type VideoTrackCoordinates = number[] | number[][];
export type VideoKeyframe = { timestamp_ms: number; coordinates: VideoTrackCoordinates };
export type VideoTrack = {
  id: string;
  category: string;
  kind: VideoTrackKind;
  keyframes: VideoKeyframe[];
  user_id?: string;
};

/** Return the normalized geometry at a time between authored keyframes. */
export function interpolateTrack(track: VideoTrack, timestampMs: number): VideoTrackCoordinates | null {
  if (!Number.isFinite(timestampMs) || track.keyframes.length === 0) return null;
  const frames = [...track.keyframes].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  if (timestampMs < frames[0].timestamp_ms || timestampMs > frames[frames.length - 1].timestamp_ms) return null;
  const exact = frames.find(frame => frame.timestamp_ms === timestampMs);
  if (exact) return exact.coordinates;
  const rightIndex = frames.findIndex(frame => frame.timestamp_ms > timestampMs);
  if (rightIndex <= 0) return null;
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  const ratio = (timestampMs - left.timestamp_ms) / (right.timestamp_ms - left.timestamp_ms);
  const flatten = (coordinates: VideoTrackCoordinates): number[] => Array.isArray(coordinates[0])
    ? (coordinates as number[][]).flat()
    : coordinates as number[];
  const leftValues = flatten(left.coordinates);
  const rightValues = flatten(right.coordinates);
  if (leftValues.length !== rightValues.length || leftValues.length === 0) return null;
  const interpolated = leftValues.map((value, index) => Math.round((value + (rightValues[index] - value) * ratio) * 1e9) / 1e9);
  if (track.kind === 'polyline') {
    return Array.from({ length: interpolated.length / 2 }, (_, index) => interpolated.slice(index * 2, index * 2 + 2));
  }
  return interpolated;
}
