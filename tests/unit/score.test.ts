import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateScore } from '../../src/game/score.ts';

test('score subtracts a penalty for each Road Rage takedown', () => {
  assert.equal(
    calculateScore({
      baseDeliveredCargo: 1_000,
      cargoIntegrity: 0.85,
      integrityMultiplier: 2_000,
      takedownCount: 3,
      takedownPenalty: 250,
    }),
    1_950
  );
});

test('score rounds once after evaluating the formula', () => {
  assert.equal(
    calculateScore({
      baseDeliveredCargo: 10,
      cargoIntegrity: 1 / 3,
      integrityMultiplier: 10,
      takedownCount: 0,
      takedownPenalty: 250,
    }),
    13
  );
});

test('Road Rage penalties cannot reduce the score below zero', () => {
  assert.equal(
    calculateScore({
      baseDeliveredCargo: 10,
      cargoIntegrity: 0,
      integrityMultiplier: 2_000,
      takedownCount: 1,
      takedownPenalty: 250,
    }),
    0
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
        takedownPenalty: 1,
      }),
    RangeError
  );
});

test('score rejects a negative Road Rage penalty', () => {
  assert.throws(
    () =>
      calculateScore({
        baseDeliveredCargo: 0,
        cargoIntegrity: 1,
        integrityMultiplier: 1,
        takedownCount: 0,
        takedownPenalty: -1,
      }),
    RangeError
  );
});
