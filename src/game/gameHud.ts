import { isFuelInFumes, type FuelState, type FuelTuning } from '/src/game/fuel.js';
import type { TruckState, TruckTuning } from '/src/game/truck.js';

export type GameHudUnitSystem = 'imperial' | 'metric';
export type CargoIntegritySeverity = 'intact' | 'damaged' | 'critical';

export interface GameHudSnapshot {
  readonly unitSystem: GameHudUnitSystem;
  readonly speedText: string;
  readonly speedUnitText: 'MPH' | 'KM/H';
  readonly speedMetersPerSecondText: string;
  readonly cruiseSpeedText: string;
  readonly speedLevel: number;
  readonly cruiseSpeedLevel: number;
  readonly cargoIntegrityText: string;
  readonly cargoIntegrityLevel: number;
  readonly cargoIntegritySeverity: CargoIntegritySeverity;
  readonly fuelPercentText: string;
  readonly fuelLevel: number;
  readonly isFuelInFumes: boolean;
  readonly fuelStatusText: string;
  readonly distanceTraveledText: string;
  readonly distanceRemainingText: string;
  readonly routeProgress: number;
  readonly routeProgressText: string;
  readonly elapsedTimeText: string;
  readonly stageText: string;
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
  /** Accepted fixed simulation time while this run is active. */
  readonly elapsedRunSeconds: number;
  readonly stageNumber: number;
  readonly unitSystem: GameHudUnitSystem;
  /** Reserved for the M6.5 lifecycle; it only affects presentation here. */
  readonly isStageComplete: boolean;
  /** Always-on cruise setpoint controlled by the gas and brake actions. */
  readonly cruiseTargetSpeedMetersPerSecond: number;
}

export const DEFAULT_GAME_HUD_UNIT_SYSTEM: GameHudUnitSystem = 'imperial';
export const DIAL_MIN_ANGLE_DEGREES = -135;
export const DIAL_MAX_ANGLE_DEGREES = 135;

const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR = 3.6;
const METERS_PER_MILE = 1_609.344;
const METERS_PER_KILOMETER = 1_000;
const CARGO_DAMAGED_THRESHOLD = 0.6;
const CARGO_CRITICAL_THRESHOLD = 0.25;

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
    elapsedRunSeconds: 0,
    stageNumber: 1,
    unitSystem: DEFAULT_GAME_HUD_UNIT_SYSTEM,
    isStageComplete: false,
    cruiseTargetSpeedMetersPerSecond: 0,
  }
): GameHudSnapshot {
  assertNonNegative('speedMetersPerSecond', truck.speedMetersPerSecond);
  assertRange('cargoIntegrity', truck.cargoIntegrity, 0, 1);
  assertRange('fuel.level', fuel.level, 0, 1);
  assertPositive('maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);
  assertNonNegativeInteger('score', runStats.score);
  assertNonNegativeInteger('takedowns', runStats.takedowns);
  assertString('eventText', runStats.eventText);
  assertNonNegative('routeDistanceMeters', runStats.routeDistanceMeters);
  assertPositive('routeLengthMeters', runStats.routeLengthMeters);
  assertNonNegative('elapsedRunSeconds', runStats.elapsedRunSeconds);
  assertPositiveInteger('stageNumber', runStats.stageNumber);
  assertUnitSystem(runStats.unitSystem);
  assertBoolean('isStageComplete', runStats.isStageComplete);
  assertNonNegative('cruiseTargetSpeedMetersPerSecond', runStats.cruiseTargetSpeedMetersPerSecond);
  if (runStats.cruiseTargetSpeedMetersPerSecond > tuning.maxForwardSpeedMetersPerSecond) {
    throw new RangeError(
      `cruiseTargetSpeedMetersPerSecond must not exceed ${tuning.maxForwardSpeedMetersPerSecond}, got ${runStats.cruiseTargetSpeedMetersPerSecond}`
    );
  }
  if (runStats.isStageComplete && runStats.routeDistanceMeters < runStats.routeLengthMeters) {
    throw new RangeError(
      `completed stage requires route distance >= route length, got ${runStats.routeDistanceMeters} < ${runStats.routeLengthMeters}`
    );
  }

  const speedLevel = normalizeLevel(
    truck.speedMetersPerSecond,
    tuning.maxForwardSpeedMetersPerSecond
  );
  const cruiseSpeedLevel = normalizeLevel(
    runStats.cruiseTargetSpeedMetersPerSecond,
    tuning.maxForwardSpeedMetersPerSecond
  );
  const routeProgress = normalizeLevel(runStats.routeDistanceMeters, runStats.routeLengthMeters);
  const distanceRemainingMeters = Math.max(
    0,
    runStats.routeLengthMeters - runStats.routeDistanceMeters
  );
  const fumes = isFuelInFumes(fuel, fuelTuning);

  return {
    unitSystem: runStats.unitSystem,
    speedText: formatSpeed(truck.speedMetersPerSecond, runStats.unitSystem),
    speedUnitText: runStats.unitSystem === 'imperial' ? 'MPH' : 'KM/H',
    speedMetersPerSecondText: `${truck.speedMetersPerSecond.toFixed(1)} m/s`,
    cruiseSpeedText: formatSpeed(runStats.cruiseTargetSpeedMetersPerSecond, runStats.unitSystem),
    speedLevel,
    cruiseSpeedLevel,
    cargoIntegrityText: `${Math.round(truck.cargoIntegrity * 100)}%`,
    cargoIntegrityLevel: truck.cargoIntegrity,
    cargoIntegritySeverity: resolveCargoIntegritySeverity(truck.cargoIntegrity),
    fuelPercentText: `${Math.round(fuel.level * 100)}%`,
    fuelLevel: fuel.level,
    isFuelInFumes: fumes,
    fuelStatusText: fumes ? 'FUMES' : 'FUEL',
    distanceTraveledText: formatDistanceMeters(runStats.routeDistanceMeters, runStats.unitSystem),
    distanceRemainingText: formatDistanceMeters(distanceRemainingMeters, runStats.unitSystem),
    routeProgress,
    routeProgressText: `${Math.round(routeProgress * 100)}%`,
    elapsedTimeText: formatElapsedTime(runStats.elapsedRunSeconds),
    stageText: `STAGE ${runStats.stageNumber}`,
    statusText: resolveStatusText(truck, fumes, runStats),
    scoreText: runStats.score.toLocaleString('en-US'),
    takedownsText: String(runStats.takedowns),
    eventText: runStats.eventText,
  };
}

/** Map an SI speed to the authored dial arc, clamping only visual overspeed. */
export function mapSpeedToDialAngleDegrees(
  speedMetersPerSecond: number,
  maximumSpeedMetersPerSecond: number
): number {
  assertNonNegative('speedMetersPerSecond', speedMetersPerSecond);
  assertPositive('maximumSpeedMetersPerSecond', maximumSpeedMetersPerSecond);
  const level = normalizeLevel(speedMetersPerSecond, maximumSpeedMetersPerSecond);
  return DIAL_MIN_ANGLE_DEGREES + level * (DIAL_MAX_ANGLE_DEGREES - DIAL_MIN_ANGLE_DEGREES);
}

export function formatElapsedTime(elapsedRunSeconds: number): string {
  assertNonNegative('elapsedRunSeconds', elapsedRunSeconds);
  const wholeSeconds = Math.floor(elapsedRunSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDistanceMeters(
  distanceMeters: number,
  unitSystem: GameHudUnitSystem
): string {
  assertNonNegative('distanceMeters', distanceMeters);
  assertUnitSystem(unitSystem);
  if (unitSystem === 'imperial') {
    return `${(distanceMeters / METERS_PER_MILE).toFixed(1)} mi`;
  }
  return `${(distanceMeters / METERS_PER_KILOMETER).toFixed(1)} km`;
}

/** Presentation-only bands; cargo damage itself remains continuous simulation state. */
export function resolveCargoIntegritySeverity(cargoIntegrityLevel: number): CargoIntegritySeverity {
  assertRange('cargoIntegrityLevel', cargoIntegrityLevel, 0, 1);
  if (cargoIntegrityLevel <= CARGO_CRITICAL_THRESHOLD) return 'critical';
  if (cargoIntegrityLevel < CARGO_DAMAGED_THRESHOLD) return 'damaged';
  return 'intact';
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

function formatSpeed(speedMetersPerSecond: number, unitSystem: GameHudUnitSystem): string {
  const multiplier =
    unitSystem === 'imperial' ? METERS_PER_SECOND_TO_MPH : METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR;
  return String(Math.round(speedMetersPerSecond * multiplier));
}

function normalizeLevel(value: number, maximum: number): number {
  return clamp(value / maximum, 0, 1);
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

function assertPositiveInteger(label: string, value: number): void {
  assertPositive(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
}

function assertNonNegativeInteger(label: string, value: number): void {
  assertNonNegative(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertRange(label: string, value: number, min: number, max: number): void {
  assertFinite(label, value);
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}

function assertUnitSystem(value: unknown): asserts value is GameHudUnitSystem {
  if (value !== 'imperial' && value !== 'metric') {
    throw new TypeError(`unitSystem must be imperial or metric, got ${String(value)}`);
  }
}

function assertBoolean(label: string, value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
}

function assertString(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
