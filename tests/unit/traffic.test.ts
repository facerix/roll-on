import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { createRoute, routeToWorld, sampleRoute } from '../../src/game/route.ts';
import type { TruckFootprintDimensions } from '../../src/game/roadCollision.ts';
import {
  detectRigidBodyContact,
  resolveRigidBodyContact,
  type RigidBody,
} from '../../src/game/rigidBody.ts';
import {
  addPatrolCruiser,
  createTrafficState,
  createTrafficVehicle,
  DEFAULT_TRAFFIC_TUNING,
  removeTrafficVehicle,
  stagePatrolCruiser,
  stepTraffic,
  type PatrolVehicleCommand,
  type TrafficState,
} from '../../src/game/traffic.ts';
import { createTruckState, type TruckState } from '../../src/game/truck.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING);
const CURVED_ROAD = createRoad(
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
const TRUCK_DIMENSIONS: TruckFootprintDimensions = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 4,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: 0.7,
};

function truck(overrides: Partial<TruckState> = {}): TruckState {
  return createTruckState({
    position: { xMeters: ROAD.laneCenterOffsetsMeters[1]!, yMeters: 100 },
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

test('commuters follow route lane centers and headings through an S-curve', () => {
  const commuter = createTrafficVehicle({
    id: 1,
    kind: 'commuter',
    laneIndex: 2,
    distanceMeters: 65,
    speedMetersPerSecond: 15,
    laneChangeCooldownSeconds: 99,
  });
  const distanceAlongRouteMeters = commuter.distanceMeters + commuter.speedMetersPerSecond;
  const result = stepTraffic({
    state: createTrafficState({ seed: 7, vehicles: [commuter], spawnCountdownSeconds: 99 }),
    truck: truck({ position: { xMeters: 0, yMeters: 0 } }),
    truckRoutePosition: { distanceAlongRouteMeters: 0, lateralOffsetMeters: 0 },
    road: CURVED_ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1,
  });
  const moved = result.state.vehicles[0]!;
  const expected = routeToWorld(CURVED_ROAD.route, {
    distanceAlongRouteMeters,
    lateralOffsetMeters: CURVED_ROAD.laneCenterOffsetsMeters[2]!,
  });
  const expectedHeading = sampleRoute(CURVED_ROAD.route, distanceAlongRouteMeters).headingRadians;

  assert.ok(Math.abs(moved.worldPosition.xMeters - expected.xMeters) < 1e-9);
  assert.ok(Math.abs(moved.worldPosition.yMeters - expected.yMeters) < 1e-9);
  assert.ok(Math.abs(moved.headingRadians - expectedHeading) < 1e-9);
  assert.ok(Math.abs(moved.lateralMeters - CURVED_ROAD.laneCenterOffsetsMeters[2]!) < 1e-9);
});

test('a collision-displaced driving vehicle reacquires its nearby route position', () => {
  const distanceAlongRouteMeters = 70;
  const lateralOffsetMeters = CURVED_ROAD.laneCenterOffsetsMeters[2]!;
  const sample = sampleRoute(CURVED_ROAD.route, distanceAlongRouteMeters);
  const commuter = createTrafficVehicle({
    id: 1,
    kind: 'commuter',
    laneIndex: 2,
    distanceMeters: distanceAlongRouteMeters,
    speedMetersPerSecond: 5,
    laneChangeCooldownSeconds: 99,
  });
  const positioned = {
    ...commuter,
    lateralMeters: lateralOffsetMeters,
    headingRadians: sample.headingRadians,
    worldPosition: routeToWorld(CURVED_ROAD.route, {
      distanceAlongRouteMeters,
      lateralOffsetMeters,
    }),
    worldVelocity: {
      xMetersPerSecond: sample.tangent.xMeters * 5,
      yMetersPerSecond: sample.tangent.yMeters * 5,
    },
  };
  const result = stepTraffic({
    state: createTrafficState({
      seed: 7,
      vehicles: [positioned],
      spawnCountdownSeconds: 99,
    }),
    truck: truck({ position: positioned.worldPosition, speedMetersPerSecond: 0 }),
    truckRoutePosition: { distanceAlongRouteMeters, lateralOffsetMeters },
    road: CURVED_ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
    tuning: {
      ...DEFAULT_TRAFFIC_TUNING,
      plowImpactSpeedMetersPerSecond: 100,
    },
  });

  const resolved = result.state.vehicles[0]!;
  assert.ok(Math.abs(resolved.distanceMeters - distanceAlongRouteMeters) < 2);
  const reacquiredWorldPosition = routeToWorld(CURVED_ROAD.route, {
    distanceAlongRouteMeters: resolved.distanceMeters,
    lateralOffsetMeters: resolved.lateralMeters,
  });
  assert.ok(Math.abs(resolved.worldPosition.xMeters - reacquiredWorldPosition.xMeters) < 1e-9);
  assert.ok(Math.abs(resolved.worldPosition.yMeters - reacquiredWorldPosition.yMeters) < 1e-9);
});

test('traffic accepts the signed hitch offset used by truck collision geometry', () => {
  assert.doesNotThrow(() =>
    stepTraffic({
      state: createTrafficState({ seed: 7, spawnCountdownSeconds: 99 }),
      truck: truck(),
      road: ROAD,
      truckDimensions: { ...TRUCK_DIMENSIONS, hitchGapMeters: -1.1 },
      dtSeconds: 1 / 60,
    })
  );
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
    position: { xMeters: 0, yMeters: 0 },
    velocity: { xMetersPerSecond: 0, yMetersPerSecond: 0 },
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
    position: { xMeters: 1.2, yMeters: 0.4 },
    headingRadians: -Math.PI / 10,
  });
  const contact = detectRigidBodyContact(a, b);

  assert.ok(contact);
  assert.ok(contact.penetrationMeters > 0);
  assert.ok(contact.normal.xMeters > 0);
  assert.ok(Math.abs(Math.hypot(contact.normal.xMeters, contact.normal.yMeters) - 1) < 1e-12);
  assert.equal(
    detectRigidBodyContact(a, body({ id: 'far', position: { xMeters: 10, yMeters: 0 } })),
    null
  );
});

test('rigid-body response separates overlap and transfers less velocity to a heavy truck', () => {
  const truckBody = body({
    id: 'truck',
    velocity: { xMetersPerSecond: 0, yMetersPerSecond: 25 },
    widthMeters: 2.6,
    lengthMeters: 4,
    massKilograms: 36_287,
  });
  const carBody = body({
    id: 'car',
    position: { xMeters: 0, yMeters: 2.5 },
    velocity: { xMetersPerSecond: 0, yMetersPerSecond: 10 },
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
  assert.ok(result.bodyA.velocity.yMetersPerSecond < 25);
  assert.ok(result.bodyA.velocity.yMetersPerSecond > 24);
  assert.ok(result.bodyB.velocity.yMetersPerSecond > 10);
  assert.ok(result.normalImpulse > 0);
});

test('plowing over a commuter leaves a short-lived pushed wreck and records Road Rage once', () => {
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

test('a cruiser moves only as its encounter commands', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 5, spawnCountdownSeconds: 99 }), {
    distanceMeters: 70,
    lateralMeters: 10.4,
    speedMetersPerSecond: 0,
    headingOffsetRadians: Math.PI / 2,
    road: ROAD,
  });
  const command: PatrolVehicleCommand = {
    vehicleId: posted.vehicleId,
    targetLateralMeters: 1.85,
    lateralRateMetersPerSecond: 3,
    targetSpeedMetersPerSecond: 30,
    targetHeadingOffsetRadians: 0,
    headingRateRadiansPerSecond: 2,
  };
  const result = stepTraffic({
    state: posted.state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.5,
    patrolCommand: command,
  });
  const cruiser = result.state.vehicles[0]!;

  assert.equal(cruiser.kind, 'patrol');
  assert.ok(cruiser.speedMetersPerSecond > 0 && cruiser.speedMetersPerSecond <= 30);
  assert.ok(cruiser.lateralMeters < 10.4 && cruiser.lateralMeters >= 1.85);
  assert.ok(Math.abs(cruiser.headingRadians) < Math.PI / 2);
  assert.deepEqual(result.events, []);
});

test('an uncommanded cruiser holds the pose its encounter parked it in', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 5, spawnCountdownSeconds: 99 }), {
    distanceMeters: 700,
    lateralMeters: 10.4,
    speedMetersPerSecond: 0,
    headingOffsetRadians: Math.PI / 2,
    road: ROAD,
  });
  const result = stepTraffic({
    state: posted.state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 1,
  });
  const cruiser = result.state.vehicles[0]!;

  assert.equal(cruiser.speedMetersPerSecond, 0);
  assert.equal(cruiser.lateralMeters, 10.4);
  assert.equal(cruiser.distanceMeters, 700);
  assert.ok(Math.abs(cruiser.headingRadians - Math.PI / 2) < 1e-9);
});

test('staging relocates one cruiser without disturbing its lateral pull-out pose', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 5, spawnCountdownSeconds: 99 }), {
    distanceMeters: 700,
    lateralMeters: 7.1,
    speedMetersPerSecond: 9,
    headingOffsetRadians: 0.4,
    road: CURVED_ROAD,
  });
  const staged = stagePatrolCruiser(posted.state, posted.vehicleId, {
    distanceMeters: 735,
    speedMetersPerSecond: 40,
    road: CURVED_ROAD,
  });
  const cruiser = staged.vehicles.find(vehicle => vehicle.id === posted.vehicleId)!;

  assert.equal(cruiser.distanceMeters, 735);
  assert.equal(cruiser.speedMetersPerSecond, 40);
  assert.equal(cruiser.lateralMeters, 7.1);
  assert.equal(cruiser.distanceCollisionVelocityMetersPerSecond, 0);
  assert.equal(cruiser.lateralCollisionVelocityMetersPerSecond, 0);
  assert.throws(
    () =>
      stagePatrolCruiser(staged, 999, {
        distanceMeters: 700,
        speedMetersPerSecond: 30,
        road: ROAD,
      }),
    /patrol cruiser 999/
  );
});

test('ambient traffic never spawns a cruiser on its own', () => {
  let state = createTrafficState({ seed: 3, spawnCountdownSeconds: 0 });
  let currentTruck = truck();
  for (let index = 0; index < 60; index++) {
    const result = stepTraffic({
      state,
      truck: currentTruck,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
      dtSeconds: 0.5,
    });
    state = result.state;
    currentTruck = result.truck;
  }

  assert.ok(state.nextVehicleId > 1, 'expected ambient traffic to have spawned');
  assert.equal(state.vehicles.filter(vehicle => vehicle.kind === 'patrol').length, 0);
});

test('a parked cruiser and a responding cruiser can share the road, and removal is explicit', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 1, spawnCountdownSeconds: 99 }), {
    distanceMeters: 700,
    lateralMeters: 10.4,
    speedMetersPerSecond: 0,
    headingOffsetRadians: Math.PI / 2,
    road: ROAD,
  });
  const responding = addPatrolCruiser(posted.state, {
    distanceMeters: 660,
    lateralMeters: 5.55,
    speedMetersPerSecond: 25,
    road: ROAD,
  });

  assert.notEqual(responding.vehicleId, posted.vehicleId);
  assert.equal(responding.state.vehicles.length, 2);

  const parkedOnly = removeTrafficVehicle(responding.state, responding.vehicleId);
  assert.deepEqual(
    parkedOnly.vehicles.map(vehicle => vehicle.id),
    [posted.vehicleId]
  );
});

test('only the commanded cruiser moves when two are on the road', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 1, spawnCountdownSeconds: 99 }), {
    distanceMeters: 700,
    lateralMeters: 10.4,
    speedMetersPerSecond: 0,
    headingOffsetRadians: Math.PI / 2,
    road: ROAD,
  });
  const responding = addPatrolCruiser(posted.state, {
    distanceMeters: 660,
    lateralMeters: 5.55,
    speedMetersPerSecond: 25,
    road: ROAD,
  });
  const result = stepTraffic({
    state: responding.state,
    truck: truck({ position: { xMeters: 0, yMeters: 690 } }),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.5,
    patrolCommand: {
      vehicleId: responding.vehicleId,
      targetLateralMeters: 1.85,
      lateralRateMetersPerSecond: 3,
      targetSpeedMetersPerSecond: 32,
      targetHeadingOffsetRadians: 0,
      headingRateRadiansPerSecond: 2,
    },
  });

  const parked = result.state.vehicles.find(vehicle => vehicle.id === posted.vehicleId)!;
  const chasing = result.state.vehicles.find(vehicle => vehicle.id === responding.vehicleId)!;

  assert.equal(parked.speedMetersPerSecond, 0);
  assert.equal(parked.lateralMeters, 10.4);
  assert.ok(chasing.speedMetersPerSecond > 25);
  assert.ok(chasing.lateralMeters < 5.55);
});

test('a cruiser outlives the distance cull because its encounter owns it', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 1, spawnCountdownSeconds: 99 }), {
    distanceMeters: 100,
    lateralMeters: 5.55,
    speedMetersPerSecond: 0,
    road: ROAD,
  });
  const commuter = createTrafficVehicle({
    id: 90,
    kind: 'commuter',
    laneIndex: 1,
    distanceMeters: 100,
    speedMetersPerSecond: 0,
  });
  const result = stepTraffic({
    state: { ...posted.state, vehicles: [...posted.state.vehicles, commuter] },
    truck: truck({ position: { xMeters: 0, yMeters: 400 } }),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0.1,
  });

  assert.deepEqual(
    result.state.vehicles.map(vehicle => vehicle.kind),
    ['patrol']
  );
});

test('cruiser contact is reported once per cooldown and costs the truck nothing here', () => {
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

  const contact = first.events.find(event => event.kind === 'patrol-contact');
  assert.equal(contact?.kind, 'patrol-contact');
  assert.ok(
    (contact?.impactSpeedMetersPerSecond ?? 0) >=
      DEFAULT_TRAFFIC_TUNING.patrolContactImpactSpeedMetersPerSecond
  );
  assert.equal(first.truck.cargoIntegrity, 1);
  assert.equal(second.truck.cargoIntegrity, 1);
  assert.equal(second.state.takedowns, 0);
  assert.equal(second.events.filter(event => event.kind === 'patrol-contact').length, 0);
  assert.equal(second.state.vehicles[0]!.status, 'driving');
});

test('a commanded cruiser holds its ordered speed across many small steps', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 5, spawnCountdownSeconds: 99 }), {
    distanceMeters: 60,
    lateralMeters: 1.85,
    speedMetersPerSecond: 20,
    road: ROAD,
  });
  let state = posted.state;
  let currentTruck = truck();
  const command: PatrolVehicleCommand = {
    vehicleId: posted.vehicleId,
    targetLateralMeters: 1.85,
    lateralRateMetersPerSecond: 3,
    targetSpeedMetersPerSecond: 28,
    targetHeadingOffsetRadians: 0,
    headingRateRadiansPerSecond: 2,
  };

  for (let index = 0; index < 240; index++) {
    const result = stepTraffic({
      state,
      truck: currentTruck,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
      dtSeconds: 1 / 60,
      patrolCommand: command,
    });
    state = result.state;
    currentTruck = {
      ...result.truck,
      position: {
        ...result.truck.position,
        yMeters: result.truck.position.yMeters + result.truck.speedMetersPerSecond / 60,
      },
    };
  }

  const cruiser = state.vehicles[0]!;
  assert.ok(Math.abs(cruiser.speedMetersPerSecond - 28) < 1e-6);
  assert.ok(Math.abs(cruiser.lateralMeters - 1.85) < 0.05);
  assert.ok(cruiser.distanceMeters > 60);
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

test('ambient spawning adds commuters around an encounter cruiser without replacing it', () => {
  const posted = addPatrolCruiser(createTrafficState({ seed: 42, spawnCountdownSeconds: 0 }), {
    distanceMeters: 65,
    lateralMeters: -5.55,
    speedMetersPerSecond: 20,
    road: ROAD,
  });
  const result = stepTraffic({
    state: posted.state,
    truck: truck(),
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
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
