import { DEFAULT_TRUCK_TUNING, type TruckControls, type TruckTuning } from '/src/game/truck.js';

export interface CruiseControlState {
  readonly isActive: boolean;
  readonly targetSpeedMetersPerSecond: number;
}

export interface CruiseControlInput {
  readonly throttle: number;
  readonly brake: number;
  /** One down-edge from keyboard or touch; held/repeat state is irrelevant. */
  readonly toggleCruise: boolean;
  readonly currentSpeedMetersPerSecond: number;
}

export interface CruiseControlTuning {
  readonly maximumTargetSpeedMetersPerSecond: number;
  readonly fullControlErrorMetersPerSecond: number;
}

export interface CruiseControlStep {
  readonly state: CruiseControlState;
  readonly controls: Pick<TruckControls, 'throttle' | 'brake'>;
}

export const DEFAULT_CRUISE_CONTROL_TUNING: CruiseControlTuning = Object.freeze({
  maximumTargetSpeedMetersPerSecond: 40,
  fullControlErrorMetersPerSecond: 4,
});

export function createCruiseControlState(
  initial: Partial<CruiseControlState> = {},
  tuning: CruiseControlTuning = DEFAULT_CRUISE_CONTROL_TUNING
): CruiseControlState {
  validateTuning(tuning);
  const isActive = initial.isActive ?? false;
  const targetSpeedMetersPerSecond = initial.targetSpeedMetersPerSecond ?? 0;
  if (typeof isActive !== 'boolean') throw new TypeError('isActive must be boolean');
  assertFinite('targetSpeedMetersPerSecond', targetSpeedMetersPerSecond);
  if (
    targetSpeedMetersPerSecond < 0 ||
    targetSpeedMetersPerSecond > tuning.maximumTargetSpeedMetersPerSecond
  ) {
    throw new RangeError(
      `targetSpeedMetersPerSecond must be in [0, ${tuning.maximumTargetSpeedMetersPerSecond}], got ${targetSpeedMetersPerSecond}`
    );
  }
  return { isActive, targetSpeedMetersPerSecond };
}

/**
 * Keep the physical pedals honest while adding an explicit retained-speed
 * state. Inactive cruise passes both pedals through. Active cruise is
 * temporarily overridden by throttle, resumes its captured target on
 * release, and is cancelled by any service-brake input.
 */
export function stepCruiseControl(
  state: CruiseControlState,
  input: CruiseControlInput,
  tuning: CruiseControlTuning = DEFAULT_CRUISE_CONTROL_TUNING,
  truckTuning: TruckTuning = DEFAULT_TRUCK_TUNING
): CruiseControlStep {
  validateTuning(tuning);
  validateTruckTuning(truckTuning);
  const validState = createCruiseControlState(state, tuning);
  validateUnit('throttle', input.throttle);
  validateUnit('brake', input.brake);
  if (typeof input.toggleCruise !== 'boolean') {
    throw new TypeError('toggleCruise must be boolean');
  }
  assertFinite('currentSpeedMetersPerSecond', input.currentSpeedMetersPerSecond);
  if (input.currentSpeedMetersPerSecond < 0) {
    throw new RangeError(
      `currentSpeedMetersPerSecond must be non-negative, got ${input.currentSpeedMetersPerSecond}`
    );
  }

  // Braking always wins over a simultaneous cruise command and reaches the
  // truck unchanged. This makes both emergency response and cancellation
  // predictable from the visible Brake label.
  if (input.brake > 0) {
    return {
      state: { ...validState, isActive: false },
      controls: { throttle: input.throttle, brake: input.brake },
    };
  }

  const nextState = input.toggleCruise
    ? validState.isActive
      ? { ...validState, isActive: false }
      : {
          isActive: true,
          targetSpeedMetersPerSecond: clamp(
            input.currentSpeedMetersPerSecond,
            0,
            tuning.maximumTargetSpeedMetersPerSecond
          ),
        }
    : validState;

  if (!nextState.isActive || input.throttle > 0) {
    return {
      state: nextState,
      controls: { throttle: input.throttle, brake: 0 },
    };
  }

  const speedError = nextState.targetSpeedMetersPerSecond - input.currentSpeedMetersPerSecond;
  if (speedError < 0) {
    return {
      state: nextState,
      controls: {
        throttle: 0,
        brake: clamp(-speedError / tuning.fullControlErrorMetersPerSecond, 0, 1),
      },
    };
  }

  // Feed-forward throttle offsets rolling drag at the target. Proportional
  // correction closes the remaining gap after a hill, impact, or override.
  const targetSpeedRatio = clamp(
    nextState.targetSpeedMetersPerSecond / truckTuning.maxForwardSpeedMetersPerSecond,
    0,
    1
  );
  const availableEngineAcceleration =
    truckTuning.engineAccelerationMetersPerSecondSquared * (1 - targetSpeedRatio);
  const holdingThrottle =
    truckTuning.coastDecelerationMetersPerSecondSquared /
    (availableEngineAcceleration + truckTuning.coastDecelerationMetersPerSecondSquared);

  return {
    state: nextState,
    controls: {
      throttle: clamp(holdingThrottle + speedError / tuning.fullControlErrorMetersPerSecond, 0, 1),
      brake: 0,
    },
  };
}

function validateTuning(tuning: CruiseControlTuning): void {
  assertPositive('maximumTargetSpeedMetersPerSecond', tuning.maximumTargetSpeedMetersPerSecond);
  assertPositive('fullControlErrorMetersPerSecond', tuning.fullControlErrorMetersPerSecond);
}

function validateTruckTuning(tuning: TruckTuning): void {
  assertPositive('truck.maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);
  assertPositive(
    'truck.engineAccelerationMetersPerSecondSquared',
    tuning.engineAccelerationMetersPerSecondSquared
  );
  assertPositive(
    'truck.coastDecelerationMetersPerSecondSquared',
    tuning.coastDecelerationMetersPerSecondSquared
  );
}

function validateUnit(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0 || value > 1) throw new RangeError(`${label} must be in [0, 1], got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
