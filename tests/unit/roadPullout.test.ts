import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoad,
  DEFAULT_ROAD_TUNING,
  getBarrierLateralMeters,
  getPulloutDepthMeters,
  sampleRoad,
  sampleRoadWindow,
  type Road,
  type RoadPullout,
} from '../../src/game/road.ts';
import { createRoute, type Route } from '../../src/game/route.ts';
import type { PolygonDrawable } from '../../src/engine/renderer.ts';
import { buildRoadCamera } from '../../src/game/roadCamera.ts';
import {
  buildRoadScene,
  DEFAULT_ROAD_SCENE_TUNING,
  type RoadSceneTruckDimensions,
} from '../../src/game/roadScene.ts';
import { createTruckState } from '../../src/game/truck.ts';

const VIEWPORT = { width: 320, height: 480 };
const CAMERA_TUNING = { pixelsPerMeter: 10, anchorX: 160, anchorY: 360 };
const TRUCK_DIMENSIONS: RoadSceneTruckDimensions = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 4,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: 0.7,
};

const PULLOUT: RoadPullout = Object.freeze({
  id: 'test-pullout',
  side: 'right',
  startDistanceMeters: 100,
  endDistanceMeters: 200,
  taperMeters: 20,
  depthMeters: 4,
});

function straightRoute(maximumAbsoluteRoadOffsetMeters = 16): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 300 }],
    constraints: { maximumAbsoluteRoadOffsetMeters, minimumBendRadiusMeters: 30 },
  });
}

function roadWith(pullouts: readonly RoadPullout[]): Road {
  return createRoad(DEFAULT_ROAD_TUNING, straightRoute(), { pullouts });
}

test('a road without pullouts keeps one constant barrier bound at every distance', () => {
  const road = roadWith([]);

  assert.deepEqual(road.pullouts, []);
  assert.equal(road.maximumPulloutDepthMeters, 0);
  for (const distance of [0, 50, 137.5, 300]) {
    assert.equal(getPulloutDepthMeters(road, 'right', distance), 0);
    assert.equal(getBarrierLateralMeters(road, 'right', distance), road.rightBarrierLateralMeters);
    assert.equal(getBarrierLateralMeters(road, 'left', distance), road.leftBarrierLateralMeters);
  }
});

test('a pullout opens and closes over its tapers and holds full depth between them', () => {
  const road = roadWith([PULLOUT]);

  assert.equal(getPulloutDepthMeters(road, 'right', 99), 0);
  assert.equal(getPulloutDepthMeters(road, 'right', 100), 0);
  assert.equal(getPulloutDepthMeters(road, 'right', 110), 2);
  assert.equal(getPulloutDepthMeters(road, 'right', 120), 4);
  assert.equal(getPulloutDepthMeters(road, 'right', 150), 4);
  assert.equal(getPulloutDepthMeters(road, 'right', 180), 4);
  assert.equal(getPulloutDepthMeters(road, 'right', 190), 2);
  assert.equal(getPulloutDepthMeters(road, 'right', 200), 0);
  assert.equal(getPulloutDepthMeters(road, 'right', 201), 0);
  assert.equal(road.maximumPulloutDepthMeters, 4);
});

test('only the pullout side moves, and it moves outward', () => {
  const road = roadWith([PULLOUT]);

  assert.equal(getBarrierLateralMeters(road, 'right', 150), 13.9);
  assert.equal(getBarrierLateralMeters(road, 'left', 150), -9.9);
  assert.equal(getPulloutDepthMeters(road, 'left', 150), 0);

  const leftRoad = roadWith([{ ...PULLOUT, id: 'left-pullout', side: 'left' }]);
  assert.equal(getBarrierLateralMeters(leftRoad, 'left', 150), -13.9);
  assert.equal(getBarrierLateralMeters(leftRoad, 'right', 150), 9.9);
});

test('independent pullouts on opposite sides do not interfere', () => {
  const road = roadWith([
    PULLOUT,
    { ...PULLOUT, id: 'left-pullout', side: 'left', depthMeters: 2 },
  ]);

  assert.equal(getBarrierLateralMeters(road, 'right', 150), 13.9);
  assert.equal(getBarrierLateralMeters(road, 'left', 150), -11.9);
  assert.equal(road.maximumPulloutDepthMeters, 4);
});

test('sampled cross sections carry the widened shoulder and barrier through the pullout', () => {
  const road = roadWith([PULLOUT]);
  const inside = sampleRoad(road, 150);
  const outside = sampleRoad(road, 250);

  assert.equal(inside.shoulderEdges[1]!.xMeters, 13.9);
  assert.equal(inside.barrierEdges[1]!.xMeters, 13.9);
  assert.equal(inside.shoulderEdges[0]!.xMeters, -9.9);
  assert.equal(outside.shoulderEdges[1]!.xMeters, 9.9);
  assert.equal(outside.barrierEdges[1]!.xMeters, 9.9);
  for (const point of [...inside.shoulderEdges, ...inside.barrierEdges]) {
    assert.ok(Number.isFinite(point.xMeters) && Number.isFinite(point.yMeters));
  }
});

test('a sampled window lands exactly on every pullout corner so the apron renders crisply', () => {
  const road = roadWith([PULLOUT]);
  const distances = sampleRoadWindow(
    road,
    { startDistanceMeters: 0, endDistanceMeters: 300 },
    50
  ).map(sample => sample.distanceAlongRouteMeters);

  for (const corner of [100, 120, 180, 200]) {
    assert.ok(distances.includes(corner), `expected a sample at ${corner} m, got ${distances}`);
  }
  assert.deepEqual(
    [...distances].sort((a, b) => a - b),
    distances
  );
});

test('malformed pullouts fail loudly instead of quietly reshaping the road', () => {
  assert.throws(() => roadWith([{ ...PULLOUT, endDistanceMeters: 100 }]), /endDistanceMeters/);
  assert.throws(() => roadWith([{ ...PULLOUT, depthMeters: 0 }]), /depthMeters/);
  assert.throws(() => roadWith([{ ...PULLOUT, taperMeters: 0 }]), /taperMeters/);
  assert.throws(() => roadWith([{ ...PULLOUT, taperMeters: 60 }]), /taperMeters/);
  assert.throws(() => roadWith([{ ...PULLOUT, startDistanceMeters: Number.NaN }]), /finite/);
  assert.throws(
    () => roadWith([{ ...PULLOUT, side: 'centre' as RoadPullout['side'] }]),
    /pullout side/
  );
  assert.throws(() => roadWith([PULLOUT, { ...PULLOUT }]), /duplicate/);
  assert.throws(
    () =>
      roadWith([
        PULLOUT,
        { ...PULLOUT, id: 'overlapping', startDistanceMeters: 150, endDistanceMeters: 260 },
      ]),
    /overlap/
  );
});

test('the rendered barrier follows the apron instead of the constant bound', () => {
  const road = roadWith([PULLOUT]);
  const rightmostBarrierMeters = (distanceAlongRouteMeters: number): number => {
    const truck = createTruckState({
      position: { xMeters: 0, yMeters: distanceAlongRouteMeters },
      headingRadians: 0,
      speedMetersPerSecond: 0,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: 0,
      massKilograms: 36_287,
      cargoIntegrity: 1,
      status: 'driving',
    });
    const camera = buildRoadCamera(truck.position, VIEWPORT, CAMERA_TUNING);
    const scene = buildRoadScene({
      road,
      camera,
      truck,
      truckDimensions: TRUCK_DIMENSIONS,
      focusDistanceAlongRouteMeters: distanceAlongRouteMeters,
    });
    const barrierPoints = scene.drawables
      .filter(
        (drawable): drawable is PolygonDrawable =>
          drawable.kind === 'polygon' && drawable.color === DEFAULT_ROAD_SCENE_TUNING.barrierColor
      )
      .flatMap(drawable => drawable.points.map(point => point.x));
    assert.ok(barrierPoints.length > 0, 'expected barrier geometry in the scene');
    return (Math.max(...barrierPoints) - CAMERA_TUNING.anchorX) / CAMERA_TUNING.pixelsPerMeter;
  };

  assert.ok(Math.abs(rightmostBarrierMeters(150) - 13.99) < 0.05);
  assert.ok(Math.abs(rightmostBarrierMeters(280) - 9.99) < 0.05);
});

test('a pullout deeper than the route allows is rejected when the road is built', () => {
  assert.throws(
    () =>
      createRoad(DEFAULT_ROAD_TUNING, straightRoute(12), {
        pullouts: [{ ...PULLOUT, depthMeters: 4 }],
      }),
    /exceeds route constraint/
  );
  assert.doesNotThrow(() =>
    createRoad(DEFAULT_ROAD_TUNING, straightRoute(14), {
      pullouts: [{ ...PULLOUT, depthMeters: 4 }],
    })
  );
});
