import { buildFinalTally, type FinalTally } from '/src/game/finalTally.js';
import {
  validateGameSession,
  type GameSession,
  type ChallengeSession,
} from '/src/game/gameSession.js';
import { formatElapsedTime } from '/src/game/gameHud.js';
import type { StageRunFrame, StageRunState } from '/src/game/stageRun.js';

export const RUN_RESULT_STORE_VERSION = 1;
export type ScoreChannel = 'campaign' | 'challenge';

export interface RunResultRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly source: 'run' | 'legacy';
  readonly completedAt: string;
  readonly mode: 'campaign' | 'challenge';
  readonly scoreChannel: ScoreChannel;
  readonly outcome: 'completed' | 'failed';
  readonly score: number;
  readonly stageNumber: number;
  readonly completedStages: number;
  readonly session: GameSession | null;
  readonly terminalSnapshot: Readonly<StageRunFrame> | null;
  readonly finalStageTally: FinalTally | null;
}

export interface RunResultStore {
  readonly version: 1;
  readonly results: readonly RunResultRecord[];
}

export interface CreateRunResultOptions {
  readonly id: string;
  readonly completedAt: string;
  readonly session: GameSession;
  readonly terminalState: StageRunState;
  readonly finalStageTally: FinalTally;
}

export interface ParseRunResultStoreOptions {
  readonly createId: () => string;
  readonly now: () => string;
}

export interface HighScoreRowPresentation {
  readonly id: string;
  readonly rank: number;
  readonly scoreText: string;
  readonly detailText: string;
  readonly isCurrent: boolean;
}

export interface HighScoreTablePresentation {
  readonly channel: ScoreChannel;
  readonly heading: 'COAST TO COAST' | 'ENDLESS BLACKTOP';
  readonly emptyMessage: 'NO RUNS RECORDED' | null;
  readonly rows: readonly HighScoreRowPresentation[];
}

export function createEmptyRunResultStore(): RunResultStore {
  return Object.freeze({ version: RUN_RESULT_STORE_VERSION, results: Object.freeze([]) });
}

/** Create a durable result from terminal truth; no simulation values are recomputed here. */
export function createRunResult(options: CreateRunResultOptions): RunResultRecord {
  assertNonEmptyString('id', options.id);
  const completedAt = normalizeTimestamp('completedAt', options.completedAt);
  validateGameSession(options.session);
  const snapshot = requireTerminalSnapshot(options.terminalState);
  const expectedTally = buildFinalTally(options.terminalState);
  if (JSON.stringify(options.finalStageTally) !== JSON.stringify(expectedTally)) {
    throw new RangeError('finalStageTally does not match the terminal snapshot');
  }

  if (options.session.mode === 'campaign') {
    if (options.terminalState.phase !== 'completed') {
      throw new RangeError('only a completed Campaign run may be persisted');
    }
    return deepFreeze({
      schemaVersion: RUN_RESULT_STORE_VERSION,
      id: options.id,
      source: 'run',
      completedAt,
      mode: 'campaign',
      scoreChannel: 'campaign',
      outcome: 'completed',
      score: options.finalStageTally.total,
      stageNumber: options.session.stage.stageNumber,
      completedStages: 1,
      session: options.session,
      terminalSnapshot: snapshot,
      finalStageTally: options.finalStageTally,
    });
  }

  if (options.session.phase !== 'failed' || options.terminalState.phase !== 'failed') {
    throw new RangeError('Challenge results require a failed terminal session and stage');
  }
  if (options.session.cumulativeScore < options.finalStageTally.total) {
    throw new RangeError('Challenge cumulative score cannot be less than its final stage tally');
  }
  return deepFreeze({
    schemaVersion: RUN_RESULT_STORE_VERSION,
    id: options.id,
    source: 'run',
    completedAt,
    mode: 'challenge',
    scoreChannel: 'challenge',
    outcome: 'failed',
    score: options.session.cumulativeScore,
    stageNumber: options.session.stage.stageNumber,
    completedStages: options.session.completedStages,
    session: options.session,
    terminalSnapshot: snapshot,
    finalStageTally: options.finalStageTally,
  });
}

export function insertRunResult(store: RunResultStore, result: RunResultRecord): RunResultStore {
  validateStore(store);
  validateRunResult(result);
  const existing = store.results.find(candidate => candidate.id === result.id);
  if (existing !== undefined) {
    if (JSON.stringify(existing) === JSON.stringify(result)) return store;
    throw new RangeError(`run result id collision: ${result.id}`);
  }
  return deepFreeze({
    version: RUN_RESULT_STORE_VERSION,
    results: [result, ...store.results],
  });
}

/** Parse the current envelope or explicitly migrate the original unversioned score array. */
export function parseRunResultStore(
  json: string,
  options: ParseRunResultStoreOptions
): RunResultStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new SyntaxError(`scores storage is not valid JSON: ${errorMessage(error)}`);
  }

  if (Array.isArray(parsed)) {
    const migrated = parsed.map((value, index) => {
      if (isRecord(value) && value.schemaVersion === RUN_RESULT_STORE_VERSION) {
        validateRunResult(value as unknown as RunResultRecord);
        return value as unknown as RunResultRecord;
      }
      return migrateLegacyScore(value, index, options);
    });
    const store: RunResultStore = deepFreeze({
      version: RUN_RESULT_STORE_VERSION,
      results: migrated,
    });
    validateStore(store);
    return store;
  }

  if (!isRecord(parsed)) {
    throw new TypeError('scores storage must be a versioned object or legacy array');
  }
  if (parsed.version !== RUN_RESULT_STORE_VERSION) {
    throw new RangeError(`unsupported scores storage version: ${String(parsed.version)}`);
  }
  const store = parsed as unknown as RunResultStore;
  validateStore(store);
  return deepFreeze(store);
}

export function serializeRunResultStore(store: RunResultStore): string {
  validateStore(store);
  return JSON.stringify(store);
}

export function buildHighScoreTablePresentation(
  results: readonly RunResultRecord[],
  channel: ScoreChannel,
  currentResultId?: string,
  limit = 5
): HighScoreTablePresentation {
  if (channel !== 'campaign' && channel !== 'challenge') {
    throw new TypeError(`unknown score channel: ${String(channel)}`);
  }
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  results.forEach(validateRunResult);
  const ranked = [...results]
    .filter(result => result.scoreChannel === channel)
    .sort(compareRunResults)
    .slice(0, limit);
  const rows = ranked.map((result, index) =>
    Object.freeze({
      id: result.id,
      rank: index + 1,
      scoreText: result.score.toLocaleString('en-US'),
      detailText: buildResultDetail(result),
      isCurrent: result.id === currentResultId,
    })
  );
  return Object.freeze({
    channel,
    heading: channel === 'campaign' ? 'COAST TO COAST' : 'ENDLESS BLACKTOP',
    emptyMessage: rows.length === 0 ? 'NO RUNS RECORDED' : null,
    rows: Object.freeze(rows),
  });
}

function migrateLegacyScore(
  value: unknown,
  index: number,
  options: ParseRunResultStoreOptions
): RunResultRecord {
  if (!isRecord(value)) throw new TypeError(`legacy scores[${index}] must be an object`);
  assertNonNegativeInteger(`legacy scores[${index}].score`, value.score);
  const id = value.id === undefined ? options.createId() : value.id;
  assertNonEmptyString(`legacy scores[${index}].id`, id);
  const timestamp = value.completedAt ?? value.date ?? options.now();
  if (typeof timestamp !== 'string') {
    throw new TypeError(`legacy scores[${index}] date must be a string`);
  }
  return deepFreeze({
    schemaVersion: RUN_RESULT_STORE_VERSION,
    id,
    source: 'legacy',
    completedAt: normalizeTimestamp(`legacy scores[${index}] date`, timestamp),
    mode: 'campaign',
    scoreChannel: 'campaign',
    outcome: 'completed',
    score: value.score,
    stageNumber: 1,
    completedStages: 1,
    session: null,
    terminalSnapshot: null,
    finalStageTally: null,
  });
}

function validateStore(store: RunResultStore): void {
  if (!isRecord(store) || store.version !== RUN_RESULT_STORE_VERSION) {
    throw new RangeError(`run result store must use version ${RUN_RESULT_STORE_VERSION}`);
  }
  if (!Array.isArray(store.results))
    throw new TypeError('run result store results must be an array');
  const ids = new Set<string>();
  for (const result of store.results) {
    validateRunResult(result);
    if (ids.has(result.id)) throw new RangeError(`duplicate run result id: ${result.id}`);
    ids.add(result.id);
  }
}

function validateRunResult(result: RunResultRecord): void {
  if (!isRecord(result)) throw new TypeError('run result must be an object');
  if (result.schemaVersion !== RUN_RESULT_STORE_VERSION) {
    throw new RangeError(`unsupported run result schemaVersion: ${String(result.schemaVersion)}`);
  }
  assertNonEmptyString('run result id', result.id);
  normalizeTimestamp('run result completedAt', result.completedAt);
  assertNonNegativeInteger('run result score', result.score);
  assertPositiveInteger('run result stageNumber', result.stageNumber);
  assertNonNegativeInteger('run result completedStages', result.completedStages);
  if (result.mode !== 'campaign' && result.mode !== 'challenge') {
    throw new TypeError(`unknown run result mode: ${String(result.mode)}`);
  }
  if (result.scoreChannel !== result.mode) {
    throw new TypeError('run result mode and score channel must match');
  }
  if (result.outcome !== 'completed' && result.outcome !== 'failed') {
    throw new TypeError(`unknown run result outcome: ${String(result.outcome)}`);
  }

  if (result.source === 'legacy') {
    if (
      result.mode !== 'campaign' ||
      result.outcome !== 'completed' ||
      result.session !== null ||
      result.terminalSnapshot !== null ||
      result.finalStageTally !== null
    ) {
      throw new TypeError('legacy result contains unsupported run identity');
    }
    return;
  }
  if (result.source !== 'run')
    throw new TypeError(`unknown run result source: ${String(result.source)}`);
  if (
    result.session === null ||
    result.terminalSnapshot === null ||
    result.finalStageTally === null
  ) {
    throw new TypeError('run result requires session, terminal snapshot, and final tally');
  }
  validateGameSession(result.session);
  if (result.session.mode !== result.mode)
    throw new TypeError('result session mode does not match');
  const terminalState: StageRunState = {
    phase: result.outcome,
    failureReason: result.outcome === 'failed' ? failureReason(result.terminalSnapshot) : null,
    terminalSnapshot: result.terminalSnapshot,
  };
  const expectedTally = buildFinalTally(terminalState);
  if (JSON.stringify(result.finalStageTally) !== JSON.stringify(expectedTally)) {
    throw new RangeError('persisted final tally does not match its terminal snapshot');
  }
  if (result.mode === 'campaign') {
    if (result.outcome !== 'completed' || result.score !== result.finalStageTally.total) {
      throw new RangeError('Campaign result must be a completed final tally');
    }
    return;
  }
  const challenge = result.session as ChallengeSession;
  if (
    challenge.phase !== 'failed' ||
    result.outcome !== 'failed' ||
    challenge.cumulativeScore !== result.score
  ) {
    throw new RangeError('Challenge result must match its failed cumulative session');
  }
}

function compareRunResults(left: RunResultRecord, right: RunResultRecord): number {
  return (
    right.score - left.score ||
    right.completedStages - left.completedStages ||
    terminalDistance(right) - terminalDistance(left) ||
    terminalTime(left) - terminalTime(right) ||
    left.completedAt.localeCompare(right.completedAt) ||
    left.id.localeCompare(right.id)
  );
}

function terminalDistance(result: RunResultRecord): number {
  return result.terminalSnapshot?.routeDistanceMeters ?? 0;
}

function terminalTime(result: RunResultRecord): number {
  return result.terminalSnapshot?.elapsedRunSeconds ?? Number.MAX_SAFE_INTEGER;
}

function buildResultDetail(result: RunResultRecord): string {
  if (result.terminalSnapshot === null) return 'LEGACY SCORE';
  const time = formatElapsedTime(result.terminalSnapshot.elapsedRunSeconds);
  const cargo = `${Math.round(result.terminalSnapshot.cargoIntegrity * 100)}% CARGO`;
  return result.mode === 'challenge'
    ? `STAGE ${result.stageNumber} · ${cargo}`
    : `${time} · ${cargo}`;
}

function requireTerminalSnapshot(state: StageRunState): Readonly<StageRunFrame> {
  if (
    typeof state !== 'object' ||
    state === null ||
    (state.phase !== 'completed' && state.phase !== 'failed') ||
    state.terminalSnapshot === null
  ) {
    throw new RangeError('run result requires a terminal stage snapshot');
  }
  return state.terminalSnapshot;
}

function failureReason(snapshot: Readonly<StageRunFrame>): 'crashed' | 'out-of-fuel' {
  return snapshot.truckStatus === 'crashed' ? 'crashed' : 'out-of-fuel';
}

function normalizeTimestamp(label: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a timestamp string`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${label} must be a valid timestamp`);
  return new Date(milliseconds).toISOString();
}

function assertNonEmptyString(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(label: string, value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${String(value)}`);
  }
}

function assertPositiveInteger(label: string, value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer, got ${String(value)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
