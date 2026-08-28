/**
 * Shared dashboard speed tiers. The speedometer and highway-patrol detection
 * both read these boundaries, so a tuning edit cannot make the dial disagree
 * with what a speed trap enforces.
 */
export type SpeedTierName = 'cruise' | 'caution' | 'high' | 'limit';

export interface SpeedTier {
  readonly name: SpeedTierName;
  /** Inclusive normalized speed level at which this tier begins. */
  readonly minimumLevel: number;
  /** Exclusive normalized speed level at which this tier ends, except at 1. */
  readonly maximumLevel: number;
}

const SPEED_TIER_NAMES: readonly SpeedTierName[] = ['cruise', 'caution', 'high', 'limit'];

export const SPEED_TIERS: readonly SpeedTier[] = validateSpeedTiers([
  { name: 'cruise', minimumLevel: 0, maximumLevel: 0.55 },
  { name: 'caution', minimumLevel: 0.55, maximumLevel: 0.75 },
  { name: 'high', minimumLevel: 0.75, maximumLevel: 0.9 },
  { name: 'limit', minimumLevel: 0.9, maximumLevel: 1 },
]);

export function getSpeedTier(name: SpeedTierName): SpeedTier {
  const tier = SPEED_TIERS.find(candidate => candidate.name === name);
  if (!tier) throw new RangeError(`Unknown speed tier: ${String(name)}`);
  return tier;
}

export function getSpeedTierMinimumLevel(name: SpeedTierName): number {
  return getSpeedTier(name).minimumLevel;
}

/** Resolve a normalized level to its tier; each boundary belongs to the faster tier. */
export function resolveSpeedTierName(speedLevel: number): SpeedTierName {
  assertNormalizedLevel('speedLevel', speedLevel);
  let resolved = SPEED_TIERS[0]!.name;
  for (const tier of SPEED_TIERS) {
    if (speedLevel >= tier.minimumLevel) resolved = tier.name;
  }
  return resolved;
}

/** Absolute speed at which a tier begins, given the validated maximum speed. */
export function resolveSpeedTierThresholdMetersPerSecond(
  name: SpeedTierName,
  maximumSpeedMetersPerSecond: number
): number {
  assertPositiveFinite('maximumSpeedMetersPerSecond', maximumSpeedMetersPerSecond);
  return getSpeedTierMinimumLevel(name) * maximumSpeedMetersPerSecond;
}

/** True when a resolved speed has reached a tier. Equality counts as reached. */
export function isAtOrAboveSpeedTier(
  speedMetersPerSecond: number,
  name: SpeedTierName,
  maximumSpeedMetersPerSecond: number
): boolean {
  assertNonNegativeFinite('speedMetersPerSecond', speedMetersPerSecond);
  return (
    speedMetersPerSecond >=
    resolveSpeedTierThresholdMetersPerSecond(name, maximumSpeedMetersPerSecond)
  );
}

/** Reject gapped, overlapping, duplicated, or non-finite tier definitions. */
export function validateSpeedTiers(tiers: readonly SpeedTier[]): readonly SpeedTier[] {
  if (!Array.isArray(tiers)) throw new TypeError('speed tiers must be an array');
  if (tiers.length === 0) throw new RangeError('speed tiers must contain at least one tier');

  const seen = new Set<SpeedTierName>();
  let previous: SpeedTier | null = null;
  for (const tier of tiers) {
    if (typeof tier !== 'object' || tier === null) {
      throw new TypeError('each speed tier must be an object');
    }
    if (!SPEED_TIER_NAMES.includes(tier.name)) {
      throw new RangeError(`Unknown speed tier: ${String(tier.name)}`);
    }
    if (seen.has(tier.name)) throw new RangeError(`duplicate speed tier: ${tier.name}`);
    seen.add(tier.name);
    assertFinite(`${tier.name}.minimumLevel`, tier.minimumLevel);
    assertFinite(`${tier.name}.maximumLevel`, tier.maximumLevel);
    if (tier.maximumLevel <= tier.minimumLevel) {
      throw new RangeError(
        `${tier.name}.maximumLevel must be greater than its minimumLevel, got ${tier.maximumLevel} <= ${tier.minimumLevel}`
      );
    }
    if (previous === null) {
      if (tier.minimumLevel !== 0) {
        throw new RangeError(`speed tiers must start at 0, got ${tier.minimumLevel}`);
      }
    } else if (tier.minimumLevel !== previous.maximumLevel) {
      throw new RangeError(
        `speed tier ${tier.name} must start where tier ${previous.name} ends, got ${tier.minimumLevel} after ${previous.maximumLevel}`
      );
    }
    previous = tier;
  }
  if (previous!.maximumLevel !== 1) {
    throw new RangeError(`speed tiers must end at 1, got ${previous!.maximumLevel}`);
  }

  return Object.freeze(tiers.map(tier => Object.freeze({ ...tier })));
}

function assertNormalizedLevel(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0 || value > 1) throw new RangeError(`${label} must be in [0, 1], got ${value}`);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function assertNonNegativeFinite(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertPositiveFinite(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}
