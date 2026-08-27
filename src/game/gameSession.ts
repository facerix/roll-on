import { Rng } from '/src/rng.js';
import {
  CHALLENGE_ROUTE_GENERATOR_ID,
  CHALLENGE_ROUTE_GENERATOR_VERSION,
  generateChallengeRoute,
} from '/src/game/challengeRouteGenerator.js';
import type { RouteDefinition } from '/src/game/route.js';
import {
  generateChallengeRoadFeatures,
  type ChallengeDifficulty,
} from '/src/game/challengeRoadFeatures.js';
import type { RoadPullout } from '/src/game/road.js';
import type { PatrolEncounterDefinition } from '/src/game/patrolEncounter.js';

const MAX_U32 = 0xffff_ffff;

export const CHALLENGE_GENERATOR_VERSION = CHALLENGE_ROUTE_GENERATOR_VERSION;

export interface ChallengeIntermissionPolicy {
  /** Normalized tank fraction added before the next stage, clamped at one. */
  readonly fuelRefillFraction: number;
}

export const DEFAULT_CHALLENGE_INTERMISSION_POLICY: ChallengeIntermissionPolicy = Object.freeze({
  fuelRefillFraction: 0.25,
});

export interface ChallengeRunIdentity {
  readonly runSeed: number;
  readonly generatorVersion: number;
}

export interface ChallengeRunUpgrade {
  readonly id: string;
  readonly level: number;
}

export interface ChallengeCarryover {
  readonly cargoIntegrity: number;
  readonly fuelLevel: number;
  readonly haulCurrency: number;
  readonly runUpgrades: readonly ChallengeRunUpgrade[];
}

export interface CampaignStageIdentity {
  readonly stageId: string;
  readonly stageNumber: 1;
  readonly routeSource: {
    readonly kind: 'authored';
    readonly routeId: string;
  };
}

export interface ChallengeStageIdentity {
  readonly stageNumber: number;
  readonly stageSeed: number;
  readonly routeSource: {
    readonly kind: 'generated';
    readonly generatorId: string;
    readonly generatorVersion: number;
    readonly seed: number;
    /** Resolved definition retained so a replay survives generator changes. */
    readonly definition: RouteDefinition;
  };
  readonly encounterSeed: number;
  readonly roadFeatureSource: {
    readonly kind: 'generated';
    readonly generatorId: string;
    readonly generatorVersion: number;
    readonly seed: number;
    readonly stageNumber: number;
    readonly attempt: number;
    readonly difficulty: ChallengeDifficulty;
    readonly pullouts: readonly RoadPullout[];
    readonly patrolEncounters: readonly PatrolEncounterDefinition[];
  };
  readonly trafficSeed: number;
  readonly shopSeed: number;
}

export interface CampaignSession {
  readonly mode: 'campaign';
  readonly scoreChannel: 'campaign';
  readonly stage: CampaignStageIdentity;
}

export type ChallengeRunPhase = 'driving' | 'intermission' | 'failed';

export interface ChallengeSession {
  readonly mode: 'challenge';
  readonly scoreChannel: 'challenge';
  readonly phase: ChallengeRunPhase;
  readonly identity: ChallengeRunIdentity;
  /** The active, most recently completed, or failed stage according to phase. */
  readonly stage: ChallengeStageIdentity;
  readonly completedStages: number;
  readonly cumulativeScore: number;
  readonly carryover: ChallengeCarryover;
  readonly failureDistanceMeters: number | null;
}

export type GameSession = CampaignSession | ChallengeSession;

export interface CreateCampaignSessionOptions {
  readonly mode: 'campaign';
  readonly stageId: string;
  readonly routeId: string;
}

export interface CreateChallengeSessionOptions {
  readonly mode: 'challenge';
  readonly runSeed: number;
  readonly generatorVersion?: number;
  readonly initialCargoIntegrity?: number;
  readonly initialFuelLevel?: number;
  readonly initialHaulCurrency?: number;
  readonly initialRunUpgrades?: readonly ChallengeRunUpgrade[];
}

export interface ChallengeStageCompletion {
  readonly stageScore: number;
  readonly cargoIntegrity: number;
  readonly fuelLevel: number;
  readonly haulCurrencyEarned: number;
}

export interface ChallengeStageFailure {
  readonly stageScore: number;
  readonly routeDistanceMeters: number;
  readonly cargoIntegrity: number;
  readonly fuelLevel: number;
}

export function createGameSession(options: CreateCampaignSessionOptions): CampaignSession;
export function createGameSession(options: CreateChallengeSessionOptions): ChallengeSession;
export function createGameSession(
  options: CreateCampaignSessionOptions | CreateChallengeSessionOptions
): GameSession;
export function createGameSession(
  options: CreateCampaignSessionOptions | CreateChallengeSessionOptions
): GameSession {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('game session options must be an object');
  }

  if (options.mode === 'campaign') {
    assertNonEmptyString('stageId', options.stageId);
    assertNonEmptyString('routeId', options.routeId);
    return Object.freeze({
      mode: 'campaign',
      scoreChannel: 'campaign',
      stage: Object.freeze({
        stageId: options.stageId,
        stageNumber: 1,
        routeSource: Object.freeze({ kind: 'authored', routeId: options.routeId }),
      }),
    });
  }

  if (options.mode !== 'challenge') {
    throw new TypeError(`unknown game mode: ${String((options as { mode: unknown }).mode)}`);
  }

  const identity = freezeIdentity({
    runSeed: options.runSeed,
    generatorVersion: options.generatorVersion ?? CHALLENGE_GENERATOR_VERSION,
  });
  const carryover = freezeCarryover({
    cargoIntegrity: options.initialCargoIntegrity ?? 1,
    fuelLevel: options.initialFuelLevel ?? 1,
    haulCurrency: options.initialHaulCurrency ?? 0,
    runUpgrades: options.initialRunUpgrades ?? [],
  });

  return freezeChallengeSession({
    phase: 'driving',
    identity,
    stage: deriveChallengeStageIdentity(identity, 1),
    completedStages: 0,
    cumulativeScore: 0,
    carryover,
    failureDistanceMeters: null,
  });
}

/** Derive stable per-subsystem seeds without advancing or coupling sibling streams. */
export function deriveChallengeStageIdentity(
  identity: ChallengeRunIdentity,
  stageNumber: number
): ChallengeStageIdentity {
  validateIdentity(identity);
  assertPositiveInteger('stageNumber', stageNumber);

  const runRng = new Rng(identity.runSeed);
  const stageRng = runRng.fork(`challenge-v${identity.generatorVersion}:stage-${stageNumber}`);
  const routeSeed = stageRng.fork('route').seed;
  const generatedRoute = generateChallengeRoute(routeSeed, {
    generatorVersion: identity.generatorVersion,
  });
  const encounterSeed = stageRng.fork('encounters').seed;
  const generatedRoadFeatures = generateChallengeRoadFeatures(encounterSeed, {
    stageNumber,
    route: generatedRoute.route,
    generatorVersion: identity.generatorVersion,
  });
  return Object.freeze({
    stageNumber,
    stageSeed: stageRng.seed,
    routeSource: Object.freeze({
      kind: 'generated',
      generatorId: CHALLENGE_ROUTE_GENERATOR_ID,
      generatorVersion: identity.generatorVersion,
      seed: routeSeed,
      definition: generatedRoute.definition,
    }),
    encounterSeed,
    roadFeatureSource: Object.freeze({ kind: 'generated' as const, ...generatedRoadFeatures }),
    trafficSeed: stageRng.fork('traffic').seed,
    shopSeed: stageRng.fork('shop').seed,
  });
}

/** Capture one delivered stage before the future truck-stop intermission mutates run resources. */
export function completeChallengeStage(
  session: ChallengeSession,
  completion: ChallengeStageCompletion
): ChallengeSession {
  validateChallengeSession(session);
  requirePhase(session, 'driving');
  validateCompletion(completion);

  return freezeChallengeSession({
    ...session,
    phase: 'intermission',
    completedStages: session.completedStages + 1,
    cumulativeScore: addSafeIntegers(
      'cumulativeScore',
      session.cumulativeScore,
      completion.stageScore
    ),
    carryover: freezeCarryover({
      cargoIntegrity: completion.cargoIntegrity,
      fuelLevel: completion.fuelLevel,
      haulCurrency: addSafeIntegers(
        'haulCurrency',
        session.carryover.haulCurrency,
        completion.haulCurrencyEarned
      ),
      runUpgrades: session.carryover.runUpgrades,
    }),
    failureDistanceMeters: null,
  });
}

/** Leave intermission and begin the next deterministic stage. */
export function startNextChallengeStage(
  session: ChallengeSession,
  policy: ChallengeIntermissionPolicy = DEFAULT_CHALLENGE_INTERMISSION_POLICY
): ChallengeSession {
  validateChallengeSession(session);
  requirePhase(session, 'intermission');
  validateIntermissionPolicy(policy);

  const stageNumber = session.stage.stageNumber + 1;
  return freezeChallengeSession({
    ...session,
    phase: 'driving',
    stage: deriveChallengeStageIdentity(session.identity, stageNumber),
    carryover: freezeCarryover({
      ...session.carryover,
      fuelLevel: Math.min(1, session.carryover.fuelLevel + policy.fuelRefillFraction),
    }),
  });
}

/** End a Challenge exactly once while retaining a terminal snapshot for score persistence. */
export function failChallengeRun(
  session: ChallengeSession,
  failure: ChallengeStageFailure
): ChallengeSession {
  validateChallengeSession(session);
  if (session.phase === 'failed') return session;
  requirePhase(session, 'driving');
  validateFailure(failure);

  return freezeChallengeSession({
    ...session,
    phase: 'failed',
    cumulativeScore: addSafeIntegers(
      'cumulativeScore',
      session.cumulativeScore,
      failure.stageScore
    ),
    carryover: freezeCarryover({
      ...session.carryover,
      cargoIntegrity: failure.cargoIntegrity,
      fuelLevel: failure.fuelLevel,
    }),
    failureDistanceMeters: failure.routeDistanceMeters,
  });
}

interface ChallengeSessionSnapshot {
  readonly phase: ChallengeRunPhase;
  readonly identity: ChallengeRunIdentity;
  readonly stage: ChallengeStageIdentity;
  readonly completedStages: number;
  readonly cumulativeScore: number;
  readonly carryover: ChallengeCarryover;
  readonly failureDistanceMeters: number | null;
}

function freezeChallengeSession(snapshot: ChallengeSessionSnapshot): ChallengeSession {
  return Object.freeze({
    mode: 'challenge',
    scoreChannel: 'challenge',
    ...snapshot,
  });
}

function freezeIdentity(identity: ChallengeRunIdentity): ChallengeRunIdentity {
  validateIdentity(identity);
  return Object.freeze({ ...identity });
}

function freezeCarryover(carryover: ChallengeCarryover): ChallengeCarryover {
  assertNormalized('cargoIntegrity', carryover.cargoIntegrity);
  assertNormalized('fuelLevel', carryover.fuelLevel);
  assertNonNegativeInteger('haulCurrency', carryover.haulCurrency);
  if (!Array.isArray(carryover.runUpgrades)) {
    throw new TypeError('runUpgrades must be an array');
  }

  const seenIds = new Set<string>();
  const runUpgrades = carryover.runUpgrades.map((upgrade, index) => {
    if (typeof upgrade !== 'object' || upgrade === null) {
      throw new TypeError(`runUpgrades[${index}] must be an object`);
    }
    assertNonEmptyString(`runUpgrades[${index}].id`, upgrade.id);
    assertPositiveInteger(`runUpgrades[${index}].level`, upgrade.level);
    if (seenIds.has(upgrade.id)) {
      throw new RangeError(`runUpgrades contains duplicate id: ${upgrade.id}`);
    }
    seenIds.add(upgrade.id);
    return Object.freeze({ id: upgrade.id, level: upgrade.level });
  });

  return Object.freeze({
    cargoIntegrity: carryover.cargoIntegrity,
    fuelLevel: carryover.fuelLevel,
    haulCurrency: carryover.haulCurrency,
    runUpgrades: Object.freeze(runUpgrades),
  });
}

function validateChallengeSession(session: ChallengeSession): void {
  if (typeof session !== 'object' || session === null || session.mode !== 'challenge') {
    throw new TypeError('ChallengeSession must be a challenge session object');
  }
  if (session.scoreChannel !== 'challenge') {
    throw new TypeError('ChallengeSession must use the challenge score channel');
  }
  if (
    session.phase !== 'driving' &&
    session.phase !== 'intermission' &&
    session.phase !== 'failed'
  ) {
    throw new TypeError(`unknown Challenge phase: ${String(session.phase)}`);
  }
  validateIdentity(session.identity);
  validateStageIdentity(session.stage, session.identity);
  assertNonNegativeInteger('completedStages', session.completedStages);
  assertNonNegativeInteger('cumulativeScore', session.cumulativeScore);
  freezeCarryover(session.carryover);

  if (session.phase === 'driving' && session.completedStages !== session.stage.stageNumber - 1) {
    throw new RangeError('driving Challenge stage must follow completedStages');
  }
  if (session.phase === 'intermission' && session.completedStages !== session.stage.stageNumber) {
    throw new RangeError('intermission Challenge stage must equal completedStages');
  }
  if (session.phase === 'failed') {
    assertNonNegative('failureDistanceMeters', session.failureDistanceMeters);
  } else if (session.failureDistanceMeters !== null) {
    throw new RangeError('active Challenge session cannot have a failure distance');
  }
}

function validateIdentity(identity: ChallengeRunIdentity): void {
  if (typeof identity !== 'object' || identity === null) {
    throw new TypeError('ChallengeRunIdentity must be an object');
  }
  assertU32('runSeed', identity.runSeed);
  assertPositiveInteger('generatorVersion', identity.generatorVersion);
}

function validateStageIdentity(
  stage: ChallengeStageIdentity,
  identity: ChallengeRunIdentity
): void {
  if (typeof stage !== 'object' || stage === null) {
    throw new TypeError('ChallengeStageIdentity must be an object');
  }
  const expected = deriveChallengeStageIdentity(identity, stage.stageNumber);
  if (
    stage.stageSeed !== expected.stageSeed ||
    stage.routeSource.kind !== 'generated' ||
    stage.routeSource.generatorId !== expected.routeSource.generatorId ||
    stage.routeSource.generatorVersion !== expected.routeSource.generatorVersion ||
    stage.routeSource.seed !== expected.routeSource.seed ||
    JSON.stringify(stage.routeSource.definition) !==
      JSON.stringify(expected.routeSource.definition) ||
    stage.encounterSeed !== expected.encounterSeed ||
    JSON.stringify(stage.roadFeatureSource) !== JSON.stringify(expected.roadFeatureSource) ||
    stage.trafficSeed !== expected.trafficSeed ||
    stage.shopSeed !== expected.shopSeed
  ) {
    throw new RangeError('ChallengeStageIdentity does not match its run identity');
  }
}

function validateCompletion(completion: ChallengeStageCompletion): void {
  if (typeof completion !== 'object' || completion === null) {
    throw new TypeError('ChallengeStageCompletion must be an object');
  }
  assertNonNegativeInteger('stageScore', completion.stageScore);
  assertNormalized('cargoIntegrity', completion.cargoIntegrity);
  assertNormalized('fuelLevel', completion.fuelLevel);
  assertNonNegativeInteger('haulCurrencyEarned', completion.haulCurrencyEarned);
}

function validateFailure(failure: ChallengeStageFailure): void {
  if (typeof failure !== 'object' || failure === null) {
    throw new TypeError('ChallengeStageFailure must be an object');
  }
  assertNonNegativeInteger('stageScore', failure.stageScore);
  assertNonNegative('routeDistanceMeters', failure.routeDistanceMeters);
  assertNormalized('cargoIntegrity', failure.cargoIntegrity);
  assertNormalized('fuelLevel', failure.fuelLevel);
}

function validateIntermissionPolicy(policy: ChallengeIntermissionPolicy): void {
  if (typeof policy !== 'object' || policy === null) {
    throw new TypeError('ChallengeIntermissionPolicy must be an object');
  }
  assertFinite('fuelRefillFraction', policy.fuelRefillFraction);
  if (policy.fuelRefillFraction <= 0 || policy.fuelRefillFraction >= 1) {
    throw new RangeError(
      `fuelRefillFraction must be between zero and one, got ${policy.fuelRefillFraction}`
    );
  }
}

function requirePhase(session: ChallengeSession, phase: ChallengeRunPhase): void {
  if (session.phase !== phase) {
    throw new RangeError(`Challenge transition requires ${phase} phase, got ${session.phase}`);
  }
}

function addSafeIntegers(label: string, left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer, got ${result}`);
  }
  return result;
}

function assertU32(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_U32) {
    throw new RangeError(`${label} must be a uint32, got ${value}`);
  }
}

function assertNonEmptyString(label: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertNormalized(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1], got ${value}`);
  }
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`);
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer, got ${value}`);
  }
}

function assertNonNegative(label: string, value: number | null): asserts value is number {
  if (value === null) {
    throw new RangeError(`${label} must be present`);
  }
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}
