import type { FuelState, FuelTuning } from '/src/game/fuel.js';
import type { TruckState, TruckTuning } from '/src/game/truck.js';

export interface GameHudSnapshot {
  readonly speedMphText: string;
  readonly speedMetersPerSecondText: string;
  readonly topSpeedPercentText: string;
  readonly cargoIntegrityText: string;
  readonly fuelPercentText: string;
  readonly fuelLevel: number;
  readonly isFuelInFumes: boolean;
  readonly fuelStatusText: string;
  readonly distanceText: string;
  readonly routeProgressText: string;
  readonly statusText: string;
  readonly scoreText: string;
  readonly takedownsText: string;
  readonly eventText: string;
}

export interface GameHudRunStats {
  readonly score: number;
  readonly takedowns: number;
  readonly eventText: string;
  /** Route-space progress, never inferred from Cartesian world coordinates. */
  readonly routeDistanceMeters: number;
  readonly routeLengthMeters: number;
  /** Reserved for the M6.5 lifecycle; it only affects presentation here. */
  readonly isStageComplete: boolean;
}

const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const DEFAULT_FUMES_THRESHOLD = 0.05;

export function buildGameHudSnapshot(
  truck: TruckState,
  tuning: TruckTuning,
  fuel: FuelState,
  fuelTuning?: FuelTuning,
  runStats: GameHudRunStats = {
    score: 0,
    takedowns: 0,
    eventText: '',
    routeDistanceMeters: 0,
    routeLengthMeters: 1,
    isStageComplete: false,
  }
): GameHudSnapshot {
  assertFinite('speedMetersPerSecond', truck.speedMetersPerSecond);
  assertFinite('position.yMeters', truck.position.yMeters);
  assertFinite('cargoIntegrity', truck.cargoIntegrity);
  assertFinite('fuel.level', fuel.level);
  assertPositive('maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);
  assertNonNegativeInteger('score', runStats.score);
  assertNonNegativeInteger('takedowns', runStats.takedowns);
  assertNonNegative('routeDistanceMeters', runStats.routeDistanceMeters);
  assertPositive('routeLengthMeters', runStats.routeLengthMeters);

  const topSpeedPercent = clamp(
    truck.speedMetersPerSecond / tuning.maxForwardSpeedMetersPerSecond,
    0,
    1
  );
  const cargoIntegrity = clamp(truck.cargoIntegrity, 0, 1);
  const fuelLevel = clamp(fuel.level, 0, 1);
  const fumes = fuelLevel <= (fuelTuning?.fumesThreshold ?? DEFAULT_FUMES_THRESHOLD);
  const routeProgress = clamp(runStats.routeDistanceMeters / runStats.routeLengthMeters, 0, 1);

  return {
    speedMphText: String(Math.round(truck.speedMetersPerSecond * METERS_PER_SECOND_TO_MPH)),
    speedMetersPerSecondText: `${truck.speedMetersPerSecond.toFixed(1)} m/s`,
    topSpeedPercentText: `${Math.round(topSpeedPercent * 100)}%`,
    cargoIntegrityText: `${Math.round(cargoIntegrity * 100)}%`,
    fuelPercentText: `${Math.round(fuelLevel * 100)}%`,
    fuelLevel,
    isFuelInFumes: fumes,
    fuelStatusText: fumes ? 'FUMES' : 'FUEL',
    distanceText: `${Math.max(0, Math.round(truck.position.yMeters))} m`,
    routeProgressText: `${Math.round(routeProgress * 100)}%`,
    statusText: resolveStatusText(truck, fumes, runStats),
    scoreText: runStats.score.toLocaleString('en-US'),
    takedownsText: String(runStats.takedowns),
    eventText: runStats.eventText,
  };
}

/**
 * One visible status prevents competing alerts from hiding each other. The
 * stage lifecycle wins, then terminal truck state, recoverable control state,
 * fuel, and finally a transient event. The event text remains separately
 * visible for its detail.
 */
function resolveStatusText(truck: TruckState, fumes: boolean, runStats: GameHudRunStats): string {
  if (runStats.isStageComplete) return 'STAGE COMPLETE';
  if (truck.status === 'crashed') return 'CRASHED';
  if (truck.status === 'jackknifed') return 'JACKKNIFED';
  if (fumes) return 'FUMES';
  if (runStats.eventText.length > 0) return 'EVENT';
  return 'DRIVING';
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive, got ${value}`);
  }
}

function assertNonNegativeInteger(label: string, value: number): void {
  assertFinite(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
