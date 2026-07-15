import type { Road } from '/src/game/road.js';
import type { TruckImpact, TruckState } from '/src/game/truck.js';

export type BarrierSide = 'left' | 'right';

export interface TruckFootprintDimensions {
  readonly cabWidthMeters: number;
  readonly cabLengthMeters: number;
  readonly trailerWidthMeters: number;
  readonly trailerLengthMeters: number;
  readonly hitchGapMeters: number;
}

export interface WorldAabb {
  readonly minLateralMeters: number;
  readonly maxLateralMeters: number;
  readonly minDistanceMeters: number;
  readonly maxDistanceMeters: number;
}

export interface RoadBarrierImpact {
  readonly kind: 'barrier';
  readonly side: BarrierSide;
  readonly penetrationMeters: number;
  readonly minDistanceMeters: number;
  readonly maxDistanceMeters: number;
}

export interface RoadCollisionTuning {
  readonly cargoDamagePerBarrierHit: number;
  readonly barrierDamageCooldownSeconds: number;
}

export interface BarrierContactState {
  readonly cooldownRemainingSeconds: number;
}

export interface ResolveRoadBarrierContactOptions {
  readonly truck: TruckState;
  readonly impact: RoadBarrierImpact | null;
  readonly contactState: BarrierContactState;
  readonly dtSeconds: number;
  readonly tuning: RoadCollisionTuning;
  readonly resolveImpact: (state: TruckState, impact: TruckImpact) => TruckState;
}

export interface RoadBarrierContactResult {
  readonly truck: TruckState;
  readonly contactState: BarrierContactState;
  readonly didDamageCargo: boolean;
}

export const DEFAULT_ROAD_COLLISION_TUNING: RoadCollisionTuning = Object.freeze({
  cargoDamagePerBarrierHit: 0.08,
  barrierDamageCooldownSeconds: 0.5,
});

export function buildTruckFootprint(
  truck: TruckState,
  dimensions: TruckFootprintDimensions
): readonly [WorldAabb, WorldAabb] {
  validateTruck(truck);
  validateDimensions(dimensions);

  const hitchLengthMeters =
    dimensions.cabLengthMeters / 2 + dimensions.trailerLengthMeters / 2 + dimensions.hitchGapMeters;
  const trailerCenter = {
    lateralMeters:
      truck.position.lateralMeters - Math.sin(truck.trailerHeadingRadians) * hitchLengthMeters,
    distanceMeters:
      truck.position.distanceMeters - Math.cos(truck.trailerHeadingRadians) * hitchLengthMeters,
  };

  return [
    orientedRectAabb(
      truck.position,
      truck.headingRadians,
      dimensions.cabWidthMeters,
      dimensions.cabLengthMeters
    ),
    orientedRectAabb(
      trailerCenter,
      truck.trailerHeadingRadians,
      dimensions.trailerWidthMeters,
      dimensions.trailerLengthMeters
    ),
  ];
}

export function detectRoadBarrierImpact(
  road: Road,
  footprint: WorldAabb | readonly WorldAabb[]
): RoadBarrierImpact | null {
  validateRoad(road);
  const boxes = Array.isArray(footprint) ? footprint : [footprint];

  let strongest: RoadBarrierImpact | null = null;
  for (const box of boxes) {
    validateAabb(box);
    const leftPenetration = road.leftBarrierLateralMeters - box.minLateralMeters;
    const rightPenetration = box.maxLateralMeters - road.rightBarrierLateralMeters;

    if (leftPenetration > 0) {
      strongest = strongerImpact(strongest, {
        kind: 'barrier',
        side: 'left',
        penetrationMeters: leftPenetration,
        minDistanceMeters: box.minDistanceMeters,
        maxDistanceMeters: box.maxDistanceMeters,
      });
    }
    if (rightPenetration > 0) {
      strongest = strongerImpact(strongest, {
        kind: 'barrier',
        side: 'right',
        penetrationMeters: rightPenetration,
        minDistanceMeters: box.minDistanceMeters,
        maxDistanceMeters: box.maxDistanceMeters,
      });
    }
  }

  return strongest;
}

export function resolveRoadBarrierContact(
  options: ResolveRoadBarrierContactOptions
): RoadBarrierContactResult {
  validateTruck(options.truck);
  validateContactState(options.contactState);
  validateCollisionTuning(options.tuning);
  assertFinite('dtSeconds', options.dtSeconds);
  if (options.dtSeconds < 0) {
    throw new RangeError(`dtSeconds must be non-negative, got ${options.dtSeconds}`);
  }

  const cooledContactState = {
    cooldownRemainingSeconds: Math.max(
      0,
      options.contactState.cooldownRemainingSeconds - options.dtSeconds
    ),
  };

  if (options.impact === null) {
    return { truck: options.truck, contactState: cooledContactState, didDamageCargo: false };
  }

  const impacted = options.resolveImpact(options.truck, { kind: 'barrier' });
  if (impacted.status === 'crashed' || cooledContactState.cooldownRemainingSeconds > 0) {
    return { truck: impacted, contactState: cooledContactState, didDamageCargo: false };
  }

  return {
    truck: {
      ...impacted,
      position: { ...impacted.position },
      cargoIntegrity: clamp(
        impacted.cargoIntegrity - options.tuning.cargoDamagePerBarrierHit,
        0,
        1
      ),
    },
    contactState: {
      cooldownRemainingSeconds: options.tuning.barrierDamageCooldownSeconds,
    },
    didDamageCargo: true,
  };
}

function orientedRectAabb(
  center: TruckState['position'],
  headingRadians: number,
  widthMeters: number,
  lengthMeters: number
): WorldAabb {
  const sin = Math.sin(headingRadians);
  const cos = Math.cos(headingRadians);
  const halfWidth = widthMeters / 2;
  const halfLength = lengthMeters / 2;
  const corners = [
    { lateral: -halfWidth, distance: -halfLength },
    { lateral: halfWidth, distance: -halfLength },
    { lateral: halfWidth, distance: halfLength },
    { lateral: -halfWidth, distance: halfLength },
  ].map(corner => ({
    lateralMeters: center.lateralMeters + corner.lateral * cos + corner.distance * sin,
    distanceMeters: center.distanceMeters - corner.lateral * sin + corner.distance * cos,
  }));

  return {
    minLateralMeters: Math.min(...corners.map(corner => corner.lateralMeters)),
    maxLateralMeters: Math.max(...corners.map(corner => corner.lateralMeters)),
    minDistanceMeters: Math.min(...corners.map(corner => corner.distanceMeters)),
    maxDistanceMeters: Math.max(...corners.map(corner => corner.distanceMeters)),
  };
}

function strongerImpact(
  current: RoadBarrierImpact | null,
  candidate: RoadBarrierImpact
): RoadBarrierImpact {
  if (current === null || candidate.penetrationMeters > current.penetrationMeters) {
    return candidate;
  }
  return current;
}

function validateTruck(truck: TruckState): void {
  if (typeof truck !== 'object' || truck === null) {
    throw new TypeError('TruckState must be an object');
  }
  if (typeof truck.position !== 'object' || truck.position === null) {
    throw new TypeError('TruckState.position must be an object');
  }
  assertFinite('truck.position.lateralMeters', truck.position.lateralMeters);
  assertFinite('truck.position.distanceMeters', truck.position.distanceMeters);
  assertFinite('truck.headingRadians', truck.headingRadians);
  assertFinite('truck.trailerHeadingRadians', truck.trailerHeadingRadians);
  assertFinite('truck.cargoIntegrity', truck.cargoIntegrity);
}

function validateDimensions(dimensions: TruckFootprintDimensions): void {
  if (typeof dimensions !== 'object' || dimensions === null) {
    throw new TypeError('TruckFootprintDimensions must be an object');
  }
  assertPositive('cabWidthMeters', dimensions.cabWidthMeters);
  assertPositive('cabLengthMeters', dimensions.cabLengthMeters);
  assertPositive('trailerWidthMeters', dimensions.trailerWidthMeters);
  assertPositive('trailerLengthMeters', dimensions.trailerLengthMeters);
  assertNonNegative('hitchGapMeters', dimensions.hitchGapMeters);
}

function validateRoad(road: Road): void {
  if (typeof road !== 'object' || road === null) {
    throw new TypeError('Road must be an object');
  }
  assertFinite('road.leftBarrierLateralMeters', road.leftBarrierLateralMeters);
  assertFinite('road.rightBarrierLateralMeters', road.rightBarrierLateralMeters);
  if (road.leftBarrierLateralMeters >= road.rightBarrierLateralMeters) {
    throw new RangeError(
      `leftBarrierLateralMeters must be < rightBarrierLateralMeters, got ${road.leftBarrierLateralMeters} >= ${road.rightBarrierLateralMeters}`
    );
  }
}

function validateAabb(box: WorldAabb): void {
  if (typeof box !== 'object' || box === null) {
    throw new TypeError('WorldAabb must be an object');
  }
  assertFinite('minLateralMeters', box.minLateralMeters);
  assertFinite('maxLateralMeters', box.maxLateralMeters);
  assertFinite('minDistanceMeters', box.minDistanceMeters);
  assertFinite('maxDistanceMeters', box.maxDistanceMeters);
  if (box.minLateralMeters > box.maxLateralMeters) {
    throw new RangeError(
      `minLateralMeters must be <= maxLateralMeters, got ${box.minLateralMeters} > ${box.maxLateralMeters}`
    );
  }
  if (box.minDistanceMeters > box.maxDistanceMeters) {
    throw new RangeError(
      `minDistanceMeters must be <= maxDistanceMeters, got ${box.minDistanceMeters} > ${box.maxDistanceMeters}`
    );
  }
}

function validateCollisionTuning(tuning: RoadCollisionTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('RoadCollisionTuning must be an object');
  }
  assertFinite('cargoDamagePerBarrierHit', tuning.cargoDamagePerBarrierHit);
  assertFinite('barrierDamageCooldownSeconds', tuning.barrierDamageCooldownSeconds);
  assertRange('cargoDamagePerBarrierHit', tuning.cargoDamagePerBarrierHit, 0, 1);
  assertPositive('barrierDamageCooldownSeconds', tuning.barrierDamageCooldownSeconds);
}

function validateContactState(state: BarrierContactState): void {
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('BarrierContactState must be an object');
  }
  assertFinite('cooldownRemainingSeconds', state.cooldownRemainingSeconds);
  assertNonNegative('cooldownRemainingSeconds', state.cooldownRemainingSeconds);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertRange(label: string, value: number, min: number, max: number): void {
  assertFinite(label, value);
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
