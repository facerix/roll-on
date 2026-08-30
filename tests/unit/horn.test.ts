import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHornState, DEFAULT_HORN_TUNING, stepHorn } from '../../src/game/horn.ts';
import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { createRoute } from '../../src/game/route.ts';
import {
  createTrafficState,
  createTrafficVehicle,
  type TrafficVehicle,
} from '../../src/game/traffic.ts';

const ROUTE = createRoute({
  origin: { xMeters: 0, yMeters: 0 },
  headingRadians: 0,
  segments: [{ kind: 'straight', lengthMeters: 500 }],
  constraints: { maximumAbsoluteRoadOffsetMeters: 14, minimumBendRadiusMeters: 100 },
});
const ROAD = createRoad(DEFAULT_ROAD_TUNING, ROUTE);
const TRUCK_ROUTE_POSITION = {
  distanceAlongRouteMeters: 100,
  lateralOffsetMeters: ROAD.laneCenterOffsetsMeters[1]!,
};

function commuter(
  id: number,
  laneIndex: number,
  distanceMeters: number,
  overrides: Partial<TrafficVehicle> = {}
): TrafficVehicle {
  return {
    ...createTrafficVehicle({
      id,
      kind: 'commuter',
      laneIndex,
      distanceMeters,
      speedMetersPerSecond: 15,
      laneChangeCooldownSeconds: 99,
    }),
    ...overrides,
  };
}

function activate(vehicles: readonly TrafficVehicle[]) {
  return stepHorn({
    state: createHornState(),
    activate: true,
    dtSeconds: 1 / 60,
    traffic: createTrafficState({ vehicles, spawnCountdownSeconds: 99 }),
    truckRoutePosition: TRUCK_ROUTE_POSITION,
    road: ROAD,
  });
}

test('horn clears the nearest commuter ahead into the right lane and begins recharging', () => {
  const nearest = commuter(1, 1, 112);
  const farther = commuter(2, 1, 125);

  const result = activate([farther, nearest]);

  assert.equal(result.status, 'cleared');
  assert.equal(result.affectedVehicleId, nearest.id);
  assert.equal(result.state.cooldownRemainingSeconds, DEFAULT_HORN_TUNING.rechargeSeconds);
  assert.deepEqual(
    result.traffic.vehicles.map(vehicle => [
      vehicle.id,
      vehicle.targetLaneIndex,
      vehicle.laneChangeRemainingSeconds,
    ]),
    [
      [farther.id, 1, 0],
      [nearest.id, 2, DEFAULT_HORN_TUNING.laneChangeDurationSeconds],
    ]
  );
});

test('horn falls back to the left lane when the preferred right gap is occupied', () => {
  const target = commuter(1, 1, 112);
  const rightBlocker = commuter(2, 2, 115);

  const result = activate([target, rightBlocker]);

  assert.equal(result.status, 'cleared');
  assert.equal(result.traffic.vehicles[0]!.targetLaneIndex, 0);
});

test('horn neither moves traffic nor spends its charge when both adjacent gaps are blocked', () => {
  const target = commuter(1, 1, 112);
  const leftBlocker = commuter(2, 0, 108);
  const rightBlocker = commuter(3, 2, 115);

  const result = activate([target, leftBlocker, rightBlocker]);

  assert.equal(result.status, 'blocked');
  assert.equal(result.affectedVehicleId, null);
  assert.deepEqual(result.state, createHornState());
  assert.deepEqual(result.traffic.vehicles, [target, leftBlocker, rightBlocker]);
});

test('horn ignores cars behind, outside its lane or range, patrol cars, and cars already moving over', () => {
  const vehicles = [
    commuter(1, 1, 99),
    commuter(2, 0, 112),
    commuter(3, 1, 100 + DEFAULT_HORN_TUNING.rangeAheadMeters + 0.01),
    {
      ...createTrafficVehicle({
        id: 4,
        kind: 'patrol',
        laneIndex: 1,
        distanceMeters: 110,
        speedMetersPerSecond: 15,
      }),
    },
    commuter(5, 1, 108, {
      targetLaneIndex: 2,
      laneChangeRemainingSeconds: 0.5,
    }),
  ];

  const result = activate(vehicles);

  assert.equal(result.status, 'no-target');
  assert.equal(result.state.cooldownRemainingSeconds, 0);
  assert.deepEqual(result.traffic.vehicles, vehicles);
});

test('horn rejects another use until the successful-use cooldown reaches zero', () => {
  const target = commuter(1, 1, 112);
  const first = activate([target]);
  const duringCooldown = stepHorn({
    state: first.state,
    activate: true,
    dtSeconds: 1,
    traffic: first.traffic,
    truckRoutePosition: TRUCK_ROUTE_POSITION,
    road: ROAD,
  });

  assert.equal(duringCooldown.status, 'cooldown');
  assert.equal(
    duringCooldown.state.cooldownRemainingSeconds,
    DEFAULT_HORN_TUNING.rechargeSeconds - 1
  );

  const recharged = stepHorn({
    ...duringCooldown,
    state: duringCooldown.state,
    activate: false,
    dtSeconds: DEFAULT_HORN_TUNING.rechargeSeconds,
    traffic: duringCooldown.traffic,
    truckRoutePosition: TRUCK_ROUTE_POSITION,
    road: ROAD,
  });
  assert.equal(recharged.status, 'idle');
  assert.equal(recharged.state.cooldownRemainingSeconds, 0);
});

test('horn state and tuning validation reject corrupt simulation values', () => {
  const traffic = createTrafficState({ spawnCountdownSeconds: 99 });
  assert.throws(
    () =>
      stepHorn({
        state: { cooldownRemainingSeconds: Number.NaN },
        activate: false,
        dtSeconds: 0,
        traffic,
        truckRoutePosition: TRUCK_ROUTE_POSITION,
        road: ROAD,
      }),
    /cooldownRemainingSeconds must be finite/
  );
  assert.throws(
    () =>
      stepHorn({
        state: createHornState(),
        activate: false,
        dtSeconds: 0,
        traffic,
        truckRoutePosition: TRUCK_ROUTE_POSITION,
        road: ROAD,
        tuning: { ...DEFAULT_HORN_TUNING, rechargeSeconds: 0 },
      }),
    /rechargeSeconds must be positive/
  );
});
