import type { Road } from '/src/game/road.js';
import type { TruckFootprintDimensions } from '/src/game/roadCollision.js';
import type { TruckState } from '/src/game/truck.js';

export type TrafficVehicleKind = 'commuter' | 'patrol';
export type TrafficVehicleStatus = 'driving' | 'disengaging' | 'disabled';

export interface PhysicsVector {
  readonly lateralMeters: number;
  readonly distanceMeters: number;
}

export interface PhysicsVelocity {
  readonly lateralMetersPerSecond: number;
  readonly distanceMetersPerSecond: number;
}

export interface RigidBody {
  readonly id: string;
  readonly position: PhysicsVector;
  readonly velocity: PhysicsVelocity;
  readonly headingRadians: number;
  readonly angularVelocityRadiansPerSecond: number;
  readonly widthMeters: number;
  readonly lengthMeters: number;
  readonly massKilograms: number;
}

export interface RigidBodyContact {
  readonly normal: PhysicsVector;
  readonly penetrationMeters: number;
  readonly point: PhysicsVector;
}

export interface RigidBodyResponseTuning {
  readonly restitution: number;
  readonly friction: number;
  readonly positionalCorrection: number;
  readonly penetrationSlopMeters: number;
}

export interface RigidBodyResponse {
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly normalImpulse: number;
  readonly impactSpeedMetersPerSecond: number;
}

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
    const relativeDistance = vehicle.distanceMeters - options.truck.position.distanceMeters;
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
      isDisengaging ? vehicle.lateralMeters : truck.position.lateralMeters
    );
    const targetLateral = road.laneCenterOffsetsMeters[targetLaneIndex]!;
    const trailerRearDistanceMeters =
      truck.position.distanceMeters -
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
  const distanceMeters = truck.position.distanceMeters + (kind === 'patrol' ? -30 : ahead);
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
    lateralMeters:
      truck.position.lateralMeters - Math.sin(truck.trailerHeadingRadians) * hitchLengthMeters,
    distanceMeters:
      truck.position.distanceMeters - Math.cos(truck.trailerHeadingRadians) * hitchLengthMeters,
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
      lateralMeters: vehicle.lateralMeters,
      distanceMeters: vehicle.distanceMeters,
    },
    velocity: {
      lateralMetersPerSecond: vehicle.lateralCollisionVelocityMetersPerSecond,
      distanceMetersPerSecond:
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
    lateralMeters: body.position.lateralMeters,
    distanceMeters: body.position.distanceMeters,
    headingRadians: body.headingRadians,
    angularVelocityRadiansPerSecond: body.angularVelocityRadiansPerSecond,
    lateralCollisionVelocityMetersPerSecond: body.velocity.lateralMetersPerSecond,
    distanceCollisionVelocityMetersPerSecond:
      body.velocity.distanceMetersPerSecond - vehicle.speedMetersPerSecond,
  };
}

function applyResolvedTruckBody(
  truck: TruckState,
  originalBody: RigidBody,
  resolvedBody: RigidBody
): TruckState {
  const positionDelta = {
    lateralMeters: resolvedBody.position.lateralMeters - originalBody.position.lateralMeters,
    distanceMeters: resolvedBody.position.distanceMeters - originalBody.position.distanceMeters,
  };
  const forward = velocityAlongHeading(truck.headingRadians, 1);
  const resolvedForwardSpeed = Math.max(0, dotVelocity(resolvedBody.velocity, forward));
  return {
    ...truck,
    position: {
      lateralMeters: truck.position.lateralMeters + positionDelta.lateralMeters,
      distanceMeters: truck.position.distanceMeters + positionDelta.distanceMeters,
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

export function detectRigidBodyContact(
  bodyA: RigidBody,
  bodyB: RigidBody
): RigidBodyContact | null {
  validateRigidBody(bodyA);
  validateRigidBody(bodyB);
  const axes = [...bodyAxes(bodyA), ...bodyAxes(bodyB)];
  const centerDelta = subtractVectors(bodyB.position, bodyA.position);
  let minimumOverlap = Number.POSITIVE_INFINITY;
  let minimumAxis: PhysicsVector | null = null;

  for (const axis of axes) {
    const projectionA = projectBody(bodyA, axis);
    const projectionB = projectBody(bodyB, axis);
    const overlap =
      Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
    if (overlap <= 1e-10) return null;
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumAxis = dotVector(centerDelta, axis) < 0 ? scaleVector(axis, -1) : axis;
    }
  }

  if (!minimumAxis) return null;
  const supportA = supportPoint(bodyA, minimumAxis);
  const supportB = supportPoint(bodyB, scaleVector(minimumAxis, -1));
  return {
    normal: minimumAxis,
    penetrationMeters: minimumOverlap,
    point: scaleVector(addVectors(supportA, supportB), 0.5),
  };
}

export function resolveRigidBodyContact(
  bodyA: RigidBody,
  bodyB: RigidBody,
  contact: RigidBodyContact,
  tuning: RigidBodyResponseTuning
): RigidBodyResponse {
  validateRigidBody(bodyA);
  validateRigidBody(bodyB);
  validateRigidBodyContact(contact);
  validateRigidBodyResponseTuning(tuning);
  const inverseMassA = 1 / bodyA.massKilograms;
  const inverseMassB = 1 / bodyB.massKilograms;
  const inverseMassSum = inverseMassA + inverseMassB;
  const separationMeters =
    Math.max(0, contact.penetrationMeters - tuning.penetrationSlopMeters) *
      tuning.positionalCorrection +
    1e-9;
  const correction = scaleVector(contact.normal, separationMeters / inverseMassSum);
  let resolvedA: RigidBody = {
    ...bodyA,
    position: subtractVectors(bodyA.position, scaleVector(correction, inverseMassA)),
    velocity: { ...bodyA.velocity },
  };
  let resolvedB: RigidBody = {
    ...bodyB,
    position: addVectors(bodyB.position, scaleVector(correction, inverseMassB)),
    velocity: { ...bodyB.velocity },
  };

  const armA = subtractVectors(contact.point, bodyA.position);
  const armB = subtractVectors(contact.point, bodyB.position);
  const contactVelocityA = addVelocities(
    resolvedA.velocity,
    angularVelocityAtPoint(resolvedA.angularVelocityRadiansPerSecond, armA)
  );
  const contactVelocityB = addVelocities(
    resolvedB.velocity,
    angularVelocityAtPoint(resolvedB.angularVelocityRadiansPerSecond, armB)
  );
  const relativeVelocity = subtractVelocities(contactVelocityB, contactVelocityA);
  const velocityAlongNormal = dotVelocity(relativeVelocity, contact.normal);
  const impactSpeedMetersPerSecond = Math.max(0, -velocityAlongNormal);
  let normalImpulse = 0;

  if (velocityAlongNormal < 0) {
    const inverseInertiaA = 1 / rectangleInertia(bodyA);
    const inverseInertiaB = 1 / rectangleInertia(bodyB);
    const armNormalA = clockwiseCross(armA, contact.normal);
    const armNormalB = clockwiseCross(armB, contact.normal);
    const normalDenominator =
      inverseMassSum +
      armNormalA * armNormalA * inverseInertiaA +
      armNormalB * armNormalB * inverseInertiaB;
    normalImpulse = (-(1 + tuning.restitution) * velocityAlongNormal) / normalDenominator;
    const impulse = scaleVector(contact.normal, normalImpulse);
    resolvedA = applyImpulse(resolvedA, scaleVector(impulse, -1), armA);
    resolvedB = applyImpulse(resolvedB, impulse, armB);

    const postNormalRelativeVelocity = subtractVelocities(
      addVelocities(
        resolvedB.velocity,
        angularVelocityAtPoint(resolvedB.angularVelocityRadiansPerSecond, armB)
      ),
      addVelocities(
        resolvedA.velocity,
        angularVelocityAtPoint(resolvedA.angularVelocityRadiansPerSecond, armA)
      )
    );
    const normalVelocity = dotVelocity(postNormalRelativeVelocity, contact.normal);
    const tangentUnnormalized: PhysicsVelocity = {
      lateralMetersPerSecond:
        postNormalRelativeVelocity.lateralMetersPerSecond -
        contact.normal.lateralMeters * normalVelocity,
      distanceMetersPerSecond:
        postNormalRelativeVelocity.distanceMetersPerSecond -
        contact.normal.distanceMeters * normalVelocity,
    };
    const tangentLength = Math.hypot(
      tangentUnnormalized.lateralMetersPerSecond,
      tangentUnnormalized.distanceMetersPerSecond
    );
    if (tangentLength > 1e-10) {
      const tangent: PhysicsVector = {
        lateralMeters: tangentUnnormalized.lateralMetersPerSecond / tangentLength,
        distanceMeters: tangentUnnormalized.distanceMetersPerSecond / tangentLength,
      };
      const armTangentA = clockwiseCross(armA, tangent);
      const armTangentB = clockwiseCross(armB, tangent);
      const tangentDenominator =
        inverseMassSum +
        armTangentA * armTangentA * inverseInertiaA +
        armTangentB * armTangentB * inverseInertiaB;
      const rawFrictionImpulse =
        -dotVelocity(postNormalRelativeVelocity, tangent) / tangentDenominator;
      const frictionImpulse = clamp(
        rawFrictionImpulse,
        -normalImpulse * tuning.friction,
        normalImpulse * tuning.friction
      );
      const tangentImpulse = scaleVector(tangent, frictionImpulse);
      resolvedA = applyImpulse(resolvedA, scaleVector(tangentImpulse, -1), armA);
      resolvedB = applyImpulse(resolvedB, tangentImpulse, armB);
    }
  }

  return {
    bodyA: resolvedA,
    bodyB: resolvedB,
    normalImpulse,
    impactSpeedMetersPerSecond,
  };
}

function applyImpulse(
  body: RigidBody,
  impulse: PhysicsVector,
  contactArm: PhysicsVector
): RigidBody {
  const inverseMass = 1 / body.massKilograms;
  const inverseInertia = 1 / rectangleInertia(body);
  return {
    ...body,
    velocity: {
      lateralMetersPerSecond:
        body.velocity.lateralMetersPerSecond + impulse.lateralMeters * inverseMass,
      distanceMetersPerSecond:
        body.velocity.distanceMetersPerSecond + impulse.distanceMeters * inverseMass,
    },
    angularVelocityRadiansPerSecond:
      body.angularVelocityRadiansPerSecond + clockwiseCross(contactArm, impulse) * inverseInertia,
  };
}

function rectangleInertia(body: RigidBody): number {
  return (
    (body.massKilograms *
      (body.widthMeters * body.widthMeters + body.lengthMeters * body.lengthMeters)) /
    12
  );
}

function bodyAxes(body: RigidBody): readonly [PhysicsVector, PhysicsVector] {
  const sin = Math.sin(body.headingRadians);
  const cos = Math.cos(body.headingRadians);
  return [
    { lateralMeters: cos, distanceMeters: -sin },
    { lateralMeters: sin, distanceMeters: cos },
  ];
}

function projectBody(
  body: RigidBody,
  axis: PhysicsVector
): { readonly min: number; readonly max: number } {
  const [widthAxis, lengthAxis] = bodyAxes(body);
  const center = dotVector(body.position, axis);
  const radius =
    Math.abs(dotVector(widthAxis, axis)) * (body.widthMeters / 2) +
    Math.abs(dotVector(lengthAxis, axis)) * (body.lengthMeters / 2);
  return { min: center - radius, max: center + radius };
}

function supportPoint(body: RigidBody, direction: PhysicsVector): PhysicsVector {
  const [widthAxis, lengthAxis] = bodyAxes(body);
  return addVectors(
    body.position,
    addVectors(
      scaleVector(widthAxis, Math.sign(dotVector(widthAxis, direction)) * (body.widthMeters / 2)),
      scaleVector(lengthAxis, Math.sign(dotVector(lengthAxis, direction)) * (body.lengthMeters / 2))
    )
  );
}

function velocityAlongHeading(
  headingRadians: number,
  speedMetersPerSecond: number
): PhysicsVelocity {
  return {
    lateralMetersPerSecond: Math.sin(headingRadians) * speedMetersPerSecond,
    distanceMetersPerSecond: Math.cos(headingRadians) * speedMetersPerSecond,
  };
}

function angularVelocityAtPoint(
  angularVelocityRadiansPerSecond: number,
  arm: PhysicsVector
): PhysicsVelocity {
  return {
    lateralMetersPerSecond: angularVelocityRadiansPerSecond * arm.distanceMeters,
    distanceMetersPerSecond: -angularVelocityRadiansPerSecond * arm.lateralMeters,
  };
}

function addVectors(a: PhysicsVector, b: PhysicsVector): PhysicsVector {
  return {
    lateralMeters: a.lateralMeters + b.lateralMeters,
    distanceMeters: a.distanceMeters + b.distanceMeters,
  };
}

function subtractVectors(a: PhysicsVector, b: PhysicsVector): PhysicsVector {
  return {
    lateralMeters: a.lateralMeters - b.lateralMeters,
    distanceMeters: a.distanceMeters - b.distanceMeters,
  };
}

function scaleVector(vector: PhysicsVector, scale: number): PhysicsVector {
  return {
    lateralMeters: vector.lateralMeters * scale,
    distanceMeters: vector.distanceMeters * scale,
  };
}

function addVelocities(a: PhysicsVelocity, b: PhysicsVelocity): PhysicsVelocity {
  return {
    lateralMetersPerSecond: a.lateralMetersPerSecond + b.lateralMetersPerSecond,
    distanceMetersPerSecond: a.distanceMetersPerSecond + b.distanceMetersPerSecond,
  };
}

function subtractVelocities(a: PhysicsVelocity, b: PhysicsVelocity): PhysicsVelocity {
  return {
    lateralMetersPerSecond: a.lateralMetersPerSecond - b.lateralMetersPerSecond,
    distanceMetersPerSecond: a.distanceMetersPerSecond - b.distanceMetersPerSecond,
  };
}

function dotVector(a: PhysicsVector, b: PhysicsVector): number {
  return a.lateralMeters * b.lateralMeters + a.distanceMeters * b.distanceMeters;
}

function dotVelocity(velocity: PhysicsVelocity, vector: PhysicsVector | PhysicsVelocity): number {
  const lateral = 'lateralMeters' in vector ? vector.lateralMeters : vector.lateralMetersPerSecond;
  const distance =
    'distanceMeters' in vector ? vector.distanceMeters : vector.distanceMetersPerSecond;
  return velocity.lateralMetersPerSecond * lateral + velocity.distanceMetersPerSecond * distance;
}

function clockwiseCross(a: PhysicsVector, b: PhysicsVector): number {
  return a.distanceMeters * b.lateralMeters - a.lateralMeters * b.distanceMeters;
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

function validateRigidBody(body: RigidBody): void {
  if (typeof body !== 'object' || body === null) {
    throw new TypeError('RigidBody must be an object');
  }
  if (typeof body.id !== 'string' || body.id.length === 0) {
    throw new TypeError('RigidBody.id must be a non-empty string');
  }
  assertFinite('body.position.lateralMeters', body.position.lateralMeters);
  assertFinite('body.position.distanceMeters', body.position.distanceMeters);
  assertFinite('body.velocity.lateralMetersPerSecond', body.velocity.lateralMetersPerSecond);
  assertFinite('body.velocity.distanceMetersPerSecond', body.velocity.distanceMetersPerSecond);
  assertFinite('body.headingRadians', body.headingRadians);
  assertFinite('body.angularVelocityRadiansPerSecond', body.angularVelocityRadiansPerSecond);
  assertPositive('body.widthMeters', body.widthMeters);
  assertPositive('body.lengthMeters', body.lengthMeters);
  assertPositive('body.massKilograms', body.massKilograms);
}

function validateRigidBodyContact(contact: RigidBodyContact): void {
  if (typeof contact !== 'object' || contact === null) {
    throw new TypeError('RigidBodyContact must be an object');
  }
  assertFinite('contact.normal.lateralMeters', contact.normal.lateralMeters);
  assertFinite('contact.normal.distanceMeters', contact.normal.distanceMeters);
  const normalLength = Math.hypot(contact.normal.lateralMeters, contact.normal.distanceMeters);
  if (Math.abs(normalLength - 1) > 1e-9) {
    throw new RangeError(`contact normal must be normalized, got ${normalLength}`);
  }
  assertPositive('contact.penetrationMeters', contact.penetrationMeters);
  assertFinite('contact.point.lateralMeters', contact.point.lateralMeters);
  assertFinite('contact.point.distanceMeters', contact.point.distanceMeters);
}

function validateRigidBodyResponseTuning(tuning: RigidBodyResponseTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('RigidBodyResponseTuning must be an object');
  }
  assertRange('restitution', tuning.restitution, 0, 1);
  assertRange('friction', tuning.friction, 0, 1);
  assertRange('positionalCorrection', tuning.positionalCorrection, 0, 1);
  assertNonNegative('penetrationSlopMeters', tuning.penetrationSlopMeters);
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
