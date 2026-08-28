import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_GENERATOR_VERSION,
  DEFAULT_CHALLENGE_INTERMISSION_POLICY,
  completeChallengeStage,
  createGameSession,
  deriveChallengeStageIdentity,
  failChallengeRun,
  startNextChallengeStage,
  type ChallengeSession,
  type CreateChallengeSessionOptions,
} from '../../src/game/gameSession.ts';

function challenge(
  overrides: Partial<Omit<CreateChallengeSessionOptions, 'mode' | 'runSeed'>> & {
    readonly runSeed?: number;
  } = {}
): ChallengeSession {
  return createGameSession({ mode: 'challenge', runSeed: 0x51_51_51, ...overrides });
}

test('Dispatch creates a fixed Campaign session with its own score channel', () => {
  const session = createGameSession({
    mode: 'campaign',
    stageId: 'interstate-80',
    routeId: 'stage-1-authored-v1',
  });

  assert.deepEqual(session, {
    mode: 'campaign',
    scoreChannel: 'campaign',
    stage: {
      stageId: 'interstate-80',
      stageNumber: 1,
      routeSource: { kind: 'authored', routeId: 'stage-1-authored-v1' },
    },
  });
  assert.ok(Object.isFrozen(session));
  assert.ok(Object.isFrozen(session.stage));
  assert.ok(Object.isFrozen(session.stage.routeSource));
});

test('Dispatch creates a fresh Challenge run with generated route identity', () => {
  const session = challenge();

  assert.equal(session.scoreChannel, 'challenge');
  assert.equal(session.phase, 'driving');
  assert.equal(session.identity.runSeed, 0x51_51_51);
  assert.equal(session.identity.generatorVersion, CHALLENGE_GENERATOR_VERSION);
  assert.equal(session.stage.stageNumber, 1);
  assert.equal(session.stage.routeSource.kind, 'generated');
  assert.equal(session.stage.routeSource.generatorId, 'route-phrases-v2');
  assert.equal(session.stage.routeSource.definition.segments.length > 0, true);
  assert.ok(Object.isFrozen(session.stage.routeSource.definition));
  assert.ok(Object.isFrozen(session.stage.routeSource.definition.segments));
  assert.equal(session.stage.roadFeatureSource.kind, 'generated');
  assert.equal(session.stage.roadFeatureSource.seed, session.stage.encounterSeed);
  assert.equal(session.stage.roadFeatureSource.pullouts.length, 1);
  assert.equal(session.stage.roadFeatureSource.patrolEncounters.length, 1);
  assert.equal(session.completedStages, 0);
  assert.equal(session.cumulativeScore, 0);
  assert.deepEqual(session.carryover, {
    cargoIntegrity: 1,
    fuelLevel: 1,
    haulCurrency: 0,
    runUpgrades: [],
  });
  assert.equal(session.failureDistanceMeters, null);
});

test('Challenge stage identities use stable independent named seeds', () => {
  const first = deriveChallengeStageIdentity(
    { runSeed: 123, generatorVersion: CHALLENGE_GENERATOR_VERSION },
    4
  );
  const repeated = deriveChallengeStageIdentity(
    { runSeed: 123, generatorVersion: CHALLENGE_GENERATOR_VERSION },
    4
  );
  const nextStage = deriveChallengeStageIdentity(
    { runSeed: 123, generatorVersion: CHALLENGE_GENERATOR_VERSION },
    5
  );
  const otherRun = deriveChallengeStageIdentity(
    { runSeed: 124, generatorVersion: CHALLENGE_GENERATOR_VERSION },
    4
  );

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, nextStage);
  assert.notDeepEqual(first, otherRun);
  assert.equal(
    new Set([
      first.stageSeed,
      first.routeSource.seed,
      first.encounterSeed,
      first.trafficSeed,
      first.shopSeed,
    ]).size,
    5
  );
});

test('completing a Challenge stage enters intermission and captures carryover', () => {
  const initial = challenge({
    initialRunUpgrades: [
      { id: 'reinforced-hitch', level: 1 },
      { id: 'fuel-cell', level: 2 },
    ],
  });
  const completed = completeChallengeStage(initial, {
    stageScore: 12_500,
    cargoIntegrity: 0.72,
    fuelLevel: 0.18,
    haulCurrencyEarned: 40,
  });

  assert.equal(completed.phase, 'intermission');
  assert.equal(completed.completedStages, 1);
  assert.equal(completed.cumulativeScore, 12_500);
  assert.equal(completed.stage.stageNumber, 1);
  assert.deepEqual(completed.carryover, {
    cargoIntegrity: 0.72,
    fuelLevel: 0.18,
    haulCurrency: 40,
    runUpgrades: [
      { id: 'reinforced-hitch', level: 1 },
      { id: 'fuel-cell', level: 2 },
    ],
  });
  assert.equal(initial.phase, 'driving');
  assert.equal(initial.cumulativeScore, 0);
});

test('starting the next Challenge stage partially refills fuel and derives a new stage', () => {
  const completed = completeChallengeStage(challenge(), {
    stageScore: 9_000,
    cargoIntegrity: 0.6,
    fuelLevel: 0.1,
    haulCurrencyEarned: 25,
  });
  const next = startNextChallengeStage(completed);

  assert.equal(next.phase, 'driving');
  assert.equal(next.stage.stageNumber, 2);
  assert.notDeepEqual(next.stage, completed.stage);
  assert.equal(next.carryover.cargoIntegrity, 0.6);
  assert.equal(
    next.carryover.fuelLevel,
    0.1 + DEFAULT_CHALLENGE_INTERMISSION_POLICY.fuelRefillFraction
  );
  assert.equal(next.carryover.haulCurrency, 25);
  assert.equal(next.cumulativeScore, 9_000);
});

test('multi-stage Challenge progression raises only bounded recorded feature pressure', () => {
  let session = challenge();
  const stages = [session.stage];
  for (let stageNumber = 2; stageNumber <= 6; stageNumber += 1) {
    session = startNextChallengeStage(
      completeChallengeStage(session, {
        stageScore: 100,
        cargoIntegrity: 0.8,
        fuelLevel: 0.5,
        haulCurrencyEarned: 1,
      })
    );
    stages.push(session.stage);
  }

  assert.deepEqual(
    stages.map(stage => ({
      stageNumber: stage.stageNumber,
      encounterCount: stage.roadFeatureSource.patrolEncounters.length,
      requiredAvoids: stage.roadFeatureSource.difficulty.requiredAvoids,
    })),
    [
      { stageNumber: 1, encounterCount: 1, requiredAvoids: 1 },
      { stageNumber: 2, encounterCount: 1, requiredAvoids: 1 },
      { stageNumber: 3, encounterCount: 1, requiredAvoids: 2 },
      { stageNumber: 4, encounterCount: 1, requiredAvoids: 2 },
      { stageNumber: 5, encounterCount: 2, requiredAvoids: 2 },
      { stageNumber: 6, encounterCount: 2, requiredAvoids: 2 },
    ]
  );
  assert.equal(session.completedStages, 5);
  assert.equal(session.cumulativeScore, 500);
  assert.equal(session.scoreChannel, 'challenge');
  assert.equal(new Set(stages.map(stage => stage.encounterSeed)).size, stages.length);
  assert.equal(new Set(stages.map(stage => stage.trafficSeed)).size, stages.length);
  assert.equal(new Set(stages.map(stage => stage.shopSeed)).size, stages.length);
});

test('the partial refill clamps at a full tank and accepts explicit tuning', () => {
  const completed = completeChallengeStage(challenge(), {
    stageScore: 1,
    cargoIntegrity: 1,
    fuelLevel: 0.9,
    haulCurrencyEarned: 0,
  });

  assert.equal(startNextChallengeStage(completed).carryover.fuelLevel, 1);
  assert.ok(
    Math.abs(
      startNextChallengeStage(completed, { fuelRefillFraction: 0.05 }).carryover.fuelLevel - 0.95
    ) < Number.EPSILON
  );
});

test('failure ends a Challenge run and a new run cannot inherit temporary state', () => {
  const initial = challenge({
    initialCargoIntegrity: 0.8,
    initialFuelLevel: 0.7,
    initialHaulCurrency: 30,
    initialRunUpgrades: [{ id: 'cowcatcher', level: 2 }],
  });
  const failed = failChallengeRun(initial, {
    stageScore: 4_500,
    routeDistanceMeters: 1_234,
    cargoIntegrity: 0.42,
    fuelLevel: 0.08,
  });

  assert.equal(failed.phase, 'failed');
  assert.equal(failed.completedStages, 0);
  assert.equal(failed.cumulativeScore, 4_500);
  assert.equal(failed.failureDistanceMeters, 1_234);
  assert.equal(failed.carryover.cargoIntegrity, 0.42);
  assert.equal(failed.carryover.fuelLevel, 0.08);
  assert.equal(
    failChallengeRun(failed, {
      stageScore: 99,
      routeDistanceMeters: 99,
      cargoIntegrity: 0,
      fuelLevel: 0,
    }),
    failed
  );

  const fresh = challenge({ runSeed: 999 });
  assert.equal(fresh.cumulativeScore, 0);
  assert.deepEqual(fresh.carryover.runUpgrades, []);
  assert.equal(fresh.carryover.haulCurrency, 0);
  assert.equal(fresh.carryover.cargoIntegrity, 1);
  assert.equal(fresh.carryover.fuelLevel, 1);
});

test('Challenge transitions reject the wrong phase instead of silently corrupting a run', () => {
  const active = challenge();
  const intermission = completeChallengeStage(active, {
    stageScore: 1,
    cargoIntegrity: 1,
    fuelLevel: 1,
    haulCurrencyEarned: 0,
  });

  assert.throws(() => startNextChallengeStage(active), /intermission/);
  assert.throws(
    () =>
      completeChallengeStage(intermission, {
        stageScore: 1,
        cargoIntegrity: 1,
        fuelLevel: 1,
        haulCurrencyEarned: 0,
      }),
    /driving/
  );
});

test('session inputs and carryover results fail loudly when invalid', () => {
  assert.throws(() => createGameSession({ mode: 'challenge', runSeed: -1 }), /runSeed/);
  assert.throws(() => createGameSession({ mode: 'challenge', runSeed: 1.5 }), /runSeed/);
  assert.throws(
    () => createGameSession({ mode: 'campaign', stageId: '', routeId: 'route' }),
    /stageId/
  );
  assert.throws(
    () =>
      completeChallengeStage(challenge(), {
        stageScore: 1,
        cargoIntegrity: 1.1,
        fuelLevel: 1,
        haulCurrencyEarned: 0,
      }),
    /cargoIntegrity/
  );
  assert.throws(
    () =>
      startNextChallengeStage(
        completeChallengeStage(challenge(), {
          stageScore: 1,
          cargoIntegrity: 1,
          fuelLevel: 1,
          haulCurrencyEarned: 0,
        }),
        { fuelRefillFraction: 1.1 }
      ),
    /fuelRefillFraction/
  );
});

test('Challenge session objects are deeply frozen snapshots', () => {
  const session: ChallengeSession = challenge({
    initialRunUpgrades: [{ id: 'fuel-cell', level: 1 }],
  });

  assert.ok(Object.isFrozen(session));
  assert.ok(Object.isFrozen(session.identity));
  assert.ok(Object.isFrozen(session.stage));
  assert.ok(Object.isFrozen(session.stage.routeSource));
  assert.ok(Object.isFrozen(session.stage.roadFeatureSource));
  assert.ok(Object.isFrozen(session.stage.roadFeatureSource.difficulty));
  assert.ok(Object.isFrozen(session.stage.roadFeatureSource.pullouts));
  assert.ok(Object.isFrozen(session.stage.roadFeatureSource.patrolEncounters));
  assert.ok(Object.isFrozen(session.carryover));
  assert.ok(Object.isFrozen(session.carryover.runUpgrades));
  assert.ok(Object.isFrozen(session.carryover.runUpgrades[0]));
});
