import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateScore } from '../../src/game/score.ts';

test('score combines base cargo, integrity multiplier, and takedown points', () => {
  assert.equal(
    calculateScore({
      baseDeliveredCargo: 1_000,
      cargoIntegrity: 0.85,
      integrityMultiplier: 2_000,
      takedownCount: 3,
      pointsPerTakedown: 250,
    }),
    3_450
  );
});

test('score rounds once after evaluating the formula', () => {
  assert.equal(
    calculateScore({
      baseDeliveredCargo: 10,
      cargoIntegrity: 1 / 3,
      integrityMultiplier: 10,
      takedownCount: 0,
      pointsPerTakedown: 250,
    }),
    13
  );
});

test('score rejects corrupt ranges instead of silently producing a bogus total', () => {
  assert.throws(
    () =>
      calculateScore({
        baseDeliveredCargo: 0,
        cargoIntegrity: 1.01,
        integrityMultiplier: 1,
        takedownCount: 0,
        pointsPerTakedown: 1,
      }),
    RangeError
  );
});
