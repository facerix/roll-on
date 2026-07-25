import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import type { TruckFootprintDimensions } from '../../src/game/roadCollision.ts';
import {
  createTrafficState,
  createTrafficVehicle,
  DEFAULT_TRAFFIC_TUNING,
  detectRigidBodyContact,
  resolveRigidBodyContact,
  stepTraffic,
  type RigidBody,
  type TrafficState,
} from '../../src/game/traffic.ts';
import { createTruckState, type TruckState } from '../../src/game/truck.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING);
const TRUCK_DIMENSIONS: TruckFootprintDimensions = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 4,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: 0.7,
};

function truck(overrides: Partial<TruckState> = {}): TruckState {
  return createTruckState({
    position: { lateralMeters: ROAD.laneCenterOffsetsMeters[1]!, distanceMeters: 100 },
    headingRadians: 0,
    speedMetersPerSecond: 25,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
    ...overrides,
  });
}

test('commuter cars move forward and stay centered in their lane', () => {
  const commuter = createTrafficVehicle({
    id: 1,
    kind: 'commuter',
    laneIndex: 2,
    distanceMeters: 130,
    speedMetersPerSecond: 15,
  });
  const state = createTrafficState({ seed: 7, vehicles: [commuter], spawnCountdownSeconds: 99 });

  const result = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1,
  });

  assert.equal(result.state.vehicles[0]!.distanceMeters, 145);
  assert.equal(result.state.vehicles[0]!.lateralMeters, ROAD.laneCenterOffsetsMeters[2]);
});

test('a bumped commuter settles back toward its lane center and straight heading', () => {
  const laneCenter = ROAD.laneCenterOffsetsMeters[2]!;
  const commuter = {
    ...createTrafficVehicle({
      id: 1,
      kind: 'commuter',
      laneIndex: 2,
      distanceMeters: 130,
      speedMetersPerSecond: 15,
      laneChangeCooldownSeconds: 99,
    }),
    lateralMeters: laneCenter + 1,
    headingRadians: 0.4,
  };
  const state = createTrafficState({ seed: 7, vehicles: [commuter], spawnCountdownSeconds: 99 });

  const result = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.25,
  });
  const settled = result.state.vehicles[0]!;

  assert.ok(Math.abs(settled.lateralMeters - laneCenter) < 1);
  assert.ok(Math.abs(settled.headingRadians) < 0.4);
});

test('commuters occasionally make a bounded adjacent-lane change', () => {
  const commuter = createTrafficVehicle({
    id: 1,
    kind: 'commuter',
    laneIndex: 1,
    distanceMeters: 160,
    speedMetersPerSecond: 15,
    laneChangeCooldownSeconds: 0,
  });
  const state = createTrafficState({ seed: 1, vehicles: [commuter], spawnCountdownSeconds: 99 });

  const result = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.25,
  });
  const changed = result.state.vehicles[0]!;

  assert.ok(Math.abs(changed.targetLaneIndex - 1) === 1);
  assert.ok(changed.lateralMeters !== ROAD.laneCenterOffsetsMeters[1]);
  assert.ok(changed.lateralMeters > ROAD.leftRoadEdgeMeters);
  assert.ok(changed.lateralMeters < ROAD.rightRoadEdgeMeters);
});

function body(overrides: Partial<RigidBody> = {}): RigidBody {
  return {
    id: 'body',
    position: { lateralMeters: 0, distanceMeters: 0 },
    velocity: { lateralMetersPerSecond: 0, distanceMetersPerSecond: 0 },
    headingRadians: 0,
    angularVelocityRadiansPerSecond: 0,
    widthMeters: 2,
    lengthMeters: 4,
    massKilograms: 1_500,
    ...overrides,
  };
}

test('SAT reports a stable normal and penetration for rotated rigid bodies', () => {
  const a = body({ id: 'a', headingRadians: Math.PI / 12 });
  const b = body({
    id: 'b',
    position: { lateralMeters: 1.2, distanceMeters: 0.4 },
    headingRadians: -Math.PI / 10,
  });
  const contact = detectRigidBodyContact(a, b);

  assert.ok(contact);
  assert.ok(contact.penetrationMeters > 0);
  assert.ok(contact.normal.lateralMeters > 0);
  assert.ok(
    Math.abs(Math.hypot(contact.normal.lateralMeters, contact.normal.distanceMeters) - 1) < 1e-12
  );
  assert.equal(
    detectRigidBodyContact(
      a,
      body({ id: 'far', position: { lateralMeters: 10, distanceMeters: 0 } })
    ),
    null
  );
});

test('rigid-body response separates overlap and transfers less velocity to a heavy truck', () => {
  const truckBody = body({
    id: 'truck',
    velocity: { lateralMetersPerSecond: 0, distanceMetersPerSecond: 25 },
    widthMeters: 2.6,
    lengthMeters: 4,
    massKilograms: 36_287,
  });
  const carBody = body({
    id: 'car',
    position: { lateralMeters: 0, distanceMeters: 2.5 },
    velocity: { lateralMetersPerSecond: 0, distanceMetersPerSecond: 10 },
  });
  const contact = detectRigidBodyContact(truckBody, carBody);
  assert.ok(contact);

  const result = resolveRigidBodyContact(truckBody, carBody, contact, {
    restitution: 0.08,
    friction: 0.35,
    positionalCorrection: 1,
    penetrationSlopMeters: 0,
  });

  assert.equal(detectRigidBodyContact(result.bodyA, result.bodyB), null);
  assert.ok(result.bodyA.velocity.distanceMetersPerSecond < 25);
  assert.ok(result.bodyA.velocity.distanceMetersPerSecond > 24);
  assert.ok(result.bodyB.velocity.distanceMetersPerSecond > 10);
  assert.ok(result.normalImpulse > 0);
});

test('plowing over a commuter leaves a short-lived pushed wreck and awards Road Rage once', () => {
  const commuter = createTrafficVehicle({
    id: 4,
    kind: 'commuter',
    laneIndex: 1,
    distanceMeters: 103.5,
    speedMetersPerSecond: 10,
  });
  const state = createTrafficState({ seed: 3, vehicles: [commuter], spawnCountdownSeconds: 99 });

  const result = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
  });

  const wreck = result.state.vehicles[0]!;
  assert.equal(wreck.status, 'disabled');
  assert.ok(wreck.disabledSecondsRemaining > 0);
  assert.ok(wreck.distanceMeters > commuter.distanceMeters);
  assert.equal(result.state.takedowns, 1);
  assert.equal(result.truck.cargoIntegrity, 0.98);
  assert.deepEqual(result.events, [{ kind: 'road-rage', vehicleId: 4 }]);

  const next = stepTraffic({
    state: result.state,
    truck: result.truck,
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1 / 60,
  });
  assert.equal(next.state.takedowns, 1);
  assert.deepEqual(next.events, []);
});

test('low-speed commuter contact separates bodies without falsely awarding Road Rage', () => {
  const commuter = createTrafficVehicle({
    id: 5,
    kind: 'commuter',
    laneIndex: 1,
    distanceMeters: 103.5,
    speedMetersPerSecond: 23,
  });
  const result = stepTraffic({
    state: createTrafficState({
      seed: 3,
      vehicles: [commuter],
      spawnCountdownSeconds: 99,
    }),
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
  });

  assert.equal(result.state.vehicles[0]!.status, 'driving');
  assert.equal(result.state.takedowns, 0);
  assert.equal(result.truck.cargoIntegrity, 1);
  assert.deepEqual(result.events, []);
});

test('patrol cruiser accelerates to catch and pace the truck', () => {
  const cruiser = createTrafficVehicle({
    id: 2,
    kind: 'patrol',
    laneIndex: 0,
    distanceMeters: 70,
    speedMetersPerSecond: 20,
  });
  const state = createTrafficState({ seed: 5, vehicles: [cruiser], spawnCountdownSeconds: 99 });

  const result = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1,
  });
  const paced = result.state.vehicles[0]!;

  assert.ok(paced.speedMetersPerSecond > 20);
  assert.equal(paced.targetLaneIndex, 1);
  assert.ok(paced.lateralMeters > ROAD.laneCenterOffsetsMeters[0]!);
});

test('patrol cruiser brakes hard instead of overrunning a suddenly slower truck', () => {
  const cruiser = createTrafficVehicle({
    id: 2,
    kind: 'patrol',
    laneIndex: 1,
    distanceMeters: 75,
    speedMetersPerSecond: 30,
  });
  const result = stepTraffic({
    state: createTrafficState({ seed: 5, vehicles: [cruiser], spawnCountdownSeconds: 99 }),
    truck: truck({ speedMetersPerSecond: 10 }),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.5,
  });

  assert.ok(result.state.vehicles[0]!.speedMetersPerSecond <= 24);
});

test('patrol contact causes a stronger cooldown-limited cargo hit without a takedown', () => {
  const cruiser = createTrafficVehicle({
    id: 9,
    kind: 'patrol',
    laneIndex: 1,
    distanceMeters: 84,
    speedMetersPerSecond: 35,
  });
  let state: TrafficState = createTrafficState({
    seed: 8,
    vehicles: [cruiser],
    spawnCountdownSeconds: 99,
  });
  const first = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
  });
  state = first.state;
  const second = stepTraffic({
    state,
    truck: first.truck,
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.1,
  });

  assert.ok(first.truck.cargoIntegrity < 1);
  assert.equal(second.truck.cargoIntegrity, first.truck.cargoIntegrity);
  assert.equal(second.state.takedowns, 0);
  assert.equal(second.state.vehicles.length, 1);
  assert.equal(first.state.vehicles[0]!.status, 'disengaging');
  assert.ok(first.state.vehicles[0]!.patrolDisengageSecondsRemaining > 0);
  assert.ok(
    second.state.vehicles[0]!.patrolDisengageSecondsRemaining <
      first.state.vehicles[0]!.patrolDisengageSecondsRemaining
  );
  const trailerRearMeters =
    first.truck.position.distanceMeters -
    (TRUCK_DIMENSIONS.cabLengthMeters / 2 +
      TRUCK_DIMENSIONS.trailerLengthMeters +
      TRUCK_DIMENSIONS.hitchGapMeters);
  assert.ok(first.state.vehicles[0]!.distanceMeters < trailerRearMeters);

  const departed = stepTraffic({
    state: second.state,
    truck: second.truck,
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: DEFAULT_TRAFFIC_TUNING.patrolDisengageSeconds,
  });
  assert.equal(departed.state.vehicles.length, 0);
});

test('patrol pacing target stays behind the trailer instead of inside it', () => {
  let state = createTrafficState({
    seed: 5,
    vehicles: [
      createTrafficVehicle({
        id: 2,
        kind: 'patrol',
        laneIndex: 1,
        distanceMeters: 60,
        speedMetersPerSecond: 20,
      }),
    ],
    spawnCountdownSeconds: 99,
  });
  let currentTruck = truck();

  for (let index = 0; index < 240; index++) {
    const result = stepTraffic({
      state,
      truck: currentTruck,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
      dtSeconds: 1 / 60,
    });
    state = result.state;
    currentTruck = {
      ...result.truck,
      position: {
        ...result.truck.position,
        distanceMeters:
          result.truck.position.distanceMeters + result.truck.speedMetersPerSecond / 60,
      },
    };
  }

  const cruiser = state.vehicles[0]!;
  const trailerRearMeters =
    currentTruck.position.distanceMeters -
    (TRUCK_DIMENSIONS.cabLengthMeters / 2 +
      TRUCK_DIMENSIONS.trailerLengthMeters +
      TRUCK_DIMENSIONS.hitchGapMeters);
  assert.ok(cruiser.distanceMeters < trailerRearMeters - 1);
});

test('a commuter rejects a lane change when the adjacent gap is occupied', () => {
  const changing = createTrafficVehicle({
    id: 1,
    kind: 'commuter',
    laneIndex: 0,
    distanceMeters: 140,
    speedMetersPerSecond: 15,
    laneChangeCooldownSeconds: 0,
  });
  const blocker = createTrafficVehicle({
    id: 2,
    kind: 'commuter',
    laneIndex: 1,
    distanceMeters: 141,
    speedMetersPerSecond: 15,
  });
  const result = stepTraffic({
    state: createTrafficState({
      seed: 1,
      vehicles: [changing, blocker],
      spawnCountdownSeconds: 99,
    }),
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1 / 60,
  });

  assert.equal(result.state.vehicles[0]!.targetLaneIndex, 0);
});

test('traffic-to-traffic contacts separate cars without awarding a takedown', () => {
  const first = createTrafficVehicle({
    id: 1,
    kind: 'commuter',
    laneIndex: 2,
    distanceMeters: 140,
    speedMetersPerSecond: 18,
  });
  const second = createTrafficVehicle({
    id: 2,
    kind: 'commuter',
    laneIndex: 2,
    distanceMeters: 144,
    speedMetersPerSecond: 12,
  });
  const result = stepTraffic({
    state: createTrafficState({
      seed: 1,
      vehicles: [first, second],
      spawnCountdownSeconds: 99,
    }),
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
  });
  const [resolvedFirst, resolvedSecond] = result.state.vehicles;
  assert.ok(resolvedFirst && resolvedSecond);
  assert.ok(Math.abs(resolvedFirst.distanceMeters - resolvedSecond.distanceMeters) >= 4.5 - 1e-9);
  assert.equal(result.state.takedowns, 0);
});

test('traffic spawning is deterministic from its state checkpoint', () => {
  const initial = createTrafficState({ seed: 42, spawnCountdownSeconds: 0 });
  const run = () =>
    stepTraffic({
      state: initial,
      truck: truck(),
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
      dtSeconds: 0,
    }).state;

  assert.deepEqual(run(), run());
  assert.equal(run().vehicles.length, 1);
});

test('traffic spawning limits patrol encounters to one active cruiser', () => {
  const patrol = createTrafficVehicle({
    id: 1,
    kind: 'patrol',
    laneIndex: 0,
    distanceMeters: 65,
    speedMetersPerSecond: 20,
  });
  const result = stepTraffic({
    state: createTrafficState({
      seed: 42,
      vehicles: [patrol],
      spawnCountdownSeconds: 0,
    }),
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
    tuning: {
      ...DEFAULT_TRAFFIC_TUNING,
      patrolSpawnChance: 1,
    },
  });

  assert.equal(result.state.vehicles.filter(vehicle => vehicle.kind === 'patrol').length, 1);
  assert.equal(result.state.vehicles.filter(vehicle => vehicle.kind === 'commuter').length, 1);
});

test('traffic spawning skips a fully occupied spawn window', () => {
  const occupied = ROAD.laneCenterOffsetsMeters.map((_, laneIndex) =>
    createTrafficVehicle({
      id: laneIndex + 1,
      kind: 'commuter',
      laneIndex,
      distanceMeters: 180,
      speedMetersPerSecond: 15,
    })
  );
  const state = createTrafficState({
    seed: 42,
    vehicles: occupied,
    spawnCountdownSeconds: 0,
  });
  const result = stepTraffic({
    state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
    tuning: {
      ...DEFAULT_TRAFFIC_TUNING,
      patrolSpawnChance: 0,
      spawnAheadMinMeters: 80,
      spawnAheadMaxMeters: 80,
    },
  });

  assert.equal(result.state.vehicles.length, occupied.length);
  assert.equal(result.state.nextVehicleId, state.nextVehicleId);
});

test('traffic rejects corrupt time, RNG, and lane state', () => {
  const valid = createTrafficState({ seed: 1, spawnCountdownSeconds: 1 });
  const options = {
    state: valid,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1 / 60,
  };

  assert.throws(() => stepTraffic({ ...options, dtSeconds: -1 }), RangeError);
  assert.throws(() => stepTraffic({ ...options, state: { ...valid, rngState: NaN } }), TypeError);
  assert.throws(
    () =>
      stepTraffic({
        ...options,
        state: {
          ...valid,
          vehicles: [
            {
              ...createTrafficVehicle({
                id: 1,
                kind: 'commuter',
                laneIndex: 0,
                distanceMeters: 10,
                speedMetersPerSecond: 10,
              }),
              laneIndex: ROAD.laneCount,
            },
          ],
        },
      }),
    RangeError
  );
});
