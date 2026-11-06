import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceWindowForViewport } from './imageWindow.ts';

test('maps a zoomed, panned viewport into bounded source pixels without changing its overlay coordinates', () => {
  const window = sourceWindowForViewport({
    sourceWidth: 10_980,
    sourceHeight: 10_980,
    contentWidth: 14_336,
    contentHeight: 14_336,
    viewportWidth: 896,
    viewportHeight: 600,
    scrollLeft: 8_400,
    scrollTop: 7_000,
    outputScale: 2,
  });
  assert.ok(window);
  assert.ok(window.x > 0 && window.y > 0);
  assert.ok(window.x + window.width <= 10_980);
  assert.ok(window.y + window.height <= 10_980);
  assert.ok(window.outputWidth <= 2_048 && window.outputHeight <= 2_048);

  const sourcePoint: [number, number] = [6_775, 5_590];
  const sourceScreenX = sourcePoint[0] / 10_980 * 1_000;
  const sourceScreenY = sourcePoint[1] / 10_980 * 700;
  const detailLeft = window.leftPercent / 100 * 1_000;
  const detailTop = window.topPercent / 100 * 700;
  const detailWidth = window.widthPercent / 100 * 1_000;
  const detailHeight = window.heightPercent / 100 * 700;
  const localDetailX = (sourceScreenX - detailLeft) / detailWidth * window.outputWidth;
  const localDetailY = (sourceScreenY - detailTop) / detailHeight * window.outputHeight;
  const localSourceX = (sourcePoint[0] - window.x) / window.width * window.outputWidth;
  const localSourceY = (sourcePoint[1] - window.y) / window.height * window.outputHeight;
  assert.ok(Math.abs(localDetailX - localSourceX) < 1e-9);
  assert.ok(Math.abs(localDetailY - localSourceY) < 1e-9);
});

test('clips source windows at all image edges and rejects unusable viewport geometry', () => {
  const topLeft = sourceWindowForViewport({
    sourceWidth: 10_980, sourceHeight: 10_980,
    contentWidth: 20_000, contentHeight: 20_000,
    viewportWidth: 600, viewportHeight: 600,
    scrollLeft: 0, scrollTop: 0,
  });
  assert.ok(topLeft);
  assert.equal(topLeft.x, 0);
  assert.equal(topLeft.y, 0);

  const bottomRight = sourceWindowForViewport({
    sourceWidth: 10_980, sourceHeight: 10_980,
    contentWidth: 20_000, contentHeight: 20_000,
    viewportWidth: 600, viewportHeight: 600,
    scrollLeft: 19_400, scrollTop: 19_400,
  });
  assert.ok(bottomRight);
  assert.equal(bottomRight.x + bottomRight.width, 10_980);
  assert.equal(bottomRight.y + bottomRight.height, 10_980);
  assert.equal(sourceWindowForViewport({
    sourceWidth: 0, sourceHeight: 100, contentWidth: 100, contentHeight: 100,
    viewportWidth: 100, viewportHeight: 100, scrollLeft: 0, scrollTop: 0,
  }), null);
});
