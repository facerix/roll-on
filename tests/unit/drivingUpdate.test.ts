import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFuelState } from '../../src/game/fuel.ts';
import { stepDriving } from '../../src/game/drivingUpdate.ts';
import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { buildTruckFootprint, detectRoadBarrierImpact } from '../../src/game/roadCollision.ts';
import { createRoute, routeToWorld, sampleRoute } from '../../src/game/route.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';

const ROAD = createRoad(
  DEFAULT_ROAD_TUNING,
  createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    constraints: { maximumAbsoluteRoadOffsetMeters: 12, minimumBendRadiusMeters: 40 },
    segments: [
      { kind: 'straight', lengthMeters: 40 },
      { kind: 'arc', lengthMeters: 60, curvaturePerMeter: 0.01 },
      { kind: 'arc', lengthMeters: 60, curvaturePerMeter: -0.01 },
    ],
  })
);

const DIMENSIONS = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 5.2,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: -1.1,
} as const;

test('stepDriving advances explicit route progress through a shallow curve', () => {
  const distanceAlongRouteMeters = 45;
  const sample = sampleRoute(ROAD.route, distanceAlongRouteMeters);
  const state = {
    truck: createTruckState({
      position: routeToWorld(ROAD.route, { distanceAlongRouteMeters, lateralOffsetMeters: 0 }),
      headingRadians: sample.headingRadians,
      speedMetersPerSecond: 20,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: sample.headingRadians,
      massKilograms: 36_287,
      cargoIntegrity: 1,
      status: 'driving' as const,
    }),
    routePosition: { distanceAlongRouteMeters, lateralOffsetMeters: 0 },
    fuel: createFuelState(),
    barrierContactState: { cooldownRemainingSeconds: 0 },
    lastFuelBurn: {
      baselineDrain: 0,
      highSpeedDrain: 0,
      launchGulpDrain: 0,
      totalDrain: 0,
      drainRatePerSecond: 0,
    },
  };

  const result = stepDriving({
    state,
    controls: { throttle: 0, brake: 0, steering: 0 },
    dtSeconds: 0.5,
    road: ROAD,
    truckDimensions: DIMENSIONS,
    truckTuning: DEFAULT_TRUCK_TUNING,
  });

  assert.ok(result.state.routePosition.distanceAlongRouteMeters > distanceAlongRouteMeters);
  assert.notEqual(result.state.truck.position.xMeters, state.truck.position.xMeters);
  assert.equal(result.state.routePosition.lateralOffsetMeters < 1, true);
});

test('stepDriving keeps the complete truck footprint inside the barriers after a hit', () => {
  const distanceAlongRouteMeters = 20;
  const state = {
    truck: createTruckState({
      position: routeToWorld(ROAD.route, {
        distanceAlongRouteMeters,
        lateralOffsetMeters: 8.5,
      }),
      headingRadians: 0.4,
      speedMetersPerSecond: 20,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: 0.4,
      massKilograms: 36_287,
      cargoIntegrity: 1,
      status: 'driving' as const,
    }),
    routePosition: { distanceAlongRouteMeters, lateralOffsetMeters: 8.5 },
    fuel: createFuelState(),
    barrierContactState: { cooldownRemainingSeconds: 0 },
    lastFuelBurn: {
      baselineDrain: 0,
      highSpeedDrain: 0,
      launchGulpDrain: 0,
      totalDrain: 0,
      drainRatePerSecond: 0,
    },
  };

  const result = stepDriving({
    state,
    controls: { throttle: 0, brake: 0, steering: 0 },
    dtSeconds: 0.5,
    road: ROAD,
    truckDimensions: DIMENSIONS,
    truckTuning: DEFAULT_TRUCK_TUNING,
  });

  assert.equal(result.barrierImpact?.side, 'right');
  assert.equal(result.didDamageCargo, true);
  assert.equal(
    detectRoadBarrierImpact(
      ROAD,
      buildTruckFootprint(result.state.truck, DIMENSIONS),
      result.state.routePosition.distanceAlongRouteMeters
    ),
    null
  );
});
