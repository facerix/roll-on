/** Position on the road's ground plane, independent of any camera or projection. */
export interface WorldPosition {
  readonly lateralMeters: number;
  readonly distanceMeters: number;
}

export type TruckStatus = 'driving' | 'jackknifed' | 'crashed';

/**
 * Complete simulation state for one truck.
 *
 * Units are part of every field name so this model cannot quietly drift into
 * pixels or frame-relative values as rendering and physics grow separately.
 */
export interface TruckState {
  readonly position: WorldPosition;
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
}

export const DEFAULT_TRUCK_TUNING: TruckTuning = Object.freeze({
  // Approximately 89 mph. This is a bound, not yet an acceleration target.
  maxForwardSpeedMetersPerSecond: 40,
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
    position: {
      lateralMeters: initial.position.lateralMeters,
      distanceMeters: initial.position.distanceMeters,
    },
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
 * M1.1 establishes the deterministic, immutable boundary. At rest there is no
 * state transition yet; M1.2 will add longitudinal motion behind this same
 * contract without changing callers.
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

  return createTruckState(state);
}

function validateTruckState(state: TruckState): void {
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('TruckState must be an object');
  }
  if (typeof state.position !== 'object' || state.position === null) {
    throw new TypeError('TruckState.position must be an object');
  }

  assertFinite('position.lateralMeters', state.position.lateralMeters);
  assertFinite('position.distanceMeters', state.position.distanceMeters);
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
  if (tuning.maxForwardSpeedMetersPerSecond <= 0) {
    throw new RangeError(
      `tuning.maxForwardSpeedMetersPerSecond must be positive, got ` +
        `${tuning.maxForwardSpeedMetersPerSecond}`
    );
  }
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
