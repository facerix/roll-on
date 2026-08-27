import { Rng } from '/src/rng.js';
import {
  createRoute,
  sampleRoute,
  type Route,
  type RouteConstraints,
  type RouteDefinition,
  type RouteSegmentDefinition,
} from '/src/game/route.js';

export const CHALLENGE_ROUTE_GENERATOR_VERSION = 2;
export const CHALLENGE_ROUTE_GENERATOR_ID = 'route-phrases-v2';
export const CHALLENGE_ROUTE_TOTAL_LENGTH_METERS = 2_200;

export interface ChallengeRouteConstraints extends RouteConstraints {
  /** Maximum lateral displacement of the centerline from the initial heading corridor. */
  readonly maximumAbsoluteCenterOffsetMeters: number;
  /** Minimum straight approach before the first bend in a phrase. */
  readonly minimumApproachMeters: number;
  /** Minimum straight recovery between consecutive bends. */
  readonly minimumRecoveryBetweenBendsMeters: number;
  /** Distance between geometry samples used by global validation. */
  readonly validationSampleStepMeters: number;
}

export const CHALLENGE_ROUTE_CONSTRAINTS: ChallengeRouteConstraints = Object.freeze({
  // Four lanes and the ordinary shoulder consume 9.9 m. Challenge patrol
  // aprons need another 3.6 m, so generated definitions reserve that geometry
  // in their recorded route constraint rather than widening the road later.
  maximumAbsoluteRoadOffsetMeters: 14,
  minimumBendRadiusMeters: 100,
  maximumAbsoluteCenterOffsetMeters: 360,
  minimumApproachMeters: 40,
  minimumRecoveryBetweenBendsMeters: 40,
  validationSampleStepMeters: 10,
});

export interface GenerateChallengeRouteOptions {
  readonly maxAttempts?: number;
  readonly constraints?: ChallengeRouteConstraints;
  readonly generatorVersion?: number;
}

export interface GeneratedChallengeRoute {
  readonly generatorId: string;
  readonly generatorVersion: number;
  readonly seed: number;
  readonly attempt: number;
  readonly phraseIds: readonly string[];
  readonly definition: RouteDefinition;
  readonly route: Route;
}

interface RoutePhrase {
  readonly id: string;
  readonly segments: readonly RouteSegmentDefinition[];
}

interface RoutePhraseSection {
  readonly id: string;
  readonly phrases: readonly RoutePhrase[];
}

const ROUTE_PHRASE_SECTIONS: readonly RoutePhraseSection[] = Object.freeze([
  section('launch-and-onboarding', [phrase('onboarding-straight', [straight(250)])]),
  section('opening-alternating-sweepers', [
    phrase('opening-broad-right-left', [
      straight(75),
      arc(125, 0.004),
      straight(50),
      arc(125, -0.004),
      straight(75),
    ]),
    phrase('opening-broad-left-right', [
      straight(65),
      arc(140, -0.0035),
      straight(60),
      arc(125, 0.004),
      straight(60),
    ]),
    phrase('opening-long-read', [
      straight(90),
      arc(110, -0.0045),
      straight(70),
      arc(150, 0.0033),
      straight(30),
    ]),
  ]),
  section('patrol-sightline', [
    phrase('patrol-right-sightline', [straight(100), arc(100, -0.003), straight(50)]),
    phrase('patrol-left-sightline', [straight(90), arc(110, 0.003), straight(50)]),
    phrase('patrol-gentle-sightline', [straight(125), arc(75, -0.0035), straight(50)]),
  ]),
  section('technical-lull', [
    phrase('technical-right-left', [straight(50), arc(75, 0.006), straight(50), arc(75, -0.006)]),
    phrase('technical-left-right', [straight(60), arc(65, -0.006), straight(60), arc(65, 0.006)]),
    phrase('technical-tight-right-left', [
      straight(50),
      arc(60, 0.0065),
      straight(60),
      arc(80, -0.0055),
    ]),
  ]),
  section('mixed-pressure-sweepers', [
    phrase('pressure-broad-right-left', [
      straight(125),
      arc(125, 0.0035),
      straight(125),
      arc(125, -0.0035),
    ]),
    phrase('pressure-long-left-right', [
      straight(100),
      arc(150, -0.003),
      straight(100),
      arc(150, 0.003),
    ]),
    phrase('pressure-separated-right-left', [
      straight(140),
      arc(110, 0.0045),
      straight(140),
      arc(110, -0.0045),
    ]),
  ]),
  section('recovery', [phrase('recovery-straight', [straight(200)])]),
  section('final-gauntlet', [
    phrase('gauntlet-left-right', [straight(60), arc(90, -0.0065), straight(60), arc(90, 0.0065)]),
    phrase('gauntlet-right-left', [straight(75), arc(75, 0.007), straight(75), arc(75, -0.007)]),
    phrase('gauntlet-wide-left-right', [
      straight(50),
      arc(100, 0.006),
      straight(50),
      arc(100, -0.006),
    ]),
  ]),
]);

export function generateChallengeRoute(
  seed: number,
  options: GenerateChallengeRouteOptions = {}
): GeneratedChallengeRoute {
  assertUint32('seed', seed);
  const maxAttempts = options.maxAttempts ?? 8;
  assertPositiveInteger('maxAttempts', maxAttempts);
  const generatorVersion = options.generatorVersion ?? CHALLENGE_ROUTE_GENERATOR_VERSION;
  if (generatorVersion !== CHALLENGE_ROUTE_GENERATOR_VERSION) {
    throw new RangeError(`unsupported challenge route generator version: ${generatorVersion}`);
  }
  const constraints = options.constraints ?? CHALLENGE_ROUTE_CONSTRAINTS;
  validateChallengeRouteConstraints(constraints);

  let lastFailure: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const routeRng = new Rng(seed).fork(`challenge-route-attempt-${attempt}`);
    const selected = ROUTE_PHRASE_SECTIONS.map(section => {
      if (section.phrases.length === 1) return section.phrases[0]!;
      return section.phrases[routeRng.intRange(0, section.phrases.length)]!;
    });
    const definition = freezeDefinition({
      origin: { xMeters: 0, yMeters: 0 },
      headingRadians: 0,
      segments: selected.flatMap(selectedPhrase => selectedPhrase.segments),
      constraints: {
        maximumAbsoluteRoadOffsetMeters: constraints.maximumAbsoluteRoadOffsetMeters,
        minimumBendRadiusMeters: constraints.minimumBendRadiusMeters,
      },
    });

    try {
      const route = createRoute(definition);
      validateChallengeRouteDefinition(definition, constraints, route);
      return Object.freeze({
        generatorId: CHALLENGE_ROUTE_GENERATOR_ID,
        generatorVersion,
        seed,
        attempt,
        phraseIds: Object.freeze(selected.map(selectedPhrase => selectedPhrase.id)),
        definition,
        route,
      });
    } catch (error) {
      lastFailure = error;
    }
  }

  const detail = lastFailure instanceof Error ? `: ${lastFailure.message}` : '';
  throw new RangeError(`challenge route generation failed after ${maxAttempts} attempts${detail}`);
}

export function validateChallengeRouteDefinition(
  definition: RouteDefinition,
  constraints: ChallengeRouteConstraints = CHALLENGE_ROUTE_CONSTRAINTS,
  compiledRoute?: Route
): void {
  validateChallengeRouteConstraints(constraints);
  const route = compiledRoute ?? createRoute(definition);

  if (route.totalLengthMeters !== CHALLENGE_ROUTE_TOTAL_LENGTH_METERS) {
    throw new RangeError(
      `challenge route must be exactly ${CHALLENGE_ROUTE_TOTAL_LENGTH_METERS} m, got ${route.totalLengthMeters} m`
    );
  }

  let previousArcIndex = -1;
  for (const [index, segment] of route.segments.entries()) {
    assertFinite(`segments[${index}].start.xMeters`, segment.start.xMeters);
    assertFinite(`segments[${index}].start.yMeters`, segment.start.yMeters);
    assertFinite(`segments[${index}].end.xMeters`, segment.end.xMeters);
    assertFinite(`segments[${index}].end.yMeters`, segment.end.yMeters);
    assertFinite(`segments[${index}].startHeadingRadians`, segment.startHeadingRadians);
    assertFinite(`segments[${index}].endHeadingRadians`, segment.endHeadingRadians);

    if (segment.kind !== 'arc') continue;
    const approach = route.segments[index - 1];
    if (
      approach?.kind !== 'straight' ||
      approach.lengthMeters < constraints.minimumApproachMeters
    ) {
      throw new RangeError(
        `bend at segment ${index} lacks a ${constraints.minimumApproachMeters} m approach`
      );
    }

    if (previousArcIndex >= 0) {
      const recoveryMeters = route.segments
        .slice(previousArcIndex + 1, index)
        .reduce((total, between) => total + between.lengthMeters, 0);
      if (recoveryMeters < constraints.minimumRecoveryBetweenBendsMeters) {
        throw new RangeError(
          `bends at segments ${previousArcIndex} and ${index} have only ${recoveryMeters} m recovery`
        );
      }
    }
    previousArcIndex = index;
  }

  for (
    let distance = 0;
    distance <= route.totalLengthMeters;
    distance += constraints.validationSampleStepMeters
  ) {
    const sample = sampleRoute(route, distance);
    if (Math.abs(sample.center.xMeters) > constraints.maximumAbsoluteCenterOffsetMeters) {
      throw new RangeError(
        `challenge route centerline exceeds global clearance at ${distance} m: ${sample.center.xMeters} m`
      );
    }
  }
}

function section(id: string, phrases: readonly RoutePhrase[]): RoutePhraseSection {
  return Object.freeze({ id, phrases: Object.freeze(phrases) });
}

function phrase(id: string, segments: readonly RouteSegmentDefinition[]): RoutePhrase {
  return Object.freeze({
    id,
    segments: Object.freeze(segments.map(segment => Object.freeze({ ...segment }))),
  });
}

function straight(lengthMeters: number): RouteSegmentDefinition {
  return { kind: 'straight', lengthMeters };
}

function arc(lengthMeters: number, curvaturePerMeter: number): RouteSegmentDefinition {
  return { kind: 'arc', lengthMeters, curvaturePerMeter };
}

function freezeDefinition(definition: RouteDefinition): RouteDefinition {
  return Object.freeze({
    origin: Object.freeze({ ...definition.origin }),
    headingRadians: definition.headingRadians,
    segments: Object.freeze(definition.segments.map(segment => Object.freeze({ ...segment }))),
    constraints: Object.freeze({ ...definition.constraints }),
  });
}

function validateChallengeRouteConstraints(constraints: ChallengeRouteConstraints): void {
  if (typeof constraints !== 'object' || constraints === null) {
    throw new TypeError('challenge route constraints must be an object');
  }
  assertPositive('maximumAbsoluteRoadOffsetMeters', constraints.maximumAbsoluteRoadOffsetMeters);
  assertPositive('minimumBendRadiusMeters', constraints.minimumBendRadiusMeters);
  assertPositive(
    'maximumAbsoluteCenterOffsetMeters',
    constraints.maximumAbsoluteCenterOffsetMeters
  );
  assertPositive('minimumApproachMeters', constraints.minimumApproachMeters);
  assertPositive(
    'minimumRecoveryBetweenBendsMeters',
    constraints.minimumRecoveryBetweenBendsMeters
  );
  assertPositive('validationSampleStepMeters', constraints.validationSampleStepMeters);
  if (constraints.minimumBendRadiusMeters <= constraints.maximumAbsoluteRoadOffsetMeters) {
    throw new RangeError('minimumBendRadiusMeters must exceed maximumAbsoluteRoadOffsetMeters');
  }
}

function assertUint32(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be a uint32, got ${value}`);
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive, got ${value}`);
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}
