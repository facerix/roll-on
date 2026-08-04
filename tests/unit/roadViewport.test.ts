import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { buildRoadCameraTuning, measureRoadViewport } from '../../src/game/roadViewport.ts';
import { STAGE_HEIGHT_PIXELS, STAGE_WIDTH_PIXELS } from '../../src/game/stageLayout.ts';

test('road viewport always uses the fixed stage rather than browser dimensions', () => {
  assert.deepEqual(measureRoadViewport(), {
    width: STAGE_WIDTH_PIXELS,
    height: STAGE_HEIGHT_PIXELS,
  });
});

test('camera tuning centers the road and anchors the truck below the midpoint', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING);

  assert.deepEqual(buildRoadCameraTuning(road, { width: 800, height: 600 }), {
    pixelsPerMeter: 20,
    anchorX: 400,
    anchorY: 348,
  });
});

test('camera tuning clamps scale for undersized and very large viewports', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING);

  assert.equal(buildRoadCameraTuning(road, { width: 100, height: 100 }).pixelsPerMeter, 8);
  assert.equal(buildRoadCameraTuning(road, { width: 4000, height: 4000 }).pixelsPerMeter, 20);
});
