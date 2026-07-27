import {
  createWorldPoint,
  validatePoint,
  type WorldPoint,
  type WorldSegment,
} from '/src/game/worldGeometry.js';

export type TruckStatus = 'driving' | 'jackknifed' | 'crashed';

/**
 * Complete simulation state for one truck.
 *
 * Units are part of every field name so this model cannot quietly drift into
 * pixels or frame-relative values as rendering and physics grow separately.
 */
export interface TruckState {
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speedMetersPerSecond: number;
  readonly yawRateRadiansPerSecond: number;
  readonly trailerHeadingRadians: number;
  readonly massKilograms: number;
  /** Normalized cargo condition: 0 is destroyed, 1 is pristine. */
  readonly cargoIntegrity: number;
  readonly status: TruckStatus;
}

/** Device-independent controls consumed by truck simulation. */
export interface TruckControls {
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
}

/**
 * Named physical/gameplay limits supplied to the simulation.
 * M1.2 and M1.3 will add acceleration and steering feel constants here.
 */
export interface TruckTuning {
  readonly maxForwardSpeedMetersPerSecond: number;
  /** Full-throttle acceleration available at rest; tapers toward top speed. */
  readonly engineAccelerationMetersPerSecondSquared: number;
  /** Rolling/aerodynamic slowdown applied as the throttle closes. */
  readonly coastDecelerationMetersPerSecondSquared: number;
  /** Additional slowdown at full service-brake input. */
  readonly brakeDecelerationMetersPerSecondSquared: number;
  /** Maximum cab yaw rate once steering has full speed authority. */
  readonly maxSteeringYawRateRadiansPerSecond: number;
  /** First-order response rate used to approach the requested cab yaw. */
  readonly steeringResponsePerSecond: number;
  /** Speed at which steering reaches full yaw authority. */
  readonly steeringFullResponseSpeedMetersPerSecond: number;
  /** Hitch-to-trailer-axle distance used by the kinematic follower. */
  readonly trailerWheelbaseMeters: number;
  /** Physical trailer width used as the radius of its swipe capsule. */
  readonly trailerWidthMeters: number;
  /** Absolute articulation required to enter the jackknife state. */
  readonly jackknifeEntryAngleRadians: number;
  /** Lower articulation required to recover, providing state hysteresis. */
  readonly jackknifeRecoveryAngleRadians: number;
  /** Jackknifing is disabled below this speed for stable maneuvering. */
  readonly jackknifeMinimumSpeedMetersPerSecond: number;
}

/** Capsule occupied by the swinging trailer while jackknifed. */
export interface TrailerSwipeHitZone {
  readonly segment: WorldSegment;
  readonly radiusMeters: number;
}

export type TruckImpact = { readonly kind: 'barrier' };

export const DEFAULT_TRUCK_TUNING: TruckTuning = Object.freeze({
  // Approximately 89 mph.
  maxForwardSpeedMetersPerSecond: 40,
  // Produces 50% of top speed in approximately 4.5 seconds at full throttle.
  engineAccelerationMetersPerSecondSquared: 6.2,
  coastDecelerationMetersPerSecondSquared: 0.5,
  brakeDecelerationMetersPerSecondSquared: 8,
  maxSteeringYawRateRadiansPerSecond: 0.75,
  steeringResponsePerSecond: 3,
  steeringFullResponseSpeedMetersPerSecond: 15,
  trailerWheelbaseMeters: 12,
  trailerWidthMeters: 2.6,
  jackknifeEntryAngleRadians: (12 * Math.PI) / 180,
  jackknifeRecoveryAngleRadians: (7 * Math.PI) / 180,
  jackknifeMinimumSpeedMetersPerSecond: 20,
});

const TRUCK_STATUSES = new Set<TruckStatus>(['driving', 'jackknifed', 'crashed']);

/**
 * Validate and copy state entering the simulation boundary.
 *
 * Copying ensures callers cannot retain a nested position object and mutate a
 * state returned by this module behind the simulation's back.
 */
export function createTruckState(initial: TruckState): TruckState {
  validateTruckState(initial);

  return {
    position: createWorldPoint(initial.position.xMeters, initial.position.yMeters),
    headingRadians: initial.headingRadians,
    speedMetersPerSecond: initial.speedMetersPerSecond,
    yawRateRadiansPerSecond: initial.yawRateRadiansPerSecond,
    trailerHeadingRadians: initial.trailerHeadingRadians,
    massKilograms: initial.massKilograms,
    cargoIntegrity: initial.cargoIntegrity,
    status: initial.status,
  };
}

/**
 * Advance truck simulation by one fixed step.
 *
 * Longitudinal acceleration is an arcade curve: strongest at rest and tapering
 * linearly as speed approaches the configured maximum. Coasting and braking
 * are separate so releasing the throttle preserves substantially more momentum
 * than applying the service brake.
 */
export function stepTruck(
  state: TruckState,
  controls: TruckControls,
  dtSeconds: number,
  tuning: TruckTuning
): TruckState {
  validateTuning(tuning);
  validateTruckState(state);
  validateControls(controls);
  assertFinite('dtSeconds', dtSeconds);
  if (dtSeconds < 0) {
    throw new RangeError(`dtSeconds must be non-negative, got ${dtSeconds}`);
  }
  if (state.speedMetersPerSecond > tuning.maxForwardSpeedMetersPerSecond) {
    throw new RangeError(
      `speedMetersPerSecond must not exceed tuning maximum ` +
        `${tuning.maxForwardSpeedMetersPerSecond}, got ${state.speedMetersPerSecond}`
    );
  }
  if (state.status === 'crashed') {
    return createTruckState(state);
  }

  const speedRatio = state.speedMetersPerSecond / tuning.maxForwardSpeedMetersPerSecond;
  const engineAcceleration =
    tuning.engineAccelerationMetersPerSecondSquared *
    controls.throttle *
    Math.max(0, 1 - speedRatio);
  const coastDeceleration =
    tuning.coastDecelerationMetersPerSecondSquared * (1 - controls.throttle);
  const brakeDeceleration = tuning.brakeDecelerationMetersPerSecondSquared * controls.brake;
  const acceleration = engineAcceleration - coastDeceleration - brakeDeceleration;
  const nextSpeed = clamp(
    state.speedMetersPerSecond + acceleration * dtSeconds,
    0,
    tuning.maxForwardSpeedMetersPerSecond
  );

  // Steering authority grows with speed. A first-order response prevents the
  // cab from snapping instantly to its requested yaw rate.
  const averageSpeed = (state.speedMetersPerSecond + nextSpeed) / 2;
  const steeringAuthority = clamp(
    averageSpeed / tuning.steeringFullResponseSpeedMetersPerSecond,
    0,
    1
  );
  const targetYawRate =
    controls.steering * tuning.maxSteeringYawRateRadiansPerSecond * steeringAuthority;
  const steeringResponseFraction = 1 - Math.exp(-tuning.steeringResponsePerSecond * dtSeconds);
  const nextYawRate =
    state.yawRateRadiansPerSecond +
    (targetYawRate - state.yawRateRadiansPerSecond) * steeringResponseFraction;
  const headingDelta = ((state.yawRateRadiansPerSecond + nextYawRate) / 2) * dtSeconds;
  const movementHeading = normalizeAngle(state.headingRadians + headingDelta / 2);
  const nextHeading = normalizeAngle(state.headingRadians + headingDelta);

  // Trapezoidal speed integration avoids using either the old or new speed
  // alone for the whole step.
  const distanceTravelled = averageSpeed * dtSeconds;
  const nextPosition: WorldPoint = {
    xMeters: state.position.xMeters + Math.sin(movementHeading) * distanceTravelled,
    yMeters: state.position.yMeters + Math.cos(movementHeading) * distanceTravelled,
  };

  // A single-track trailer follower: its axle rotates toward the cab according
  // to speed and current articulation, but cannot snap directly to cab heading.
  const articulation = angleDelta(movementHeading, state.trailerHeadingRadians);
  const trailerYawRate = (averageSpeed / tuning.trailerWheelbaseMeters) * Math.sin(articulation);
  const nextTrailerHeading = normalizeAngle(
    state.trailerHeadingRadians + trailerYawRate * dtSeconds
  );
  const nextArticulation = Math.abs(angleDelta(nextHeading, nextTrailerHeading));
  const nextStatus = nextTruckStatus(state.status, nextArticulation, nextSpeed, tuning);

  return createTruckState({
    ...state,
    position: nextPosition,
    headingRadians: nextHeading,
    speedMetersPerSecond: nextSpeed,
    yawRateRadiansPerSecond: nextYawRate,
    trailerHeadingRadians: nextTrailerHeading,
    status: nextStatus,
  });
}

/**
 * Return the world-space capsule swept by the trailer while jackknifed.
 * Future enemy collision can test a point/body against this capsule without
 * depending on sprite size or camera projection.
 */
export function getTrailerSwipeHitZone(
  state: TruckState,
  tuning: TruckTuning
): TrailerSwipeHitZone | null {
  validateTruckState(state);
  validateTuning(tuning);
  if (state.status !== 'jackknifed') return null;

  return {
    segment: {
      start: createWorldPoint(state.position.xMeters, state.position.yMeters),
      end: createWorldPoint(
        state.position.xMeters -
          Math.sin(state.trailerHeadingRadians) * tuning.trailerWheelbaseMeters,
        state.position.yMeters -
          Math.cos(state.trailerHeadingRadians) * tuning.trailerWheelbaseMeters
      ),
    },
    radiusMeters: tuning.trailerWidthMeters / 2,
  };
}

/** Resolve impacts already detected by a world/collision system. */
export function resolveTruckImpact(state: TruckState, impact: TruckImpact): TruckState {
  validateTruckState(state);
  if (typeof impact !== 'object' || impact === null || impact.kind !== 'barrier') {
    throw new TypeError(`Unknown truck impact: ${String(impact)}`);
  }
  if (state.status !== 'jackknifed') return createTruckState(state);
  return createTruckState({
    ...state,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    status: 'crashed',
  });
}

function validateTruckState(state: TruckState): void {
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('TruckState must be an object');
  }
  validatePoint('TruckState.position', state.position);
  assertFinite('headingRadians', state.headingRadians);
  assertFinite('speedMetersPerSecond', state.speedMetersPerSecond);
  assertFinite('yawRateRadiansPerSecond', state.yawRateRadiansPerSecond);
  assertFinite('trailerHeadingRadians', state.trailerHeadingRadians);
  assertFinite('massKilograms', state.massKilograms);
  assertFinite('cargoIntegrity', state.cargoIntegrity);

  if (state.speedMetersPerSecond < 0) {
    throw new RangeError(
      `speedMetersPerSecond must be non-negative, got ${state.speedMetersPerSecond}`
    );
  }
  if (state.massKilograms <= 0) {
    throw new RangeError(`massKilograms must be positive, got ${state.massKilograms}`);
  }
  assertRange('cargoIntegrity', state.cargoIntegrity, 0, 1);

  if (!TRUCK_STATUSES.has(state.status)) {
    throw new TypeError(`Unknown truck status: ${String(state.status)}`);
  }
}

function validateControls(controls: TruckControls): void {
  if (typeof controls !== 'object' || controls === null) {
    throw new TypeError('TruckControls must be an object');
  }

  assertFinite('controls.throttle', controls.throttle);
  assertFinite('controls.brake', controls.brake);
  assertFinite('controls.steering', controls.steering);
  assertRange('controls.throttle', controls.throttle, 0, 1);
  assertRange('controls.brake', controls.brake, 0, 1);
  assertRange('controls.steering', controls.steering, -1, 1);
}

function validateTuning(tuning: TruckTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('TruckTuning must be an object');
  }

  assertFinite('tuning.maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);
  assertFinite(
    'tuning.engineAccelerationMetersPerSecondSquared',
    tuning.engineAccelerationMetersPerSecondSquared
  );
  assertFinite(
    'tuning.coastDecelerationMetersPerSecondSquared',
    tuning.coastDecelerationMetersPerSecondSquared
  );
  assertFinite(
    'tuning.brakeDecelerationMetersPerSecondSquared',
    tuning.brakeDecelerationMetersPerSecondSquared
  );
  assertFinite(
    'tuning.maxSteeringYawRateRadiansPerSecond',
    tuning.maxSteeringYawRateRadiansPerSecond
  );
  assertFinite('tuning.steeringResponsePerSecond', tuning.steeringResponsePerSecond);
  assertFinite(
    'tuning.steeringFullResponseSpeedMetersPerSecond',
    tuning.steeringFullResponseSpeedMetersPerSecond
  );
  assertFinite('tuning.trailerWheelbaseMeters', tuning.trailerWheelbaseMeters);
  assertFinite('tuning.trailerWidthMeters', tuning.trailerWidthMeters);
  assertFinite('tuning.jackknifeEntryAngleRadians', tuning.jackknifeEntryAngleRadians);
  assertFinite('tuning.jackknifeRecoveryAngleRadians', tuning.jackknifeRecoveryAngleRadians);
  assertFinite(
    'tuning.jackknifeMinimumSpeedMetersPerSecond',
    tuning.jackknifeMinimumSpeedMetersPerSecond
  );
  assertPositive('tuning.maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);
  assertPositive(
    'tuning.engineAccelerationMetersPerSecondSquared',
    tuning.engineAccelerationMetersPerSecondSquared
  );
  assertPositive(
    'tuning.coastDecelerationMetersPerSecondSquared',
    tuning.coastDecelerationMetersPerSecondSquared
  );
  assertPositive(
    'tuning.brakeDecelerationMetersPerSecondSquared',
    tuning.brakeDecelerationMetersPerSecondSquared
  );
  assertPositive(
    'tuning.maxSteeringYawRateRadiansPerSecond',
    tuning.maxSteeringYawRateRadiansPerSecond
  );
  assertPositive('tuning.steeringResponsePerSecond', tuning.steeringResponsePerSecond);
  assertPositive(
    'tuning.steeringFullResponseSpeedMetersPerSecond',
    tuning.steeringFullResponseSpeedMetersPerSecond
  );
  assertPositive('tuning.trailerWheelbaseMeters', tuning.trailerWheelbaseMeters);
  assertPositive('tuning.trailerWidthMeters', tuning.trailerWidthMeters);
  assertPositive('tuning.jackknifeEntryAngleRadians', tuning.jackknifeEntryAngleRadians);
  assertPositive('tuning.jackknifeRecoveryAngleRadians', tuning.jackknifeRecoveryAngleRadians);
  assertPositive(
    'tuning.jackknifeMinimumSpeedMetersPerSecond',
    tuning.jackknifeMinimumSpeedMetersPerSecond
  );
  if (tuning.jackknifeRecoveryAngleRadians >= tuning.jackknifeEntryAngleRadians) {
    throw new RangeError(
      `jackknifeRecoveryAngleRadians must be less than entry angle, got ` +
        `${tuning.jackknifeRecoveryAngleRadians} >= ${tuning.jackknifeEntryAngleRadians}`
    );
  }
  if (tuning.jackknifeMinimumSpeedMetersPerSecond > tuning.maxForwardSpeedMetersPerSecond) {
    throw new RangeError(
      `jackknifeMinimumSpeedMetersPerSecond must not exceed maximum speed, got ` +
        `${tuning.jackknifeMinimumSpeedMetersPerSecond} > ` +
        `${tuning.maxForwardSpeedMetersPerSecond}`
    );
  }
}

function nextTruckStatus(
  current: TruckStatus,
  articulationRadians: number,
  speedMetersPerSecond: number,
  tuning: TruckTuning
): TruckStatus {
  if (current === 'crashed') return 'crashed';
  if (current === 'jackknifed') {
    return articulationRadians <= tuning.jackknifeRecoveryAngleRadians ? 'driving' : 'jackknifed';
  }
  if (
    speedMetersPerSecond >= tuning.jackknifeMinimumSpeedMetersPerSecond &&
    articulationRadians >= tuning.jackknifeEntryAngleRadians
  ) {
    return 'jackknifed';
  }
  return 'driving';
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function assertRange(label: string, value: number, min: number, max: number): void {
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  if (value <= 0) {
    throw new RangeError(`${label} must be positive, got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleDelta(a: number, b: number): number {
  return normalizeAngle(a - b);
}
