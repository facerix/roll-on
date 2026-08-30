import type { Road } from '/src/game/road.js';
import type { RoutePosition } from '/src/game/route.js';
import {
  DEFAULT_TRAFFIC_TUNING,
  type TrafficState,
  type TrafficVehicle,
} from '/src/game/traffic.js';

/** Recharge and targeting values for the commuter-clearing air horn action. */
export interface HornTuning {
  readonly rechargeSeconds: number;
  readonly rangeAheadMeters: number;
  readonly laneChangeDurationSeconds: number;
  readonly laneChangeClearanceMeters: number;
}

export interface HornState {
  readonly cooldownRemainingSeconds: number;
}

export type HornStatus = 'idle' | 'cooldown' | 'no-target' | 'blocked' | 'cleared';

export interface StepHornOptions {
  readonly state: HornState;
  readonly activate: boolean;
  readonly dtSeconds: number;
  readonly traffic: TrafficState;
  readonly truckRoutePosition: RoutePosition;
  readonly road: Road;
  readonly tuning?: HornTuning;
}

export interface StepHornResult {
  readonly state: HornState;
  readonly traffic: TrafficState;
  readonly status: HornStatus;
  readonly affectedVehicleId: number | null;
}

export const DEFAULT_HORN_TUNING: HornTuning = Object.freeze({
  rechargeSeconds: 3,
  rangeAheadMeters: 35,
  laneChangeDurationSeconds: DEFAULT_TRAFFIC_TUNING.laneChangeDurationSeconds,
  laneChangeClearanceMeters: DEFAULT_TRAFFIC_TUNING.laneChangeClearanceMeters,
});

export function createHornState(): HornState {
  return { cooldownRemainingSeconds: 0 };
}

/**
 * Advance the horn recharge and, on an available activation edge, ask the
 * nearest ordinary commuter in the truck's lane to move aside.
 *
 * Right is preferred because Roll On's Stage 1 road follows US traffic
 * convention. The other adjacent lane is the fallback. A car never enters a
 * gap occupied by driving traffic, and a blocked/no-target press does not
 * spend the charge.
 */
export function stepHorn(options: StepHornOptions): StepHornResult {
  validateOptions(options);
  const tuning = options.tuning ?? DEFAULT_HORN_TUNING;
  validateTuning(tuning);

  const cooldownRemainingSeconds = Math.max(
    0,
    options.state.cooldownRemainingSeconds - options.dtSeconds
  );
  const cooledState = { cooldownRemainingSeconds };
  if (!options.activate) return unchanged(cooledState, options.traffic, 'idle');
  if (cooldownRemainingSeconds > 0) {
    return unchanged(cooledState, options.traffic, 'cooldown');
  }

  const truckLaneIndex = nearestLaneIndex(
    options.road,
    options.truckRoutePosition.lateralOffsetMeters
  );
  const target = nearestEligibleCommuter(
    options.traffic.vehicles,
    truckLaneIndex,
    options.truckRoutePosition.distanceAlongRouteMeters,
    tuning.rangeAheadMeters
  );
  if (target === null) return unchanged(cooledState, options.traffic, 'no-target');

  const targetLaneIndex = [target.laneIndex + 1, target.laneIndex - 1].find(
    laneIndex =>
      laneIndex >= 0 &&
      laneIndex < options.road.laneCount &&
      isLaneGapClear(target, laneIndex, options.traffic.vehicles, tuning.laneChangeClearanceMeters)
  );
  if (targetLaneIndex === undefined) {
    return unchanged(cooledState, options.traffic, 'blocked');
  }

  const traffic = {
    ...options.traffic,
    vehicles: options.traffic.vehicles.map(vehicle =>
      vehicle.id === target.id
        ? {
            ...vehicle,
            targetLaneIndex,
            laneChangeRemainingSeconds: tuning.laneChangeDurationSeconds,
          }
        : vehicle
    ),
  };
  return {
    state: { cooldownRemainingSeconds: tuning.rechargeSeconds },
    traffic,
    status: 'cleared',
    affectedVehicleId: target.id,
  };
}

function unchanged(
  state: HornState,
  traffic: TrafficState,
  status: Exclude<HornStatus, 'cleared'>
): StepHornResult {
  return { state, traffic, status, affectedVehicleId: null };
}

function nearestEligibleCommuter(
  vehicles: readonly TrafficVehicle[],
  truckLaneIndex: number,
  truckDistanceMeters: number,
  rangeAheadMeters: number
): TrafficVehicle | null {
  let nearest: TrafficVehicle | null = null;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;
  for (const vehicle of vehicles) {
    const distanceAheadMeters = vehicle.distanceMeters - truckDistanceMeters;
    const eligible =
      vehicle.kind === 'commuter' &&
      vehicle.status === 'driving' &&
      vehicle.laneIndex === truckLaneIndex &&
      vehicle.targetLaneIndex === truckLaneIndex &&
      vehicle.laneChangeRemainingSeconds === 0 &&
      distanceAheadMeters > 0 &&
      distanceAheadMeters <= rangeAheadMeters;
    if (!eligible) continue;
    if (
      distanceAheadMeters < nearestDistanceMeters ||
      (distanceAheadMeters === nearestDistanceMeters &&
        (nearest === null || vehicle.id < nearest.id))
    ) {
      nearest = vehicle;
      nearestDistanceMeters = distanceAheadMeters;
    }
  }
  return nearest;
}

function isLaneGapClear(
  target: TrafficVehicle,
  targetLaneIndex: number,
  vehicles: readonly TrafficVehicle[],
  clearanceMeters: number
): boolean {
  return vehicles.every(vehicle => {
    if (vehicle.id === target.id || vehicle.status === 'disabled') return true;
    const occupiesLane =
      vehicle.laneIndex === targetLaneIndex || vehicle.targetLaneIndex === targetLaneIndex;
    return (
      !occupiesLane || Math.abs(vehicle.distanceMeters - target.distanceMeters) >= clearanceMeters
    );
  });
}

function nearestLaneIndex(road: Road, lateralOffsetMeters: number): number {
  let nearest = 0;
  for (let index = 1; index < road.laneCenterOffsetsMeters.length; index += 1) {
    if (
      Math.abs(road.laneCenterOffsetsMeters[index]! - lateralOffsetMeters) <
      Math.abs(road.laneCenterOffsetsMeters[nearest]! - lateralOffsetMeters)
    ) {
      nearest = index;
    }
  }
  return nearest;
}

function validateOptions(options: StepHornOptions): void {
  assertNonNegative('cooldownRemainingSeconds', options.state.cooldownRemainingSeconds);
  assertNonNegative('dtSeconds', options.dtSeconds);
  if (typeof options.activate !== 'boolean') {
    throw new TypeError(`activate must be boolean, got ${String(options.activate)}`);
  }
  assertFinite(
    'truckRoutePosition.distanceAlongRouteMeters',
    options.truckRoutePosition.distanceAlongRouteMeters
  );
  assertFinite(
    'truckRoutePosition.lateralOffsetMeters',
    options.truckRoutePosition.lateralOffsetMeters
  );
  if (
    options.road.laneCount < 1 ||
    options.road.laneCenterOffsetsMeters.length !== options.road.laneCount
  ) {
    throw new RangeError('road must expose one lane center for each lane');
  }
}

function validateTuning(tuning: HornTuning): void {
  assertPositive('rechargeSeconds', tuning.rechargeSeconds);
  assertPositive('rangeAheadMeters', tuning.rangeAheadMeters);
  assertPositive('laneChangeDurationSeconds', tuning.laneChangeDurationSeconds);
  assertPositive('laneChangeClearanceMeters', tuning.laneChangeClearanceMeters);
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
