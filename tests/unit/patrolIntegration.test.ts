import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFuelState } from '../../src/game/fuel.ts';
import { stepDriving, type DrivingState } from '../../src/game/drivingUpdate.ts';
import {
  createDefaultStageRoute,
  createRoad,
  DEFAULT_ROAD_TUNING,
  STAGE_1_PATROL_ENCOUNTERS,
  STAGE_1_ROAD_PULLOUTS,
} from '../../src/game/road.ts';
import { routeToWorld, sampleRoute } from '../../src/game/route.ts';
import {
  addPatrolCruiser,
  createTrafficState,
  DEFAULT_TRAFFIC_TUNING,
  removeTrafficVehicle,
  stagePatrolCruiser,
  stepTraffic,
  type PatrolVehicleCommand,
  type TrafficState,
  type TrafficVehicle,
} from '../../src/game/traffic.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';
import { buildRoadCameraTuning, measureRoadViewport } from '../../src/game/roadViewport.ts';
import {
  DEFAULT_PATROL_ENCOUNTER_TUNING,
  createPatrolEncounterState,
  getActivePatrolEncounter,
  stepPatrolEncounter,
  type PatrolEncounterPhase,
  type PatrolEncounterState,
} from '../../src/game/patrolEncounter.ts';
import {
  applyPatrolHit,
  buildPatrolCommand,
  buildPatrolStagingPose,
  DEFAULT_PATROL_PURSUIT_TUNING,
  observePatrolSurroundings,
  parkedCruiserPose,
} from '../../src/game/patrolPursuit.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING, createDefaultStageRoute(), {
  pullouts: STAGE_1_ROAD_PULLOUTS,
});
const TRUCK_DIMENSIONS = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 5.2,
  trailerWidthMeters: DEFAULT_TRUCK_TUNING.trailerWidthMeters,
  trailerLengthMeters: DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters,
  hitchGapMeters: -1.1,
} as const;
const STEP_SECONDS = 1 / 60;
/**
 * How much road the camera actually shows behind the truck, read from the real
 * viewport rather than assumed. A pursuit the player can never see is a pursuit
 * that does not exist, so this is the yardstick the encounter has to beat.
 */
const REAR_VIEW_DEPTH_METERS = (() => {
  const viewport = measureRoadViewport();
  const camera = buildRoadCameraTuning(ROAD, viewport);
  return (viewport.height - camera.anchorY) / camera.pixelsPerMeter;
})();

interface RunResult {
  readonly phases: readonly PatrolEncounterPhase[];
  readonly finalDistanceMeters: number;
  readonly cargoIntegrity: number;
  readonly cruiserCount: number;
  readonly didCruiserEnterTravelLanes: boolean;
  readonly hits: number;
  /** Closest the cruiser ever got while a pursuit was running. */
  readonly minimumPatrolGapMeters: number;
  readonly maximumPostHandoffGapMeters: number;
  readonly didLeaveRearView: boolean;
  readonly reentrySecondsAfterPursuitStarted: number | null;
  readonly closingHandoffs: number;
  /** Greatest physical side separation reached while warning of the first attack. */
  readonly maximumTelegraphLateralSeparationMeters: number;
  /** Largest speed loss caused by traffic before a patrol attack was committed. */
  readonly maximumPreAttackTrafficSpeedLossMetersPerSecond: number;
  readonly maximumPreAttackSpeedLossPhase: PatrolEncounterPhase | null;
  readonly maximumPreAttackSpeedLossGapMeters: number;
  readonly maximumPreAttackSpeedLossLateralSeparationMeters: number;
  readonly firstSideswipeGapMeters: number;
  readonly firstSideswipeLateralSeparationMeters: number;
}

test('patrol approach tuning clears the trailer before same-line contact can pin the cruiser', () => {
  const trailerRearContactGapMeters =
    TRUCK_DIMENSIONS.cabLengthMeters / 2 +
    TRUCK_DIMENSIONS.trailerLengthMeters +
    TRUCK_DIMENSIONS.hitchGapMeters +
    DEFAULT_TRAFFIC_TUNING.patrolLengthMeters / 2;
  const sideBySideClearanceMeters =
    (TRUCK_DIMENSIONS.trailerWidthMeters + DEFAULT_TRAFFIC_TUNING.patrolWidthMeters) / 2;
  const secondsToClearTrailer =
    sideBySideClearanceMeters / DEFAULT_PATROL_PURSUIT_TUNING.lateralRateMetersPerSecond;
  const minimumFlankGapMeters =
    trailerRearContactGapMeters +
    DEFAULT_PATROL_PURSUIT_TUNING.approachSpeedBonusMetersPerSecond * secondsToClearTrailer;

  assert.ok(
    DEFAULT_PATROL_ENCOUNTER_TUNING.flankGapMeters > minimumFlankGapMeters,
    `flanking must start beyond the ${minimumFlankGapMeters.toFixed(2)} m same-line collision bound`
  );
  assert.ok(
    DEFAULT_PATROL_ENCOUNTER_TUNING.telegraphSeconds >=
      DEFAULT_PATROL_PURSUIT_TUNING.telegraphOffsetMeters /
        DEFAULT_PATROL_PURSUIT_TUNING.lateralRateMetersPerSecond,
    'the telegraph must last long enough for a centered responder to reach its side offset'
  );
});

function createDrivingState(
  distanceAlongRouteMeters: number,
  speed: number,
  lateralOffsetMeters = 1.85
): DrivingState {
  const sample = sampleRoute(ROAD.route, distanceAlongRouteMeters);
  return {
    truck: createTruckState({
      position: routeToWorld(ROAD.route, {
        distanceAlongRouteMeters,
        lateralOffsetMeters,
      }),
      headingRadians: sample.headingRadians,
      speedMetersPerSecond: speed,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: sample.headingRadians,
      massKilograms: 36_287,
      cargoIntegrity: 1,
      status: 'driving',
    }),
    routePosition: { distanceAlongRouteMeters, lateralOffsetMeters },
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

/** Drive the Stage 1 patrol band the way roadGame composes these modules. */
function runPatrolBand(
  startSpeedMetersPerSecond: number,
  seconds: number,
  options: {
    readonly throttle?: number;
    readonly lateralOffsetMeters?: number;
    readonly roadRageResponse?: boolean;
  } = {}
): RunResult {
  let driving = createDrivingState(660, startSpeedMetersPerSecond, options.lateralOffsetMeters);
  let traffic: TrafficState = createTrafficState({ seed: 11, spawnCountdownSeconds: 999 });
  let patrol: PatrolEncounterState = options.roadRageResponse
    ? {
        encounters: [],
        pendingResponse: { secondsRemaining: STEP_SECONDS },
        nextCruiserId: 1,
      }
    : createPatrolEncounterState({ definitions: STAGE_1_PATROL_ENCOUNTERS });
  let command: PatrolVehicleCommand | null = null;
  const cruiserIds = new Map<string, number>();
  const releasedCruiserIds = new Set<number>();
  const phases: PatrolEncounterPhase[] = [];
  let hits = 0;
  let minimumPatrolGapMeters = Number.POSITIVE_INFINITY;
  let maximumPostHandoffGapMeters = Number.NEGATIVE_INFINITY;
  let pursuitStartedTick: number | null = null;
  let didLeaveRearView = false;
  let reentryTick: number | null = null;
  let closingHandoffs = 0;
  let didCruiserEnterTravelLanes = false;
  let maximumTelegraphLateralSeparationMeters = 0;
  let maximumPreAttackTrafficSpeedLossMetersPerSecond = 0;
  let maximumPreAttackSpeedLossPhase: PatrolEncounterPhase | null = null;
  let maximumPreAttackSpeedLossGapMeters = Number.NaN;
  let maximumPreAttackSpeedLossLateralSeparationMeters = Number.NaN;
  let hasEnteredSideswiping = false;
  let firstSideswipeGapMeters = Number.NaN;
  let firstSideswipeLateralSeparationMeters = Number.NaN;

  for (const encounter of patrol.encounters) {
    if (encounter.phase !== 'posted') continue;
    const pose = parkedCruiserPose(ROAD, encounter.triggerDistanceMeters);
    const added = addPatrolCruiser(traffic, {
      distanceMeters: pose.distanceMeters,
      lateralMeters: pose.lateralMeters,
      speedMetersPerSecond: pose.speedMetersPerSecond,
      headingOffsetRadians: pose.headingOffsetRadians,
      road: ROAD,
    });
    traffic = added.state;
    cruiserIds.set(encounter.id, added.vehicleId);
  }

  const cruiserFor = (encounterId: string | undefined): TrafficVehicle | null => {
    if (encounterId === undefined) return null;
    const vehicleId = cruiserIds.get(encounterId);
    if (vehicleId === undefined) return null;
    return traffic.vehicles.find(vehicle => vehicle.id === vehicleId) ?? null;
  };

  for (let tick = 0; tick < Math.round(seconds / STEP_SECONDS); tick++) {
    const previousRouteDistanceMeters = driving.routePosition.distanceAlongRouteMeters;
    driving = stepDriving({
      state: driving,
      controls: { throttle: options.throttle ?? 1, brake: 0, steering: 0 },
      dtSeconds: STEP_SECONDS,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
    }).state;
    const speedBeforeTrafficMetersPerSecond = driving.truck.speedMetersPerSecond;

    const trafficResult = stepTraffic({
      state: traffic,
      truck: driving.truck,
      truckRoutePosition: driving.routePosition,
      road: ROAD,
      truckDimensions: TRUCK_DIMENSIONS,
      dtSeconds: STEP_SECONDS,
      ...(command === null ? {} : { patrolCommand: command }),
    });
    traffic = trafficResult.state;
    driving = { ...driving, truck: trafficResult.truck };

    const activeBefore = getActivePatrolEncounter(patrol);
    const cruiser = cruiserFor(activeBefore?.id);
    if (activeBefore?.phase === 'sideswiping' && !hasEnteredSideswiping) {
      hasEnteredSideswiping = true;
      firstSideswipeGapMeters =
        cruiser === null
          ? Number.NaN
          : driving.routePosition.distanceAlongRouteMeters - cruiser.distanceMeters;
      firstSideswipeLateralSeparationMeters =
        cruiser === null
          ? Number.NaN
          : Math.abs(cruiser.lateralMeters - driving.routePosition.lateralOffsetMeters);
    }
    const preAttackSpeedLossMetersPerSecond =
      speedBeforeTrafficMetersPerSecond - driving.truck.speedMetersPerSecond;
    if (
      !hasEnteredSideswiping &&
      preAttackSpeedLossMetersPerSecond > maximumPreAttackTrafficSpeedLossMetersPerSecond
    ) {
      maximumPreAttackTrafficSpeedLossMetersPerSecond = preAttackSpeedLossMetersPerSecond;
      maximumPreAttackSpeedLossPhase = activeBefore?.phase ?? null;
      maximumPreAttackSpeedLossGapMeters =
        cruiser === null
          ? Number.NaN
          : driving.routePosition.distanceAlongRouteMeters - cruiser.distanceMeters;
      maximumPreAttackSpeedLossLateralSeparationMeters =
        cruiser === null
          ? Number.NaN
          : Math.abs(cruiser.lateralMeters - driving.routePosition.lateralOffsetMeters);
    }
    const surroundings = observePatrolSurroundings({
      road: ROAD,
      truckRoutePosition: driving.routePosition,
      cruiser,
      traffic: traffic.vehicles,
    });
    if (cruiser !== null) {
      if (activeBefore?.phase === 'telegraphing') {
        maximumTelegraphLateralSeparationMeters = Math.max(
          maximumTelegraphLateralSeparationMeters,
          Math.abs(cruiser.lateralMeters - driving.routePosition.lateralOffsetMeters)
        );
      }
      if (Math.abs(cruiser.lateralMeters) <= ROAD.rightRoadEdgeMeters) {
        didCruiserEnterTravelLanes = true;
      }
      minimumPatrolGapMeters = Math.min(minimumPatrolGapMeters, surroundings.patrolGapMeters);
      if (closingHandoffs > 0 && reentryTick === null) {
        maximumPostHandoffGapMeters = Math.max(
          maximumPostHandoffGapMeters,
          surroundings.patrolGapMeters
        );
      }
      if (surroundings.patrolGapMeters > REAR_VIEW_DEPTH_METERS) didLeaveRearView = true;
      if (
        didLeaveRearView &&
        reentryTick === null &&
        surroundings.patrolGapMeters <= REAR_VIEW_DEPTH_METERS
      ) {
        reentryTick = tick;
      }
    }
    const patrolResult = stepPatrolEncounter({
      state: patrol,
      frame: {
        dtSeconds: STEP_SECONDS,
        previousRouteDistanceMeters,
        routeDistanceMeters: driving.routePosition.distanceAlongRouteMeters,
        speedMetersPerSecond: driving.truck.speedMetersPerSecond,
        maximumSpeedMetersPerSecond: DEFAULT_TRUCK_TUNING.maxForwardSpeedMetersPerSecond,
        patrolGapMeters: surroundings.patrolGapMeters,
        leftClearanceMeters: surroundings.leftClearanceMeters,
        rightClearanceMeters: surroundings.rightClearanceMeters,
        hasPatrolContact:
          cruiser !== null &&
          trafficResult.events.some(
            event => event.kind === 'patrol-contact' && event.vehicleId === cruiser.id
          ),
        roadRageIncidents: trafficResult.events.filter(event => event.kind === 'road-rage').length,
        isTerminal: false,
      },
    });
    patrol = patrolResult.state;

    for (const event of patrolResult.events) {
      if (event.kind === 'pursuit-started') {
        pursuitStartedTick = tick;
        if (!cruiserIds.has(event.encounterId)) {
          const added = addPatrolCruiser(traffic, {
            distanceMeters:
              driving.routePosition.distanceAlongRouteMeters -
              DEFAULT_PATROL_PURSUIT_TUNING.responseSpawnGapMeters,
            lateralMeters: driving.routePosition.lateralOffsetMeters,
            speedMetersPerSecond: driving.truck.speedMetersPerSecond,
            road: ROAD,
          });
          traffic = added.state;
          cruiserIds.set(event.encounterId, added.vehicleId);
        }
      }
      if (event.kind === 'closing-started') {
        const vehicleId = cruiserIds.get(event.encounterId);
        assert.notEqual(vehicleId, undefined);
        const pose = buildPatrolStagingPose({
          truckSpeedMetersPerSecond: driving.truck.speedMetersPerSecond,
          truckRouteDistanceMeters: driving.routePosition.distanceAlongRouteMeters,
          cruiser: cruiser!,
          traffic: traffic.vehicles,
        });
        traffic = stagePatrolCruiser(traffic, vehicleId!, { ...pose, road: ROAD });
        closingHandoffs += 1;
      }
      if (event.kind === 'attack-hit') {
        hits += 1;
        driving = {
          ...driving,
          truck: applyPatrolHit(driving.truck, event.side, DEFAULT_PATROL_PURSUIT_TUNING),
        };
      }
      if (event.kind === 'resolved' || event.kind === 'trap-resolved') {
        const vehicleId = cruiserIds.get(event.encounterId);
        if (vehicleId !== undefined) {
          releasedCruiserIds.add(vehicleId);
          cruiserIds.delete(event.encounterId);
        }
      }
    }

    for (const vehicleId of releasedCruiserIds) {
      const released = traffic.vehicles.find(vehicle => vehicle.id === vehicleId);
      if (
        released === undefined ||
        driving.routePosition.distanceAlongRouteMeters - released.distanceMeters > 60
      ) {
        traffic = removeTrafficVehicle(traffic, vehicleId);
        releasedCruiserIds.delete(vehicleId);
      }
    }

    const active = getActivePatrolEncounter(patrol);
    if (active !== null && phases.at(-1) !== active.phase) phases.push(active.phase);
    const activeCruiser = cruiserFor(active?.id);
    command =
      active === null || activeCruiser === null
        ? null
        : buildPatrolCommand({
            encounter: active,
            cruiser: activeCruiser,
            road: ROAD,
            truck: driving.truck,
            truckRoutePosition: driving.routePosition,
          });
  }

  return {
    phases,
    finalDistanceMeters: driving.routePosition.distanceAlongRouteMeters,
    cargoIntegrity: driving.truck.cargoIntegrity,
    cruiserCount: traffic.vehicles.filter(vehicle => vehicle.kind === 'patrol').length,
    didCruiserEnterTravelLanes,
    hits,
    minimumPatrolGapMeters,
    maximumPostHandoffGapMeters,
    didLeaveRearView,
    reentrySecondsAfterPursuitStarted:
      pursuitStartedTick === null || reentryTick === null
        ? null
        : (reentryTick - pursuitStartedTick) * STEP_SECONDS,
    closingHandoffs,
    maximumTelegraphLateralSeparationMeters,
    maximumPreAttackTrafficSpeedLossMetersPerSecond,
    maximumPreAttackSpeedLossPhase,
    maximumPreAttackSpeedLossGapMeters,
    maximumPreAttackSpeedLossLateralSeparationMeters,
    firstSideswipeGapMeters,
    firstSideswipeLateralSeparationMeters,
  };
}

test('speeding past the Stage 1 trap starts a pursuit that leaves the apron and closes', () => {
  const run = runPatrolBand(34, 6);

  assert.equal(run.phases[0], 'pulling-out');
  assert.ok(run.phases.includes('closing'), `expected a closing phase, got ${run.phases}`);
  assert.equal(run.cruiserCount, 1);
  assert.ok(run.didCruiserEnterTravelLanes, 'the cruiser must join the travel lanes to give chase');
});

test('a cruiser catching a near-threshold truck gets alongside for a committed attack', () => {
  // Match the production start line: the truck begins centered between the
  // middle lanes and cruise control holds it near the 30 m/s trap threshold.
  const run = runPatrolBand(30, 20, { throttle: 0.25, lateralOffsetMeters: 0 });

  assert.ok(
    run.phases.includes('telegraphing'),
    `the cruiser must move alongside to telegraph, got ${run.phases}`
  );
  assert.ok(
    run.phases.includes('sideswiping'),
    `the cruiser must commit a sideswipe instead of pushing the trailer, got ${run.phases}`
  );
  const minimumSideBySideSeparationMeters =
    (DEFAULT_TRAFFIC_TUNING.patrolWidthMeters + TRUCK_DIMENSIONS.trailerWidthMeters) / 2;
  assert.ok(
    run.maximumTelegraphLateralSeparationMeters >= minimumSideBySideSeparationMeters,
    `the cruiser must clear the trailer before attacking: needed ${minimumSideBySideSeparationMeters} m, ` +
      `got ${run.maximumTelegraphLateralSeparationMeters} m`
  );
  const trailerFrontGapMeters =
    TRUCK_DIMENSIONS.cabLengthMeters / 2 + TRUCK_DIMENSIONS.hitchGapMeters;
  const trailerRearGapMeters = trailerFrontGapMeters + TRUCK_DIMENSIONS.trailerLengthMeters;
  const cruiserHalfLengthMeters = DEFAULT_TRAFFIC_TUNING.patrolLengthMeters / 2;
  const longitudinalOverlapMeters =
    Math.min(trailerRearGapMeters, run.firstSideswipeGapMeters + cruiserHalfLengthMeters) -
    Math.max(trailerFrontGapMeters, run.firstSideswipeGapMeters - cruiserHalfLengthMeters);
  assert.ok(
    longitudinalOverlapMeters >= DEFAULT_TRAFFIC_TUNING.patrolLengthMeters / 2,
    `at least half the cruiser must be alongside the trailer before attacking, got ` +
      `${longitudinalOverlapMeters} m overlap at gap ${run.firstSideswipeGapMeters} m`
  );
  assert.ok(
    run.maximumPreAttackTrafficSpeedLossMetersPerSecond <= Number.EPSILON,
    'closing, flanking, and telegraphing must not drain truck speed through rear contact: ' +
      `${run.maximumPreAttackTrafficSpeedLossMetersPerSecond} m/s in ` +
      `${run.maximumPreAttackSpeedLossPhase} at gap ${run.maximumPreAttackSpeedLossGapMeters} m ` +
      `and lateral separation ${run.maximumPreAttackSpeedLossLateralSeparationMeters} m`
  );
});

test('a same-line Road Rage responder flanks instead of pinning the trailer', () => {
  const run = runPatrolBand(30, 20, {
    throttle: 0.25,
    lateralOffsetMeters: 0,
    roadRageResponse: true,
  });

  assert.deepEqual(run.phases.slice(0, 4), ['closing', 'flanking', 'telegraphing', 'sideswiping']);
  assert.ok(
    run.firstSideswipeLateralSeparationMeters >=
      (DEFAULT_TRAFFIC_TUNING.patrolWidthMeters + TRUCK_DIMENSIONS.trailerWidthMeters) / 2,
    `the responder must clear the trailer laterally, got ${run.firstSideswipeLateralSeparationMeters} m`
  );
  assert.ok(
    run.maximumPreAttackTrafficSpeedLossMetersPerSecond <= Number.EPSILON,
    `the responder must not drain speed before its committed attack, got ` +
      `${run.maximumPreAttackTrafficSpeedLossMetersPerSecond} m/s`
  );
});

test('the pursuit ends at the patrol window and takes its cruiser off the road', () => {
  // The window is rebased to wherever the cruiser engages, so the band now runs
  // its authored length past the catch-up rather than past the trigger line.
  const run = runPatrolBand(34, 45);

  assert.ok(run.finalDistanceMeters > 950, 'the truck must clear the patrol band');
  assert.equal(
    run.phases.at(-1),
    'disengaging',
    `expected the pursuit to end by disengaging, got ${run.phases}`
  );
  assert.equal(run.cruiserCount, 0, 'a resolved encounter must release its cruiser');
});

test('a truck already at top speed is still caught before the encounter can resolve', () => {
  // The regression: a cruiser leaving a standstill could never reach a truck at
  // its maximum, so the pursuit used to resolve at a lead the player never saw.
  const run = runPatrolBand(DEFAULT_TRUCK_TUNING.maxForwardSpeedMetersPerSecond, 45);

  assert.ok(
    run.minimumPatrolGapMeters <= DEFAULT_PATROL_ENCOUNTER_TUNING.flankGapMeters,
    `the cruiser must reach attack range, got ${run.minimumPatrolGapMeters} m`
  );
  assert.ok(
    run.minimumPatrolGapMeters <= REAR_VIEW_DEPTH_METERS,
    `the cruiser must come inside the rear view, got ${run.minimumPatrolGapMeters} m`
  );
  assert.ok(run.phases.includes('sideswiping'), `the cruiser must get a swing, got ${run.phases}`);
  assert.equal(run.didLeaveRearView, true, 'the handoff must occur outside the visible camera');
  assert.equal(run.closingHandoffs, 1, 'the pursuit gets exactly one off-screen handoff');
  assert.ok(
    (run.reentrySecondsAfterPursuitStarted ?? Number.POSITIVE_INFINITY) <= 3,
    `the cruiser must re-enter within 3 seconds, got ${run.reentrySecondsAfterPursuitStarted}`
  );
  assert.ok(
    run.maximumPostHandoffGapMeters <= DEFAULT_PATROL_PURSUIT_TUNING.stagingGapMeters + 1,
    `the cruiser must not fall deeply off-screen after staging, got ${run.maximumPostHandoffGapMeters} m`
  );
  // Holding the maximum is still a legitimate escape — but it is now earned in
  // front of the player rather than granted by the cruiser's standing start.
  assert.equal(
    run.phases.at(-1),
    'disengaging',
    `expected an escape after engagement, got ${run.phases}`
  );
  assert.equal(run.hits, 0);
});

test('a slow pass through the same trap is never pursued and clears the parked cruiser', () => {
  const run = runPatrolBand(20, 8);

  assert.deepEqual(run.phases, []);
  assert.equal(run.hits, 0);
  assert.equal(run.cruiserCount, 0, 'a resolved trap must not leave a cruiser parked forever');
});
