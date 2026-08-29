import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { buildRoadCamera, projectWorldPoint } from '../../src/game/roadCamera.ts';
import { buildRoadCameraTuning } from '../../src/game/roadViewport.ts';
import { createRoute, routeToWorld, sampleRoute } from '../../src/game/route.ts';
import { buildStageOpening, DEFAULT_STAGE_OPENING_TUNING } from '../../src/game/stageOpening.ts';
import { stepTraffic } from '../../src/game/traffic.ts';

const TRUCK_DIMENSIONS = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 5.2,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: -1.1,
};

const ROAD = createRoad(
  DEFAULT_ROAD_TUNING,
  createRoute({
    origin: { xMeters: 40, yMeters: -15 },
    headingRadians: Math.PI / 6,
    segments: [{ kind: 'straight', lengthMeters: 500 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 14, minimumBendRadiusMeters: 100 },
  })
);

test('stage opening starts the rig rolling in a real lane with no launch gulp armed', () => {
  const opening = buildStageOpening({ road: ROAD, trafficSeed: 42 });
  const playerLane = DEFAULT_STAGE_OPENING_TUNING.playerLaneIndex;
  const expectedPosition = routeToWorld(ROAD.route, {
    distanceAlongRouteMeters: 0,
    lateralOffsetMeters: ROAD.laneCenterOffsetsMeters[playerLane]!,
  });
  const expectedHeading = sampleRoute(ROAD.route, 0).headingRadians;

  assert.deepEqual(opening.drivingState.truck.position, expectedPosition);
  assert.equal(opening.drivingState.truck.headingRadians, expectedHeading);
  assert.equal(opening.drivingState.truck.trailerHeadingRadians, expectedHeading);
  assert.equal(
    opening.drivingState.truck.speedMetersPerSecond,
    DEFAULT_STAGE_OPENING_TUNING.truckSpeedMetersPerSecond
  );
  assert.equal(
    opening.drivingState.routePosition.lateralOffsetMeters,
    ROAD.laneCenterOffsetsMeters[playerLane]
  );
  assert.equal(opening.drivingState.fuel.launchGulpArmed, false);
});

test('stage opening seeds a safe visible pass and lead with delayed lane changes', () => {
  const opening = buildStageOpening({ road: ROAD, trafficSeed: 42 });
  const [passing, lead] = opening.trafficState.vehicles;

  assert.ok(passing);
  assert.ok(lead);
  assert.equal(passing.distanceMeters, DEFAULT_STAGE_OPENING_TUNING.passingDistanceMeters);
  assert.equal(lead.distanceMeters, DEFAULT_STAGE_OPENING_TUNING.leadDistanceMeters);
  assert.ok(passing.speedMetersPerSecond > opening.drivingState.truck.speedMetersPerSecond);
  assert.ok(lead.speedMetersPerSecond > opening.drivingState.truck.speedMetersPerSecond);
  assert.notEqual(passing.laneIndex, DEFAULT_STAGE_OPENING_TUNING.playerLaneIndex);
  assert.notEqual(lead.laneIndex, DEFAULT_STAGE_OPENING_TUNING.playerLaneIndex);
  assert.notEqual(passing.laneIndex, lead.laneIndex);
  assert.equal(
    passing.laneChangeCooldownSeconds,
    DEFAULT_STAGE_OPENING_TUNING.openingLaneChangeCooldownSeconds
  );
  assert.equal(
    lead.laneChangeCooldownSeconds,
    DEFAULT_STAGE_OPENING_TUNING.openingLaneChangeCooldownSeconds
  );
  assert.equal(
    opening.trafficState.spawnCountdownSeconds,
    DEFAULT_STAGE_OPENING_TUNING.normalSpawnDelaySeconds
  );

  for (const vehicle of opening.trafficState.vehicles) {
    const expectedPosition = routeToWorld(ROAD.route, {
      distanceAlongRouteMeters: vehicle.distanceMeters,
      lateralOffsetMeters: ROAD.laneCenterOffsetsMeters[vehicle.laneIndex]!,
    });
    assert.deepEqual(vehicle.worldPosition, expectedPosition);
    assert.equal(
      vehicle.headingRadians,
      sampleRoute(ROAD.route, vehicle.distanceMeters).headingRadians
    );
  }

  const viewport = { width: 384, height: 450 };
  const camera = buildRoadCamera(
    opening.drivingState.truck.position,
    viewport,
    buildRoadCameraTuning(ROAD, viewport, {
      speedMetersPerSecond: opening.drivingState.truck.speedMetersPerSecond,
      maximumSpeedMetersPerSecond: 40,
      truckDimensions: TRUCK_DIMENSIONS,
    }),
    opening.drivingState.truck.headingRadians
  );
  for (const vehicle of opening.trafficState.vehicles) {
    const screen = projectWorldPoint(camera, vehicle.worldPosition);
    assert.ok(screen.x >= 0 && screen.x <= viewport.width, `traffic ${vehicle.id} must be visible`);
    assert.ok(
      screen.y >= 0 && screen.y <= viewport.height,
      `traffic ${vehicle.id} must be visible`
    );
  }

  const collisionCheck = stepTraffic({
    state: opening.trafficState,
    truck: opening.drivingState.truck,
    truckRoutePosition: opening.drivingState.routePosition,
    road: ROAD,
    truckDimensions: TRUCK_DIMENSIONS,
    dtSeconds: 0,
  });
  assert.deepEqual(collisionCheck.truck, opening.drivingState.truck);
  assert.deepEqual(collisionCheck.state.vehicles, opening.trafficState.vehicles);
});

test('stage opening is deterministic for a traffic seed and respects carried resources', () => {
  const first = buildStageOpening({
    road: ROAD,
    trafficSeed: 0x1234,
    initialCargoIntegrity: 0.65,
    initialFuelLevel: 0.4,
  });
  const second = buildStageOpening({
    road: ROAD,
    trafficSeed: 0x1234,
    initialCargoIntegrity: 0.65,
    initialFuelLevel: 0.4,
  });

  assert.deepEqual(first, second);
  assert.equal(first.drivingState.truck.cargoIntegrity, 0.65);
  assert.equal(first.drivingState.fuel.level, 0.4);
  assert.equal(first.trafficState.rngState, 0x1234);
});

test('an empty tank does not receive free rolling momentum', () => {
  const opening = buildStageOpening({ road: ROAD, initialFuelLevel: 0 });

  assert.equal(opening.drivingState.truck.speedMetersPerSecond, 0);
  assert.equal(opening.drivingState.fuel.launchGulpArmed, true);
});

test('stage opening rejects unsafe or internally contradictory tuning', () => {
  assert.throws(
    () =>
      buildStageOpening({
        road: ROAD,
        tuning: {
          ...DEFAULT_STAGE_OPENING_TUNING,
          leadLaneIndex: DEFAULT_STAGE_OPENING_TUNING.playerLaneIndex,
        },
      }),
    /distinct lanes/
  );
  assert.throws(
    () =>
      buildStageOpening({
        road: ROAD,
        tuning: { ...DEFAULT_STAGE_OPENING_TUNING, passingDistanceMeters: 1 },
      }),
    /beside or behind/
  );
  assert.throws(
    () =>
      buildStageOpening({
        road: ROAD,
        tuning: {
          ...DEFAULT_STAGE_OPENING_TUNING,
          leadSpeedMetersPerSecond: DEFAULT_STAGE_OPENING_TUNING.truckSpeedMetersPerSecond,
        },
      }),
    /must pull away/
  );
});
