/**
 * The Cartesian world plane shared by truck physics, the rigid-body solver, and
 * camera projection.
 *
 * Axis convention, carried unchanged from the straight-road prototype this
 * module replaces:
 *
 * - `+x` runs to the driver's right, across the road.
 * - `+y` runs forward, along the road.
 * - `headingRadians` is measured from `+y` toward `+x`, so a forward unit vector
 *   is `{ xMeters: sin(heading), yMeters: cos(heading) }` and positive rotation
 *   turns right.
 *
 * Nothing here knows about lanes, route distance, the camera, or pixels. Screen
 * inversion (canvas `+y` points down) belongs to the camera; road-relative
 * offsets belong to route space.
 */

export interface WorldPoint {
  readonly xMeters: number;
  readonly yMeters: number;
}

export interface WorldVector {
  readonly xMeters: number;
  readonly yMeters: number;
}

export interface WorldVelocity {
  readonly xMetersPerSecond: number;
  readonly yMetersPerSecond: number;
}

/** A directed span between two world points. */
export interface WorldSegment {
  readonly start: WorldPoint;
  readonly end: WorldPoint;
}

export function createWorldPoint(xMeters: number, yMeters: number): WorldPoint {
  assertFinite('xMeters', xMeters);
  assertFinite('yMeters', yMeters);
  return Object.freeze({ xMeters, yMeters });
}

export function createWorldVector(xMeters: number, yMeters: number): WorldVector {
  assertFinite('xMeters', xMeters);
  assertFinite('yMeters', yMeters);
  return Object.freeze({ xMeters, yMeters });
}

export function createWorldVelocity(
  xMetersPerSecond: number,
  yMetersPerSecond: number
): WorldVelocity {
  assertFinite('xMetersPerSecond', xMetersPerSecond);
  assertFinite('yMetersPerSecond', yMetersPerSecond);
  return Object.freeze({ xMetersPerSecond, yMetersPerSecond });
}

/** Unit vector along a heading, measured from `+y` toward `+x`. */
export function headingToUnitVector(headingRadians: number): WorldVector {
  assertFinite('headingRadians', headingRadians);
  return Object.freeze({
    xMeters: Math.sin(headingRadians),
    yMeters: Math.cos(headingRadians),
  });
}

/**
 * Wrap a heading into `(-pi, pi]`, the canonical form for every heading stored
 * in simulation state.
 */
export function normalizeHeading(headingRadians: number): number {
  assertFinite('headingRadians', headingRadians);
  return Math.atan2(Math.sin(headingRadians), Math.cos(headingRadians));
}

/**
 * Signed shortest rotation from `fromRadians` to `toRadians`, in `(-pi, pi]`.
 * Positive turns right, matching the rotation sense of this frame.
 */
export function shortestHeadingDelta(toRadians: number, fromRadians: number): number {
  assertFinite('toRadians', toRadians);
  assertFinite('fromRadians', fromRadians);
  return normalizeHeading(toRadians - fromRadians);
}

export function velocityAlongHeading(
  headingRadians: number,
  speedMetersPerSecond: number
): WorldVelocity {
  assertFinite('headingRadians', headingRadians);
  assertFinite('speedMetersPerSecond', speedMetersPerSecond);
  return Object.freeze({
    xMetersPerSecond: Math.sin(headingRadians) * speedMetersPerSecond,
    yMetersPerSecond: Math.cos(headingRadians) * speedMetersPerSecond,
  });
}

export function addVectors(a: WorldVector, b: WorldVector): WorldVector {
  validateVector('a', a);
  validateVector('b', b);
  return Object.freeze({ xMeters: a.xMeters + b.xMeters, yMeters: a.yMeters + b.yMeters });
}

export function subtractVectors(a: WorldVector, b: WorldVector): WorldVector {
  validateVector('a', a);
  validateVector('b', b);
  return Object.freeze({ xMeters: a.xMeters - b.xMeters, yMeters: a.yMeters - b.yMeters });
}

export function scaleVector(vector: WorldVector, scale: number): WorldVector {
  validateVector('vector', vector);
  assertFinite('scale', scale);
  return Object.freeze({ xMeters: vector.xMeters * scale, yMeters: vector.yMeters * scale });
}

export function dotVectors(a: WorldVector, b: WorldVector): number {
  validateVector('a', a);
  validateVector('b', b);
  return a.xMeters * b.xMeters + a.yMeters * b.yMeters;
}

/**
 * Cross product oriented to match this frame's rotation sense: positive when
 * `b` sits clockwise of `a` on screen, i.e. rotating from `+y` toward `+x`.
 */
export function clockwiseCross(a: WorldVector, b: WorldVector): number {
  validateVector('a', a);
  validateVector('b', b);
  return a.yMeters * b.xMeters - a.xMeters * b.yMeters;
}

export function addVelocities(a: WorldVelocity, b: WorldVelocity): WorldVelocity {
  validateVelocity('a', a);
  validateVelocity('b', b);
  return Object.freeze({
    xMetersPerSecond: a.xMetersPerSecond + b.xMetersPerSecond,
    yMetersPerSecond: a.yMetersPerSecond + b.yMetersPerSecond,
  });
}

export function subtractVelocities(a: WorldVelocity, b: WorldVelocity): WorldVelocity {
  validateVelocity('a', a);
  validateVelocity('b', b);
  return Object.freeze({
    xMetersPerSecond: a.xMetersPerSecond - b.xMetersPerSecond,
    yMetersPerSecond: a.yMetersPerSecond - b.yMetersPerSecond,
  });
}

/** Component of a velocity along a direction vector. */
export function dotVelocityWithVector(velocity: WorldVelocity, direction: WorldVector): number {
  validateVelocity('velocity', velocity);
  validateVector('direction', direction);
  return (
    velocity.xMetersPerSecond * direction.xMeters + velocity.yMetersPerSecond * direction.yMeters
  );
}

/** Velocity contributed at a point by spin about the body center. */
export function angularVelocityAtPoint(
  angularVelocityRadiansPerSecond: number,
  arm: WorldVector
): WorldVelocity {
  assertFinite('angularVelocityRadiansPerSecond', angularVelocityRadiansPerSecond);
  validateVector('arm', arm);
  return Object.freeze({
    xMetersPerSecond: angularVelocityRadiansPerSecond * arm.yMeters,
    yMetersPerSecond: -angularVelocityRadiansPerSecond * arm.xMeters,
  });
}

export function validatePoint(label: string, point: WorldPoint): void {
  if (typeof point !== 'object' || point === null) {
    throw new TypeError(`${label} must be an object`);
  }
  assertFinite(`${label}.xMeters`, point.xMeters);
  assertFinite(`${label}.yMeters`, point.yMeters);
}

export function validateVector(label: string, vector: WorldVector): void {
  if (typeof vector !== 'object' || vector === null) {
    throw new TypeError(`${label} must be an object`);
  }
  assertFinite(`${label}.xMeters`, vector.xMeters);
  assertFinite(`${label}.yMeters`, vector.yMeters);
}

export function validateVelocity(label: string, velocity: WorldVelocity): void {
  if (typeof velocity !== 'object' || velocity === null) {
    throw new TypeError(`${label} must be an object`);
  }
  assertFinite(`${label}.xMetersPerSecond`, velocity.xMetersPerSecond);
  assertFinite(`${label}.yMetersPerSecond`, velocity.yMetersPerSecond);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}
