import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinalTally } from '../../src/game/finalTally.ts';
import { createStageRunState, stepStageRun, type StageRunFrame } from '../../src/game/stageRun.ts';

function terminal(phase: 'completed' | 'failed', overrides: Partial<StageRunFrame> = {}) {
  const frame: StageRunFrame = {
    routeDistanceMeters: phase === 'completed' ? 2_200 : 1_234.9,
    speedMetersPerSecond: phase === 'completed' ? 20 : 0,
    fuelLevel: 0.25,
    cargoIntegrity: 0.8,
    elapsedRunSeconds: 100,
    score: 0,
    roadRageCount: 2,
    truckStatus: phase === 'completed' ? 'driving' : 'crashed',
    ...overrides,
  };
  return stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: phase === 'completed' ? 2_199 : 1_234,
    frame,
  });
}

test('final tally explains each accepted score component', () => {
  assert.deepEqual(buildFinalTally(terminal('completed')), {
    baseDeliveredCargo: 22_000,
    cargoIntegrityPoints: 1_600,
    dieselResiduals: 250,
    roadRagePenalties: 500,
    bonuses: 0,
    total: 23_350,
  });
});

test('a completed dry tank earns the documented bonus without residual points', () => {
  assert.deepEqual(buildFinalTally(terminal('completed', { fuelLevel: 0 })).dieselResiduals, 0);
  assert.equal(buildFinalTally(terminal('completed', { fuelLevel: 0 })).bonuses, 2_500);
});

test('failed runs use reached distance, receive no completion bonus, and floor at zero', () => {
  assert.deepEqual(
    buildFinalTally(
      terminal('failed', {
        routeDistanceMeters: 0,
        cargoIntegrity: 0,
        fuelLevel: 0,
        roadRageCount: 20,
      })
    ),
    {
      baseDeliveredCargo: 0,
      cargoIntegrityPoints: 0,
      dieselResiduals: 0,
      roadRagePenalties: 5_000,
      bonuses: 0,
      total: 0,
    }
  );
});

test('final tally rejects running state, invalid tuning, and corrupt snapshot values', () => {
  assert.throws(() => buildFinalTally(createStageRunState()), /terminal/);
  assert.throws(
    () => buildFinalTally(terminal('completed'), { dieselResidualMultiplier: Number.NaN }),
    /dieselResidualMultiplier/
  );
});
