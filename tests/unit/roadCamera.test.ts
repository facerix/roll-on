import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoadCamera,
  DEFAULT_ROAD_CAMERA_TUNING,
  getVisibleWorldDistanceRange,
  projectWorldPoint,
  type RoadCameraTuning,
  type RoadViewport,
} from '../../src/game/roadCamera.ts';
import type { WorldPosition } from '../../src/game/truck.ts';

const VIEWPORT: RoadViewport = { width: 800, height: 600 };
const FOCUS: WorldPosition = { lateralMeters: 12, distanceMeters: 1000 };
const TUNING: RoadCameraTuning = {
  pixelsPerMeter: 10,
  anchorX: 400,
  anchorY: 420,
};

test('focused truck position projects to the configured screen anchor', () => {
  const camera = buildRoadCamera(FOCUS, VIEWPORT, TUNING);

  assert.deepEqual(projectWorldPoint(camera, FOCUS), { x: 400, y: 420 });
});

test('positive lateral world movement projects rightward on screen', () => {
  const camera = buildRoadCamera(FOCUS, VIEWPORT, TUNING);

  assert.deepEqual(
    projectWorldPoint(camera, {
      lateralMeters: FOCUS.lateralMeters + 3,
      distanceMeters: FOCUS.distanceMeters,
    }),
    { x: 430, y: 420 }
  );
});

test('positive world distance ahead of the truck projects upward on screen', () => {
  const camera = buildRoadCamera(FOCUS, VIEWPORT, TUNING);

  assert.deepEqual(
    projectWorldPoint(camera, {
      lateralMeters: FOCUS.lateralMeters,
      distanceMeters: FOCUS.distanceMeters + 8,
    }),
    { x: 400, y: 340 }
  );
});

test('projection is deterministic and does not mutate inputs', () => {
  const focus = structuredClone(FOCUS);
  const viewport = structuredClone(VIEWPORT);
  const tuning = structuredClone(TUNING);
  Object.freeze(focus);
  Object.freeze(viewport);
  Object.freeze(tuning);

  const camera = buildRoadCamera(focus, viewport, tuning);
  const point: WorldPosition = { lateralMeters: 10, distanceMeters: 1005 };
  const beforePoint = structuredClone(point);

  assert.deepEqual(projectWorldPoint(camera, point), projectWorldPoint(camera, point));
  assert.deepEqual(point, beforePoint);
  assert.deepEqual(focus, FOCUS);
  assert.deepEqual(viewport, VIEWPORT);
  assert.deepEqual(tuning, TUNING);
});

test('invalid viewport, scale, or anchor values fail loudly', () => {
  assert.throws(() => buildRoadCamera(FOCUS, { width: 0, height: 600 }, TUNING), RangeError);
  assert.throws(
    () => buildRoadCamera(FOCUS, { width: 800, height: Number.NaN }, TUNING),
    TypeError
  );
  assert.throws(
    () => buildRoadCamera(FOCUS, VIEWPORT, { ...TUNING, pixelsPerMeter: 0 }),
    RangeError
  );
  assert.throws(() => buildRoadCamera(FOCUS, VIEWPORT, { ...TUNING, anchorX: -1 }), RangeError);
  assert.throws(() => buildRoadCamera(FOCUS, VIEWPORT, { ...TUNING, anchorY: 601 }), RangeError);
});

test('visible world-distance range derives from viewport height and scale', () => {
  const camera = buildRoadCamera(FOCUS, VIEWPORT, TUNING);

  assert.deepEqual(getVisibleWorldDistanceRange(camera), {
    startDistanceMeters: 982,
    endDistanceMeters: 1042,
  });
});

test('default camera tuning keeps the truck below vertical midpoint', () => {
  const camera = buildRoadCamera(
    { lateralMeters: 0, distanceMeters: 0 },
    { width: 320, height: 480 },
    DEFAULT_ROAD_CAMERA_TUNING
  );

  assert.equal(camera.anchorX, 160);
  assert.equal(camera.anchorY, 360);
  assert.ok(camera.anchorY > camera.viewportHeight / 2);
});
