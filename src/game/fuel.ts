import type { TruckControls, TruckState, TruckTuning } from '/src/game/truck.js';

export interface FuelState {
  /** Normalized tank level: 1 is full, 0 is empty. */
  readonly level: number;
  /** Armed while the truck is ready to pay a stop-to-go launch gulp. */
  readonly launchGulpArmed: boolean;
}

export interface FuelTuning {
  readonly efficientCruiseSpeedRatio: number;
  readonly baselineDrainPerSecond: number;
  readonly highSpeedDrainMultiplier: number;
  readonly highSpeedDrainExponent: number;
  readonly lowSpeedGulpSpeedRatio: number;
  readonly hardThrottleThreshold: number;
  readonly launchGulpDrain: number;
  readonly fumesThreshold: number;
  readonly fumesTopSpeedMultiplier: number;
}

export interface FuelStepInput {
  readonly speedMetersPerSecond: number;
  readonly maxForwardSpeedMetersPerSecond: number;
  readonly throttle: number;
  readonly isTruckCrashed: boolean;
}

export interface FuelBurnBreakdown {
  readonly baselineDrain: number;
  readonly highSpeedDrain: number;
  readonly launchGulpDrain: number;
  readonly totalDrain: number;
  readonly drainRatePerSecond: number;
}

export interface FuelStepResult {
  readonly fuel: FuelState;
  readonly burn: FuelBurnBreakdown;
}

export const DEFAULT_FUEL_TUNING: FuelTuning = Object.freeze({
  efficientCruiseSpeedRatio: 0.55,
  // Prototype target: roughly 2 minutes and 15 seconds at efficient cruise.
  baselineDrainPerSecond: 1 / 135,
  highSpeedDrainMultiplier: 2.4,
  highSpeedDrainExponent: 2,
  lowSpeedGulpSpeedRatio: 0.15,
  hardThrottleThreshold: 0.85,
  launchGulpDrain: 0.012,
  fumesThreshold: 0.05,
  fumesTopSpeedMultiplier: 0.42,
});

export function createFuelState(initial: Partial<FuelState> = {}): FuelState {
  const state = {
    level: initial.level ?? 1,
    launchGulpArmed: initial.launchGulpArmed ?? true,
  };
  validateFuelState(state);

  return { ...state };
}

export function isFuelInFumes(fuel: FuelState, tuning: FuelTuning = DEFAULT_FUEL_TUNING): boolean {
  validateFuelState(fuel);
  validateFuelTuning(tuning);
  return fuel.level <= tuning.fumesThreshold;
}

export function isFuelEmpty(fuel: FuelState): boolean {
  validateFuelState(fuel);
  return fuel.level <= 0;
}

export function stepFuel(
  fuel: FuelState,
  input: FuelStepInput,
  dtSeconds: number,
  tuning: FuelTuning = DEFAULT_FUEL_TUNING
): FuelStepResult {
  validateFuelState(fuel);
  validateFuelInput(input);
  validateFuelTuning(tuning);
  assertFinite('dtSeconds', dtSeconds);
  if (dtSeconds < 0) {
    throw new RangeError(`dtSeconds must be non-negative, got ${dtSeconds}`);
  }

  const speedRatio = clamp(input.speedMetersPerSecond / input.maxForwardSpeedMetersPerSecond, 0, 1);
  const canDrain = !input.isTruckCrashed && fuel.level > 0 && dtSeconds > 0;
  const hardLaunch =
    canDrain &&
    fuel.launchGulpArmed &&
    input.throttle >= tuning.hardThrottleThreshold &&
    speedRatio <= tuning.lowSpeedGulpSpeedRatio;
  const baselineDrain = canDrain
    ? tuning.baselineDrainPerSecond *
      Math.min(1, speedRatio / tuning.efficientCruiseSpeedRatio) *
      dtSeconds
    : 0;
  const highSpeedDrain =
    canDrain && speedRatio > tuning.efficientCruiseSpeedRatio
      ? tuning.baselineDrainPerSecond *
        tuning.highSpeedDrainMultiplier *
        Math.pow(
          (speedRatio - tuning.efficientCruiseSpeedRatio) / (1 - tuning.efficientCruiseSpeedRatio),
          tuning.highSpeedDrainExponent
        ) *
        dtSeconds
      : 0;
  const launchGulpDrain = hardLaunch ? tuning.launchGulpDrain : 0;
  const totalDrain = baselineDrain + highSpeedDrain + launchGulpDrain;
  const nextLevel = clamp(fuel.level - totalDrain, 0, 1);
  const shouldArmGulp =
    input.throttle < tuning.hardThrottleThreshold && speedRatio <= tuning.lowSpeedGulpSpeedRatio;

  return {
    fuel: {
      level: nextLevel,
      launchGulpArmed: hardLaunch ? false : fuel.launchGulpArmed || shouldArmGulp,
    },
    burn: {
      baselineDrain,
      highSpeedDrain,
      launchGulpDrain,
      totalDrain,
      drainRatePerSecond: dtSeconds > 0 ? totalDrain / dtSeconds : 0,
    },
  };
}

export function buildFuelLimitedControls(fuel: FuelState, controls: TruckControls): TruckControls {
  validateFuelState(fuel);
  return {
    ...controls,
    throttle: isFuelEmpty(fuel) ? 0 : controls.throttle,
  };
}

export function buildEffectiveTruckTuning(
  truckTuning: TruckTuning,
  fuel: FuelState,
  fuelTuning: FuelTuning = DEFAULT_FUEL_TUNING
): TruckTuning {
  validateFuelState(fuel);
  validateFuelTuning(fuelTuning);
  if (!isFuelInFumes(fuel, fuelTuning)) return truckTuning;

  const maxForwardSpeedMetersPerSecond =
    truckTuning.maxForwardSpeedMetersPerSecond * fuelTuning.fumesTopSpeedMultiplier;

  return {
    ...truckTuning,
    maxForwardSpeedMetersPerSecond,
    jackknifeMinimumSpeedMetersPerSecond: Math.min(
      truckTuning.jackknifeMinimumSpeedMetersPerSecond,
      maxForwardSpeedMetersPerSecond
    ),
  };
}

export function limitTruckSpeedForFuel(
  truck: TruckState,
  truckTuning: TruckTuning,
  fuel: FuelState,
  fuelTuning: FuelTuning = DEFAULT_FUEL_TUNING
): TruckState {
  validateFuelState(fuel);
  validateFuelTuning(fuelTuning);
  const effectiveTuning = buildEffectiveTruckTuning(truckTuning, fuel, fuelTuning);
  if (truck.speedMetersPerSecond <= effectiveTuning.maxForwardSpeedMetersPerSecond) return truck;

  return {
    ...truck,
    position: { ...truck.position },
    speedMetersPerSecond: effectiveTuning.maxForwardSpeedMetersPerSecond,
  };
}

function validateFuelState(state: FuelState): void {
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('FuelState must be an object');
  }
  assertFinite('fuel.level', state.level);
  if (state.level < 0 || state.level > 1) {
    throw new RangeError(`fuel.level must be in [0, 1], got ${state.level}`);
  }
  if (typeof state.launchGulpArmed !== 'boolean') {
    throw new TypeError('fuel.launchGulpArmed must be boolean');
  }
}

function validateFuelInput(input: FuelStepInput): void {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('FuelStepInput must be an object');
  }
  assertFinite('speedMetersPerSecond', input.speedMetersPerSecond);
  assertFinite('maxForwardSpeedMetersPerSecond', input.maxForwardSpeedMetersPerSecond);
  assertFinite('throttle', input.throttle);
  if (input.speedMetersPerSecond < 0) {
    throw new RangeError(
      `speedMetersPerSecond must be non-negative, got ${input.speedMetersPerSecond}`
    );
  }
  if (input.maxForwardSpeedMetersPerSecond <= 0) {
    throw new RangeError(
      `maxForwardSpeedMetersPerSecond must be positive, got ${input.maxForwardSpeedMetersPerSecond}`
    );
  }
  if (input.throttle < 0 || input.throttle > 1) {
    throw new RangeError(`throttle must be in [0, 1], got ${input.throttle}`);
  }
  if (typeof input.isTruckCrashed !== 'boolean') {
    throw new TypeError('isTruckCrashed must be boolean');
  }
}

function validateFuelTuning(tuning: FuelTuning): void {
  const unitFields = [
    ['efficientCruiseSpeedRatio', tuning.efficientCruiseSpeedRatio],
    ['lowSpeedGulpSpeedRatio', tuning.lowSpeedGulpSpeedRatio],
    ['hardThrottleThreshold', tuning.hardThrottleThreshold],
    ['fumesThreshold', tuning.fumesThreshold],
    ['fumesTopSpeedMultiplier', tuning.fumesTopSpeedMultiplier],
  ] as const;
  for (const [label, value] of unitFields) {
    assertFinite(label, value);
    if (value <= 0 || value >= 1) {
      throw new RangeError(`${label} must be greater than 0 and less than 1, got ${value}`);
    }
  }
  const positiveFields = [
    ['baselineDrainPerSecond', tuning.baselineDrainPerSecond],
    ['highSpeedDrainMultiplier', tuning.highSpeedDrainMultiplier],
    ['highSpeedDrainExponent', tuning.highSpeedDrainExponent],
    ['launchGulpDrain', tuning.launchGulpDrain],
  ] as const;
  for (const [label, value] of positiveFields) {
    assertFinite(label, value);
    if (value <= 0) {
      throw new RangeError(`${label} must be positive, got ${value}`);
    }
  }
  if (tuning.lowSpeedGulpSpeedRatio >= tuning.efficientCruiseSpeedRatio) {
    throw new RangeError('lowSpeedGulpSpeedRatio must be below efficientCruiseSpeedRatio');
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
