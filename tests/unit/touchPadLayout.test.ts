import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateStageLayout } from '../../src/game/stageLayout.ts';
import { calculateTouchPadLayout } from '../../src/game/touchPadLayout.ts';

test('portrait touch controls follow the displayed road instead of the browser bounds', () => {
  const viewport = { width: 390, height: 844 };
  const stage = calculateStageLayout({ viewport });

  assert.deepEqual(calculateTouchPadLayout({ viewport, stage }), {
    stageLeft: 0,
    stageRight: 390,
    stageCenterX: 195,
    roadTop: 129.5,
    roadBottom: 586.53125,
    portraitSteerY: 422,
    landscapeControlY: 440.28125,
    leftClusterX: 0,
    rightClusterX: 390,
  });
});

test('landscape touch controls use the side gutters as two thumb zones', () => {
  const viewport = { width: 844, height: 390 };
  const stage = calculateStageLayout({ viewport });
  const layout = calculateTouchPadLayout({ viewport, stage });
  const { landscapeControlY, ...stableLayout } = layout;

  assert.deepEqual(stableLayout, {
    stageLeft: 292,
    stageRight: 552,
    stageCenterX: 422,
    roadTop: 0,
    roadBottom: 304.6875,
    portraitSteerY: 195,
    leftClusterX: 146,
    rightClusterX: 698,
  });
  assert.ok(Math.abs(landscapeControlY - 207.1875) < 1e-10);
});

test('touch thumb zones remain inside asymmetric safe-area insets', () => {
  const viewport = { width: 900, height: 390 };
  const safeAreaInsets = { top: 0, right: 24, bottom: 18, left: 47 };
  const stage = calculateStageLayout({ viewport, safeAreaInsets });
  const layout = calculateTouchPadLayout({ viewport, safeAreaInsets, stage });

  assert.equal(layout.leftClusterX, (47 + stage.displayX) / 2);
  assert.equal(layout.rightClusterX, (stage.displayX + stage.displayWidth + 900 - 24) / 2);
  assert.ok(layout.leftClusterX >= safeAreaInsets.left);
  assert.ok(layout.rightClusterX <= viewport.width - safeAreaInsets.right);
});
