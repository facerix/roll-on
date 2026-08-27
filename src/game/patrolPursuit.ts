import { getBarrierLateralMeters, type Road } from '/src/game/road.js';
import type { PatrolAttackSide, PatrolEncounter } from '/src/game/patrolEncounter.js';
import type { RoutePosition } from '/src/game/route.js';
import {
  DEFAULT_TRAFFIC_TUNING,
  type PatrolVehicleCommand,
  type TrafficTuning,
  type TrafficVehicle,
} from '/src/game/traffic.js';
import type { TruckState } from '/src/game/truck.js';
import { headingToUnitVector } from '/src/game/worldGeometry.js';

/**
 * The bridge between the pure patrol encounter model and the driving world. It
 * reads world state into the observations the model expects, turns the model's
 * phase into one traffic motion command, and applies the consequences of a
 * committed hit through ordinary truck fields.
 */
export interface PatrolPursuitTuning {
  /** Cruiser top speed once engaged; deliberately below the truck's maximum. */
  readonly maximumSpeedMetersPerSecond: number;
  readonly closingSpeedBonusMetersPerSecond: number;
  /**
   * Top speed while the cruiser is still closing the approach gap. It sits above
   * the truck's maximum on purpose: a cruiser leaving a standstill can otherwise
   * never reach a truck already at speed, and the encounter would resolve off
   * screen before the player ever saw it. Once engaged, the ordinary maximum
   * returns and out-running the cruiser becomes possible again.
   */
  readonly approachSpeedMetersPerSecond: number;
  readonly approachSpeedBonusMetersPerSecond: number;
  /**
   * Closing bonus earned per metre of remaining gap, in inverse seconds. It
   * decays the bonus to zero as the cruiser arrives, so it settles alongside
   * rather than sailing past.
   */
  readonly closingGainPerSecond: number;
  /** Hidden gap behind the cab used for the one-time pursuit handoff. */
  readonly stagingGapMeters: number;
  /** Extra longitudinal space required around a candidate staging pose. */
  readonly stagingTrafficClearanceMeters: number;
  /** How much farther back each blocked staging candidate moves. */
  readonly stagingSearchStepMeters: number;
  /** Bounded candidate count before a blocked handoff fails loudly. */
  readonly stagingSearchAttempts: number;
  readonly pullOutSpeedMetersPerSecond: number;
  readonly recoverSpeedDeltaMetersPerSecond: number;
  readonly disengageSpeedDeltaMetersPerSecond: number;
  readonly lateralRateMetersPerSecond: number;
  readonly attackLateralRateMetersPerSecond: number;
  readonly headingRateRadiansPerSecond: number;
  /** Lateral stand-off held on the locked side while telegraphing. */
  readonly telegraphOffsetMeters: number;
  /** Route-distance window ahead of and behind the truck that blocks an attack. */
  readonly attackCorridorLengthMeters: number;
  readonly parkedApronInsetMeters: number;
  /** How far behind the truck a Road Rage response arrives. */
  readonly responseSpawnGapMeters: number;
  readonly hitCargoDamage: number;
  readonly hitSpeedLossMetersPerSecond: number;
  readonly hitLateralImpulseMeters: number;
  readonly hitYawImpulseRadiansPerSecond: number;
}

export interface PatrolSurroundings {
  /** Route-distance lead of the truck over the cruiser; negative when passed. */
  readonly patrolGapMeters: number;
  readonly leftClearanceMeters: number;
  readonly rightClearanceMeters: number;
}

export interface ObservePatrolSurroundingsOptions {
  readonly road: Road;
  readonly truckRoutePosition: RoutePosition;
  readonly cruiser: TrafficVehicle | null;
  readonly traffic: readonly TrafficVehicle[];
  readonly tuning?: PatrolPursuitTuning;
  readonly trafficTuning?: TrafficTuning;
}

export interface BuildPatrolCommandOptions {
  readonly encounter: PatrolEncounter;
  readonly cruiser: TrafficVehicle;
  readonly road: Road;
  readonly truck: TruckState;
  readonly truckRoutePosition: RoutePosition;
  readonly tuning?: PatrolPursuitTuning;
}

export interface ParkedCruiserPose {
  readonly distanceMeters: number;
  readonly lateralMeters: number;
  readonly speedMetersPerSecond: number;
  readonly headingOffsetRadians: number;
}

export interface PatrolStagingPose {
  readonly distanceMeters: number;
  readonly speedMetersPerSecond: number;
}

export interface BuildPatrolStagingPoseOptions {
  readonly truckRouteDistanceMeters: number;
  readonly truckSpeedMetersPerSecond: number;
  readonly cruiser: TrafficVehicle;
  readonly traffic: readonly TrafficVehicle[];
  readonly tuning?: PatrolPursuitTuning;
}

export const DEFAULT_PATROL_PURSUIT_TUNING: PatrolPursuitTuning = Object.freeze({
  maximumSpeedMetersPerSecond: 37,
  closingSpeedBonusMetersPerSecond: 6,
  approachSpeedMetersPerSecond: 46,
  approachSpeedBonusMetersPerSecond: 8,
  closingGainPerSecond: 1,
  stagingGapMeters: 24,
  stagingTrafficClearanceMeters: 2,
  stagingSearchStepMeters: 8,
  stagingSearchAttempts: 6,
  pullOutSpeedMetersPerSecond: 18,
  recoverSpeedDeltaMetersPerSecond: 4,
  disengageSpeedDeltaMetersPerSecond: 12,
  lateralRateMetersPerSecond: 2.2,
  attackLateralRateMetersPerSecond: 5,
  headingRateRadiansPerSecond: 2.5,
  telegraphOffsetMeters: 3.2,
  attackCorridorLengthMeters: 14,
  parkedApronInsetMeters: 3,
  responseSpawnGapMeters: 45,
  hitCargoDamage: 0.03,
  hitSpeedLossMetersPerSecond: 1.5,
  hitLateralImpulseMeters: 0.35,
  hitYawImpulseRadiansPerSecond: 0.45,
});

/** Read the observations the encounter model consumes out of the live world. */
export function observePatrolSurroundings(
  options: ObservePatrolSurroundingsOptions
): PatrolSurroundings {
  const tuning = options.tuning ?? DEFAULT_PATROL_PURSUIT_TUNING;
  validateTuning(tuning);
  const trafficTuning = options.trafficTuning ?? DEFAULT_TRAFFIC_TUNING;
  const truckDistanceMeters = options.truckRoutePosition.distanceAlongRouteMeters;
  const truckLateralMeters = options.truckRoutePosition.lateralOffsetMeters;
  assertFinite('truckRoutePosition.distanceAlongRouteMeters', truckDistanceMeters);
  assertFinite('truckRoutePosition.lateralOffsetMeters', truckLateralMeters);

  let leftClearanceMeters = Math.max(
    0,
    truckLateralMeters - getBarrierLateralMeters(options.road, 'left', truckDistanceMeters)
  );
  let rightClearanceMeters = Math.max(
    0,
    getBarrierLateralMeters(options.road, 'right', truckDistanceMeters) - truckLateralMeters
  );

  for (const vehicle of options.traffic) {
    if (options.cruiser !== null && vehicle.id === options.cruiser.id) continue;
    if (
      Math.abs(vehicle.distanceMeters - truckDistanceMeters) > tuning.attackCorridorLengthMeters
    ) {
      continue;
    }
    // Usable room stops at the blocking car's near edge, not its center line.
    const halfWidthMeters =
      (vehicle.kind === 'patrol'
        ? trafficTuning.patrolWidthMeters
        : trafficTuning.commuterWidthMeters) / 2;
    const lateralGapMeters = vehicle.lateralMeters - truckLateralMeters;
    const usableMeters = Math.max(0, Math.abs(lateralGapMeters) - halfWidthMeters);
    if (lateralGapMeters < 0) {
      leftClearanceMeters = Math.min(leftClearanceMeters, usableMeters);
    } else {
      rightClearanceMeters = Math.min(rightClearanceMeters, usableMeters);
    }
  }

  return Object.freeze({
    patrolGapMeters:
      options.cruiser === null ? 0 : truckDistanceMeters - options.cruiser.distanceMeters,
    leftClearanceMeters,
    rightClearanceMeters,
  });
}

/** Turn the encounter's current phase into this step's cruiser motion order. */
export function buildPatrolCommand(
  options: BuildPatrolCommandOptions
): PatrolVehicleCommand | null {
  const tuning = options.tuning ?? DEFAULT_PATROL_PURSUIT_TUNING;
  validateTuning(tuning);
  const encounter = options.encounter;
  if (encounter.phase === 'posted' || encounter.phase === 'resolved') return null;

  const truckSpeedMetersPerSecond = options.truck.speedMetersPerSecond;
  const truckLateralMeters = options.truckRoutePosition.lateralOffsetMeters;
  const truckDistanceMeters = options.truckRoutePosition.distanceAlongRouteMeters;
  /**
   * Chase speed is station-keeping, not a flat sprint: the closing bonus scales
   * with the gap still to be made up, so the cruiser eases onto the truck's
   * speed as it arrives instead of overshooting past the attack corridor. Until
   * it has taken its first swing it runs on the higher approach ceiling, which
   * sits above the truck's maximum — a cruiser leaving a standstill can
   * otherwise never reach a truck already at speed. After that swing the
   * ordinary ceiling returns and out-running it becomes possible again.
   */
  const gapMeters = truckDistanceMeters - options.cruiser.distanceMeters;
  const speedCeilingMetersPerSecond = encounter.hasEngaged
    ? tuning.maximumSpeedMetersPerSecond
    : tuning.approachSpeedMetersPerSecond;
  const bonusCeilingMetersPerSecond = encounter.hasEngaged
    ? tuning.closingSpeedBonusMetersPerSecond
    : tuning.approachSpeedBonusMetersPerSecond;
  const closingBonusMetersPerSecond = Math.max(
    0,
    Math.min(bonusCeilingMetersPerSecond, gapMeters * tuning.closingGainPerSecond)
  );
  const chaseSpeedMetersPerSecond = Math.min(
    speedCeilingMetersPerSecond,
    truckSpeedMetersPerSecond + closingBonusMetersPerSecond
  );
  const command = (
    targetLateralMeters: number,
    lateralRateMetersPerSecond: number,
    targetSpeedMetersPerSecond: number
  ): PatrolVehicleCommand => ({
    vehicleId: options.cruiser.id,
    targetLateralMeters: clampToBarriers(options.road, targetLateralMeters, truckDistanceMeters),
    lateralRateMetersPerSecond,
    targetSpeedMetersPerSecond: Math.max(0, targetSpeedMetersPerSecond),
    targetHeadingOffsetRadians: 0,
    headingRateRadiansPerSecond: tuning.headingRateRadiansPerSecond,
  });

  switch (encounter.phase) {
    case 'pulling-out':
      return command(
        nearestLaneCenterMeters(options.road, options.cruiser.lateralMeters),
        tuning.lateralRateMetersPerSecond,
        tuning.pullOutSpeedMetersPerSecond
      );
    case 'closing':
      return command(
        truckLateralMeters,
        tuning.lateralRateMetersPerSecond,
        chaseSpeedMetersPerSecond
      );
    case 'flanking':
      // The encounter has not found a viable side yet. Preserve the cruiser's
      // current offset and open space behind the trailer while tactical
      // clearance is retried; continuing the closing command here pins the
      // cruiser to the trailer and turns ordinary contact into a speed drain.
      return command(
        options.cruiser.lateralMeters,
        tuning.lateralRateMetersPerSecond,
        truckSpeedMetersPerSecond - tuning.recoverSpeedDeltaMetersPerSecond
      );
    case 'telegraphing':
      return command(
        truckLateralMeters + sideSign(encounter.chosenSide) * tuning.telegraphOffsetMeters,
        tuning.lateralRateMetersPerSecond,
        chaseSpeedMetersPerSecond
      );
    case 'sideswiping':
      return command(
        truckLateralMeters,
        tuning.attackLateralRateMetersPerSecond,
        chaseSpeedMetersPerSecond
      );
    case 'recovering':
      return command(
        truckLateralMeters,
        tuning.lateralRateMetersPerSecond,
        truckSpeedMetersPerSecond - tuning.recoverSpeedDeltaMetersPerSecond
      );
    case 'disengaging':
      return command(
        getBarrierLateralMeters(options.road, 'right', truckDistanceMeters) -
          tuning.parkedApronInsetMeters,
        tuning.lateralRateMetersPerSecond,
        truckSpeedMetersPerSecond - tuning.disengageSpeedDeltaMetersPerSecond
      );
    default:
      throw new RangeError(
        `Unknown patrol phase for motion: ${String((encounter as PatrolEncounter).phase)}`
      );
  }
}

/**
 * Build the one-time off-screen pursuit handoff. Position and velocity move
 * together: relocating a cruiser that is still accelerating from its parked
 * start would only let the truck immediately run away from it again.
 */
export function buildPatrolStagingPose(options: BuildPatrolStagingPoseOptions): PatrolStagingPose {
  const tuning = options.tuning ?? DEFAULT_PATROL_PURSUIT_TUNING;
  validateTuning(tuning);
  assertFinite('truckRouteDistanceMeters', options.truckRouteDistanceMeters);
  assertNonNegative('truckSpeedMetersPerSecond', options.truckSpeedMetersPerSecond);

  for (let index = 0; index < tuning.stagingSearchAttempts; index++) {
    const gapMeters = tuning.stagingGapMeters + index * tuning.stagingSearchStepMeters;
    const distanceMeters = options.truckRouteDistanceMeters - gapMeters;
    if (!isStagingPoseClear(distanceMeters, options.cruiser, options.traffic, tuning)) continue;
    return Object.freeze({
      distanceMeters,
      speedMetersPerSecond: Math.min(
        tuning.approachSpeedMetersPerSecond,
        options.truckSpeedMetersPerSecond + tuning.approachSpeedBonusMetersPerSecond
      ),
    });
  }
  throw new RangeError(`no clear patrol staging pose behind the truck`);
}

/**
 * Apply one committed sideswipe. The truck loses speed and a little cargo and
 * is shoved off its line; any jackknife must still emerge from the ordinary
 * articulation model rather than being assigned here.
 */
export function applyPatrolHit(
  truck: TruckState,
  side: PatrolAttackSide,
  tuning: PatrolPursuitTuning = DEFAULT_PATROL_PURSUIT_TUNING
): TruckState {
  validateTuning(tuning);
  assertSide(side);
  // A hit landing on the left pushes the truck toward its right.
  const pushSign = side === 'left' ? 1 : -1;
  const forward = headingToUnitVector(truck.headingRadians);
  const rightXMeters = forward.yMeters;
  const rightYMeters = -forward.xMeters;

  return {
    ...truck,
    position: {
      xMeters: truck.position.xMeters + pushSign * rightXMeters * tuning.hitLateralImpulseMeters,
      yMeters: truck.position.yMeters + pushSign * rightYMeters * tuning.hitLateralImpulseMeters,
    },
    speedMetersPerSecond: Math.max(
      0,
      truck.speedMetersPerSecond - tuning.hitSpeedLossMetersPerSecond
    ),
    yawRateRadiansPerSecond:
      truck.yawRateRadiansPerSecond + pushSign * tuning.hitYawImpulseRadiansPerSecond,
    cargoIntegrity: Math.max(0, truck.cargoIntegrity - tuning.hitCargoDamage),
  };
}

/** Where a posted cruiser waits: inside the apron, square across the road. */
export function parkedCruiserPose(
  road: Road,
  distanceMeters: number,
  tuning: PatrolPursuitTuning = DEFAULT_PATROL_PURSUIT_TUNING
): ParkedCruiserPose {
  validateTuning(tuning);
  assertFinite('distanceMeters', distanceMeters);
  const apronEdgeMeters = getBarrierLateralMeters(road, 'right', distanceMeters);
  const lateralMeters = apronEdgeMeters - tuning.parkedApronInsetMeters;
  if (lateralMeters <= road.rightRoadEdgeMeters) {
    throw new RangeError(
      `no apron at ${distanceMeters} m can hold a parked cruiser clear of the lanes`
    );
  }

  return Object.freeze({
    distanceMeters,
    lateralMeters,
    speedMetersPerSecond: 0,
    headingOffsetRadians: Math.PI / 2,
  });
}

function nearestLaneCenterMeters(road: Road, lateralMeters: number): number {
  let nearest = road.laneCenterOffsetsMeters[0]!;
  for (const center of road.laneCenterOffsetsMeters) {
    if (Math.abs(center - lateralMeters) < Math.abs(nearest - lateralMeters)) nearest = center;
  }
  return nearest;
}

function clampToBarriers(road: Road, lateralMeters: number, distanceMeters: number): number {
  const leftMeters = getBarrierLateralMeters(road, 'left', distanceMeters);
  const rightMeters = getBarrierLateralMeters(road, 'right', distanceMeters);
  return Math.max(leftMeters, Math.min(rightMeters, lateralMeters));
}

function sideSign(side: PatrolAttackSide): number {
  assertSide(side);
  return side === 'left' ? -1 : 1;
}

function assertSide(side: PatrolAttackSide): void {
  if (side !== 'left' && side !== 'right') {
    throw new TypeError(`Unknown patrol attack side: ${String(side)}`);
  }
}

function validateTuning(tuning: PatrolPursuitTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('PatrolPursuitTuning must be an object');
  }
  assertPositive('maximumSpeedMetersPerSecond', tuning.maximumSpeedMetersPerSecond);
  assertPositive('closingSpeedBonusMetersPerSecond', tuning.closingSpeedBonusMetersPerSecond);
  assertPositive('approachSpeedMetersPerSecond', tuning.approachSpeedMetersPerSecond);
  assertPositive('approachSpeedBonusMetersPerSecond', tuning.approachSpeedBonusMetersPerSecond);
  if (tuning.approachSpeedMetersPerSecond <= tuning.maximumSpeedMetersPerSecond) {
    throw new RangeError('an approaching cruiser must be able to out-run its own engaged ceiling');
  }
  if (tuning.approachSpeedBonusMetersPerSecond <= tuning.closingSpeedBonusMetersPerSecond) {
    throw new RangeError('an approaching cruiser must close faster than an engaged one');
  }
  assertPositive('closingGainPerSecond', tuning.closingGainPerSecond);
  assertPositive('stagingGapMeters', tuning.stagingGapMeters);
  assertNonNegative('stagingTrafficClearanceMeters', tuning.stagingTrafficClearanceMeters);
  assertPositive('stagingSearchStepMeters', tuning.stagingSearchStepMeters);
  if (!Number.isSafeInteger(tuning.stagingSearchAttempts) || tuning.stagingSearchAttempts <= 0) {
    throw new RangeError(
      `stagingSearchAttempts must be a positive safe integer, got ${tuning.stagingSearchAttempts}`
    );
  }
  assertPositive('pullOutSpeedMetersPerSecond', tuning.pullOutSpeedMetersPerSecond);
  assertPositive('recoverSpeedDeltaMetersPerSecond', tuning.recoverSpeedDeltaMetersPerSecond);
  assertPositive('disengageSpeedDeltaMetersPerSecond', tuning.disengageSpeedDeltaMetersPerSecond);
  if (tuning.disengageSpeedDeltaMetersPerSecond <= tuning.recoverSpeedDeltaMetersPerSecond) {
    throw new RangeError('a disengaging cruiser must fall back faster than a recovering one');
  }
  assertPositive('lateralRateMetersPerSecond', tuning.lateralRateMetersPerSecond);
  assertPositive('attackLateralRateMetersPerSecond', tuning.attackLateralRateMetersPerSecond);
  if (tuning.attackLateralRateMetersPerSecond <= tuning.lateralRateMetersPerSecond) {
    throw new RangeError('a committed attack must move faster than its setup');
  }
  assertPositive('headingRateRadiansPerSecond', tuning.headingRateRadiansPerSecond);
  assertPositive('telegraphOffsetMeters', tuning.telegraphOffsetMeters);
  assertPositive('attackCorridorLengthMeters', tuning.attackCorridorLengthMeters);
  assertPositive('parkedApronInsetMeters', tuning.parkedApronInsetMeters);
  assertPositive('responseSpawnGapMeters', tuning.responseSpawnGapMeters);
  assertRange('hitCargoDamage', tuning.hitCargoDamage, 0, 0.06);
  assertNonNegative('hitSpeedLossMetersPerSecond', tuning.hitSpeedLossMetersPerSecond);
  assertNonNegative('hitLateralImpulseMeters', tuning.hitLateralImpulseMeters);
  assertNonNegative('hitYawImpulseRadiansPerSecond', tuning.hitYawImpulseRadiansPerSecond);
}

function isStagingPoseClear(
  distanceMeters: number,
  cruiser: TrafficVehicle,
  traffic: readonly TrafficVehicle[],
  tuning: PatrolPursuitTuning
): boolean {
  const cruiserHalfWidthMeters = DEFAULT_TRAFFIC_TUNING.patrolWidthMeters / 2;
  const cruiserHalfLengthMeters = DEFAULT_TRAFFIC_TUNING.patrolLengthMeters / 2;
  return traffic.every(vehicle => {
    if (vehicle.id === cruiser.id) return true;
    const widthMeters =
      vehicle.kind === 'patrol'
        ? DEFAULT_TRAFFIC_TUNING.patrolWidthMeters
        : DEFAULT_TRAFFIC_TUNING.commuterWidthMeters;
    if (
      Math.abs(vehicle.lateralMeters - cruiser.lateralMeters) >=
      cruiserHalfWidthMeters + widthMeters / 2
    ) {
      return true;
    }
    const lengthMeters =
      vehicle.kind === 'patrol'
        ? DEFAULT_TRAFFIC_TUNING.patrolLengthMeters
        : DEFAULT_TRAFFIC_TUNING.commuterLengthMeters;
    return (
      Math.abs(vehicle.distanceMeters - distanceMeters) >=
      cruiserHalfLengthMeters + lengthMeters / 2 + tuning.stagingTrafficClearanceMeters
    );
  });
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertRange(label: string, value: number, min: number, max: number): void {
  assertFinite(label, value);
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}
