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
  readonly statusText: string;
}

const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const DEFAULT_FUMES_THRESHOLD = 0.05;

export function buildGameHudSnapshot(
  truck: TruckState,
  tuning: TruckTuning,
  fuel: FuelState,
  fuelTuning?: FuelTuning
): GameHudSnapshot {
  assertFinite('speedMetersPerSecond', truck.speedMetersPerSecond);
  assertFinite('distanceMeters', truck.position.distanceMeters);
  assertFinite('cargoIntegrity', truck.cargoIntegrity);
  assertFinite('fuel.level', fuel.level);
  assertPositive('maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);

  const topSpeedPercent = clamp(
    truck.speedMetersPerSecond / tuning.maxForwardSpeedMetersPerSecond,
    0,
    1
  );
  const cargoIntegrity = clamp(truck.cargoIntegrity, 0, 1);
  const fuelLevel = clamp(fuel.level, 0, 1);
  const fumes = fuelLevel <= (fuelTuning?.fumesThreshold ?? DEFAULT_FUMES_THRESHOLD);

  return {
    speedMphText: String(Math.round(truck.speedMetersPerSecond * METERS_PER_SECOND_TO_MPH)),
    speedMetersPerSecondText: `${truck.speedMetersPerSecond.toFixed(1)} m/s`,
    topSpeedPercentText: `${Math.round(topSpeedPercent * 100)}%`,
    cargoIntegrityText: `${Math.round(cargoIntegrity * 100)}%`,
    fuelPercentText: `${Math.round(fuelLevel * 100)}%`,
    fuelLevel,
    isFuelInFumes: fumes,
    fuelStatusText: fumes ? 'FUMES' : 'FUEL',
    distanceText: `${Math.max(0, Math.round(truck.position.distanceMeters))} m`,
    statusText: truck.status.toUpperCase(),
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
