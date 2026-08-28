import type { StageRunState } from '/src/game/stageRun.js';

export interface FinalTallyTuning {
  readonly pointsPerMeter: number;
  readonly cargoIntegrityMultiplier: number;
  readonly dieselResidualMultiplier: number;
  readonly roadRagePenalty: number;
  readonly dryTankBonus: number;
  readonly finishDistanceMeters: number;
}

export const DEFAULT_FINAL_TALLY_TUNING: FinalTallyTuning = Object.freeze({
  pointsPerMeter: 10,
  cargoIntegrityMultiplier: 2_000,
  dieselResidualMultiplier: 1_000,
  roadRagePenalty: 250,
  dryTankBonus: 2_500,
  finishDistanceMeters: 2_200,
});

export interface FinalTally {
  readonly baseDeliveredCargo: number;
  readonly cargoIntegrityPoints: number;
  readonly dieselResiduals: number;
  /** Positive value displayed as a deduction. */
  readonly roadRagePenalties: number;
  readonly bonuses: number;
  readonly total: number;
}

/** Build the explainable final score only from the locked terminal simulation snapshot. */
export function buildFinalTally(
  state: StageRunState,
  tuningOverrides: Partial<FinalTallyTuning> = {}
): FinalTally {
  if (typeof state !== 'object' || state === null || state.terminalSnapshot === null) {
    throw new RangeError('final tally requires a terminal stage state');
  }
  if (state.phase !== 'completed' && state.phase !== 'failed') {
    throw new RangeError('final tally requires a completed or failed terminal state');
  }

  const tuning = { ...DEFAULT_FINAL_TALLY_TUNING, ...tuningOverrides };
  validateTuning(tuning);
  const snapshot = state.terminalSnapshot;
  assertNonNegative('routeDistanceMeters', snapshot.routeDistanceMeters);
  assertNormalized('cargoIntegrity', snapshot.cargoIntegrity);
  assertNormalized('fuelLevel', snapshot.fuelLevel);
  assertNonNegativeInteger('roadRageCount', snapshot.roadRageCount);

  const scoredDistanceMeters = Math.min(
    Math.floor(snapshot.routeDistanceMeters),
    tuning.finishDistanceMeters
  );
  const baseDeliveredCargo = safeRound(
    'baseDeliveredCargo',
    scoredDistanceMeters * tuning.pointsPerMeter
  );
  const cargoIntegrityPoints = safeRound(
    'cargoIntegrityPoints',
    snapshot.cargoIntegrity * tuning.cargoIntegrityMultiplier
  );
  const dieselResiduals = safeRound(
    'dieselResiduals',
    snapshot.fuelLevel * tuning.dieselResidualMultiplier
  );
  const roadRagePenalties = safeRound(
    'roadRagePenalties',
    snapshot.roadRageCount * tuning.roadRagePenalty
  );
  const bonuses = state.phase === 'completed' && snapshot.fuelLevel === 0 ? tuning.dryTankBonus : 0;
  const total = safeRound(
    'total',
    Math.max(
      0,
      baseDeliveredCargo + cargoIntegrityPoints + dieselResiduals - roadRagePenalties + bonuses
    )
  );

  return Object.freeze({
    baseDeliveredCargo,
    cargoIntegrityPoints,
    dieselResiduals,
    roadRagePenalties,
    bonuses,
    total,
  });
}

function validateTuning(tuning: FinalTallyTuning): void {
  assertNonNegative('pointsPerMeter', tuning.pointsPerMeter);
  assertNonNegative('cargoIntegrityMultiplier', tuning.cargoIntegrityMultiplier);
  assertNonNegative('dieselResidualMultiplier', tuning.dieselResidualMultiplier);
  assertNonNegative('roadRagePenalty', tuning.roadRagePenalty);
  assertNonNegativeInteger('dryTankBonus', tuning.dryTankBonus);
  assertPositive('finishDistanceMeters', tuning.finishDistanceMeters);
}

function safeRound(label: string, value: number): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) {
    throw new RangeError(`${label} must be a safe integer, got ${rounded}`);
  }
  return rounded;
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`);
  }
}

function assertNormalized(label: string, value: number): void {
  assertNonNegative(label, value);
  if (value > 1) throw new RangeError(`${label} must be within [0, 1], got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertNonNegative(label, value);
  if (value === 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}
