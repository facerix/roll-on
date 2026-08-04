import { DEFAULT_TRUCK_TUNING, type TruckControls, type TruckTuning } from '/src/game/truck.js';

export interface CruiseControlState {
  readonly targetSpeedMetersPerSecond: number;
}

export interface CruiseControlInput {
  readonly gas: number;
  readonly brake: number;
  readonly currentSpeedMetersPerSecond: number;
  readonly dtSeconds: number;
}

export interface CruiseControlTuning {
  readonly initialTargetSpeedMetersPerSecond: number;
  readonly maximumTargetSpeedMetersPerSecond: number;
  readonly targetAdjustmentMetersPerSecondSquared: number;
  readonly fullControlErrorMetersPerSecond: number;
}

export interface CruiseControlStep {
  readonly state: CruiseControlState;
  readonly controls: Pick<TruckControls, 'throttle' | 'brake'>;
}

export const DEFAULT_CRUISE_CONTROL_TUNING: CruiseControlTuning = Object.freeze({
  // Start at the established fuel-efficient cruise ratio: 50% of top speed.
  initialTargetSpeedMetersPerSecond: 20,
  maximumTargetSpeedMetersPerSecond: 40,
  // Full pedal travel moves the setpoint by roughly 22 mph each second.
  targetAdjustmentMetersPerSecondSquared: 10,
  fullControlErrorMetersPerSecond: 4,
});

export function createCruiseControlState(
  initial: Partial<CruiseControlState> = {},
  tuning: CruiseControlTuning = DEFAULT_CRUISE_CONTROL_TUNING
): CruiseControlState {
  validateTuning(tuning);
  const targetSpeedMetersPerSecond =
    initial.targetSpeedMetersPerSecond ?? tuning.initialTargetSpeedMetersPerSecond;
  assertFinite('targetSpeedMetersPerSecond', targetSpeedMetersPerSecond);
  if (
    targetSpeedMetersPerSecond < 0 ||
    targetSpeedMetersPerSecond > tuning.maximumTargetSpeedMetersPerSecond
  ) {
    throw new RangeError(
      `targetSpeedMetersPerSecond must be in [0, ${tuning.maximumTargetSpeedMetersPerSecond}], got ${targetSpeedMetersPerSecond}`
    );
  }
  return { targetSpeedMetersPerSecond };
}

/**
 * Adjust the always-on cruise setpoint and derive the physical pedal inputs
 * that pursue it. Gas and brake change the setpoint; they are not passed
 * through to the drivetrain, so releasing them retains the requested speed.
 */
export function stepCruiseControl(
  state: CruiseControlState,
  input: CruiseControlInput,
  tuning: CruiseControlTuning = DEFAULT_CRUISE_CONTROL_TUNING,
  truckTuning: TruckTuning = DEFAULT_TRUCK_TUNING
): CruiseControlStep {
  validateTuning(tuning);
  validateTruckTuning(truckTuning);
  createCruiseControlState(state, tuning);
  validateUnit('gas', input.gas);
  validateUnit('brake', input.brake);
  assertFinite('currentSpeedMetersPerSecond', input.currentSpeedMetersPerSecond);
  assertFinite('dtSeconds', input.dtSeconds);
  if (input.currentSpeedMetersPerSecond < 0) {
    throw new RangeError(
      `currentSpeedMetersPerSecond must be non-negative, got ${input.currentSpeedMetersPerSecond}`
    );
  }
  if (input.dtSeconds < 0) {
    throw new RangeError(`dtSeconds must be non-negative, got ${input.dtSeconds}`);
  }

  const targetAdjustment =
    (input.gas - input.brake) * tuning.targetAdjustmentMetersPerSecondSquared * input.dtSeconds;
  const targetSpeedMetersPerSecond = clamp(
    state.targetSpeedMetersPerSecond + targetAdjustment,
    0,
    tuning.maximumTargetSpeedMetersPerSecond
  );
  const nextState = { targetSpeedMetersPerSecond };

  if (targetSpeedMetersPerSecond === 0) {
    return {
      state: nextState,
      controls: {
        throttle: 0,
        brake: clamp(
          input.currentSpeedMetersPerSecond / tuning.fullControlErrorMetersPerSecond,
          0,
          1
        ),
      },
    };
  }

  const speedError = targetSpeedMetersPerSecond - input.currentSpeedMetersPerSecond;
  if (speedError < 0) {
    return {
      state: nextState,
      controls: {
        throttle: 0,
        brake: clamp(-speedError / tuning.fullControlErrorMetersPerSecond, 0, 1),
      },
    };
  }

  // Feed-forward throttle exactly offsets the truck model's rolling drag at
  // the setpoint. Proportional correction then closes any remaining gap.
  const targetSpeedRatio = clamp(
    targetSpeedMetersPerSecond / truckTuning.maxForwardSpeedMetersPerSecond,
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
  assertFinite('initialTargetSpeedMetersPerSecond', tuning.initialTargetSpeedMetersPerSecond);
  if (
    tuning.initialTargetSpeedMetersPerSecond < 0 ||
    tuning.initialTargetSpeedMetersPerSecond > tuning.maximumTargetSpeedMetersPerSecond
  ) {
    throw new RangeError('initialTargetSpeedMetersPerSecond must fit within the target range');
  }
  assertPositive(
    'targetAdjustmentMetersPerSecondSquared',
    tuning.targetAdjustmentMetersPerSecondSquared
  );
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
