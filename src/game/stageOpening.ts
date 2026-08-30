import { createFuelState } from '/src/game/fuel.js';
import { ZERO_FUEL_BURN, type DrivingState } from '/src/game/drivingUpdate.js';
import type { Road } from '/src/game/road.js';
import { routeToWorld, sampleRoute } from '/src/game/route.js';
import {
  createTrafficState,
  createTrafficVehicle,
  DEFAULT_TRAFFIC_TUNING,
  type TrafficState,
  type TrafficVehicle,
} from '/src/game/traffic.js';
import { createTruckState } from '/src/game/truck.js';
import { createWorldVelocity } from '/src/game/worldGeometry.js';

export interface StageOpeningTuning {
  readonly playerLaneIndex: number;
  readonly passingLaneIndex: number;
  readonly leadLaneIndex: number;
  readonly truckSpeedMetersPerSecond: number;
  readonly passingDistanceMeters: number;
  readonly passingSpeedMetersPerSecond: number;
  readonly leadDistanceMeters: number;
  readonly leadSpeedMetersPerSecond: number;
  readonly openingLaneChangeCooldownSeconds: number;
  readonly normalSpawnDelaySeconds: number;
}

export interface BuildStageOpeningOptions {
  readonly road: Road;
  readonly initialCargoIntegrity?: number;
  readonly initialFuelLevel?: number;
  readonly trafficSeed?: number;
  readonly tuning?: StageOpeningTuning;
}

export interface StageOpening {
  readonly drivingState: DrivingState;
  readonly trafficState: TrafficState;
}

export const DEFAULT_STAGE_OPENING_TUNING: StageOpeningTuning = Object.freeze({
  // The right-center lane leaves readable traffic on both sides of the rig.
  playerLaneIndex: 2,
  passingLaneIndex: 0,
  leadLaneIndex: 1,
  // About 22 mph: enough steering authority and road motion without consuming
  // the 0-250 m onboarding runway before the player acts.
  truckSpeedMetersPerSecond: 10,
  // One far-lane commuter starts alongside the trailer and visibly pulls away.
  passingDistanceMeters: -4,
  passingSpeedMetersPerSecond: 17,
  // One neighboring-lane commuter begins inside the 25 m opening sightline.
  leadDistanceMeters: 22,
  leadSpeedMetersPerSecond: 15,
  openingLaneChangeCooldownSeconds: 6,
  normalSpawnDelaySeconds: DEFAULT_TRAFFIC_TUNING.spawnIntervalSeconds,
});

/**
 * Build a deterministic in-medias-res opening without applying a hidden
 * control. The truck owns only initial momentum; its first no-input step is an
 * ordinary coast, and explicit cruise remains independently inactive.
 */
export function buildStageOpening(options: BuildStageOpeningOptions): StageOpening {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('stage opening options must be an object');
  }
  if (typeof options.road !== 'object' || options.road === null) {
    throw new TypeError('stage opening road must be an object');
  }
  const tuning = options.tuning ?? DEFAULT_STAGE_OPENING_TUNING;
  validateTuning(tuning, options.road);

  const fuelLevel = options.initialFuelLevel ?? 1;
  const truckSpeedMetersPerSecond = fuelLevel === 0 ? 0 : tuning.truckSpeedMetersPerSecond;
  const truckRoutePosition = {
    distanceAlongRouteMeters: 0,
    lateralOffsetMeters: options.road.laneCenterOffsetsMeters[tuning.playerLaneIndex]!,
  };
  const routeStart = sampleRoute(options.road.route, 0);
  const drivingState: DrivingState = {
    truck: createTruckState({
      position: routeToWorld(options.road.route, truckRoutePosition),
      headingRadians: routeStart.headingRadians,
      speedMetersPerSecond: truckSpeedMetersPerSecond,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: routeStart.headingRadians,
      massKilograms: 36_287,
      cargoIntegrity: options.initialCargoIntegrity ?? 1,
      status: 'driving',
    }),
    routePosition: truckRoutePosition,
    fuel: createFuelState({
      level: fuelLevel,
      // Initial momentum is not a stop-to-go launch. A real low-speed release
      // will arm the existing gulp policy again.
      launchGulpArmed: truckSpeedMetersPerSecond === 0,
    }),
    barrierContactState: { cooldownRemainingSeconds: 0 },
    lastFuelBurn: ZERO_FUEL_BURN,
  };

  const vehicles = [
    buildOpeningCommuter(options.road, {
      id: 1,
      laneIndex: tuning.passingLaneIndex,
      distanceMeters: tuning.passingDistanceMeters,
      speedMetersPerSecond: tuning.passingSpeedMetersPerSecond,
      laneChangeCooldownSeconds: tuning.openingLaneChangeCooldownSeconds,
    }),
    buildOpeningCommuter(options.road, {
      id: 2,
      laneIndex: tuning.leadLaneIndex,
      distanceMeters: tuning.leadDistanceMeters,
      speedMetersPerSecond: tuning.leadSpeedMetersPerSecond,
      laneChangeCooldownSeconds: tuning.openingLaneChangeCooldownSeconds,
    }),
  ];
  const trafficState = createTrafficState({
    ...(options.trafficSeed === undefined ? {} : { seed: options.trafficSeed }),
    vehicles,
    spawnCountdownSeconds: tuning.normalSpawnDelaySeconds,
  });

  return { drivingState, trafficState };
}

function buildOpeningCommuter(
  road: Road,
  options: {
    readonly id: number;
    readonly laneIndex: number;
    readonly distanceMeters: number;
    readonly speedMetersPerSecond: number;
    readonly laneChangeCooldownSeconds: number;
  }
): TrafficVehicle {
  const base = createTrafficVehicle({ ...options, kind: 'commuter' });
  const lateralMeters = road.laneCenterOffsetsMeters[options.laneIndex]!;
  const routeSample = sampleRoute(road.route, options.distanceMeters);

  return {
    ...base,
    lateralMeters,
    worldPosition: routeToWorld(road.route, {
      distanceAlongRouteMeters: options.distanceMeters,
      lateralOffsetMeters: lateralMeters,
    }),
    headingRadians: routeSample.headingRadians,
    worldVelocity: createWorldVelocity(
      routeSample.tangent.xMeters * options.speedMetersPerSecond,
      routeSample.tangent.yMeters * options.speedMetersPerSecond
    ),
  };
}

function validateTuning(tuning: StageOpeningTuning, road: Road): void {
  for (const [label, laneIndex] of [
    ['playerLaneIndex', tuning.playerLaneIndex],
    ['passingLaneIndex', tuning.passingLaneIndex],
    ['leadLaneIndex', tuning.leadLaneIndex],
  ] as const) {
    if (!Number.isSafeInteger(laneIndex) || laneIndex < 0 || laneIndex >= road.laneCount) {
      throw new RangeError(`${label} ${laneIndex} must identify one of ${road.laneCount} lanes`);
    }
  }
  if (new Set([tuning.playerLaneIndex, tuning.passingLaneIndex, tuning.leadLaneIndex]).size !== 3) {
    throw new RangeError('opening truck, passing commuter, and lead commuter need distinct lanes');
  }
  assertPositive('truckSpeedMetersPerSecond', tuning.truckSpeedMetersPerSecond);
  assertFinite('passingDistanceMeters', tuning.passingDistanceMeters);
  if (tuning.passingDistanceMeters > 0) {
    throw new RangeError('passingDistanceMeters must begin beside or behind the truck');
  }
  assertPositive('passingSpeedMetersPerSecond', tuning.passingSpeedMetersPerSecond);
  assertPositive('leadDistanceMeters', tuning.leadDistanceMeters);
  assertPositive('leadSpeedMetersPerSecond', tuning.leadSpeedMetersPerSecond);
  assertPositive('openingLaneChangeCooldownSeconds', tuning.openingLaneChangeCooldownSeconds);
  assertPositive('normalSpawnDelaySeconds', tuning.normalSpawnDelaySeconds);
  if (
    tuning.passingSpeedMetersPerSecond <= tuning.truckSpeedMetersPerSecond ||
    tuning.leadSpeedMetersPerSecond <= tuning.truckSpeedMetersPerSecond
  ) {
    throw new RangeError('opening commuters must pull away from the truck during the grace period');
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}
