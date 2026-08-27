import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultStageRoute,
  createRoad,
  DEFAULT_ROAD_TUNING,
  STAGE_1_ROAD_PULLOUTS,
} from '../../src/game/road.ts';
import {
  applyPatrolHit,
  buildPatrolCommand,
  buildPatrolStagingPose,
  DEFAULT_PATROL_PURSUIT_TUNING,
  observePatrolSurroundings,
  parkedCruiserPose,
} from '../../src/game/patrolPursuit.ts';
import { createTrafficVehicle, type TrafficVehicle } from '../../src/game/traffic.ts';
import { createTruckState, type TruckState } from '../../src/game/truck.ts';
import type { PatrolEncounter, PatrolEncounterPhase } from '../../src/game/patrolEncounter.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING, createDefaultStageRoute(), {
  pullouts: STAGE_1_ROAD_PULLOUTS,
});
const TRUCK_SPEED = 30;

function truck(overrides: Partial<TruckState> = {}): TruckState {
  return createTruckState({
    position: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: TRUCK_SPEED,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
    ...overrides,
  });
}

function cruiserAt(distanceMeters: number, lateralMeters: number): TrafficVehicle {
  return {
    ...createTrafficVehicle({
      id: 7,
      kind: 'patrol',
      laneIndex: 2,
      distanceMeters,
      speedMetersPerSecond: 28,
    }),
    lateralMeters,
  };
}

function encounter(
  phase: PatrolEncounterPhase,
  overrides: Partial<Record<string, unknown>> = {}
): PatrolEncounter {
  return {
    id: 'stage-1-speed-trap',
    source: 'speed-trap',
    cruiserId: 7,
    windowStartDistanceMeters: 700,
    windowEndDistanceMeters: 950,
    requiredAvoids: 2,
    recordedAvoids: 0,
    leadDwellSeconds: 0,
    hasEngaged: true,
    phase,
    phaseSecondsRemaining: 1,
    chosenSide: 'left',
    triggerDistanceMeters: 700,
    resolution: 'window-exit',
    reason: 'window-exit',
    ...overrides,
  } as PatrolEncounter;
}

test('surroundings measure the cruiser gap in route space', () => {
  const observed = observePatrolSurroundings({
    road: ROAD,
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 0 },
    cruiser: cruiserAt(770, 0),
    traffic: [],
  });

  assert.equal(observed.patrolGapMeters, 30);
});

test('clearance comes from the road bounds when no traffic is alongside', () => {
  const observed = observePatrolSurroundings({
    road: ROAD,
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
    cruiser: cruiserAt(790, 1.85),
    traffic: [],
  });

  assert.ok(Math.abs(observed.leftClearanceMeters - (1.85 + 9.9)) < 1e-9);
  assert.ok(Math.abs(observed.rightClearanceMeters - (9.9 - 1.85)) < 1e-9);
});

test('the authored apron widens right-side clearance only inside the pullout', () => {
  const inside = observePatrolSurroundings({
    road: ROAD,
    truckRoutePosition: { distanceAlongRouteMeters: 700, lateralOffsetMeters: 0 },
    cruiser: cruiserAt(690, 0),
    traffic: [],
  });
  const outside = observePatrolSurroundings({
    road: ROAD,
    truckRoutePosition: { distanceAlongRouteMeters: 900, lateralOffsetMeters: 0 },
    cruiser: cruiserAt(890, 0),
    traffic: [],
  });

  assert.ok(Math.abs(inside.rightClearanceMeters - 13.5) < 1e-9);
  assert.ok(Math.abs(outside.rightClearanceMeters - 9.9) < 1e-9);
  assert.equal(inside.leftClearanceMeters, outside.leftClearanceMeters);
});

test('a commuter in the attack corridor closes that side and leaves the other open', () => {
  const blocker: TrafficVehicle = {
    ...createTrafficVehicle({
      id: 3,
      kind: 'commuter',
      laneIndex: 3,
      distanceMeters: 802,
      speedMetersPerSecond: 25,
    }),
    lateralMeters: 3.5,
  };
  const observed = observePatrolSurroundings({
    road: ROAD,
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 0 },
    cruiser: cruiserAt(790, 0),
    traffic: [blocker],
  });

  assert.ok(observed.rightClearanceMeters < 3.5);
  assert.ok(observed.leftClearanceMeters > 9);
});

test('traffic far ahead or behind does not close an attack corridor', () => {
  const distant: TrafficVehicle = {
    ...createTrafficVehicle({
      id: 4,
      kind: 'commuter',
      laneIndex: 3,
      distanceMeters: 900,
      speedMetersPerSecond: 25,
    }),
    lateralMeters: 3.5,
  };
  const observed = observePatrolSurroundings({
    road: ROAD,
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 0 },
    cruiser: cruiserAt(790, 0),
    traffic: [distant],
  });

  assert.ok(observed.rightClearanceMeters > 9);
});

test('a posted or resolved encounter issues no motion command', () => {
  for (const phase of ['posted', 'resolved'] as const) {
    assert.equal(
      buildPatrolCommand({
        encounter: encounter(phase),
        cruiser: cruiserAt(700, 10.4),
        road: ROAD,
        truck: truck(),
        truckRoutePosition: { distanceAlongRouteMeters: 700, lateralOffsetMeters: 0 },
      }),
      null
    );
  }
});

test('a pulling-out cruiser leaves the apron for the nearest travel lane', () => {
  const command = buildPatrolCommand({
    encounter: encounter('pulling-out', { cruiserId: 99 }),
    cruiser: cruiserAt(700, 10.4),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 720, lateralOffsetMeters: 0 },
  });

  assert.equal(command?.vehicleId, 7, 'the command follows the observed traffic cruiser identity');
  assert.ok((command?.targetLateralMeters ?? 99) <= ROAD.rightRoadEdgeMeters);
  assert.ok((command?.targetSpeedMetersPerSecond ?? 0) > 0);
  assert.equal(command?.targetHeadingOffsetRadians, 0);
});

test('the off-screen handoff stages a speed-matched cruiser just behind the rear view', () => {
  const cruiser = cruiserAt(840, 7.1);
  const pose = buildPatrolStagingPose({
    truckSpeedMetersPerSecond: 40,
    truckRouteDistanceMeters: 900,
    cruiser,
    traffic: [cruiser],
  });

  assert.equal(pose.distanceMeters, 900 - DEFAULT_PATROL_PURSUIT_TUNING.stagingGapMeters);
  assert.ok(pose.speedMetersPerSecond >= 40);
  assert.ok(
    pose.speedMetersPerSecond <= DEFAULT_PATROL_PURSUIT_TUNING.approachSpeedMetersPerSecond
  );
});

test('the off-screen handoff moves farther back rather than overlapping traffic', () => {
  const cruiser = cruiserAt(840, 7.1);
  const blockedDistanceMeters = 900 - DEFAULT_PATROL_PURSUIT_TUNING.stagingGapMeters;
  const blocker: TrafficVehicle = {
    ...createTrafficVehicle({
      id: 8,
      kind: 'commuter',
      laneIndex: 3,
      distanceMeters: blockedDistanceMeters,
      speedMetersPerSecond: 20,
    }),
    lateralMeters: 5.55,
  };
  const pose = buildPatrolStagingPose({
    truckSpeedMetersPerSecond: 40,
    truckRouteDistanceMeters: 900,
    cruiser,
    traffic: [cruiser, blocker],
  });

  assert.equal(
    pose.distanceMeters,
    blockedDistanceMeters - DEFAULT_PATROL_PURSUIT_TUNING.stagingSearchStepMeters
  );
});

test('the off-screen handoff fails loudly when every bounded staging pose is occupied', () => {
  const cruiser = cruiserAt(840, 7.1);
  const blockers = Array.from(
    { length: DEFAULT_PATROL_PURSUIT_TUNING.stagingSearchAttempts },
    (_, index): TrafficVehicle => ({
      ...createTrafficVehicle({
        id: 20 + index,
        kind: 'commuter',
        laneIndex: 3,
        distanceMeters:
          900 -
          DEFAULT_PATROL_PURSUIT_TUNING.stagingGapMeters -
          index * DEFAULT_PATROL_PURSUIT_TUNING.stagingSearchStepMeters,
        speedMetersPerSecond: 20,
      }),
      lateralMeters: 5.55,
    })
  );

  assert.throws(
    () =>
      buildPatrolStagingPose({
        truckSpeedMetersPerSecond: 40,
        truckRouteDistanceMeters: 900,
        cruiser,
        traffic: [cruiser, ...blockers],
      }),
    /no clear patrol staging pose/
  );
});

test('a closing cruiser chases faster than the truck but under its own top speed', () => {
  const command = buildPatrolCommand({
    encounter: encounter('closing'),
    cruiser: cruiserAt(760, 0),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });

  assert.ok((command?.targetSpeedMetersPerSecond ?? 0) > TRUCK_SPEED);
  assert.ok(
    (command?.targetSpeedMetersPerSecond ?? 0) <=
      DEFAULT_PATROL_PURSUIT_TUNING.maximumSpeedMetersPerSecond
  );
  assert.ok(
    DEFAULT_PATROL_PURSUIT_TUNING.maximumSpeedMetersPerSecond < 40,
    'a cruiser must stay slower than a truck at full speed'
  );
});

test('a flanking cruiser without a committed side falls back instead of attaching to the trailer', () => {
  const cruiser = cruiserAt(790, 2.5);
  const command = buildPatrolCommand({
    encounter: encounter('flanking'),
    cruiser,
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });

  assert.equal(
    command?.targetLateralMeters,
    cruiser.lateralMeters,
    'waiting for a viable side must not steer into the trailer centerline'
  );
  assert.ok(
    (command?.targetSpeedMetersPerSecond ?? Number.POSITIVE_INFINITY) < TRUCK_SPEED,
    'waiting for a viable side must open a gap for another attempt'
  );
});

test('a telegraphing cruiser moves to the locked side before it can strike', () => {
  const left = buildPatrolCommand({
    encounter: encounter('telegraphing', { chosenSide: 'left' }),
    cruiser: cruiserAt(795, 1.85),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });
  const right = buildPatrolCommand({
    encounter: encounter('telegraphing', { chosenSide: 'right' }),
    cruiser: cruiserAt(795, 1.85),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });

  assert.ok((left?.targetLateralMeters ?? 0) < 1.85);
  assert.ok((right?.targetLateralMeters ?? 0) > 1.85);
  assert.equal(
    left?.lateralRateMetersPerSecond,
    DEFAULT_PATROL_PURSUIT_TUNING.lateralRateMetersPerSecond
  );
});

test('a sideswiping cruiser lunges into the truck line faster than it set up', () => {
  const command = buildPatrolCommand({
    encounter: encounter('sideswiping', { chosenSide: 'left' }),
    cruiser: cruiserAt(798, -1.5),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });

  assert.equal(command?.targetLateralMeters, 1.85);
  assert.ok(
    (command?.lateralRateMetersPerSecond ?? 0) >
      DEFAULT_PATROL_PURSUIT_TUNING.lateralRateMetersPerSecond
  );
});

test('recovering and disengaging cruisers fall behind instead of pressing', () => {
  const recovering = buildPatrolCommand({
    encounter: encounter('recovering'),
    cruiser: cruiserAt(798, 1.85),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });
  const disengaging = buildPatrolCommand({
    encounter: encounter('disengaging'),
    cruiser: cruiserAt(798, 1.85),
    road: ROAD,
    truck: truck(),
    truckRoutePosition: { distanceAlongRouteMeters: 800, lateralOffsetMeters: 1.85 },
  });

  assert.ok((recovering?.targetSpeedMetersPerSecond ?? 99) < TRUCK_SPEED);
  assert.ok(
    (disengaging?.targetSpeedMetersPerSecond ?? 99) < (recovering?.targetSpeedMetersPerSecond ?? 0)
  );
});

test('a committed hit costs exactly the tuned speed, cargo, and stability', () => {
  const before = truck({ yawRateRadiansPerSecond: 0 });
  const hit = applyPatrolHit(before, 'left', DEFAULT_PATROL_PURSUIT_TUNING);

  assert.equal(
    hit.speedMetersPerSecond,
    TRUCK_SPEED - DEFAULT_PATROL_PURSUIT_TUNING.hitSpeedLossMetersPerSecond
  );
  assert.equal(hit.cargoIntegrity, 1 - DEFAULT_PATROL_PURSUIT_TUNING.hitCargoDamage);
  assert.ok(DEFAULT_PATROL_PURSUIT_TUNING.hitCargoDamage < 0.06);
  assert.equal(hit.status, 'driving', 'a hit must not assign a truck status directly');
  assert.equal(hit.trailerHeadingRadians, before.trailerHeadingRadians);
  assert.ok(hit.yawRateRadiansPerSecond > 0, 'a hit from the left must push the truck right');
  assert.ok(hit.position.xMeters > before.position.xMeters);

  const fromRight = applyPatrolHit(before, 'right', DEFAULT_PATROL_PURSUIT_TUNING);
  assert.ok(fromRight.yawRateRadiansPerSecond < 0);
  assert.ok(fromRight.position.xMeters < before.position.xMeters);
});

test('a hit never drives speed or cargo below zero', () => {
  const crawling = applyPatrolHit(
    truck({ speedMetersPerSecond: 0.2, cargoIntegrity: 0.01 }),
    'right',
    DEFAULT_PATROL_PURSUIT_TUNING
  );

  assert.equal(crawling.speedMetersPerSecond, 0);
  assert.equal(crawling.cargoIntegrity, 0);
});

test('the parked cruiser pose sits inside the authored apron facing across the road', () => {
  const pose = parkedCruiserPose(ROAD, 700, DEFAULT_PATROL_PURSUIT_TUNING);

  assert.equal(pose.distanceMeters, 700);
  assert.ok(pose.lateralMeters > ROAD.rightRoadEdgeMeters);
  assert.ok(pose.lateralMeters < 13.5);
  assert.equal(pose.speedMetersPerSecond, 0);
  assert.ok(Math.abs(Math.abs(pose.headingOffsetRadians) - Math.PI / 2) < 1e-9);
});
