import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFuelState } from '../../src/game/fuel.ts';
import { stepDriving, type DrivingState } from '../../src/game/drivingUpdate.ts';
import { createDefaultStageRoute, createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { routeToWorld, sampleRoute } from '../../src/game/route.ts';
import { createTrafficState, stepTraffic } from '../../src/game/traffic.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING, createDefaultStageRoute());
const TRUCK_DIMENSIONS = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 5.2,
  trailerWidthMeters: DEFAULT_TRUCK_TUNING.trailerWidthMeters,
  trailerLengthMeters: DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters,
  hitchGapMeters: -1.1,
} as const;

function createState(): DrivingState {
  const sample = sampleRoute(ROAD.route, 0);
  return {
    truck: createTruckState({
      position: routeToWorld(ROAD.route, {
        distanceAlongRouteMeters: 0,
        lateralOffsetMeters: 0,
      }),
      headingRadians: sample.headingRadians,
      speedMetersPerSecond: 0,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: sample.headingRadians,
      massKilograms: 36_287,
      cargoIntegrity: 1,
      status: 'driving',
    }),
    routePosition: { distanceAlongRouteMeters: 0, lateralOffsetMeters: 0 },
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
}

function runSeededWindingRoute(seed: number): {
  readonly state: DrivingState;
  readonly trafficState: ReturnType<typeof createTrafficState>;
} {
  let state = createState();
  let trafficState = createTrafficState({ seed });
  for (let tick = 0; tick < 60 * 60; tick += 1) {
    const driving = stepDriving({
      state,
      controls: { throttle: 1, brake: 0, steering: 0 },
      dtSeconds: 1 / 60,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
    });
    state = driving.state;
    const traffic = stepTraffic({
      state: trafficState,
      truck: state.truck,
      truckRoutePosition: state.routePosition,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
      dtSeconds: 1 / 60,
    });
    trafficState = traffic.state;
    state = { ...state, truck: traffic.truck };
  }
  return { state, trafficState };
}

test('the default authored route is a long, deterministic shallow S-curve', () => {
  const route = createDefaultStageRoute();
  assert.equal(route.totalLengthMeters, 1320);
  assert.equal(sampleRoute(route, 320).curvaturePerMeter, 0.004);
  assert.equal(sampleRoute(route, 500).curvaturePerMeter, -0.004);
  assert.equal(sampleRoute(route, 680).curvaturePerMeter, 0);
});

test('a seeded fixed-step winding run keeps all systems finite and deterministic', () => {
  const first = runSeededWindingRoute(0x51_51_51);
  const second = runSeededWindingRoute(0x51_51_51);

  assert.deepEqual(first, second);
  assert.ok(first.state.routePosition.distanceAlongRouteMeters > 900);
  assert.ok(first.state.routePosition.distanceAlongRouteMeters < 2_000);
  assert.ok(first.state.truck.position.xMeters !== 0);
  assert.ok(Number.isFinite(first.state.truck.position.yMeters));
  assert.ok(first.trafficState.vehicles.length > 0);
  assert.ok(
    first.trafficState.vehicles.every(vehicle => Number.isFinite(vehicle.worldPosition.xMeters))
  );
});
