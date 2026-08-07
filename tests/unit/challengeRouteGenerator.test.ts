import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_ROUTE_GENERATOR_ID,
  CHALLENGE_ROUTE_GENERATOR_VERSION,
  CHALLENGE_ROUTE_CONSTRAINTS,
  generateChallengeRoute,
  validateChallengeRouteDefinition,
} from '../../src/game/challengeRouteGenerator.ts';
import { sampleRoute } from '../../src/game/route.ts';

test('equal route seeds reproduce the complete resolved route definition', () => {
  const first = generateChallengeRoute(0x12_34_56_78);
  const repeated = generateChallengeRoute(0x12_34_56_78);

  assert.deepEqual(first, repeated);
  assert.equal(first.generatorId, CHALLENGE_ROUTE_GENERATOR_ID);
  assert.equal(first.generatorVersion, CHALLENGE_ROUTE_GENERATOR_VERSION);
  assert.equal(first.seed, 0x12_34_56_78);
  assert.ok(first.attempt >= 1);
  assert.equal(first.route.totalLengthMeters, 2_200);
  assert.ok(Object.isFrozen(first.definition));
  assert.ok(Object.isFrozen(first.definition.segments));
});

test('representative different route seeds choose different vetted phrases', () => {
  const definitions = [1, 2, 3, 4, 5].map(seed =>
    JSON.stringify(generateChallengeRoute(seed).definition)
  );

  assert.ok(new Set(definitions).size >= 3);
});

test('generated routes satisfy length, continuity, finite geometry, recovery, and clearance rules', () => {
  for (const seed of [0, 1, 0x51_51_51, 0xffff_ffff]) {
    const generated = generateChallengeRoute(seed);
    const route = generated.route;

    assert.equal(route.totalLengthMeters, 2_200);
    validateChallengeRouteDefinition(generated.definition);

    for (let index = 1; index < route.segments.length; index += 1) {
      const previous = route.segments[index - 1]!;
      const current = route.segments[index]!;
      assert.deepEqual(current.start, previous.end);
      assert.equal(current.startHeadingRadians, previous.endHeadingRadians);
    }

    for (let distance = 0; distance <= route.totalLengthMeters; distance += 10) {
      const sample = sampleRoute(route, distance);
      assert.ok(Number.isFinite(sample.center.xMeters));
      assert.ok(Number.isFinite(sample.center.yMeters));
      assert.ok(
        Math.abs(sample.center.xMeters) <=
          CHALLENGE_ROUTE_CONSTRAINTS.maximumAbsoluteCenterOffsetMeters
      );
    }
  }
});

test('invalid inputs and unsatisfiable constraints fail after a bounded attempt count', () => {
  assert.throws(() => generateChallengeRoute(NaN), TypeError);
  assert.throws(
    () => generateChallengeRoute(1, { maxAttempts: 0 }),
    /maxAttempts must be a positive integer/
  );
  assert.throws(
    () =>
      generateChallengeRoute(1, {
        maxAttempts: 3,
        constraints: {
          ...CHALLENGE_ROUTE_CONSTRAINTS,
          minimumBendRadiusMeters: 1_000,
        },
      }),
    /failed after 3 attempts/
  );
});
