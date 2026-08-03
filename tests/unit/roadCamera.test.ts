import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoadCamera,
  DEFAULT_ROAD_CAMERA_TUNING,
  getVisibleWorldDistanceRange,
  projectWorldPoint,
  stepRoadCameraRotation,
  type RoadCameraTuning,
  type RoadViewport,
} from '../../src/game/roadCamera.ts';
import type { WorldPoint } from '../../src/game/worldGeometry.ts';

const VIEWPORT: RoadViewport = { width: 800, height: 600 };
const FOCUS: WorldPoint = { xMeters: 12, yMeters: 1000 };
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
      xMeters: FOCUS.xMeters + 3,
      yMeters: FOCUS.yMeters,
    }),
    { x: 430, y: 420 }
  );
});

test('positive world distance ahead of the truck projects upward on screen', () => {
  const camera = buildRoadCamera(FOCUS, VIEWPORT, TUNING);

  assert.deepEqual(
    projectWorldPoint(camera, {
      xMeters: FOCUS.xMeters,
      yMeters: FOCUS.yMeters + 8,
    }),
    { x: 400, y: 340 }
  );
});

test('camera rotation keeps the focus anchored and rotates world points into local axes', () => {
  const camera = buildRoadCamera(FOCUS, VIEWPORT, TUNING, Math.PI / 2);

  assert.deepEqual(projectWorldPoint(camera, FOCUS), { x: 400, y: 420 });
  assert.deepEqual(
    projectWorldPoint(camera, { xMeters: FOCUS.xMeters, yMeters: FOCUS.yMeters + 8 }),
    { x: 320, y: 420 }
  );
});

test('camera orientation smoothing is frame-rate independent and takes the shortest path', () => {
  const target = -Math.PI + 0.1;
  const current = Math.PI - 0.1;
  const oneSecond = stepRoadCameraRotation(current, target, 1, 1);
  let sixtySteps = current;
  for (let index = 0; index < 60; index++) {
    sixtySteps = stepRoadCameraRotation(sixtySteps, target, 1 / 60, 1);
  }

  assert.ok(Math.abs(oneSecond - sixtySteps) < 0.01);
  assert.ok(oneSecond > Math.PI - 0.1 || oneSecond < -Math.PI + 0.1);
});

test('projection is deterministic and does not mutate inputs', () => {
  const focus = structuredClone(FOCUS);
  const viewport = structuredClone(VIEWPORT);
  const tuning = structuredClone(TUNING);
  Object.freeze(focus);
  Object.freeze(viewport);
  Object.freeze(tuning);

  const camera = buildRoadCamera(focus, viewport, tuning);
  const point: WorldPoint = { xMeters: 10, yMeters: 1005 };
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
    { xMeters: 0, yMeters: 0 },
    { width: 320, height: 480 },
    DEFAULT_ROAD_CAMERA_TUNING
  );

  assert.equal(camera.anchorX, 160);
  assert.equal(camera.anchorY, 360);
  assert.ok(camera.anchorY > camera.viewportHeight / 2);
});
