import type { Road } from '/src/game/road.js';
import { worldToRoute } from '/src/game/route.js';
import type { TruckImpact, TruckState } from '/src/game/truck.js';
import { headingToUnitVector, validatePoint, type WorldPoint } from '/src/game/worldGeometry.js';

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

/** A rectangular body in Cartesian world space, preserving its true heading. */
export interface WorldOrientedRect {
  readonly center: WorldPoint;
  readonly headingRadians: number;
  readonly widthMeters: number;
  readonly lengthMeters: number;
}

export type WorldFootprint = WorldAabb | WorldOrientedRect;

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

/**
 * Place the trailer from the actual articulated connection: the cab rear is
 * measured along the cab heading, then the trailer's front-to-center distance
 * is measured along the trailer heading. Using one heading for both spans
 * creates a visible gap whenever the truck is turning.
 */
export function getTruckTrailerCenter(
  truck: TruckState,
  dimensions: TruckFootprintDimensions
): WorldPoint {
  const cabForward = headingToUnitVector(truck.headingRadians);
  const trailerForward = headingToUnitVector(truck.trailerHeadingRadians);
  const cabRear = {
    xMeters: truck.position.xMeters - cabForward.xMeters * (dimensions.cabLengthMeters / 2),
    yMeters: truck.position.yMeters - cabForward.yMeters * (dimensions.cabLengthMeters / 2),
  };
  const trailerCenterDistanceMeters =
    dimensions.trailerLengthMeters / 2 + dimensions.hitchGapMeters;
  return {
    xMeters: cabRear.xMeters - trailerForward.xMeters * trailerCenterDistanceMeters,
    yMeters: cabRear.yMeters - trailerForward.yMeters * trailerCenterDistanceMeters,
  };
}

export function buildTruckFootprint(
  truck: TruckState,
  dimensions: TruckFootprintDimensions
): readonly [WorldOrientedRect, WorldOrientedRect] {
  validateTruck(truck);
  validateDimensions(dimensions);

  const trailerCenter = getTruckTrailerCenter(truck, dimensions);

  return [
    orientedRect(
      truck.position,
      truck.headingRadians,
      dimensions.cabWidthMeters,
      dimensions.cabLengthMeters
    ),
    orientedRect(
      trailerCenter,
      truck.trailerHeadingRadians,
      dimensions.trailerWidthMeters,
      dimensions.trailerLengthMeters
    ),
  ];
}

export function detectRoadBarrierImpact(
  road: Road,
  footprint: WorldFootprint | readonly WorldFootprint[],
  routeDistanceHintMeters?: number
): RoadBarrierImpact | null {
  validateRoad(road);
  const bodies = Array.isArray(footprint) ? footprint : [footprint];

  let strongest: RoadBarrierImpact | null = null;
  for (const body of bodies) {
    validateFootprint(body);
    const bounds = footprintBounds(body);
    if (isStraightRoute(road)) {
      const impact = detectStraightBarrierImpact(road, bounds);
      if (impact !== null) strongest = strongerImpact(strongest, impact);
      continue;
    }

    const center = footprintCenter(body, bounds);
    const hint = routeDistanceHintMeters ?? center.yMeters - road.route.segments[0]!.start.yMeters;
    assertFinite('routeDistanceHintMeters', hint);
    for (const point of footprintBoundaryPoints(body)) {
      const projection = worldToRoute(road.route, point, {
        hintDistanceAlongRouteMeters: hint,
        searchRadiusMeters: 100,
      });
      const leftPenetration = road.leftBarrierLateralMeters - projection.lateralOffsetMeters;
      const rightPenetration = projection.lateralOffsetMeters - road.rightBarrierLateralMeters;
      if (leftPenetration > 0) {
        strongest = strongerImpact(strongest, barrierImpact('left', leftPenetration, bounds));
      }
      if (rightPenetration > 0) {
        strongest = strongerImpact(strongest, barrierImpact('right', rightPenetration, bounds));
      }
    }
  }

  return strongest;
}

function detectStraightBarrierImpact(road: Road, box: WorldAabb): RoadBarrierImpact | null {
  const leftPenetration = road.leftBarrierLateralMeters - box.minXMeters;
  const rightPenetration = box.maxXMeters - road.rightBarrierLateralMeters;
  if (leftPenetration <= 0 && rightPenetration <= 0) return null;
  return leftPenetration >= rightPenetration
    ? barrierImpact('left', leftPenetration, box)
    : barrierImpact('right', rightPenetration, box);
}

function barrierImpact(
  side: BarrierSide,
  penetrationMeters: number,
  box: WorldAabb
): RoadBarrierImpact {
  return {
    kind: 'barrier',
    side,
    penetrationMeters,
    minYMeters: box.minYMeters,
    maxYMeters: box.maxYMeters,
  };
}

function isStraightRoute(road: Road): boolean {
  return road.route.segments.every(segment => segment.curvaturePerMeter === 0);
}

function aabbCorners(box: WorldAabb): readonly WorldPoint[] {
  return [
    { xMeters: box.minXMeters, yMeters: box.minYMeters },
    { xMeters: box.minXMeters, yMeters: box.maxYMeters },
    { xMeters: box.maxXMeters, yMeters: box.minYMeters },
    { xMeters: box.maxXMeters, yMeters: box.maxYMeters },
  ];
}

function orientedRectCorners(rect: WorldOrientedRect): readonly WorldPoint[] {
  const sin = Math.sin(rect.headingRadians);
  const cos = Math.cos(rect.headingRadians);
  const halfWidth = rect.widthMeters / 2;
  const halfLength = rect.lengthMeters / 2;
  return [
    { across: -halfWidth, along: -halfLength },
    { across: halfWidth, along: -halfLength },
    { across: halfWidth, along: halfLength },
    { across: -halfWidth, along: halfLength },
  ].map(corner => ({
    xMeters: rect.center.xMeters + corner.across * cos + corner.along * sin,
    yMeters: rect.center.yMeters - corner.across * sin + corner.along * cos,
  }));
}

function footprintBoundaryPoints(body: WorldFootprint): readonly WorldPoint[] {
  const corners = isWorldAabb(body) ? aabbCorners(body) : orientedRectCorners(body);
  const points: WorldPoint[] = [];
  for (let index = 0; index < corners.length; index++) {
    const start = corners[index]!;
    const end = corners[(index + 1) % corners.length]!;
    const steps = Math.ceil(Math.hypot(end.xMeters - start.xMeters, end.yMeters - start.yMeters));
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps;
      points.push({
        xMeters: start.xMeters + (end.xMeters - start.xMeters) * fraction,
        yMeters: start.yMeters + (end.yMeters - start.yMeters) * fraction,
      });
    }
  }
  return points;
}

function footprintBounds(body: WorldFootprint): WorldAabb {
  if (isWorldAabb(body)) return body;
  const corners = orientedRectCorners(body);
  return {
    minXMeters: Math.min(...corners.map(corner => corner.xMeters)),
    maxXMeters: Math.max(...corners.map(corner => corner.xMeters)),
    minYMeters: Math.min(...corners.map(corner => corner.yMeters)),
    maxYMeters: Math.max(...corners.map(corner => corner.yMeters)),
  };
}

function footprintCenter(body: WorldFootprint, bounds: WorldAabb): WorldPoint {
  if (!isWorldAabb(body)) return body.center;
  return {
    xMeters: (bounds.minXMeters + bounds.maxXMeters) / 2,
    yMeters: (bounds.minYMeters + bounds.maxYMeters) / 2,
  };
}

function isWorldAabb(body: unknown): body is WorldAabb {
  return typeof body === 'object' && body !== null && 'minXMeters' in body;
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

function orientedRect(
  center: WorldPoint,
  headingRadians: number,
  widthMeters: number,
  lengthMeters: number
): WorldOrientedRect {
  return {
    center: { ...center },
    headingRadians,
    widthMeters,
    lengthMeters,
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

function validateFootprint(body: WorldFootprint): void {
  if (typeof body !== 'object' || body === null) {
    throw new TypeError('footprint must be an object');
  }
  if (!isWorldAabb(body)) {
    validatePoint('footprint.center', body.center);
    assertFinite('footprint.headingRadians', body.headingRadians);
    assertPositive('footprint.widthMeters', body.widthMeters);
    assertPositive('footprint.lengthMeters', body.lengthMeters);
    return;
  }
  validateAabb(body);
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
