import type { Road } from '/src/game/road.js';
import type { TruckImpact, TruckState } from '/src/game/truck.js';
import { validatePoint, type WorldPoint } from '/src/game/worldGeometry.js';

export type BarrierSide = 'left' | 'right';

export interface TruckFootprintDimensions {
  readonly cabWidthMeters: number;
  readonly cabLengthMeters: number;
  readonly trailerWidthMeters: number;
  readonly trailerLengthMeters: number;
  /** Signed edge offset: positive leaves a gap; negative overlaps cab and trailer. */
  readonly hitchGapMeters: number;
}

/** Axis-aligned bounds in the Cartesian world plane. */
export interface WorldAabb {
  readonly minXMeters: number;
  readonly maxXMeters: number;
  readonly minYMeters: number;
  readonly maxYMeters: number;
}

export interface RoadBarrierImpact {
  readonly kind: 'barrier';
  readonly side: BarrierSide;
  readonly penetrationMeters: number;
  /** World-space extent of the contacting body along the road. */
  readonly minYMeters: number;
  readonly maxYMeters: number;
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
    xMeters: truck.position.xMeters - Math.sin(truck.trailerHeadingRadians) * hitchLengthMeters,
    yMeters: truck.position.yMeters - Math.cos(truck.trailerHeadingRadians) * hitchLengthMeters,
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
    // Zero-curvature shortcut: on the straight prototype route the road's
    // lateral barrier offsets coincide with world x. M5.6 replaces this with
    // sampled world-space barrier geometry.
    const leftPenetration = road.leftBarrierLateralMeters - box.minXMeters;
    const rightPenetration = box.maxXMeters - road.rightBarrierLateralMeters;

    if (leftPenetration > 0) {
      strongest = strongerImpact(strongest, {
        kind: 'barrier',
        side: 'left',
        penetrationMeters: leftPenetration,
        minYMeters: box.minYMeters,
        maxYMeters: box.maxYMeters,
      });
    }
    if (rightPenetration > 0) {
      strongest = strongerImpact(strongest, {
        kind: 'barrier',
        side: 'right',
        penetrationMeters: rightPenetration,
        minYMeters: box.minYMeters,
        maxYMeters: box.maxYMeters,
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
  center: WorldPoint,
  headingRadians: number,
  widthMeters: number,
  lengthMeters: number
): WorldAabb {
  const sin = Math.sin(headingRadians);
  const cos = Math.cos(headingRadians);
  const halfWidth = widthMeters / 2;
  const halfLength = lengthMeters / 2;
  const corners = [
    { across: -halfWidth, along: -halfLength },
    { across: halfWidth, along: -halfLength },
    { across: halfWidth, along: halfLength },
    { across: -halfWidth, along: halfLength },
  ].map(corner => ({
    xMeters: center.xMeters + corner.across * cos + corner.along * sin,
    yMeters: center.yMeters - corner.across * sin + corner.along * cos,
  }));

  return {
    minXMeters: Math.min(...corners.map(corner => corner.xMeters)),
    maxXMeters: Math.max(...corners.map(corner => corner.xMeters)),
    minYMeters: Math.min(...corners.map(corner => corner.yMeters)),
    maxYMeters: Math.max(...corners.map(corner => corner.yMeters)),
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
  validatePoint('truck.position', truck.position);
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
  validateHitchOffset(
    'hitchGapMeters',
    dimensions.hitchGapMeters,
    dimensions.cabLengthMeters,
    dimensions.trailerLengthMeters
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
  assertFinite('minXMeters', box.minXMeters);
  assertFinite('maxXMeters', box.maxXMeters);
  assertFinite('minYMeters', box.minYMeters);
  assertFinite('maxYMeters', box.maxYMeters);
  if (box.minXMeters > box.maxXMeters) {
    throw new RangeError(
      `minXMeters must be <= maxXMeters, got ${box.minXMeters} > ${box.maxXMeters}`
    );
  }
  if (box.minYMeters > box.maxYMeters) {
    throw new RangeError(
      `minYMeters must be <= maxYMeters, got ${box.minYMeters} > ${box.maxYMeters}`
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
