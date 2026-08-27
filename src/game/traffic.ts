import type { Road } from '/src/game/road.js';
import { routeToWorld, sampleRoute, worldToRoute, type RoutePosition } from '/src/game/route.js';
import {
  detectRigidBodyContact,
  resolveRigidBodyContact,
  validateRigidBodyResponseTuning,
  type RigidBody,
  type RigidBodyContact,
  type RigidBodyResponseTuning,
} from '/src/game/rigidBody.js';
import { getTruckTrailerCenter, type TruckFootprintDimensions } from '/src/game/roadCollision.js';
import type { TruckState } from '/src/game/truck.js';
import {
  createWorldVelocity,
  dotVelocityWithVector,
  headingToUnitVector,
  normalizeHeading,
  shortestHeadingDelta,
  validatePoint,
  velocityAlongHeading,
  type WorldPoint,
  type WorldVelocity,
} from '/src/game/worldGeometry.js';

export type TrafficVehicleKind = 'commuter' | 'patrol';
export type TrafficVehicleStatus = 'driving' | 'disabled';

/**
 * Per-step motion order for one patrol cruiser. Traffic owns no patrol
 * decisions: the encounter model chooses where the cruiser should be, and this
 * command is the only way it moves.
 */
export interface PatrolVehicleCommand {
  readonly vehicleId: number;
  readonly targetLateralMeters: number;
  readonly lateralRateMetersPerSecond: number;
  readonly targetSpeedMetersPerSecond: number;
  readonly targetHeadingOffsetRadians: number;
  readonly headingRateRadiansPerSecond: number;
}

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
  /** Cartesian pose used by rendering and rigid-body contacts. */
  readonly worldPosition: WorldPoint;
  readonly worldVelocity: WorldVelocity;
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
  readonly laneChangeDurationSeconds: number;
  readonly minLaneChangeCooldownSeconds: number;
  readonly maxLaneChangeCooldownSeconds: number;
  readonly spawnIntervalSeconds: number;
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
  /** Impact speed above which a cruiser contact is worth reporting. */
  readonly patrolContactImpactSpeedMetersPerSecond: number;
  readonly disabledLifetimeSeconds: number;
  readonly laneChangeClearanceMeters: number;
  readonly laneChangeRetrySeconds: number;
  readonly rigidBodyResponse: RigidBodyResponseTuning;
}

export type TrafficEvent =
  | { readonly kind: 'road-rage'; readonly vehicleId: number }
  | {
      readonly kind: 'patrol-contact';
      readonly vehicleId: number;
      readonly impactSpeedMetersPerSecond: number;
    };

export interface StepTrafficOptions {
  readonly state: TrafficState;
  readonly truck: TruckState;
  readonly road: Road;
  readonly truckDimensions: TruckFootprintDimensions;
  readonly dtSeconds: number;
  readonly truckRoutePosition?: RoutePosition;
  readonly tuning?: TrafficTuning;
  /** Motion order for the one cruiser an active encounter controls, if any. */
  readonly patrolCommand?: PatrolVehicleCommand;
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
  patrolAccelerationMetersPerSecondSquared: 6,
  patrolBrakingMetersPerSecondSquared: 12,
  laneChangeDurationSeconds: 1.25,
  minLaneChangeCooldownSeconds: 4,
  maxLaneChangeCooldownSeconds: 9,
  spawnIntervalSeconds: 3.5,
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
  patrolContactImpactSpeedMetersPerSecond: 2,
  disabledLifetimeSeconds: 0.8,
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
    worldPosition: { xMeters: lateralMeters, yMeters: options.distanceMeters },
    worldVelocity: velocityAlongHeading(0, options.speedMetersPerSecond),
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
  const truckRoutePosition =
    options.truckRoutePosition ?? projectTruckRoutePosition(options.road, options.truck);

  const moved = options.state.vehicles.map(vehicle =>
    stepVehicle(
      vehicle,
      options.state.vehicles,
      options.road,
      options.dtSeconds,
      tuning,
      rng,
      options.patrolCommand?.vehicleId === vehicle.id ? options.patrolCommand : null
    )
  );

  if (spawnCountdownSeconds <= 0) {
    const spawned = spawnCommuter(
      nextVehicleId,
      truckRoutePosition,
      moved,
      options.road,
      tuning,
      rng
    );
    if (spawned) {
      moved.push(spawned);
      nextVehicleId += 1;
    }
    spawnCountdownSeconds += tuning.spawnIntervalSeconds;
  }

  const inRange = moved.filter(vehicle => {
    const relativeDistance = vehicle.distanceMeters - truckRoutePosition.distanceAlongRouteMeters;
    const isActive =
      vehicle.status === 'driving' ||
      (vehicle.status === 'disabled' && vehicle.disabledSecondsRemaining > 0);
    if (!isActive) return false;
    // A cruiser belongs to its encounter, which removes it explicitly. Culling
    // one by distance would delete a pursuit the encounter still owns.
    if (vehicle.kind === 'patrol') return true;
    return (
      relativeDistance >= -tuning.cullBehindMeters && relativeDistance <= tuning.cullAheadMeters
    );
  });
  const collisionResult = resolveWorldContacts({
    truck: options.truck,
    vehicles: inRange,
    road: options.road,
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
  road: Road,
  dtSeconds: number,
  tuning: TrafficTuning,
  rng: RandomStream,
  patrolCommand: PatrolVehicleCommand | null
): TrafficVehicle {
  const collisionDamping = Math.exp(-tuning.collisionVelocityDampingPerSecond * dtSeconds);
  const angularDamping = Math.exp(-tuning.angularVelocityDampingPerSecond * dtSeconds);
  const collisionMotion = {
    lateralMeters: vehicle.lateralCollisionVelocityMetersPerSecond * dtSeconds,
    distanceMeters: vehicle.distanceCollisionVelocityMetersPerSecond * dtSeconds,
  };
  const routeSample = sampleRoute(road.route, vehicle.distanceMeters);
  const headingOffsetRadians = shortestHeadingDelta(
    vehicle.headingRadians,
    routeSample.headingRadians
  );

  if (vehicle.status === 'disabled') {
    const position = vehicle.worldPosition;
    const velocity = vehicle.worldVelocity;
    return {
      ...vehicle,
      worldPosition: {
        xMeters: position.xMeters + velocity.xMetersPerSecond * dtSeconds,
        yMeters: position.yMeters + velocity.yMetersPerSecond * dtSeconds,
      },
      worldVelocity: createWorldVelocity(
        velocity.xMetersPerSecond * collisionDamping,
        velocity.yMetersPerSecond * collisionDamping
      ),
      headingRadians: normalizeHeading(
        vehicle.headingRadians + vehicle.angularVelocityRadiansPerSecond * dtSeconds
      ),
      angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond * angularDamping,
      lateralCollisionVelocityMetersPerSecond:
        vehicle.lateralCollisionVelocityMetersPerSecond * collisionDamping,
      distanceCollisionVelocityMetersPerSecond:
        vehicle.distanceCollisionVelocityMetersPerSecond * collisionDamping,
      disabledSecondsRemaining: Math.max(0, vehicle.disabledSecondsRemaining - dtSeconds),
    };
  }

  if (vehicle.kind === 'patrol') {
    // Without a command the cruiser holds whatever pose its encounter left it
    // in, which is how a posted trap stays parked in its apron.
    const targetLateral = patrolCommand?.targetLateralMeters ?? vehicle.lateralMeters;
    const lateralRate = patrolCommand?.lateralRateMetersPerSecond ?? 0;
    const targetSpeed = patrolCommand?.targetSpeedMetersPerSecond ?? vehicle.speedMetersPerSecond;
    const targetHeadingOffset = patrolCommand?.targetHeadingOffsetRadians ?? headingOffsetRadians;
    const headingRate = patrolCommand?.headingRateRadiansPerSecond ?? 0;
    const acceleration =
      targetSpeed < vehicle.speedMetersPerSecond
        ? tuning.patrolBrakingMetersPerSecondSquared
        : tuning.patrolAccelerationMetersPerSecondSquared;
    const speed = moveToward(vehicle.speedMetersPerSecond, targetSpeed, acceleration * dtSeconds);
    return finalizeRouteVehicle(
      {
        ...vehicle,
        targetLaneIndex: nearestLaneIndex(road, targetLateral),
        laneIndex: nearestLaneIndex(road, vehicle.lateralMeters),
        lateralMeters:
          moveToward(vehicle.lateralMeters, targetLateral, lateralRate * dtSeconds) +
          collisionMotion.lateralMeters,
        distanceMeters:
          vehicle.distanceMeters +
          (speed + vehicle.distanceCollisionVelocityMetersPerSecond) * dtSeconds,
        speedMetersPerSecond: speed,
        headingRadians:
          moveToward(headingOffsetRadians, targetHeadingOffset, headingRate * dtSeconds) +
          vehicle.angularVelocityRadiansPerSecond * dtSeconds,
        angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond * angularDamping,
        lateralCollisionVelocityMetersPerSecond:
          vehicle.lateralCollisionVelocityMetersPerSecond * collisionDamping,
        distanceCollisionVelocityMetersPerSecond:
          vehicle.distanceCollisionVelocityMetersPerSecond * collisionDamping,
      },
      road
    );
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
  return finalizeRouteVehicle(
    {
      ...next,
      lateralMeters: laneCenteredLateralMeters + collisionMotion.lateralMeters,
      distanceMeters:
        next.distanceMeters +
        (next.speedMetersPerSecond + next.distanceCollisionVelocityMetersPerSecond) * dtSeconds,
      headingRadians:
        moveToward(headingOffsetRadians, 0, tuning.headingRecoveryRadiansPerSecond * dtSeconds) +
        next.angularVelocityRadiansPerSecond * dtSeconds,
      angularVelocityRadiansPerSecond: next.angularVelocityRadiansPerSecond * angularDamping,
      lateralCollisionVelocityMetersPerSecond:
        next.lateralCollisionVelocityMetersPerSecond * collisionDamping,
      distanceCollisionVelocityMetersPerSecond:
        next.distanceCollisionVelocityMetersPerSecond * collisionDamping,
    },
    road
  );
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

/** Ambient traffic is commuters only; cruisers exist because an encounter posts one. */
function spawnCommuter(
  id: number,
  truckRoutePosition: RoutePosition,
  vehicles: readonly TrafficVehicle[],
  road: Road,
  tuning: TrafficTuning,
  rng: RandomStream
): TrafficVehicle | null {
  const ahead =
    tuning.spawnAheadMinMeters +
    rng.next() * (tuning.spawnAheadMaxMeters - tuning.spawnAheadMinMeters);
  const distanceMeters = truckRoutePosition.distanceAlongRouteMeters + ahead;
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
    tuning.commuterMinSpeedMetersPerSecond +
    rng.next() * (tuning.commuterMaxSpeedMetersPerSecond - tuning.commuterMinSpeedMetersPerSecond);
  const initial = createTrafficVehicle({
    id,
    kind: 'commuter',
    laneIndex,
    distanceMeters,
    speedMetersPerSecond: speed,
    laneChangeCooldownSeconds:
      tuning.minLaneChangeCooldownSeconds +
      rng.next() * (tuning.maxLaneChangeCooldownSeconds - tuning.minLaneChangeCooldownSeconds),
  });
  return finalizeRouteVehicle(
    {
      ...initial,
      lateralMeters: road.laneCenterOffsetsMeters[laneIndex]!,
      massKilograms: tuning.commuterMassKilograms,
    },
    road
  );
}

export interface AddPatrolCruiserOptions {
  readonly distanceMeters: number;
  readonly lateralMeters: number;
  readonly speedMetersPerSecond: number;
  readonly headingOffsetRadians?: number;
  readonly road: Road;
  readonly tuning?: TrafficTuning;
}

export interface AddPatrolCruiserResult {
  readonly state: TrafficState;
  readonly vehicleId: number;
}

/** Put one encounter-owned cruiser on the road at an explicit route pose. */
export function addPatrolCruiser(
  state: TrafficState,
  options: AddPatrolCruiserOptions
): AddPatrolCruiserResult {
  const tuning = options.tuning ?? DEFAULT_TRAFFIC_TUNING;
  validateTuning(tuning);
  assertFinite('distanceMeters', options.distanceMeters);
  assertFinite('lateralMeters', options.lateralMeters);
  assertNonNegative('speedMetersPerSecond', options.speedMetersPerSecond);
  const headingOffsetRadians = options.headingOffsetRadians ?? 0;
  assertFinite('headingOffsetRadians', headingOffsetRadians);
  // Several cruisers may exist at once — a posted trap can stay parked while a
  // Road Rage response pursues. Only one may be *enforcing*, which the patrol
  // encounter model guarantees; traffic stays a generic vehicle simulation.
  const laneIndex = nearestLaneIndex(options.road, options.lateralMeters);
  const initial = createTrafficVehicle({
    id: state.nextVehicleId,
    kind: 'patrol',
    laneIndex,
    distanceMeters: options.distanceMeters,
    speedMetersPerSecond: options.speedMetersPerSecond,
  });
  const cruiser = finalizeRouteVehicle(
    {
      ...initial,
      lateralMeters: options.lateralMeters,
      headingRadians: headingOffsetRadians,
      massKilograms: tuning.patrolMassKilograms,
    },
    options.road
  );

  return {
    state: {
      ...state,
      vehicles: [...state.vehicles, cruiser],
      nextVehicleId: state.nextVehicleId + 1,
    },
    vehicleId: cruiser.id,
  };
}

export interface StagePatrolCruiserOptions {
  readonly distanceMeters: number;
  readonly speedMetersPerSecond: number;
  readonly road: Road;
}

/**
 * Perform the pursuit's one hidden continuity cheat. The cruiser keeps its
 * lateral pull-out pose and heading offset, but sheds collision impulses so it
 * resumes from the staged route position with the requested approach speed.
 */
export function stagePatrolCruiser(
  state: TrafficState,
  vehicleId: number,
  options: StagePatrolCruiserOptions
): TrafficState {
  assertNonNegativeInteger('vehicleId', vehicleId);
  assertFinite('distanceMeters', options.distanceMeters);
  assertNonNegative('speedMetersPerSecond', options.speedMetersPerSecond);
  const cruiser = state.vehicles.find(vehicle => vehicle.id === vehicleId);
  if (cruiser?.kind !== 'patrol') {
    throw new RangeError(`patrol cruiser ${vehicleId} does not exist`);
  }
  const routeHeadingRadians = sampleRoute(
    options.road.route,
    cruiser.distanceMeters
  ).headingRadians;
  const headingOffsetRadians = shortestHeadingDelta(cruiser.headingRadians, routeHeadingRadians);
  const staged = finalizeRouteVehicle(
    {
      ...cruiser,
      distanceMeters: options.distanceMeters,
      speedMetersPerSecond: options.speedMetersPerSecond,
      headingRadians: headingOffsetRadians,
      angularVelocityRadiansPerSecond: 0,
      lateralCollisionVelocityMetersPerSecond: 0,
      distanceCollisionVelocityMetersPerSecond: 0,
    },
    options.road
  );

  return {
    ...state,
    vehicles: state.vehicles.map(vehicle => (vehicle.id === vehicleId ? staged : vehicle)),
  };
}

/** Take an encounter's cruiser off the road once it has resolved. */
export function removeTrafficVehicle(state: TrafficState, vehicleId: number): TrafficState {
  assertNonNegativeInteger('vehicleId', vehicleId);
  return { ...state, vehicles: state.vehicles.filter(vehicle => vehicle.id !== vehicleId) };
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
  readonly road: Road;
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
      vehicles[index] = applyResolvedVehicleBody(vehicle, response.bodyB, options.road);
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
        vehicles[firstIndex] = applyResolvedVehicleBody(first, response.bodyA, options.road);
        vehicles[secondIndex] = applyResolvedVehicleBody(second, response.bodyB, options.road);
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
  const trailerCenter = getTruckTrailerCenter(truck, dimensions);
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
    position: vehicle.worldPosition,
    velocity: vehicle.worldVelocity,
    headingRadians: vehicle.headingRadians,
    angularVelocityRadiansPerSecond: vehicle.angularVelocityRadiansPerSecond,
    widthMeters,
    lengthMeters,
    massKilograms: vehicle.massKilograms,
  };
}

function applyResolvedVehicleBody(
  vehicle: TrafficVehicle,
  body: RigidBody,
  road: Road
): TrafficVehicle {
  if (vehicle.status === 'disabled') {
    return {
      ...vehicle,
      worldPosition: body.position,
      worldVelocity: body.velocity,
      headingRadians: body.headingRadians,
      angularVelocityRadiansPerSecond: body.angularVelocityRadiansPerSecond,
    };
  }
  const projection = worldToRoute(road.route, body.position, {
    hintDistanceAlongRouteMeters: vehicle.distanceMeters,
    searchRadiusMeters: 100,
  });
  const tangent = projection.tangent;
  const normal = projection.normal;
  const forwardRouteSpeed = dotVelocityWithVector(body.velocity, tangent);
  const lateralRouteSpeed = dotVelocityWithVector(body.velocity, normal);
  return {
    ...vehicle,
    lateralMeters: projection.lateralOffsetMeters,
    distanceMeters: projection.distanceAlongRouteMeters,
    headingRadians: body.headingRadians,
    angularVelocityRadiansPerSecond: body.angularVelocityRadiansPerSecond,
    lateralCollisionVelocityMetersPerSecond: lateralRouteSpeed,
    distanceCollisionVelocityMetersPerSecond: forwardRouteSpeed - vehicle.speedMetersPerSecond,
    worldPosition: body.position,
    worldVelocity: body.velocity,
  };
}

function finalizeRouteVehicle(vehicle: TrafficVehicle, road: Road): TrafficVehicle {
  const sample = sampleRoute(road.route, vehicle.distanceMeters);
  const position = routeToWorld(road.route, {
    distanceAlongRouteMeters: vehicle.distanceMeters,
    lateralOffsetMeters: vehicle.lateralMeters,
  });
  const headingRadians = normalizeHeading(sample.headingRadians + vehicle.headingRadians);
  const tangent = sample.tangent;
  const normal = sample.normal;
  const forwardSpeed =
    vehicle.speedMetersPerSecond + vehicle.distanceCollisionVelocityMetersPerSecond;
  return {
    ...vehicle,
    headingRadians,
    worldPosition: position,
    worldVelocity: createWorldVelocity(
      tangent.xMeters * forwardSpeed +
        normal.xMeters * vehicle.lateralCollisionVelocityMetersPerSecond,
      tangent.yMeters * forwardSpeed +
        normal.yMeters * vehicle.lateralCollisionVelocityMetersPerSecond
    ),
  };
}

function projectTruckRoutePosition(road: Road, truck: TruckState): RoutePosition {
  const projection = worldToRoute(road.route, truck.position, {
    hintDistanceAlongRouteMeters: truck.position.yMeters - road.route.segments[0]!.start.yMeters,
    searchRadiusMeters: 100,
  });
  return {
    distanceAlongRouteMeters: projection.distanceAlongRouteMeters,
    lateralOffsetMeters: projection.lateralOffsetMeters,
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

    // A cruiser contact is only reported. Whether it counts as a committed
    // patrol hit, and what it costs, belongs to the encounter model.
    if (
      vehicle.kind === 'patrol' &&
      vehicle.status === 'driving' &&
      impactSpeed >= options.tuning.patrolContactImpactSpeedMetersPerSecond &&
      (contactCooldowns[String(vehicle.id)] ?? 0) === 0
    ) {
      contactCooldowns[String(vehicle.id)] = options.tuning.contactCooldownSeconds;
      events.push({
        kind: 'patrol-contact',
        vehicleId: vehicle.id,
        impactSpeedMetersPerSecond: impactSpeed,
      });
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
  assertPositive('laneChangeDurationSeconds', tuning.laneChangeDurationSeconds);
  assertNonNegative('minLaneChangeCooldownSeconds', tuning.minLaneChangeCooldownSeconds);
  assertNonNegative('maxLaneChangeCooldownSeconds', tuning.maxLaneChangeCooldownSeconds);
  if (tuning.maxLaneChangeCooldownSeconds < tuning.minLaneChangeCooldownSeconds) {
    throw new RangeError('maxLaneChangeCooldownSeconds must be >= minLaneChangeCooldownSeconds');
  }
  assertPositive('spawnIntervalSeconds', tuning.spawnIntervalSeconds);
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
    'patrolContactImpactSpeedMetersPerSecond',
    tuning.patrolContactImpactSpeedMetersPerSecond
  );
  assertPositive('disabledLifetimeSeconds', tuning.disabledLifetimeSeconds);
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
  if (vehicle.status !== 'driving' && vehicle.status !== 'disabled') {
    throw new TypeError(`Unknown traffic vehicle status: ${String(vehicle.status)}`);
  }
  assertNonNegative('vehicle.disabledSecondsRemaining', vehicle.disabledSecondsRemaining);
  validatePoint('vehicle.worldPosition', vehicle.worldPosition);
  assertFinite('vehicle.worldVelocity.xMetersPerSecond', vehicle.worldVelocity.xMetersPerSecond);
  assertFinite('vehicle.worldVelocity.yMetersPerSecond', vehicle.worldVelocity.yMetersPerSecond);
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
