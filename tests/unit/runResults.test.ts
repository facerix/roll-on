import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinalTally } from '../../src/game/finalTally.ts';
import {
  buildHighScoreTablePresentation,
  createEmptyRunResultStore,
  createRunResult,
  insertRunResult,
  parseRunResultStore,
  serializeRunResultStore,
  type RunResultRecord,
} from '../../src/game/runResults.ts';
import {
  createGameSession,
  failChallengeRun,
  type GameSession,
} from '../../src/game/gameSession.ts';
import { createRoadForSession } from '../../src/game/sessionRoute.ts';
import {
  createStageRunState,
  stepStageRun,
  type StageRunFrame,
  type StageRunState,
} from '../../src/game/stageRun.ts';

const NOW = '2026-08-27T12:00:00.000Z';

function terminal(
  phase: 'completed' | 'failed',
  overrides: Partial<StageRunFrame> = {}
): StageRunState {
  const frame: StageRunFrame = {
    routeDistanceMeters: phase === 'completed' ? 2_200 : 500,
    speedMetersPerSecond: phase === 'completed' ? 20 : 0,
    fuelLevel: 0.2,
    cargoIntegrity: 0.75,
    elapsedRunSeconds: 99.25,
    score: 0,
    roadRageCount: 1,
    truckStatus: phase === 'completed' ? 'driving' : 'crashed',
    ...overrides,
  };
  return stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: phase === 'completed' ? 2_199 : 499,
    frame,
  });
}

function campaignResult(
  overrides: {
    id?: string;
    completedAt?: string;
    elapsedRunSeconds?: number;
    cargoIntegrity?: number;
  } = {}
): RunResultRecord {
  const state = terminal('completed', {
    elapsedRunSeconds: overrides.elapsedRunSeconds ?? 99.25,
    cargoIntegrity: overrides.cargoIntegrity ?? 0.75,
  });
  return createRunResult({
    id: overrides.id ?? 'campaign-1',
    completedAt: overrides.completedAt ?? NOW,
    session: createGameSession({
      mode: 'campaign',
      stageId: 'interstate-80',
      routeId: 'stage-1-authored-v1',
    }),
    terminalState: state,
    finalStageTally: buildFinalTally(state),
  });
}

test('legacy score arrays migrate once into the versioned Campaign channel', () => {
  let ids = 0;
  const migrated = parseRunResultStore(
    JSON.stringify([{ id: 'old-1', score: 4_200, date: '2025-01-02T03:04:05Z' }, { score: 900 }]),
    { createId: () => `generated-${++ids}`, now: () => NOW }
  );

  assert.equal(migrated.version, 1);
  assert.deepEqual(
    migrated.results.map(result => [result.id, result.scoreChannel, result.score]),
    [
      ['old-1', 'campaign', 4_200],
      ['generated-1', 'campaign', 900],
    ]
  );
  assert.equal(migrated.results[0]?.completedAt, '2025-01-02T03:04:05.000Z');
  assert.deepEqual(
    parseRunResultStore(serializeRunResultStore(migrated), {
      createId: () => 'must-not-be-used',
      now: () => 'must-not-be-used',
    }),
    migrated
  );
});

test('unknown versions, malformed JSON, invalid legacy records, and corrupt records fail loudly', () => {
  const options = { createId: () => 'id', now: () => NOW };
  assert.throws(() => parseRunResultStore('{', options), SyntaxError);
  assert.throws(
    () => parseRunResultStore(JSON.stringify({ version: 99, results: [] }), options),
    /version/
  );
  assert.throws(() => parseRunResultStore(JSON.stringify([{ id: 'bad' }]), options), /score/);

  const corrupt = JSON.parse(
    serializeRunResultStore(insertRunResult(createEmptyRunResultStore(), campaignResult()))
  );
  corrupt.results[0].score = Number.NaN;
  assert.throws(() => parseRunResultStore(JSON.stringify(corrupt), options), /score/);
});

test('inserting the same immutable result is exact-once while an id collision fails', () => {
  const result = campaignResult();
  const once = insertRunResult(createEmptyRunResultStore(), result);
  assert.equal(once.results.length, 1);
  assert.equal(insertRunResult(once, result), once);

  const conflicting = campaignResult({ id: result.id, cargoIntegrity: 0.2 });
  assert.throws(() => insertRunResult(once, conflicting), /collision/);
});

test('Campaign and Challenge results rank independently with deterministic tie-breaking', () => {
  const faster = campaignResult({ id: 'faster', elapsedRunSeconds: 80 });
  const slower = campaignResult({ id: 'slower', elapsedRunSeconds: 100 });
  let store = insertRunResult(createEmptyRunResultStore(), slower);
  store = insertRunResult(store, faster);

  const failedState = terminal('failed', { routeDistanceMeters: 750 });
  const activeChallenge = createGameSession({ mode: 'challenge', runSeed: 123 });
  const stageTally = buildFinalTally(failedState);
  const failedChallenge = failChallengeRun(activeChallenge, {
    stageScore: stageTally.total,
    routeDistanceMeters: failedState.terminalSnapshot!.routeDistanceMeters,
    cargoIntegrity: failedState.terminalSnapshot!.cargoIntegrity,
    fuelLevel: failedState.terminalSnapshot!.fuelLevel,
  });
  const challenge = createRunResult({
    id: 'challenge',
    completedAt: NOW,
    session: failedChallenge,
    terminalState: failedState,
    finalStageTally: stageTally,
  });
  store = insertRunResult(store, challenge);

  assert.deepEqual(
    buildHighScoreTablePresentation(store.results, 'campaign').rows.map(row => row.id),
    ['faster', 'slower']
  );
  assert.deepEqual(
    buildHighScoreTablePresentation(store.results, 'challenge').rows.map(row => row.id),
    ['challenge']
  );
});

test('empty and full high-score tables expose semantic presentation states', () => {
  assert.deepEqual(buildHighScoreTablePresentation([], 'campaign'), {
    channel: 'campaign',
    heading: 'COAST TO COAST',
    emptyMessage: 'NO RUNS RECORDED',
    rows: [],
  });
  const table = buildHighScoreTablePresentation([campaignResult()], 'campaign');
  assert.equal(table.emptyMessage, null);
  assert.deepEqual(table.rows[0], {
    id: 'campaign-1',
    rank: 1,
    scoreText: '23,450',
    detailText: '01:39 · 75% CARGO',
    isCurrent: false,
  });
});

test('persisted generated identity round-trips to identical route and road features', () => {
  const state = terminal('failed', { routeDistanceMeters: 1_100 });
  const active = createGameSession({ mode: 'challenge', runSeed: 0x1234_5678 });
  const tally = buildFinalTally(state);
  const failed = failChallengeRun(active, {
    stageScore: tally.total,
    routeDistanceMeters: state.terminalSnapshot!.routeDistanceMeters,
    cargoIntegrity: state.terminalSnapshot!.cargoIntegrity,
    fuelLevel: state.terminalSnapshot!.fuelLevel,
  });
  const record = createRunResult({
    id: 'challenge-roundtrip',
    completedAt: NOW,
    session: failed,
    terminalState: state,
    finalStageTally: tally,
  });
  const parsed = parseRunResultStore(
    serializeRunResultStore(insertRunResult(createEmptyRunResultStore(), record)),
    { createId: () => 'unused', now: () => NOW }
  );
  const replaySession = parsed.results[0]!.session as GameSession;

  assert.deepEqual(createRoadForSession(replaySession), createRoadForSession(failed));
  assert.ok(Object.isFrozen(parsed.results[0]));
  assert.ok(Object.isFrozen(replaySession.stage));
});
