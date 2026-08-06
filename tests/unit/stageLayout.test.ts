import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HUD_HEIGHT_PIXELS,
  ROAD_VIEWPORT_HEIGHT_PIXELS,
  STAGE_HEIGHT_PIXELS,
  STAGE_WIDTH_PIXELS,
  calculateStageLayout,
} from '../../src/game/stageLayout.ts';

test('the authored stage reserves a bottom HUD bay outside the road viewport', () => {
  assert.equal(ROAD_VIEWPORT_HEIGHT_PIXELS + HUD_HEIGHT_PIXELS, STAGE_HEIGHT_PIXELS);
});

test('stage layout always preserves the fixed logical stage dimensions', () => {
  for (const viewport of [
    { width: 384, height: 576 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    const layout = calculateStageLayout({ viewport });
    assert.equal(layout.stageWidthPixels, STAGE_WIDTH_PIXELS);
    assert.equal(layout.stageHeightPixels, STAGE_HEIGHT_PIXELS);
  }
});

test('stage layout centers an aspect-preserving fit in portrait, square, and landscape viewports', () => {
  assert.deepEqual(calculateStageLayout({ viewport: { width: 384, height: 576 } }), {
    stageWidthPixels: 384,
    stageHeightPixels: 576,
    scale: 1,
    displayX: 0,
    displayY: 0,
    displayWidth: 384,
    displayHeight: 576,
  });

  const square = calculateStageLayout({ viewport: { width: 600, height: 600 } });
  assert.equal(square.scale, 600 / 576);
  assert.equal(square.displayX, 100);
  assert.equal(square.displayY, 0);
  assert.equal(square.displayWidth, 400);
  assert.equal(square.displayHeight, 600);

  const landscape = calculateStageLayout({ viewport: { width: 1280, height: 720 } });
  assert.equal(landscape.scale, 1.25);
  assert.equal(landscape.displayX, 400);
  assert.equal(landscape.displayY, 0);
  assert.equal(landscape.displayWidth, 480);
  assert.equal(landscape.displayHeight, 720);
});

test('safe-area insets reduce the usable rectangle before fitting and centering the stage', () => {
  const layout = calculateStageLayout({
    viewport: { width: 500, height: 900 },
    safeAreaInsets: { top: 20, right: 30, bottom: 40, left: 10 },
  });

  assert.equal(layout.scale, 460 / 384);
  assert.equal(layout.displayX, 10);
  assert.equal(layout.displayY, 95);
  assert.equal(layout.displayWidth, 460);
  assert.equal(layout.displayHeight, 690);
});

test('stage layout is deterministic and does not mutate its input', () => {
  const input = {
    viewport: { width: 1000, height: 700 },
    safeAreaInsets: { top: 4, right: 8, bottom: 12, left: 16 },
  };
  const original = structuredClone(input);

  assert.deepEqual(calculateStageLayout(input), calculateStageLayout(input));
  assert.deepEqual(input, original);
});

test('stage layout rejects invalid viewport dimensions and safe-area insets loudly', () => {
  const invalidViewportValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY];
  for (const value of invalidViewportValues) {
    assert.throws(() => calculateStageLayout({ viewport: { width: value, height: 576 } }));
    assert.throws(() => calculateStageLayout({ viewport: { width: 384, height: value } }));
  }
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() =>
      calculateStageLayout({
        viewport: { width: 384, height: 576 },
        safeAreaInsets: { top: value },
      })
    );
  }

  assert.throws(() =>
    calculateStageLayout({
      viewport: { width: 384, height: 576 },
      safeAreaInsets: { left: 200, right: 200 },
    })
  );
});
