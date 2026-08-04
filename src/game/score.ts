export interface ScoreInput {
  readonly baseDeliveredCargo: number;
  readonly cargoIntegrity: number;
  readonly integrityMultiplier: number;
  readonly takedownCount: number;
  /** Non-negative score deduction for each Road Rage commuter collision. */
  readonly takedownPenalty: number;
}

/** Milestone 4 score subset; diesel residuals and bonuses arrive with the stage tally. */
export function calculateScore(input: ScoreInput): number {
  validateInput(input);
  return Math.max(
    0,
    Math.round(
      input.baseDeliveredCargo +
        input.cargoIntegrity * input.integrityMultiplier -
        input.takedownCount * input.takedownPenalty
    )
  );
}

function validateInput(input: ScoreInput): void {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('ScoreInput must be an object');
  }
  assertNonNegative('baseDeliveredCargo', input.baseDeliveredCargo);
  assertRange('cargoIntegrity', input.cargoIntegrity, 0, 1);
  assertNonNegative('integrityMultiplier', input.integrityMultiplier);
  assertNonNegativeInteger('takedownCount', input.takedownCount);
  assertNonNegative('takedownPenalty', input.takedownPenalty);
}

function assertNonNegative(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertNonNegativeInteger(label: string, value: number): void {
  assertNonNegative(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
}

function assertRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}
