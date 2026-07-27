import type { Road } from '/src/game/road.js';
import {
  detectRigidBodyContact,
  resolveRigidBodyContact,
  validateRigidBodyResponseTuning,
  type RigidBody,
  type RigidBodyContact,
  type RigidBodyResponseTuning,
} from '/src/game/rigidBody.js';
import type { TruckFootprintDimensions } from '/src/game/roadCollision.js';
import type { TruckState } from '/src/game/truck.js';
import {
  dotVelocityWithVector,
  headingToUnitVector,
  velocityAlongHeading,
} from '/src/game/worldGeometry.js';

export type TrafficVehicleKind = 'commuter' | 'patrol';
export type TrafficVehicleStatus = 'driving' | 'disengaging' | 'disabled';

/**
 * Traffic state is still road-relative in this slice: `lateralMeters` is an
 * offset across the road and `distanceMeters` is progress along it. On the
 * straight prototype route those happen to equal world `x` and `y`, which is
 * why the adapters below can convert with a plain copy. M5.7 replaces that
 * coincidence with an explicit route frame.
 */
export interface TrafficVehicle {
  readonly id: number;
  readonly kind: TrafficVehicleKind;
  readonly laneIndex: number;
  readonly targetLaneIndex: number;
  readonly lateralMeters: number;
  readonly distanceMeters: number;
  readonly speedMetersPerSecond: number;
  readonly laneChangeRemainingSeconds: number;
  readonly laneChangeCooldownSeconds: number;
  readonly headingRadians: number;
  readonly angularVelocityRadiansPerSecond: number;
  readonly lateralCollisionVelocityMetersPerSecond: number;
  readonly distanceCollisionVelocityMetersPerSecond: number;
  readonly massKilograms: number;
  readonly status: TrafficVehicleStatus;
  readonly disabledSecondsRemaining: number;
  readonly patrolDisengageSecondsRemaining: number;
}

export interface CreateTrafficVehicleOptions {
  readonly id: number;
  readonly kind: TrafficVehicleKind;
  readonly laneIndex: number;
  readonly distanceMeters: number;
  readonly speedMetersPerSecond: number;
  readonly laneChangeCooldownSeconds?: number;
}

export interface TrafficState {
  readonly vehicles: readonly TrafficVehicle[];
  readonly nextVehicleId: number;
  readonly spawnCountdownSeconds: number;
  readonly rngState: number;
  readonly takedowns: number;
  readonly contactCooldowns: Readonly<Record<string, number>>;
}

export interface CreateTrafficStateOptions {
  readonly seed?: number;
  readonly vehicles?: readonly TrafficVehicle[];
  readonly spawnCountdownSeconds?: number;
}

export interface TrafficTuning {
  readonly commuterWidthMeters: number;
  readonly commuterLengthMeters: number;
  readonly commuterMinSpeedMetersPerSecond: number;
  readonly commuterMaxSpeedMetersPerSecond: number;
  readonly commuterCargoDamage: number;
  readonly patrolWidthMeters: number;
  readonly patrolLengthMeters: number;
  readonly patrolAccelerationMetersPerSecondSquared: number;
  readonly patrolBrakingMetersPerSecondSquared: number;
  readonly patrolCargoDamage: number;
  readonly patrolRammingSpeedLossMetersPerSecond: number;
  readonly patrolLateralSpeedMetersPerSecond: number;
  readonly laneChangeDurationSeconds: number;
  readonly minLaneChangeCooldownSeconds: number;
  readonly maxLaneChangeCooldownSeconds: number;
  readonly spawnIntervalSeconds: number;
  readonly patrolSpawnChance: number;
  readonly spawnAheadMinMeters: number;
  readonly spawnAheadMaxMeters: number;
  readonly cullBehindMeters: number;
  readonly cullAheadMeters: number;
  readonly contactCooldownSeconds: number;
  readonly commuterMassKilograms: number;
  readonly patrolMassKilograms: number;
  readonly collisionVelocityDampingPerSecond: number;
  readonly angularVelocityDampingPerSecond: number;
  readonly laneRecoveryMetersPerSecond: number;
  readonly headingRecoveryRadiansPerSecond: number;
  readonly solverIterations: number;
  readonly plowImpactSpeedMetersPerSecond: number;
  readonly patrolDamageImpactSpeedMetersPerSecond: number;
  readonly disabledLifetimeSeconds: number;
  readonly patrolFollowGapMeters: number;
  readonly patrolDisengageSeconds: number;
  readonly patrolRetreatSpeedDeltaMetersPerSecond: number;
  readonly laneChangeClearanceMeters: number;
  readonly laneChangeRetrySeconds: number;
  readonly rigidBodyResponse: RigidBodyResponseTuning;
}

export type TrafficEvent =
  | { readonly kind: 'road-rage'; readonly vehicleId: number }
  | { readonly kind: 'patrol-ram'; readonly vehicleId: number };

export interface StepTrafficOptions {
  readonly state: TrafficState;
  readonly truck: TruckState;
  readonly road: Road;
  readonly truckDimensions: TruckFootprintDimensions;
  readonly dtSeconds: number;
  readonly tuning?: TrafficTuning;
}

export interface StepTrafficResult {
  readonly state: TrafficState;
  readonly truck: TruckState;
  readonly events: readonly TrafficEvent[];
}

export const DEFAULT_TRAFFIC_TUNING: TrafficTuning = Object.freeze({
  commuterWidthMeters: 1.9,
  commuterLengthMeters: 4.5,
  commuterMinSpeedMetersPerSecond: 12,
  commuterMaxSpeedMetersPerSecond: 21,
  commuterCargoDamage: 0.02,
  patrolWidthMeters: 2,
  patrolLengthMeters: 4.8,
  patrolAccelerationMetersPerSecondSquared: 4,
  patrolBrakingMetersPerSecondSquared: 12,
  patrolCargoDamage: 0.06,
  patrolRammingSpeedLossMetersPerSecond: 1.5,
  patrolLateralSpeedMetersPerSecond: 1.8,
  laneChangeDurationSeconds: 1.25,
  minLaneChangeCooldownSeconds: 4,
  maxLaneChangeCooldownSeconds: 9,
  spawnIntervalSeconds: 3.5,
  patrolSpawnChance: 0.18,
  spawnAheadMinMeters: 65,
  spawnAheadMaxMeters: 105,
  cullBehindMeters: 50,
  cullAheadMeters: 135,
  contactCooldownSeconds: 0.65,
  commuterMassKilograms: 1_500,
  patrolMassKilograms: 1_850,
  collisionVelocityDampingPerSecond: 2.8,
  angularVelocityDampingPerSecond: 3.5,
  laneRecoveryMetersPerSecond: 1.4,
  headingRecoveryRadiansPerSecond: 1.2,
  solverIterations: 5,
  plowImpactSpeedMetersPerSecond: 4,
  patrolDamageImpactSpeedMetersPerSecond: 2,
  disabledLifetimeSeconds: 0.8,
  patrolFollowGapMeters: 2,
  patrolDisengageSeconds: 5,
  patrolRetreatSpeedDeltaMetersPerSecond: 10,
  laneChangeClearanceMeters: 9,
  laneChangeRetrySeconds: 0.75,
  rigidBodyResponse: Object.freeze({
    restitution: 0.08,
    friction: 0.35,
    positionalCorrection: 1,
    penetrationSlopMeters: 0,
  }),
});

const DEFAULT_LANE_COUNT = 4;
const DEFAULT_LANE_WIDTH_METERS = 3.7;

export function createTrafficVehicle(options: CreateTrafficVehicleOptions): TrafficVehicle {
  assertNonNegativeInteger('id', options.id);
  assertTrafficKind(options.kind);
  assertLaneIndex(options.laneIndex, DEFAULT_LANE_COUNT);
  assertFinite('distanceMeters', options.distanceMeters);
  assertNonNegative('speedMetersPerSecond', options.speedMetersPerSecond);
  const cooldown = options.laneChangeCooldownSeconds ?? 5;
  assertNonNegative('laneChangeCooldownSeconds', cooldown);
  const lateralMeters =
    (options.laneIndex - (DEFAULT_LANE_COUNT - 1) / 2) * DEFAULT_LANE_WIDTH_METERS;

  return {
    id: options.id,
    kind: options.kind,
    laneIndex: options.laneIndex,
    targetLaneIndex: options.laneIndex,
    lateralMeters,
    distanceMeters: options.distanceMeters,
    speedMetersPerSecond: options.speedMetersPerSecond,
    laneChangeRemainingSeconds: 0,
    laneChangeCooldownSeconds: cooldown,
    headingRadians: 0,
    angularVelocityRadiansPerSecond: 0,
    lateralCollisionVelocityMetersPerSecond: 0,
    distanceCollisionVelocityMetersPerSecond: 0,
    massKilograms:
      options.kind === 'commuter'
        ? DEFAULT_TRAFFIC_TUNING.commuterMassKilograms
        : DEFAULT_TRAFFIC_TUNING.patrolMassKilograms,
    status: 'driving',
    disabledSecondsRemaining: 0,
    patrolDisengageSecondsRemaining: 0,
  };
}

export function createTrafficState(options: CreateTrafficStateOptions = {}): TrafficState {
  const seed = options.seed ?? 0x80_18_80;
  const vehicles = (options.vehicles ?? []).map(vehicle => ({ ...vehicle }));
  for (const vehicle of vehicles) validateVehicle(vehicle);
  const spawnCountdownSeconds = options.spawnCountdownSeconds ?? 0.75;
  assertNonNegative('spawnCountdownSeconds', spawnCountdownSeconds);

  return {
    vehicles,
    nextVehicleId: vehicles.reduce((max, vehicle) => Math.max(max, vehicle.id + 1), 1),
    spawnCountdownSeconds,
    rngState: normalizeSeed(seed),
    takedowns: 0,
    contactCooldowns: {},
  };
}

export function stepTraffic(options: StepTrafficOptions): StepTrafficResult {
  validateStepOptions(options);
  const tuning = options.tuning ?? DEFAULT_TRAFFIC_TUNING;
  validateTuning(tuning);
  const rng = new RandomStream(options.state.rngState);
  let nextVehicleId = options.state.nextVehicleId;
  let spawnCountdownSeconds = options.state.spawnCountdownSeconds - options.dtSeconds;
  const contactCooldowns = coolContactCooldowns(options.state.contactCooldowns, options.dtSeconds);

  const moved = options.state.vehicles.map(vehicle =>
    stepVehicle(
      vehicle,
      options.state.vehicles,
      options.truck,
      options.road,
      options.truckDimensions,
      options.dtSeconds,
      tuning,
      rng
    )
  );

  if (spawnCountdownSeconds <= 0) {
    const spawned = spawnVehicle(nextVehicleId, options.truck, moved, options.road, tuning, rng);
    if (spawned) {
      moved.push(spawned);
      nextVehicleId += 1;
    }
    spawnCountdownSeconds += tuning.spawnIntervalSeconds;
  }

  const inRange = moved.filter(vehicle => {
    // Straight-route coincidence: the truck's world y is also its route
    // distance today. M5.7 replaces these reads with a projected route position.
    const relativeDistance = vehicle.distanceMeters - options.truck.position.yMeters;
    const isActive =
      vehicle.status === 'driving' ||
      (vehicle.status === 'disengaging' && vehicle.patrolDisengageSecondsRemaining > 0) ||
      (vehicle.status === 'disabled' && vehicle.disabledSecondsRemaining > 0);
    return (
      isActive &&
      relativeDistance >= -tuning.cullBehindMeters &&
      relativeDistance <= tuning.cullAheadMeters
    );
  });
  const collisionResult = resolveWorldContacts({
    truck: options.truck,
    vehicles: inRange,
    truckDimensions: options.truckDimensions,
    tuning,
  });
  const gameplayResult = applyTrafficContactEffects({
    truck: collisionResult.truck,
    vehicles: collisionResult.vehicles,
    impactSpeeds: collisionResult.impactSpeeds,
    takedowns: options.state.takedowns,
    contactCooldowns,
    tuning,
  });

  return {
    state: {
      vehicles: gameplayResult.vehicles,
      nextVehicleId,
      spawnCountdownSeconds,
      rngState: rng.state,
      takedowns: gameplayResult.takedowns,
      contactCooldowns: gameplayResult.contactCooldowns,
    },
    truck: gameplayResult.truck,
    events: gameplayResult.events,
  };
}

function stepVehicle(
  vehicle: TrafficVehicle,
  allVehicles: readonly TrafficVehicle[],
  truck: TruckState,
  road: Road,
  truckDimensions: TruckFootprintDimensions,
  dtSeconds: number,
  tuning: TrafficTuning,
  rng: RandomStream
): TrafficVehicle {
  const collisionDamping = Math.exp(-tuning.collisionVelocityDampingPerSecond * dtSeconds);
  const angularDamping = Math.exp(-tuning.angularVelocityDampingPerSecond * dtSeconds);
  const collisionMotion = {
    lateralMeters: vehicle.lateralCollisionVelocityMetersPerSecond * dtSeconds,
    distanceMeters: vehicle.distanceCollisionVelocityMetersPerSecond * dtSeconds,
  };

  if (vehicle.status === 'disabled') {
    return {
      ...vehicle,
      lateralMeters: vehicle.lateralMeters + collisionMotion.lateralMeters,
      distanceMeters:
        vehicle.distanceMeters +
        (vehicle.speedMetersPerSecond + vehicle.distanceCollisionVelocityMetersPerSecond) *
          dtSeconds,
      headingRadians:
        moveToward(vehicle.headingRadians, 0, tuning.headingRecoveryRadiansPerSecond * dtSeconds) +
        vehicle.angularVelocityRadiansPerSecond * dtSeconds,
      angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond * angularDamping,
      lateralCollisionVelocityMetersPerSecond:
        vehicle.lateralCollisionVelocityMetersPerSecond * collisionDamping,
      distanceCollisionVelocityMetersPerSecond:
        vehicle.distanceCollisionVelocityMetersPerSecond * collisionDamping,
      disabledSecondsRemaining: Math.max(0, vehicle.disabledSecondsRemaining - dtSeconds),
    };
  }

  if (vehicle.kind === 'patrol') {
    const disengageSecondsRemaining = Math.max(
      0,
      vehicle.patrolDisengageSecondsRemaining - dtSeconds
    );
    const isDisengaging = vehicle.status === 'disengaging';
    const targetLaneIndex = nearestLaneIndex(
      road,
      isDisengaging ? vehicle.lateralMeters : truck.position.xMeters
    );
    const targetLateral = road.laneCenterOffsetsMeters[targetLaneIndex]!;
    const trailerRearDistanceMeters =
      truck.position.yMeters -
      (truckDimensions.cabLengthMeters / 2 +
        truckDimensions.trailerLengthMeters +
        truckDimensions.hitchGapMeters);
    const desiredDistanceMeters =
      trailerRearDistanceMeters - tuning.patrolLengthMeters / 2 - tuning.patrolFollowGapMeters;
    const gapError = desiredDistanceMeters - vehicle.distanceMeters;
    const desiredSpeed = isDisengaging
      ? Math.max(0, truck.speedMetersPerSecond - tuning.patrolRetreatSpeedDeltaMetersPerSecond)
      : Math.max(0, truck.speedMetersPerSecond + clamp(gapError * 0.3, -4, 7));
    const acceleration =
      desiredSpeed < vehicle.speedMetersPerSecond
        ? tuning.patrolBrakingMetersPerSecondSquared
        : tuning.patrolAccelerationMetersPerSecondSquared;
    const speed = moveToward(vehicle.speedMetersPerSecond, desiredSpeed, acceleration * dtSeconds);
    return {
      ...vehicle,
      targetLaneIndex,
      lateralMeters:
        moveToward(
          vehicle.lateralMeters,
          targetLateral,
          tuning.patrolLateralSpeedMetersPerSecond * dtSeconds
        ) + collisionMotion.lateralMeters,
      distanceMeters:
        vehicle.distanceMeters +
        (speed + vehicle.distanceCollisionVelocityMetersPerSecond) * dtSeconds,
      speedMetersPerSecond: speed,
      patrolDisengageSecondsRemaining: disengageSecondsRemaining,
      headingRadians: vehicle.headingRadians + vehicle.angularVelocityRadiansPerSecond * dtSeconds,
      angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond * angularDamping,
      lateralCollisionVelocityMetersPerSecond:
        vehicle.lateralCollisionVelocityMetersPerSecond * collisionDamping,
      distanceCollisionVelocityMetersPerSecond:
        vehicle.distanceCollisionVelocityMetersPerSecond * collisionDamping,
    };
  }

  let next = vehicle;
  if (next.laneChangeRemainingSeconds > 0) {
    next = advanceLaneChange(next, road, dtSeconds, tuning, rng);
  } else {
    const cooldown = Math.max(0, next.laneChangeCooldownSeconds - dtSeconds);
    next = { ...next, laneChangeCooldownSeconds: cooldown };
    if (cooldown === 0) {
      const candidates = [next.laneIndex - 1, next.laneIndex + 1].filter(
        lane =>
          lane >= 0 && lane < road.laneCount && isLaneGapClear(next, lane, allVehicles, tuning)
      );
      if (candidates.length === 0) {
        next = { ...next, laneChangeCooldownSeconds: tuning.laneChangeRetrySeconds };
      } else {
        const targetLaneIndex = rng.pick(candidates);
        next = advanceLaneChange(
          {
            ...next,
            targetLaneIndex,
            laneChangeRemainingSeconds: tuning.laneChangeDurationSeconds,
          },
          road,
          dtSeconds,
          tuning,
          rng
        );
      }
    }
  }
  const laneCenteredLateralMeters =
    next.laneChangeRemainingSeconds === 0
      ? moveToward(
          next.lateralMeters,
          road.laneCenterOffsetsMeters[next.laneIndex]!,
          tuning.laneRecoveryMetersPerSecond * dtSeconds
        )
      : next.lateralMeters;
  return {
    ...next,
    lateralMeters: laneCenteredLateralMeters + collisionMotion.lateralMeters,
    distanceMeters:
      next.distanceMeters +
      (next.speedMetersPerSecond + next.distanceCollisionVelocityMetersPerSecond) * dtSeconds,
    headingRadians:
      moveToward(next.headingRadians, 0, tuning.headingRecoveryRadiansPerSecond * dtSeconds) +
      next.angularVelocityRadiansPerSecond * dtSeconds,
    angularVelocityRadiansPerSecond: next.angularVelocityRadiansPerSecond * angularDamping,
    lateralCollisionVelocityMetersPerSecond:
      next.lateralCollisionVelocityMetersPerSecond * collisionDamping,
    distanceCollisionVelocityMetersPerSecond:
      next.distanceCollisionVelocityMetersPerSecond * collisionDamping,
  };
}

function advanceLaneChange(
  vehicle: TrafficVehicle,
  road: Road,
  dtSeconds: number,
  tuning: TrafficTuning,
  rng: RandomStream
): TrafficVehicle {
  const remaining = Math.max(0, vehicle.laneChangeRemainingSeconds - dtSeconds);
  const target = road.laneCenterOffsetsMeters[vehicle.targetLaneIndex]!;
  const lateralMeters = moveToward(
    vehicle.lateralMeters,
    target,
    (road.laneWidthMeters / tuning.laneChangeDurationSeconds) * dtSeconds
  );
  if (remaining > 0 || lateralMeters !== target) {
    return { ...vehicle, lateralMeters, laneChangeRemainingSeconds: remaining };
  }
  return {
    ...vehicle,
    laneIndex: vehicle.targetLaneIndex,
    lateralMeters: target,
    laneChangeRemainingSeconds: 0,
    laneChangeCooldownSeconds:
      tuning.minLaneChangeCooldownSeconds +
      rng.next() * (tuning.maxLaneChangeCooldownSeconds - tuning.minLaneChangeCooldownSeconds),
  };
}

function spawnVehicle(
  id: number,
  truck: TruckState,
  vehicles: readonly TrafficVehicle[],
  road: Road,
  tuning: TrafficTuning,
  rng: RandomStream
): TrafficVehicle | null {
  const wantsPatrol = rng.chance(tuning.patrolSpawnChance);
  const hasActivePatrol = vehicles.some(vehicle => vehicle.kind === 'patrol');
  const kind: TrafficVehicleKind = wantsPatrol && !hasActivePatrol ? 'patrol' : 'commuter';
  const ahead =
    tuning.spawnAheadMinMeters +
    rng.next() * (tuning.spawnAheadMaxMeters - tuning.spawnAheadMinMeters);
  const distanceMeters = truck.position.yMeters + (kind === 'patrol' ? -30 : ahead);
  const availableLaneIndices = Array.from(
    { length: road.laneCount },
    (_, laneIndex) => laneIndex
  ).filter(laneIndex =>
    vehicles.every(
      vehicle =>
        vehicle.laneIndex !== laneIndex ||
        Math.abs(vehicle.distanceMeters - distanceMeters) >= tuning.laneChangeClearanceMeters
    )
  );
  if (availableLaneIndices.length === 0) return null;
  const laneIndex = rng.pick(availableLaneIndices);
  const speed =
    kind === 'patrol'
      ? Math.max(18, truck.speedMetersPerSecond + 2)
      : tuning.commuterMinSpeedMetersPerSecond +
        rng.next() *
          (tuning.commuterMaxSpeedMetersPerSecond - tuning.commuterMinSpeedMetersPerSecond);
  const initial = createTrafficVehicle({
    id,
    kind,
    laneIndex,
    distanceMeters,
    speedMetersPerSecond: speed,
    laneChangeCooldownSeconds:
      tuning.minLaneChangeCooldownSeconds +
      rng.next() * (tuning.maxLaneChangeCooldownSeconds - tuning.minLaneChangeCooldownSeconds),
  });
  return {
    ...initial,
    lateralMeters: road.laneCenterOffsetsMeters[laneIndex]!,
    massKilograms: kind === 'commuter' ? tuning.commuterMassKilograms : tuning.patrolMassKilograms,
  };
}

function isLaneGapClear(
  vehicle: TrafficVehicle,
  targetLaneIndex: number,
  vehicles: readonly TrafficVehicle[],
  tuning: TrafficTuning
): boolean {
  return vehicles.every(other => {
    if (other.id === vehicle.id || other.status === 'disabled') return true;
    const occupiesTarget =
      other.laneIndex === targetLaneIndex || other.targetLaneIndex === targetLaneIndex;
    return (
      !occupiesTarget ||
      Math.abs(other.distanceMeters - vehicle.distanceMeters) >= tuning.laneChangeClearanceMeters
    );
  });
}

interface WorldContactResult {
  readonly truck: TruckState;
  readonly vehicles: readonly TrafficVehicle[];
  readonly impactSpeeds: ReadonlyMap<number, number>;
}

interface ResolveWorldContactsOptions {
  readonly truck: TruckState;
  readonly vehicles: readonly TrafficVehicle[];
  readonly truckDimensions: TruckFootprintDimensions;
  readonly tuning: TrafficTuning;
}

function resolveWorldContacts(options: ResolveWorldContactsOptions): WorldContactResult {
  let truck = options.truck;
  const vehicles = options.vehicles.map(vehicle => ({ ...vehicle }));
  const impactSpeeds = new Map<number, number>();

  for (let iteration = 0; iteration < options.tuning.solverIterations; iteration++) {
    for (let index = 0; index < vehicles.length; index++) {
      const vehicle = vehicles[index]!;
      const vehicleBody = buildVehicleRigidBody(vehicle, options.tuning);
      const strongest = strongestTruckContact(truck, vehicleBody, options.truckDimensions);
      if (!strongest) continue;

      const response = resolveRigidBodyContact(
        strongest.truckBody,
        vehicleBody,
        strongest.contact,
        options.tuning.rigidBodyResponse
      );
      impactSpeeds.set(
        vehicle.id,
        Math.max(impactSpeeds.get(vehicle.id) ?? 0, response.impactSpeedMetersPerSecond)
      );
      truck = applyResolvedTruckBody(truck, strongest.truckBody, response.bodyA);
      vehicles[index] = applyResolvedVehicleBody(vehicle, response.bodyB);
    }

    for (let firstIndex = 0; firstIndex < vehicles.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < vehicles.length; secondIndex++) {
        const first = vehicles[firstIndex]!;
        const second = vehicles[secondIndex]!;
        const firstBody = buildVehicleRigidBody(first, options.tuning);
        const secondBody = buildVehicleRigidBody(second, options.tuning);
        const contact = detectRigidBodyContact(firstBody, secondBody);
        if (!contact) continue;
        const response = resolveRigidBodyContact(
          firstBody,
          secondBody,
          contact,
          options.tuning.rigidBodyResponse
        );
        vehicles[firstIndex] = applyResolvedVehicleBody(first, response.bodyA);
        vehicles[secondIndex] = applyResolvedVehicleBody(second, response.bodyB);
      }
    }
  }

  return { truck, vehicles, impactSpeeds };
}

interface StrongestTruckContact {
  readonly truckBody: RigidBody;
  readonly contact: RigidBodyContact;
}

function strongestTruckContact(
  truck: TruckState,
  vehicleBody: RigidBody,
  dimensions: TruckFootprintDimensions
): StrongestTruckContact | null {
  let strongest: StrongestTruckContact | null = null;
  for (const truckBody of buildTruckRigidBodies(truck, dimensions)) {
    const contact = detectRigidBodyContact(truckBody, vehicleBody);
    if (
      contact &&
      (!strongest || contact.penetrationMeters > strongest.contact.penetrationMeters)
    ) {
      strongest = { truckBody, contact };
    }
  }
  return strongest;
}

function buildTruckRigidBodies(
  truck: TruckState,
  dimensions: TruckFootprintDimensions
): readonly [RigidBody, RigidBody] {
  const hitchLengthMeters =
    dimensions.cabLengthMeters / 2 + dimensions.trailerLengthMeters / 2 + dimensions.hitchGapMeters;
  const trailerCenter = {
    xMeters: truck.position.xMeters - Math.sin(truck.trailerHeadingRadians) * hitchLengthMeters,
    yMeters: truck.position.yMeters - Math.cos(truck.trailerHeadingRadians) * hitchLengthMeters,
  };
  const cabVelocity = velocityAlongHeading(truck.headingRadians, truck.speedMetersPerSecond);
  const trailerVelocity = velocityAlongHeading(
    truck.trailerHeadingRadians,
    truck.speedMetersPerSecond
  );
  return [
    {
      id: 'truck-cab',
      position: truck.position,
      velocity: cabVelocity,
      headingRadians: truck.headingRadians,
      angularVelocityRadiansPerSecond: truck.yawRateRadiansPerSecond,
      widthMeters: dimensions.cabWidthMeters,
      lengthMeters: dimensions.cabLengthMeters,
      massKilograms: truck.massKilograms,
    },
    {
      id: 'truck-trailer',
      position: trailerCenter,
      velocity: trailerVelocity,
      headingRadians: truck.trailerHeadingRadians,
      angularVelocityRadiansPerSecond: truck.yawRateRadiansPerSecond,
      widthMeters: dimensions.trailerWidthMeters,
      lengthMeters: dimensions.trailerLengthMeters,
      massKilograms: truck.massKilograms,
    },
  ];
}

function buildVehicleRigidBody(vehicle: TrafficVehicle, tuning: TrafficTuning): RigidBody {
  const widthMeters =
    vehicle.kind === 'commuter' ? tuning.commuterWidthMeters : tuning.patrolWidthMeters;
  const lengthMeters =
    vehicle.kind === 'commuter' ? tuning.commuterLengthMeters : tuning.patrolLengthMeters;
  return {
    id: `traffic-${vehicle.id}`,
    position: {
      xMeters: vehicle.lateralMeters,
      yMeters: vehicle.distanceMeters,
    },
    velocity: {
      xMetersPerSecond: vehicle.lateralCollisionVelocityMetersPerSecond,
      yMetersPerSecond:
        vehicle.speedMetersPerSecond + vehicle.distanceCollisionVelocityMetersPerSecond,
    },
    headingRadians: vehicle.headingRadians,
    angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond,
    widthMeters,
    lengthMeters,
    massKilograms: vehicle.massKilograms,
  };
}

function applyResolvedVehicleBody(vehicle: TrafficVehicle, body: RigidBody): TrafficVehicle {
  return {
    ...vehicle,
    lateralMeters: body.position.xMeters,
    distanceMeters: body.position.yMeters,
    headingRadians: body.headingRadians,
    angularVelocityRadiansPerSecond: body.angularVelocityRadiansPerSecond,
    lateralCollisionVelocityMetersPerSecond: body.velocity.xMetersPerSecond,
    distanceCollisionVelocityMetersPerSecond:
      body.velocity.yMetersPerSecond - vehicle.speedMetersPerSecond,
  };
}

function applyResolvedTruckBody(
  truck: TruckState,
  originalBody: RigidBody,
  resolvedBody: RigidBody
): TruckState {
  const positionDelta = {
    xMeters: resolvedBody.position.xMeters - originalBody.position.xMeters,
    yMeters: resolvedBody.position.yMeters - originalBody.position.yMeters,
  };
  const forward = headingToUnitVector(truck.headingRadians);
  const resolvedForwardSpeed = Math.max(0, dotVelocityWithVector(resolvedBody.velocity, forward));
  return {
    ...truck,
    position: {
      xMeters: truck.position.xMeters + positionDelta.xMeters,
      yMeters: truck.position.yMeters + positionDelta.yMeters,
    },
    speedMetersPerSecond: resolvedForwardSpeed,
    yawRateRadiansPerSecond: clamp(resolvedBody.angularVelocityRadiansPerSecond, -0.6, 0.6),
  };
}

function damageTruck(truck: TruckState, damage: number, speedLoss: number): TruckState {
  return {
    ...truck,
    position: { ...truck.position },
    cargoIntegrity: Math.max(0, truck.cargoIntegrity - damage),
    speedMetersPerSecond: Math.max(0, truck.speedMetersPerSecond - speedLoss),
  };
}

interface ApplyTrafficContactEffectsOptions {
  readonly truck: TruckState;
  readonly vehicles: readonly TrafficVehicle[];
  readonly impactSpeeds: ReadonlyMap<number, number>;
  readonly takedowns: number;
  readonly contactCooldowns: Readonly<Record<string, number>>;
  readonly tuning: TrafficTuning;
}

interface ApplyTrafficContactEffectsResult {
  readonly truck: TruckState;
  readonly vehicles: readonly TrafficVehicle[];
  readonly takedowns: number;
  readonly contactCooldowns: Readonly<Record<string, number>>;
  readonly events: readonly TrafficEvent[];
}

function applyTrafficContactEffects(
  options: ApplyTrafficContactEffectsOptions
): ApplyTrafficContactEffectsResult {
  let truck = options.truck;
  let takedowns = options.takedowns;
  const contactCooldowns = { ...options.contactCooldowns };
  const events: TrafficEvent[] = [];
  const vehicles = options.vehicles.map(vehicle => {
    const impactSpeed = options.impactSpeeds.get(vehicle.id) ?? 0;
    if (
      vehicle.kind === 'commuter' &&
      vehicle.status === 'driving' &&
      impactSpeed >= options.tuning.plowImpactSpeedMetersPerSecond
    ) {
      truck = damageTruck(truck, options.tuning.commuterCargoDamage, 0);
      takedowns += 1;
      events.push({ kind: 'road-rage', vehicleId: vehicle.id });
      return disableVehicle(vehicle, options.tuning);
    }

    if (
      vehicle.kind === 'patrol' &&
      vehicle.status === 'driving' &&
      vehicle.patrolDisengageSecondsRemaining === 0 &&
      impactSpeed >= options.tuning.patrolDamageImpactSpeedMetersPerSecond &&
      (contactCooldowns[String(vehicle.id)] ?? 0) === 0
    ) {
      truck = damageTruck(
        truck,
        options.tuning.patrolCargoDamage,
        options.tuning.patrolRammingSpeedLossMetersPerSecond
      );
      contactCooldowns[String(vehicle.id)] = options.tuning.contactCooldownSeconds;
      events.push({ kind: 'patrol-ram', vehicleId: vehicle.id });
      return {
        ...vehicle,
        status: 'disengaging' as const,
        patrolDisengageSecondsRemaining: options.tuning.patrolDisengageSeconds,
      };
    }
    return vehicle;
  });

  return { truck, vehicles, takedowns, contactCooldowns, events };
}

function disableVehicle(vehicle: TrafficVehicle, tuning: TrafficTuning): TrafficVehicle {
  const totalDistanceVelocity =
    vehicle.speedMetersPerSecond + vehicle.distanceCollisionVelocityMetersPerSecond;
  const spinDirection =
    Math.sign(vehicle.lateralCollisionVelocityMetersPerSecond) || (vehicle.id % 2 === 0 ? 1 : -1);
  return {
    ...vehicle,
    speedMetersPerSecond: 0,
    distanceCollisionVelocityMetersPerSecond: totalDistanceVelocity,
    angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond + spinDirection * 0.9,
    status: 'disabled',
    disabledSecondsRemaining: tuning.disabledLifetimeSeconds,
  };
}

function coolContactCooldowns(
  cooldowns: Readonly<Record<string, number>>,
  dtSeconds: number
): Record<string, number> {
  const cooled: Record<string, number> = {};
  for (const [key, value] of Object.entries(cooldowns)) {
    const remaining = Math.max(0, value - dtSeconds);
    if (remaining > 0) cooled[key] = remaining;
  }
  return cooled;
}

function nearestLaneIndex(road: Road, lateralMeters: number): number {
  let nearest = 0;
  for (let index = 1; index < road.laneCenterOffsetsMeters.length; index++) {
    if (
      Math.abs(road.laneCenterOffsetsMeters[index]! - lateralMeters) <
      Math.abs(road.laneCenterOffsetsMeters[nearest]! - lateralMeters)
    ) {
      nearest = index;
    }
  }
  return nearest;
}

function validateStepOptions(options: StepTrafficOptions): void {
  if (typeof options !== 'object' || options === null)
    throw new TypeError('options must be an object');
  assertNonNegative('dtSeconds', options.dtSeconds);
  assertNonNegativeInteger('nextVehicleId', options.state.nextVehicleId);
  assertFinite('spawnCountdownSeconds', options.state.spawnCountdownSeconds);
  assertFinite('rngState', options.state.rngState);
  assertNonNegativeInteger('takedowns', options.state.takedowns);
  if (
    typeof options.state.contactCooldowns !== 'object' ||
    options.state.contactCooldowns === null
  ) {
    throw new TypeError('contactCooldowns must be an object');
  }
  for (const value of Object.values(options.state.contactCooldowns)) {
    assertNonNegative('contactCooldown', value);
  }
  for (const vehicle of options.state.vehicles) {
    validateVehicle(vehicle);
    assertLaneIndex(vehicle.laneIndex, options.road.laneCount);
    assertLaneIndex(vehicle.targetLaneIndex, options.road.laneCount);
  }
  if (
    options.road.laneCount < 1 ||
    options.road.laneCenterOffsetsMeters.length !== options.road.laneCount
  ) {
    throw new RangeError('road must expose one lane center for each lane');
  }
  assertPositive('truckDimensions.cabWidthMeters', options.truckDimensions.cabWidthMeters);
  assertPositive('truckDimensions.cabLengthMeters', options.truckDimensions.cabLengthMeters);
  assertPositive('truckDimensions.trailerWidthMeters', options.truckDimensions.trailerWidthMeters);
  assertPositive(
    'truckDimensions.trailerLengthMeters',
    options.truckDimensions.trailerLengthMeters
  );
  validateHitchOffset(
    'truckDimensions.hitchGapMeters',
    options.truckDimensions.hitchGapMeters,
    options.truckDimensions.cabLengthMeters,
    options.truckDimensions.trailerLengthMeters
  );
}

function validateHitchOffset(
  label: string,
  hitchGapMeters: number,
  cabLengthMeters: number,
  trailerLengthMeters: number
): void {
  assertFinite(label, hitchGapMeters);
  const centerDistanceMeters = cabLengthMeters / 2 + trailerLengthMeters / 2 + hitchGapMeters;
  if (centerDistanceMeters <= 0) {
    throw new RangeError(
      `${label} must keep the trailer center behind the cab center, got ${hitchGapMeters}`
    );
  }
}

function validateTuning(tuning: TrafficTuning): void {
  assertPositive('commuterWidthMeters', tuning.commuterWidthMeters);
  assertPositive('commuterLengthMeters', tuning.commuterLengthMeters);
  assertNonNegative('commuterMinSpeedMetersPerSecond', tuning.commuterMinSpeedMetersPerSecond);
  assertNonNegative('commuterMaxSpeedMetersPerSecond', tuning.commuterMaxSpeedMetersPerSecond);
  if (tuning.commuterMaxSpeedMetersPerSecond < tuning.commuterMinSpeedMetersPerSecond) {
    throw new RangeError(
      'commuterMaxSpeedMetersPerSecond must be >= commuterMinSpeedMetersPerSecond'
    );
  }
  assertRange('commuterCargoDamage', tuning.commuterCargoDamage, 0, 1);
  assertPositive('patrolWidthMeters', tuning.patrolWidthMeters);
  assertPositive('patrolLengthMeters', tuning.patrolLengthMeters);
  assertPositive(
    'patrolAccelerationMetersPerSecondSquared',
    tuning.patrolAccelerationMetersPerSecondSquared
  );
  assertPositive('patrolBrakingMetersPerSecondSquared', tuning.patrolBrakingMetersPerSecondSquared);
  assertRange('patrolCargoDamage', tuning.patrolCargoDamage, 0, 1);
  assertNonNegative(
    'patrolRammingSpeedLossMetersPerSecond',
    tuning.patrolRammingSpeedLossMetersPerSecond
  );
  assertPositive('patrolLateralSpeedMetersPerSecond', tuning.patrolLateralSpeedMetersPerSecond);
  assertPositive('laneChangeDurationSeconds', tuning.laneChangeDurationSeconds);
  assertNonNegative('minLaneChangeCooldownSeconds', tuning.minLaneChangeCooldownSeconds);
  assertNonNegative('maxLaneChangeCooldownSeconds', tuning.maxLaneChangeCooldownSeconds);
  if (tuning.maxLaneChangeCooldownSeconds < tuning.minLaneChangeCooldownSeconds) {
    throw new RangeError('maxLaneChangeCooldownSeconds must be >= minLaneChangeCooldownSeconds');
  }
  assertPositive('spawnIntervalSeconds', tuning.spawnIntervalSeconds);
  assertRange('patrolSpawnChance', tuning.patrolSpawnChance, 0, 1);
  assertNonNegative('spawnAheadMinMeters', tuning.spawnAheadMinMeters);
  assertNonNegative('spawnAheadMaxMeters', tuning.spawnAheadMaxMeters);
  if (tuning.spawnAheadMaxMeters < tuning.spawnAheadMinMeters) {
    throw new RangeError('spawnAheadMaxMeters must be >= spawnAheadMinMeters');
  }
  assertPositive('cullBehindMeters', tuning.cullBehindMeters);
  assertPositive('cullAheadMeters', tuning.cullAheadMeters);
  assertPositive('contactCooldownSeconds', tuning.contactCooldownSeconds);
  assertPositive('commuterMassKilograms', tuning.commuterMassKilograms);
  assertPositive('patrolMassKilograms', tuning.patrolMassKilograms);
  assertPositive('collisionVelocityDampingPerSecond', tuning.collisionVelocityDampingPerSecond);
  assertPositive('angularVelocityDampingPerSecond', tuning.angularVelocityDampingPerSecond);
  assertPositive('laneRecoveryMetersPerSecond', tuning.laneRecoveryMetersPerSecond);
  assertPositive('headingRecoveryRadiansPerSecond', tuning.headingRecoveryRadiansPerSecond);
  assertPositiveInteger('solverIterations', tuning.solverIterations);
  assertNonNegative('plowImpactSpeedMetersPerSecond', tuning.plowImpactSpeedMetersPerSecond);
  assertNonNegative(
    'patrolDamageImpactSpeedMetersPerSecond',
    tuning.patrolDamageImpactSpeedMetersPerSecond
  );
  assertPositive('disabledLifetimeSeconds', tuning.disabledLifetimeSeconds);
  assertNonNegative('patrolFollowGapMeters', tuning.patrolFollowGapMeters);
  assertPositive('patrolDisengageSeconds', tuning.patrolDisengageSeconds);
  assertPositive(
    'patrolRetreatSpeedDeltaMetersPerSecond',
    tuning.patrolRetreatSpeedDeltaMetersPerSecond
  );
  assertPositive('laneChangeClearanceMeters', tuning.laneChangeClearanceMeters);
  assertPositive('laneChangeRetrySeconds', tuning.laneChangeRetrySeconds);
  validateRigidBodyResponseTuning(tuning.rigidBodyResponse);
}

function validateVehicle(vehicle: TrafficVehicle): void {
  assertNonNegativeInteger('vehicle.id', vehicle.id);
  assertTrafficKind(vehicle.kind);
  assertNonNegativeInteger('vehicle.laneIndex', vehicle.laneIndex);
  assertNonNegativeInteger('vehicle.targetLaneIndex', vehicle.targetLaneIndex);
  assertFinite('vehicle.lateralMeters', vehicle.lateralMeters);
  assertFinite('vehicle.distanceMeters', vehicle.distanceMeters);
  assertNonNegative('vehicle.speedMetersPerSecond', vehicle.speedMetersPerSecond);
  assertNonNegative('vehicle.laneChangeRemainingSeconds', vehicle.laneChangeRemainingSeconds);
  assertNonNegative('vehicle.laneChangeCooldownSeconds', vehicle.laneChangeCooldownSeconds);
  assertFinite('vehicle.headingRadians', vehicle.headingRadians);
  assertFinite('vehicle.angularVelocityRadiansPerSecond', vehicle.angularVelocityRadiansPerSecond);
  assertFinite(
    'vehicle.lateralCollisionVelocityMetersPerSecond',
    vehicle.lateralCollisionVelocityMetersPerSecond
  );
  assertFinite(
    'vehicle.distanceCollisionVelocityMetersPerSecond',
    vehicle.distanceCollisionVelocityMetersPerSecond
  );
  assertPositive('vehicle.massKilograms', vehicle.massKilograms);
  if (
    vehicle.status !== 'driving' &&
    vehicle.status !== 'disengaging' &&
    vehicle.status !== 'disabled'
  ) {
    throw new TypeError(`Unknown traffic vehicle status: ${String(vehicle.status)}`);
  }
  assertNonNegative('vehicle.disabledSecondsRemaining', vehicle.disabledSecondsRemaining);
  assertNonNegative(
    'vehicle.patrolDisengageSecondsRemaining',
    vehicle.patrolDisengageSecondsRemaining
  );
}

function assertTrafficKind(kind: TrafficVehicleKind): void {
  if (kind !== 'commuter' && kind !== 'patrol') {
    throw new TypeError(`Unknown traffic vehicle kind: ${String(kind)}`);
  }
}

function assertLaneIndex(laneIndex: number, laneCount: number): void {
  assertNonNegativeInteger('laneIndex', laneIndex);
  if (laneIndex >= laneCount)
    throw new RangeError(`laneIndex ${laneIndex} outside ${laneCount} lanes`);
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

function assertNonNegativeInteger(label: string, value: number): void {
  assertNonNegative(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
}

function assertPositiveInteger(label: string, value: number): void {
  assertPositive(label, value);
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer, got ${value}`);
  }
}

function moveToward(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) return target;
  return value + Math.sign(target - value) * maxDelta;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Small stateful facade over the same mulberry32 stream used by src/rng.ts. */
class RandomStream {
  state: number;

  constructor(state: number) {
    this.state = normalizeSeed(state);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  intRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  pick<T>(values: readonly T[]): T {
    return values[this.intRange(0, values.length)]!;
  }
}

function normalizeSeed(seed: number): number {
  assertFinite('seed', seed);
  return seed >>> 0;
}
