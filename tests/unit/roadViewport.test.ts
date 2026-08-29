import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import {
  buildRoadCameraTuning,
  calculateTruckRearExtentMeters,
  DEFAULT_ROAD_CAMERA_FRAMING_TUNING,
  measureRoadViewport,
} from '../../src/game/roadViewport.ts';
import { ROAD_VIEWPORT_HEIGHT_PIXELS, STAGE_WIDTH_PIXELS } from '../../src/game/stageLayout.ts';
import { DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING);
const TRUCK_DIMENSIONS = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 5.2,
  trailerWidthMeters: DEFAULT_TRUCK_TUNING.trailerWidthMeters,
  trailerLengthMeters: DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters,
  hitchGapMeters: -1.1,
} as const;
const MAXIMUM_SPEED_METERS_PER_SECOND = DEFAULT_TRUCK_TUNING.maxForwardSpeedMetersPerSecond;

function tuningAtSpeed(speedMetersPerSecond: number, viewport = measureRoadViewport()) {
  return buildRoadCameraTuning(ROAD, viewport, {
    speedMetersPerSecond,
    maximumSpeedMetersPerSecond: MAXIMUM_SPEED_METERS_PER_SECOND,
    truckDimensions: TRUCK_DIMENSIONS,
  });
}

function forwardViewMeters(tuning: ReturnType<typeof buildRoadCameraTuning>): number {
  return tuning.anchorY / tuning.pixelsPerMeter;
}

function rearViewMeters(
  tuning: ReturnType<typeof buildRoadCameraTuning>,
  viewport = measureRoadViewport()
): number {
  return (viewport.height - tuning.anchorY) / tuning.pixelsPerMeter;
}

function assertNear(actual: number, expected: number, epsilon = 0.000_001): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test('road viewport always uses the fixed stage rather than browser dimensions', () => {
  assert.deepEqual(measureRoadViewport(), {
    width: STAGE_WIDTH_PIXELS,
    height: ROAD_VIEWPORT_HEIGHT_PIXELS,
  });
});

test('camera framing keeps the full articulated rig and an explicit rear margin visible', () => {
  const rearExtentMeters = calculateTruckRearExtentMeters(TRUCK_DIMENSIONS);
  const expectedRearViewMeters =
    rearExtentMeters + DEFAULT_ROAD_CAMERA_FRAMING_TUNING.rearMarginMeters;

  for (const speedMetersPerSecond of [0, 20, 40]) {
    assertNear(rearViewMeters(tuningAtSpeed(speedMetersPerSecond)), expectedRearViewMeters);
  }

  const alignedTrailerRearMeters =
    TRUCK_DIMENSIONS.cabLengthMeters / 2 +
    TRUCK_DIMENSIONS.trailerLengthMeters +
    TRUCK_DIMENSIONS.hitchGapMeters;
  assert.ok(rearExtentMeters > alignedTrailerRearMeters);
});

test('forward sight distance grows from 20 m at rest to 40 m at maximum speed', () => {
  const stopped = tuningAtSpeed(0);
  const cruise = tuningAtSpeed(20);
  const maximum = tuningAtSpeed(40);

  assertNear(forwardViewMeters(stopped), 20);
  assertNear(forwardViewMeters(cruise), 30);
  assertNear(forwardViewMeters(maximum), 40);
  assert.ok(stopped.pixelsPerMeter > cruise.pixelsPerMeter);
  assert.ok(cruise.pixelsPerMeter > maximum.pixelsPerMeter);
  assert.ok(stopped.anchorY < cruise.anchorY);
  assert.ok(cruise.anchorY < maximum.anchorY);
});

test('maximum-speed framing provides at least 1.4 seconds against the slowest commuter', () => {
  const forwardMeters = forwardViewMeters(tuningAtSpeed(MAXIMUM_SPEED_METERS_PER_SECOND));
  const maximumClosingSpeedMetersPerSecond = MAXIMUM_SPEED_METERS_PER_SECOND - 12;

  assert.ok(forwardMeters / maximumClosingSpeedMetersPerSecond >= 1.4);
});

test('road width and maximum scale may add sight distance but never remove the requested minimum', () => {
  const smallViewport = { width: 100, height: 100 };
  const small = tuningAtSpeed(0, smallViewport);
  const huge = tuningAtSpeed(0, { width: 4000, height: 4000 });

  assertNear(forwardViewMeters(small), 20);
  assertNear(rearViewMeters(small, smallViewport), rearViewMeters(tuningAtSpeed(0)));
  assert.equal(huge.pixelsPerMeter, DEFAULT_ROAD_CAMERA_FRAMING_TUNING.maximumPixelsPerMeter);
  assert.ok(forwardViewMeters(huge) >= 20);
});

test('camera framing is deterministic and rejects invalid speed or rig inputs', () => {
  assert.deepEqual(tuningAtSpeed(20), tuningAtSpeed(20));
  assert.throws(() => tuningAtSpeed(-1), RangeError);
  assert.throws(
    () =>
      buildRoadCameraTuning(ROAD, measureRoadViewport(), {
        speedMetersPerSecond: 20,
        maximumSpeedMetersPerSecond: 0,
        truckDimensions: TRUCK_DIMENSIONS,
      }),
    RangeError
  );
  assert.throws(
    () =>
      buildRoadCameraTuning(ROAD, measureRoadViewport(), {
        speedMetersPerSecond: 20,
        maximumSpeedMetersPerSecond: MAXIMUM_SPEED_METERS_PER_SECOND,
        truckDimensions: { ...TRUCK_DIMENSIONS, trailerLengthMeters: Number.NaN },
      }),
    TypeError
  );
});
