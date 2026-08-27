import { Rng } from '/src/rng.js';
import { CHALLENGE_ROUTE_GENERATOR_VERSION } from '/src/game/challengeRouteGenerator.js';
import { createRoad, DEFAULT_ROAD_TUNING, type RoadPullout } from '/src/game/road.js';
import {
  createPatrolEncounterState,
  DEFAULT_PATROL_ENCOUNTER_TUNING,
  type PatrolEncounterDefinition,
} from '/src/game/patrolEncounter.js';
import type { Route } from '/src/game/route.js';

export const CHALLENGE_ROAD_FEATURE_GENERATOR_ID = 'road-features-v1';

const DEFAULT_MAX_ATTEMPTS = 8;
const PULLOUT_DEPTH_METERS = 3.6;
const PULLOUT_HALF_LENGTH_METERS = 60;
const PULLOUT_TAPER_METERS = 20;
const ENCOUNTER_WINDOW_METERS = 300;
const MINIMUM_FINISH_RECOVERY_METERS = 75;

export interface ChallengeDifficulty {
  readonly tier: 1 | 2 | 3;
  readonly encounterCount: 1 | 2;
  readonly requiredAvoids: 1 | 2;
  readonly minimumApproachMeters: number;
  readonly minimumRecoveryMeters: number;
  readonly minimumEscapeWindowMeters: number;
  readonly minimumSideClearanceMeters: number;
}

export interface GeneratedChallengeRoadFeatures {
  readonly generatorId: string;
  readonly generatorVersion: number;
  readonly seed: number;
  readonly stageNumber: number;
  readonly attempt: number;
  readonly difficulty: ChallengeDifficulty;
  readonly pullouts: readonly RoadPullout[];
  readonly patrolEncounters: readonly PatrolEncounterDefinition[];
}

export interface GenerateChallengeRoadFeaturesOptions {
  readonly stageNumber: number;
  readonly route: Route;
  readonly maxAttempts?: number;
  readonly generatorVersion?: number;
}

interface PlacementBand {
  readonly id: string;
  readonly firstTriggerDistanceMeters: number;
  readonly placementCount: number;
  readonly stepMeters: number;
}

/**
 * Vetted distance bands within the fixed Challenge section budgets. The first
 * apron sits in the patrol-sightline/technical transition; the second sits in
 * the long recovery section before the final gauntlet. Seeded offsets add
 * variety without moving a trap into the launch or finish pressure zones.
 */
const PLACEMENT_BANDS: readonly PlacementBand[] = Object.freeze([
  Object.freeze({
    id: 'patrol-sightline',
    firstTriggerDistanceMeters: 740,
    placementCount: 7,
    stepMeters: 10,
  }),
  Object.freeze({
    id: 'recovery',
    firstTriggerDistanceMeters: 1_760,
    placementCount: 7,
    stepMeters: 10,
  }),
]);

/**
 * Challenge pressure rises only by encounter count and required avoids. The
 * model's timing, damage, attack clearance, and escape tuning remain unchanged.
 */
export function challengeDifficultyForStage(stageNumber: number): ChallengeDifficulty {
  assertPositiveInteger('stageNumber', stageNumber);
  const tier: ChallengeDifficulty['tier'] = stageNumber >= 5 ? 3 : stageNumber >= 3 ? 2 : 1;
  return Object.freeze({
    tier,
    encounterCount: tier === 3 ? 2 : 1,
    requiredAvoids: tier === 1 ? 1 : 2,
    minimumApproachMeters: 300,
    minimumRecoveryMeters: 250,
    minimumEscapeWindowMeters: 250,
    minimumSideClearanceMeters: DEFAULT_PATROL_ENCOUNTER_TUNING.minimumSideClearanceMeters,
  });
}

/** Resolve one recorded set of roadside geometry and posted patrols. */
export function generateChallengeRoadFeatures(
  seed: number,
  options: GenerateChallengeRoadFeaturesOptions
): GeneratedChallengeRoadFeatures {
  assertUint32('seed', seed);
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Challenge road feature options must be an object');
  }
  assertPositiveInteger('stageNumber', options.stageNumber);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  assertPositiveInteger('maxAttempts', maxAttempts);
  const generatorVersion = options.generatorVersion ?? CHALLENGE_ROUTE_GENERATOR_VERSION;
  if (generatorVersion !== CHALLENGE_ROUTE_GENERATOR_VERSION) {
    throw new RangeError(
      `unsupported Challenge road feature generator version: ${generatorVersion}`
    );
  }
  const difficulty = challengeDifficultyForStage(options.stageNumber);

  let lastFailure: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const rng = new Rng(seed).fork(`challenge-road-features-attempt-${attempt}`);
    const selectedBands = PLACEMENT_BANDS.slice(0, difficulty.encounterCount);
    const triggers = selectedBands.map(
      band =>
        band.firstTriggerDistanceMeters + rng.intRange(0, band.placementCount) * band.stepMeters
    );
    const pullouts = Object.freeze(
      selectedBands.map((band, index) =>
        Object.freeze({
          id: `challenge-${band.id}-pullout`,
          side: 'right' as const,
          startDistanceMeters: triggers[index]! - PULLOUT_HALF_LENGTH_METERS,
          endDistanceMeters: triggers[index]! + PULLOUT_HALF_LENGTH_METERS,
          taperMeters: PULLOUT_TAPER_METERS,
          depthMeters: PULLOUT_DEPTH_METERS,
        })
      )
    );
    const patrolEncounters = Object.freeze(
      selectedBands.map((band, index) => {
        const triggerDistanceMeters = triggers[index]!;
        return Object.freeze({
          id: `challenge-${band.id}-speed-trap`,
          source: 'speed-trap' as const,
          triggerDistanceMeters,
          windowStartDistanceMeters: triggerDistanceMeters,
          windowEndDistanceMeters: triggerDistanceMeters + ENCOUNTER_WINDOW_METERS,
          requiredAvoids: difficulty.requiredAvoids,
        });
      })
    );
    const generated = Object.freeze({
      generatorId: CHALLENGE_ROAD_FEATURE_GENERATOR_ID,
      generatorVersion,
      seed,
      stageNumber: options.stageNumber,
      attempt,
      difficulty,
      pullouts,
      patrolEncounters,
    });

    try {
      validateChallengeRoadFeatures(generated, options.route);
      return generated;
    } catch (error) {
      lastFailure = error;
    }
  }

  const detail = lastFailure instanceof Error ? `: ${lastFailure.message}` : '';
  throw new RangeError(
    `Challenge road feature generation failed after ${maxAttempts} attempts${detail}`
  );
}

/** Validate recorded features against the exact compiled route used for play. */
export function validateChallengeRoadFeatures(
  features: GeneratedChallengeRoadFeatures,
  route: Route
): void {
  if (typeof features !== 'object' || features === null) {
    throw new TypeError('Challenge road features must be an object');
  }
  if (features.generatorId !== CHALLENGE_ROAD_FEATURE_GENERATOR_ID) {
    throw new RangeError(`unknown Challenge road feature generator: ${features.generatorId}`);
  }
  if (features.generatorVersion !== CHALLENGE_ROUTE_GENERATOR_VERSION) {
    throw new RangeError(
      `unsupported Challenge road feature generator version: ${features.generatorVersion}`
    );
  }
  assertUint32('features.seed', features.seed);
  assertPositiveInteger('features.stageNumber', features.stageNumber);
  assertPositiveInteger('features.attempt', features.attempt);
  const expectedDifficulty = challengeDifficultyForStage(features.stageNumber);
  if (JSON.stringify(features.difficulty) !== JSON.stringify(expectedDifficulty)) {
    throw new RangeError('Challenge road feature difficulty does not match its stage number');
  }
  if (!Array.isArray(features.pullouts) || !Array.isArray(features.patrolEncounters)) {
    throw new TypeError('Challenge road feature definitions must be arrays');
  }
  if (
    features.pullouts.length !== expectedDifficulty.encounterCount ||
    features.patrolEncounters.length !== expectedDifficulty.encounterCount
  ) {
    throw new RangeError('Challenge road feature count does not match its difficulty');
  }

  const road = createRoad(DEFAULT_ROAD_TUNING, route, { pullouts: features.pullouts });
  createPatrolEncounterState({ definitions: features.patrolEncounters });

  for (const [index, encounter] of features.patrolEncounters.entries()) {
    const pullout = features.pullouts[index]!;
    const triggerDistanceMeters = encounter.triggerDistanceMeters;
    if (triggerDistanceMeters === undefined) {
      throw new TypeError(`${encounter.id} must have a trigger distance`);
    }
    if (
      triggerDistanceMeters < pullout.startDistanceMeters + pullout.taperMeters ||
      triggerDistanceMeters > pullout.endDistanceMeters - pullout.taperMeters
    ) {
      throw new RangeError(`${encounter.id} trigger must lie on its pullout's full-depth apron`);
    }
    if (encounter.requiredAvoids !== expectedDifficulty.requiredAvoids) {
      throw new RangeError(`${encounter.id} required avoids do not match Challenge difficulty`);
    }
    if (
      encounter.windowEndDistanceMeters - encounter.windowStartDistanceMeters <
      expectedDifficulty.minimumEscapeWindowMeters
    ) {
      throw new RangeError(`${encounter.id} does not preserve the minimum escape window`);
    }
    if (
      index === 0 &&
      encounter.windowStartDistanceMeters < expectedDifficulty.minimumApproachMeters
    ) {
      throw new RangeError(`${encounter.id} does not preserve the minimum approach`);
    }
    const previous = features.patrolEncounters[index - 1];
    if (
      previous !== undefined &&
      encounter.windowStartDistanceMeters - previous.windowEndDistanceMeters <
        expectedDifficulty.minimumRecoveryMeters
    ) {
      throw new RangeError(`${encounter.id} does not preserve recovery from the previous patrol`);
    }
    if (
      encounter.windowEndDistanceMeters >
      route.totalLengthMeters - MINIMUM_FINISH_RECOVERY_METERS
    ) {
      throw new RangeError(`${encounter.id} leaves no recovery before the finish`);
    }

    for (const laneCenterMeters of road.laneCenterOffsetsMeters) {
      const leftClearanceMeters = laneCenterMeters - road.leftBarrierLateralMeters;
      const rightClearanceMeters = road.rightBarrierLateralMeters - laneCenterMeters;
      if (
        Math.min(leftClearanceMeters, rightClearanceMeters) <
        expectedDifficulty.minimumSideClearanceMeters
      ) {
        throw new RangeError(`${encounter.id} does not preserve patrol side clearance`);
      }
    }
  }
}

function assertUint32(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be a uint32, got ${value}`);
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer, got ${value}`);
  }
}
