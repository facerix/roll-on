import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_ROAD_FEATURE_GENERATOR_ID,
  challengeDifficultyForStage,
  generateChallengeRoadFeatures,
  validateChallengeRoadFeatures,
} from '../../src/game/challengeRoadFeatures.ts';
import { generateChallengeRoute } from '../../src/game/challengeRouteGenerator.ts';
import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { createRoute } from '../../src/game/route.ts';
import {
  createPatrolEncounterState,
  getActivePatrolEncounter,
  stepPatrolEncounter,
} from '../../src/game/patrolEncounter.ts';

test('equal encounter seeds reproduce deeply frozen road features', () => {
  const route = generateChallengeRoute(0x12_34).route;
  const first = generateChallengeRoadFeatures(0xab_cd, { stageNumber: 1, route });
  const repeated = generateChallengeRoadFeatures(0xab_cd, { stageNumber: 1, route });

  assert.deepEqual(first, repeated);
  assert.equal(first.generatorId, CHALLENGE_ROAD_FEATURE_GENERATOR_ID);
  assert.equal(first.seed, 0xab_cd);
  assert.ok(first.attempt >= 1);
  assert.equal(first.pullouts.length, 1);
  assert.equal(first.patrolEncounters.length, 1);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.difficulty));
  assert.ok(Object.isFrozen(first.pullouts));
  assert.ok(Object.isFrozen(first.pullouts[0]));
  assert.ok(Object.isFrozen(first.patrolEncounters));
  assert.ok(Object.isFrozen(first.patrolEncounters[0]));
});

test('representative different encounter seeds produce different valid placements', () => {
  const route = generateChallengeRoute(0x51_51).route;
  const featureSets = [1, 2, 3, 4, 5].map(seed =>
    generateChallengeRoadFeatures(seed, { stageNumber: 1, route })
  );

  assert.ok(new Set(featureSets.map(features => JSON.stringify(features.pullouts))).size >= 3);
  for (const features of featureSets) validateChallengeRoadFeatures(features, route);
});

test('encounter generation is independent of route choice when both routes support the contract', () => {
  const firstRoute = generateChallengeRoute(11).route;
  const otherRoute = generateChallengeRoute(99).route;
  const first = generateChallengeRoadFeatures(123, { stageNumber: 5, route: firstRoute });
  const repeated = generateChallengeRoadFeatures(123, { stageNumber: 5, route: otherRoute });

  assert.deepEqual(first, repeated);
});

test('generated pullouts fit the road and pair one-to-one with readable encounter windows', () => {
  const route = generateChallengeRoute(0x90_90).route;
  const features = generateChallengeRoadFeatures(0x80_80, { stageNumber: 5, route });
  const road = createRoad(DEFAULT_ROAD_TUNING, route, { pullouts: features.pullouts });

  assert.equal(features.pullouts.length, 2);
  assert.equal(features.patrolEncounters.length, 2);
  assert.deepEqual(road.pullouts, features.pullouts);
  for (const [index, encounter] of features.patrolEncounters.entries()) {
    const pullout = features.pullouts[index]!;
    assert.equal(pullout.side, 'right');
    assert.ok(encounter.triggerDistanceMeters !== undefined);
    assert.ok(encounter.triggerDistanceMeters >= pullout.startDistanceMeters + pullout.taperMeters);
    assert.ok(encounter.triggerDistanceMeters <= pullout.endDistanceMeters - pullout.taperMeters);
    assert.ok(
      encounter.windowEndDistanceMeters - encounter.windowStartDistanceMeters >=
        features.difficulty.minimumEscapeWindowMeters
    );
  }
  for (let index = 1; index < features.patrolEncounters.length; index += 1) {
    const previous = features.patrolEncounters[index - 1]!;
    const current = features.patrolEncounters[index]!;
    assert.ok(
      current.windowStartDistanceMeters - previous.windowEndDistanceMeters >=
        features.difficulty.minimumRecoveryMeters
    );
  }
});

test('a two-trap stage resolves triggers sequentially without creating two active patrols', () => {
  const route = generateChallengeRoute(0x91_91).route;
  const features = generateChallengeRoadFeatures(0x81_81, { stageNumber: 5, route });
  const [first, second] = features.patrolEncounters;
  assert.ok(first?.triggerDistanceMeters !== undefined);
  assert.ok(second?.triggerDistanceMeters !== undefined);
  let state = createPatrolEncounterState({ definitions: features.patrolEncounters });

  state = stepPatrolEncounter({
    state,
    frame: patrolFrame(first.triggerDistanceMeters - 1, first.triggerDistanceMeters, 20),
  }).state;
  assert.equal(state.encounters[0]!.phase, 'resolved');
  assert.equal(getActivePatrolEncounter(state), null);

  state = stepPatrolEncounter({
    state,
    frame: patrolFrame(second.triggerDistanceMeters - 1, second.triggerDistanceMeters, 30),
  }).state;
  assert.equal(getActivePatrolEncounter(state)?.id, second.id);
  assert.equal(
    state.encounters.filter(encounter =>
      ['pulling-out', 'closing', 'flanking', 'telegraphing', 'sideswiping', 'recovering'].includes(
        encounter.phase
      )
    ).length,
    1
  );
});

test('stage difficulty is deterministic, bounded, and preserves fairness floors', () => {
  assert.deepEqual(challengeDifficultyForStage(1), challengeDifficultyForStage(2));
  assert.equal(challengeDifficultyForStage(1).encounterCount, 1);
  assert.equal(challengeDifficultyForStage(1).requiredAvoids, 1);
  assert.equal(challengeDifficultyForStage(3).encounterCount, 1);
  assert.equal(challengeDifficultyForStage(3).requiredAvoids, 2);
  assert.equal(challengeDifficultyForStage(5).encounterCount, 2);
  assert.equal(challengeDifficultyForStage(5).requiredAvoids, 2);
  assert.deepEqual(challengeDifficultyForStage(5), challengeDifficultyForStage(5_000));

  for (const stageNumber of [1, 2, 3, 4, 5, 5_000]) {
    const difficulty = challengeDifficultyForStage(stageNumber);
    assert.ok(difficulty.minimumApproachMeters >= 300);
    assert.ok(difficulty.minimumRecoveryMeters >= 250);
    assert.ok(difficulty.minimumEscapeWindowMeters >= 250);
    assert.ok(difficulty.minimumSideClearanceMeters >= 2.6);
    assert.ok(Object.isFrozen(difficulty));
  }
});

test('invalid inputs and unsupported routes fail after a bounded attempt count', () => {
  const tooShort = createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 500 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 14, minimumBendRadiusMeters: 100 },
  });

  assert.throws(() => challengeDifficultyForStage(0), /stageNumber/);
  assert.throws(
    () => generateChallengeRoadFeatures(1, { stageNumber: 1, route: tooShort, maxAttempts: 3 }),
    /failed after 3 attempts/
  );
  assert.throws(
    () =>
      generateChallengeRoadFeatures(1, {
        stageNumber: 1,
        route: generateChallengeRoute(1).route,
        maxAttempts: 0,
      }),
    /maxAttempts/
  );
});

function patrolFrame(
  previousRouteDistanceMeters: number,
  routeDistanceMeters: number,
  speedMetersPerSecond: number
) {
  return {
    dtSeconds: 1 / 60,
    previousRouteDistanceMeters,
    routeDistanceMeters,
    speedMetersPerSecond,
    maximumSpeedMetersPerSecond: 40,
    patrolGapMeters: 0,
    leftClearanceMeters: 10,
    rightClearanceMeters: 10,
    hasPatrolContact: false,
    roadRageIncidents: 0,
    isTerminal: false,
  };
}
