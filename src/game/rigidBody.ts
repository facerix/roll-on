import {
  addVectors,
  addVelocities,
  angularVelocityAtPoint,
  clockwiseCross,
  dotVectors,
  dotVelocityWithVector,
  scaleVector,
  subtractVectors,
  subtractVelocities,
  validateVector,
  validateVelocity,
  type WorldPoint,
  type WorldVector,
  type WorldVelocity,
} from '/src/game/worldGeometry.js';

/**
 * A deliberately small arcade rigid-body layer: oriented rectangles, SAT
 * contact generation, and one low-restitution impulse response.
 *
 * Everything here is Cartesian world space. The solver has no idea a road
 * exists — lanes, route distance, and driving intent stay with their owners and
 * reach this module only as a pose and a velocity.
 */

export interface RigidBody {
  readonly id: string;
  readonly position: WorldPoint;
  readonly velocity: WorldVelocity;
  readonly headingRadians: number;
  readonly angularVelocityRadiansPerSecond: number;
  readonly widthMeters: number;
  readonly lengthMeters: number;
  readonly massKilograms: number;
}

export interface RigidBodyContact {
  readonly normal: WorldVector;
  readonly penetrationMeters: number;
  readonly point: WorldPoint;
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

export function detectRigidBodyContact(
  bodyA: RigidBody,
  bodyB: RigidBody
): RigidBodyContact | null {
  validateRigidBody(bodyA);
  validateRigidBody(bodyB);
  const axes = [...bodyAxes(bodyA), ...bodyAxes(bodyB)];
  const centerDelta = subtractVectors(bodyB.position, bodyA.position);
  let minimumOverlap = Number.POSITIVE_INFINITY;
  let minimumAxis: WorldVector | null = null;

  for (const axis of axes) {
    const projectionA = projectBody(bodyA, axis);
    const projectionB = projectBody(bodyB, axis);
    const overlap =
      Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
    if (overlap <= 1e-10) return null;
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumAxis = dotVectors(centerDelta, axis) < 0 ? scaleVector(axis, -1) : axis;
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
  const velocityAlongNormal = dotVelocityWithVector(relativeVelocity, contact.normal);
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
    const normalVelocity = dotVelocityWithVector(postNormalRelativeVelocity, contact.normal);
    const tangentUnnormalized: WorldVelocity = {
      xMetersPerSecond:
        postNormalRelativeVelocity.xMetersPerSecond - contact.normal.xMeters * normalVelocity,
      yMetersPerSecond:
        postNormalRelativeVelocity.yMetersPerSecond - contact.normal.yMeters * normalVelocity,
    };
    const tangentLength = Math.hypot(
      tangentUnnormalized.xMetersPerSecond,
      tangentUnnormalized.yMetersPerSecond
    );
    if (tangentLength > 1e-10) {
      const tangent: WorldVector = {
        xMeters: tangentUnnormalized.xMetersPerSecond / tangentLength,
        yMeters: tangentUnnormalized.yMetersPerSecond / tangentLength,
      };
      const armTangentA = clockwiseCross(armA, tangent);
      const armTangentB = clockwiseCross(armB, tangent);
      const tangentDenominator =
        inverseMassSum +
        armTangentA * armTangentA * inverseInertiaA +
        armTangentB * armTangentB * inverseInertiaB;
      const rawFrictionImpulse =
        -dotVelocityWithVector(postNormalRelativeVelocity, tangent) / tangentDenominator;
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

function applyImpulse(body: RigidBody, impulse: WorldVector, contactArm: WorldVector): RigidBody {
  const inverseMass = 1 / body.massKilograms;
  const inverseInertia = 1 / rectangleInertia(body);
  return {
    ...body,
    velocity: {
      xMetersPerSecond: body.velocity.xMetersPerSecond + impulse.xMeters * inverseMass,
      yMetersPerSecond: body.velocity.yMetersPerSecond + impulse.yMeters * inverseMass,
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

/** The body's local width axis then length axis, expressed in world space. */
function bodyAxes(body: RigidBody): readonly [WorldVector, WorldVector] {
  const sin = Math.sin(body.headingRadians);
  const cos = Math.cos(body.headingRadians);
  return [
    { xMeters: cos, yMeters: -sin },
    { xMeters: sin, yMeters: cos },
  ];
}

function projectBody(
  body: RigidBody,
  axis: WorldVector
): { readonly min: number; readonly max: number } {
  const [widthAxis, lengthAxis] = bodyAxes(body);
  const center = dotVectors(body.position, axis);
  const radius =
    Math.abs(dotVectors(widthAxis, axis)) * (body.widthMeters / 2) +
    Math.abs(dotVectors(lengthAxis, axis)) * (body.lengthMeters / 2);
  return { min: center - radius, max: center + radius };
}

function supportPoint(body: RigidBody, direction: WorldVector): WorldPoint {
  const [widthAxis, lengthAxis] = bodyAxes(body);
  return addVectors(
    body.position,
    addVectors(
      scaleVector(widthAxis, Math.sign(dotVectors(widthAxis, direction)) * (body.widthMeters / 2)),
      scaleVector(
        lengthAxis,
        Math.sign(dotVectors(lengthAxis, direction)) * (body.lengthMeters / 2)
      )
    )
  );
}

export function validateRigidBody(body: RigidBody): void {
  if (typeof body !== 'object' || body === null) {
    throw new TypeError('RigidBody must be an object');
  }
  if (typeof body.id !== 'string' || body.id.length === 0) {
    throw new TypeError('RigidBody.id must be a non-empty string');
  }
  validateVector('body.position', body.position);
  validateVelocity('body.velocity', body.velocity);
  assertFinite('body.headingRadians', body.headingRadians);
  assertFinite('body.angularVelocityRadiansPerSecond', body.angularVelocityRadiansPerSecond);
  assertPositive('body.widthMeters', body.widthMeters);
  assertPositive('body.lengthMeters', body.lengthMeters);
  assertPositive('body.massKilograms', body.massKilograms);
}

export function validateRigidBodyContact(contact: RigidBodyContact): void {
  if (typeof contact !== 'object' || contact === null) {
    throw new TypeError('RigidBodyContact must be an object');
  }
  validateVector('contact.normal', contact.normal);
  const normalLength = Math.hypot(contact.normal.xMeters, contact.normal.yMeters);
  if (Math.abs(normalLength - 1) > 1e-9) {
    throw new RangeError(`contact normal must be normalized, got ${normalLength}`);
  }
  assertPositive('contact.penetrationMeters', contact.penetrationMeters);
  validateVector('contact.point', contact.point);
}

export function validateRigidBodyResponseTuning(tuning: RigidBodyResponseTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('RigidBodyResponseTuning must be an object');
  }
  assertRange('restitution', tuning.restitution, 0, 1);
  assertRange('friction', tuning.friction, 0, 1);
  assertRange('positionalCorrection', tuning.positionalCorrection, 0, 1);
  assertNonNegative('penetrationSlopMeters', tuning.penetrationSlopMeters);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
