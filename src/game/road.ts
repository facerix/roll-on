import {
  createRoute,
  routeToWorld,
  sampleRoute,
  type Route,
  type RouteSample,
  type RouteSegmentDefinition,
} from '/src/game/route.js';
import type { WorldPoint } from '/src/game/worldGeometry.js';
import type { PatrolEncounterDefinition } from '/src/game/patrolEncounter.js';

export interface RoadTuning {
  readonly laneCount: number;
  readonly laneWidthMeters: number;
  readonly shoulderWidthMeters: number;
  readonly markerCadenceMeters: number;
  readonly markerLengthMeters: number;
}

export type RoadSide = 'left' | 'right';

/**
 * An authored widening of one shoulder over a route-distance window, with a
 * linear taper at each end. The barrier follows the widened edge, so a pullout
 * is both the apron a parked vehicle occupies and the opening it leaves through.
 */
export interface RoadPullout {
  readonly id: string;
  readonly side: RoadSide;
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
  /** Ramp length at each end; the apron holds full depth between the ramps. */
  readonly taperMeters: number;
  /** Extra width beyond the ordinary shoulder edge. */
  readonly depthMeters: number;
}

export interface CreateRoadOptions {
  readonly pullouts?: readonly RoadPullout[];
}

export interface Road {
  readonly route: Route;
  readonly laneCount: number;
  readonly laneWidthMeters: number;
  readonly laneCenterOffsetsMeters: readonly number[];
  readonly laneBoundaryOffsetsMeters: readonly number[];
  readonly shoulderWidthMeters: number;
  readonly leftRoadEdgeMeters: number;
  readonly rightRoadEdgeMeters: number;
  readonly leftShoulderEdgeMeters: number;
  readonly rightShoulderEdgeMeters: number;
  readonly leftBarrierLateralMeters: number;
  readonly rightBarrierLateralMeters: number;
  readonly markerCadenceMeters: number;
  readonly markerLengthMeters: number;
  readonly pullouts: readonly RoadPullout[];
  readonly maximumPulloutDepthMeters: number;
}

export interface RoadDistanceWindow {
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
}

export interface LaneMarkerSpan {
  readonly lateralMeters: number;
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
}

export interface RoadCrossSectionSample {
  readonly distanceAlongRouteMeters: number;
  readonly center: WorldPoint;
  readonly laneCenters: readonly WorldPoint[];
  readonly laneBoundaries: readonly WorldPoint[];
  readonly roadEdges: readonly [WorldPoint, WorldPoint];
  readonly shoulderEdges: readonly [WorldPoint, WorldPoint];
  readonly barrierEdges: readonly [WorldPoint, WorldPoint];
  readonly routeSample: RouteSample;
}

export const DEFAULT_ROAD_TUNING: RoadTuning = Object.freeze({
  laneCount: 4,
  laneWidthMeters: 3.7,
  shoulderWidthMeters: 2.5,
  markerCadenceMeters: 12,
  markerLengthMeters: 5,
});

export interface StageRouteSection {
  readonly id: string;
  readonly intent: string;
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
  readonly segments: readonly RouteSegmentDefinition[];
}

interface StageRouteSectionSource {
  readonly id: string;
  readonly intent: string;
  readonly endDistanceMeters: number;
  readonly segments: readonly RouteSegmentDefinition[];
}

/**
 * Stage 1 geometry grouped by gameplay intent and aligned with the authored
 * encounter bands. Section ends are checked while this module initializes so
 * an edit cannot silently shift patrol, lull, recovery, or gauntlet geometry.
 */
export const STAGE_1_ROUTE_SECTIONS: readonly StageRouteSection[] = createStageRouteSections([
  {
    id: 'launch-and-onboarding',
    intent: 'A straight launch gives the player room to accelerate and learn lane control.',
    endDistanceMeters: 250,
    segments: [{ kind: 'straight', lengthMeters: 250 }],
  },
  {
    id: 'opening-alternating-sweepers',
    intent: 'Two broad opposing sweepers teach approach, steering, and recovery rhythm.',
    endDistanceMeters: 700,
    segments: [
      { kind: 'straight', lengthMeters: 75 },
      { kind: 'arc', lengthMeters: 125, curvaturePerMeter: 0.004 },
      { kind: 'straight', lengthMeters: 50 },
      { kind: 'arc', lengthMeters: 125, curvaturePerMeter: -0.004 },
      { kind: 'straight', lengthMeters: 75 },
    ],
  },
  {
    id: 'patrol-sightline',
    intent: 'A long entry sightline precedes one gentle bend during the first patrol spike.',
    endDistanceMeters: 950,
    segments: [
      { kind: 'straight', lengthMeters: 100 },
      { kind: 'arc', lengthMeters: 100, curvaturePerMeter: -0.003 },
      { kind: 'straight', lengthMeters: 50 },
    ],
  },
  {
    id: 'technical-lull',
    intent: 'Lower traffic makes room for a compact opposing curve pair with a recovery gap.',
    endDistanceMeters: 1_200,
    segments: [
      { kind: 'straight', lengthMeters: 50 },
      { kind: 'arc', lengthMeters: 75, curvaturePerMeter: 0.006 },
      { kind: 'straight', lengthMeters: 50 },
      { kind: 'arc', lengthMeters: 75, curvaturePerMeter: -0.006 },
    ],
  },
  {
    id: 'mixed-pressure-sweepers',
    intent: 'Broad separated bends keep dense mixed traffic readable without becoming empty.',
    endDistanceMeters: 1_700,
    segments: [
      { kind: 'straight', lengthMeters: 125 },
      { kind: 'arc', lengthMeters: 125, curvaturePerMeter: 0.0035 },
      { kind: 'straight', lengthMeters: 125 },
      { kind: 'arc', lengthMeters: 125, curvaturePerMeter: -0.0035 },
    ],
  },
  {
    id: 'recovery',
    intent: 'A sustained straight lets the player stabilize before the final demand.',
    endDistanceMeters: 1_900,
    segments: [{ kind: 'straight', lengthMeters: 200 }],
  },
  {
    id: 'final-gauntlet',
    intent: 'A faster opposing curve pair carries meaningful steering pressure to the finish.',
    endDistanceMeters: 2_200,
    segments: [
      { kind: 'straight', lengthMeters: 60 },
      { kind: 'arc', lengthMeters: 90, curvaturePerMeter: -0.0065 },
      { kind: 'straight', lengthMeters: 60 },
      { kind: 'arc', lengthMeters: 90, curvaturePerMeter: 0.0065 },
    ],
  },
]);

/** Route distance whose first forward crossing arms the Stage 1 speed trap. */
export const STAGE_1_SPEED_TRAP_DISTANCE_METERS = 700;

/**
 * The Stage 1 speed trap's roadside apron. It opens inside the `625–700 m`
 * straight so the parked cruiser is readable well before the trap line, holds
 * full depth across that line, and closes inside the patrol band. The depth
 * carries a `4.8 m` cruiser parked perpendicular with clearance on both sides,
 * which the ordinary `2.5 m` shoulder cannot do.
 */
export const STAGE_1_ROAD_PULLOUTS: readonly RoadPullout[] = Object.freeze([
  Object.freeze({
    id: 'stage-1-speed-trap-pullout',
    side: 'right' as RoadSide,
    startDistanceMeters: 640,
    endDistanceMeters: 760,
    taperMeters: 20,
    depthMeters: 3.6,
  }),
]);

/** Stage 1's authored enforcement: one posted speed trap across the patrol band. */
export const STAGE_1_PATROL_ENCOUNTERS: readonly PatrolEncounterDefinition[] = Object.freeze([
  Object.freeze({
    id: 'stage-1-speed-trap',
    source: 'speed-trap' as const,
    triggerDistanceMeters: STAGE_1_SPEED_TRAP_DISTANCE_METERS,
    windowStartDistanceMeters: STAGE_1_SPEED_TRAP_DISTANCE_METERS,
    windowEndDistanceMeters: 950,
    requiredAvoids: 2,
  }),
]);

/**
 * The authored Stage 1 route. Its sections share boundaries with the encounter
 * timeline so geometry and traffic pressure can be tuned as one rhythm. Its
 * offset constraint leaves room for the authored speed-trap apron.
 */
export function createDefaultStageRoute(): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: STAGE_1_ROUTE_SECTIONS.flatMap(section => section.segments),
    constraints: {
      maximumAbsoluteRoadOffsetMeters: 14,
      minimumBendRadiusMeters: 100,
    },
  });
}

function createStageRouteSections(
  sources: readonly StageRouteSectionSource[]
): readonly StageRouteSection[] {
  let startDistanceMeters = 0;
  const sections = sources.map(source => {
    const segments = Object.freeze(source.segments.map(segment => Object.freeze({ ...segment })));
    const sectionLengthMeters = segments.reduce(
      (total, segment) => total + segment.lengthMeters,
      0
    );
    const actualEndDistanceMeters = startDistanceMeters + sectionLengthMeters;
    if (actualEndDistanceMeters !== source.endDistanceMeters) {
      throw new RangeError(
        `Stage route section ${source.id} must end at ${source.endDistanceMeters} m, got ${actualEndDistanceMeters} m`
      );
    }

    const section = Object.freeze({
      id: source.id,
      intent: source.intent,
      startDistanceMeters,
      endDistanceMeters: actualEndDistanceMeters,
      segments,
    });
    startDistanceMeters = actualEndDistanceMeters;
    return section;
  });
  return Object.freeze(sections);
}

export function createRoad(
  tuning: RoadTuning,
  route: Route = defaultStraightRoute(),
  options: CreateRoadOptions = {}
): Road {
  validateRoadTuning(tuning);
  const pullouts = validatePullouts(options.pullouts ?? []);
  const maximumPulloutDepthMeters = pullouts.reduce(
    (deepest, pullout) => Math.max(deepest, pullout.depthMeters),
    0
  );
  validateRouteForRoad(route, tuning, maximumPulloutDepthMeters);

  const roadHalfWidthMeters = roundMeters((tuning.laneCount * tuning.laneWidthMeters) / 2);
  const leftRoadEdgeMeters = roundMeters(-roadHalfWidthMeters);
  const rightRoadEdgeMeters = roadHalfWidthMeters;
  const leftShoulderEdgeMeters = roundMeters(leftRoadEdgeMeters - tuning.shoulderWidthMeters);
  const rightShoulderEdgeMeters = roundMeters(rightRoadEdgeMeters + tuning.shoulderWidthMeters);

  return Object.freeze({
    route,
    laneCount: tuning.laneCount,
    laneWidthMeters: tuning.laneWidthMeters,
    laneCenterOffsetsMeters: Object.freeze(buildLaneCenters(tuning)),
    laneBoundaryOffsetsMeters: Object.freeze(buildLaneBoundaries(tuning)),
    shoulderWidthMeters: tuning.shoulderWidthMeters,
    leftRoadEdgeMeters,
    rightRoadEdgeMeters,
    leftShoulderEdgeMeters,
    rightShoulderEdgeMeters,
    leftBarrierLateralMeters: leftShoulderEdgeMeters,
    rightBarrierLateralMeters: rightShoulderEdgeMeters,
    markerCadenceMeters: tuning.markerCadenceMeters,
    markerLengthMeters: tuning.markerLengthMeters,
    pullouts,
    maximumPulloutDepthMeters,
  });
}

/** Extra width the pullouts on one side add at a route distance, or 0. */
export function getPulloutDepthMeters(
  road: Road,
  side: RoadSide,
  distanceAlongRouteMeters: number
): number {
  assertSide(side);
  assertFinite('distanceAlongRouteMeters', distanceAlongRouteMeters);
  let deepest = 0;
  for (const pullout of road.pullouts) {
    if (pullout.side !== side) continue;
    if (
      distanceAlongRouteMeters <= pullout.startDistanceMeters ||
      distanceAlongRouteMeters >= pullout.endDistanceMeters
    ) {
      continue;
    }
    const fromStartMeters = distanceAlongRouteMeters - pullout.startDistanceMeters;
    const toEndMeters = pullout.endDistanceMeters - distanceAlongRouteMeters;
    const rampMeters = Math.min(fromStartMeters, toEndMeters, pullout.taperMeters);
    deepest = Math.max(deepest, (pullout.depthMeters * rampMeters) / pullout.taperMeters);
  }
  return deepest;
}

/**
 * The traversable lateral bound at a route distance. Driving, collisions, and
 * rendering all read this rather than the constant barrier offsets, so an
 * authored apron is one shape rather than a visual and a physical copy.
 */
export function getBarrierLateralMeters(
  road: Road,
  side: RoadSide,
  distanceAlongRouteMeters: number
): number {
  const depthMeters = getPulloutDepthMeters(road, side, distanceAlongRouteMeters);
  return side === 'left'
    ? road.leftBarrierLateralMeters - depthMeters
    : road.rightBarrierLateralMeters + depthMeters;
}

/** Distances where a pullout changes slope, so samplers can land on its corners. */
export function getPulloutCornerDistancesMeters(road: Road): readonly number[] {
  return road.pullouts.flatMap(pullout => [
    pullout.startDistanceMeters,
    pullout.startDistanceMeters + pullout.taperMeters,
    pullout.endDistanceMeters - pullout.taperMeters,
    pullout.endDistanceMeters,
  ]);
}

export function sampleRoad(road: Road, distanceAlongRouteMeters: number): RoadCrossSectionSample {
  validateRoad(road);
  assertFinite('distanceAlongRouteMeters', distanceAlongRouteMeters);
  const routeSample = sampleRoute(road.route, distanceAlongRouteMeters);
  const pointAt = (lateralMeters: number): WorldPoint =>
    routeToWorld(road.route, { distanceAlongRouteMeters, lateralOffsetMeters: lateralMeters });
  const leftEdgeMeters = getBarrierLateralMeters(road, 'left', distanceAlongRouteMeters);
  const rightEdgeMeters = getBarrierLateralMeters(road, 'right', distanceAlongRouteMeters);

  return Object.freeze({
    distanceAlongRouteMeters,
    center: routeSample.center,
    laneCenters: Object.freeze(road.laneCenterOffsetsMeters.map(pointAt)),
    laneBoundaries: Object.freeze(road.laneBoundaryOffsetsMeters.map(pointAt)),
    roadEdges: Object.freeze([
      pointAt(road.leftRoadEdgeMeters),
      pointAt(road.rightRoadEdgeMeters),
    ] as [WorldPoint, WorldPoint]),
    shoulderEdges: Object.freeze([pointAt(leftEdgeMeters), pointAt(rightEdgeMeters)] as [
      WorldPoint,
      WorldPoint,
    ]),
    barrierEdges: Object.freeze([pointAt(leftEdgeMeters), pointAt(rightEdgeMeters)] as [
      WorldPoint,
      WorldPoint,
    ]),
    routeSample,
  });
}

export function sampleRoadWindow(
  road: Road,
  window: RoadDistanceWindow,
  maximumStepMeters: number
): readonly RoadCrossSectionSample[] {
  validateRoad(road);
  assertFinite('startDistanceMeters', window.startDistanceMeters);
  assertFinite('endDistanceMeters', window.endDistanceMeters);
  assertPositive('maximumStepMeters', maximumStepMeters);
  if (window.endDistanceMeters < window.startDistanceMeters) {
    throw new RangeError('endDistanceMeters must be >= startDistanceMeters');
  }

  const distances = new Set<number>([window.startDistanceMeters, window.endDistanceMeters]);
  const featureDistances = [
    ...road.route.segments.map(segment => segment.startDistanceMeters),
    ...getPulloutCornerDistancesMeters(road),
  ];
  for (const distance of featureDistances) {
    if (distance > window.startDistanceMeters && distance < window.endDistanceMeters) {
      distances.add(distance);
    }
  }
  const sorted = [...distances].sort((a, b) => a - b);
  const expanded: number[] = [sorted[0]!];
  for (const end of sorted.slice(1)) {
    const start = expanded[expanded.length - 1]!;
    const steps = Math.ceil((end - start) / maximumStepMeters);
    for (let step = 1; step <= steps; step++) expanded.push(start + ((end - start) * step) / steps);
  }
  return Object.freeze(expanded.map(distance => sampleRoad(road, distance)));
}

export function getVisibleLaneMarkerSpans(
  road: Road,
  window: RoadDistanceWindow
): readonly LaneMarkerSpan[] {
  validateRoad(road);
  assertFinite('startDistanceMeters', window.startDistanceMeters);
  assertFinite('endDistanceMeters', window.endDistanceMeters);
  if (window.endDistanceMeters < window.startDistanceMeters) {
    throw new RangeError(
      `endDistanceMeters must be >= startDistanceMeters, got ${window.endDistanceMeters} < ${window.startDistanceMeters}`
    );
  }

  const spans: LaneMarkerSpan[] = [];
  const firstCadenceIndex = Math.floor(window.startDistanceMeters / road.markerCadenceMeters);
  for (
    let markerStart = firstCadenceIndex * road.markerCadenceMeters;
    markerStart <= window.endDistanceMeters;
    markerStart += road.markerCadenceMeters
  ) {
    const markerEnd = markerStart + road.markerLengthMeters;
    const clippedStart = Math.max(markerStart, window.startDistanceMeters);
    const clippedEnd = Math.min(markerEnd, window.endDistanceMeters);
    if (clippedEnd <= clippedStart) continue;

    for (const lateralMeters of road.laneBoundaryOffsetsMeters) {
      spans.push({
        lateralMeters,
        startDistanceMeters: clippedStart,
        endDistanceMeters: clippedEnd,
      });
    }
  }

  return spans;
}

function buildLaneCenters(tuning: RoadTuning): number[] {
  const leftCenter = -((tuning.laneCount - 1) * tuning.laneWidthMeters) / 2;
  return Array.from({ length: tuning.laneCount }, (_, index) =>
    roundMeters(leftCenter + index * tuning.laneWidthMeters)
  );
}

function buildLaneBoundaries(tuning: RoadTuning): number[] {
  const leftRoadEdgeMeters = -(tuning.laneCount * tuning.laneWidthMeters) / 2;
  return Array.from({ length: tuning.laneCount - 1 }, (_, index) =>
    roundMeters(leftRoadEdgeMeters + (index + 1) * tuning.laneWidthMeters)
  );
}

function validateRoad(road: Road): void {
  if (typeof road !== 'object' || road === null) {
    throw new TypeError('Road must be an object');
  }
  validateRoadTuning(road);
  validateRouteForRoad(road.route, road, road.maximumPulloutDepthMeters ?? 0);
}

function defaultStraightRoute(): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 1 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 10, minimumBendRadiusMeters: 30 },
  });
}

function validateRouteForRoad(
  route: Route,
  tuning: RoadTuning,
  maximumPulloutDepthMeters: number
): void {
  if (typeof route !== 'object' || route === null || !Array.isArray(route.segments)) {
    throw new TypeError('route must be a compiled Route');
  }
  const maximumOffset =
    (tuning.laneCount * tuning.laneWidthMeters) / 2 +
    tuning.shoulderWidthMeters +
    maximumPulloutDepthMeters;
  if (maximumOffset > route.constraints.maximumAbsoluteRoadOffsetMeters) {
    throw new RangeError(
      `road outer offset ${maximumOffset} exceeds route constraint ${route.constraints.maximumAbsoluteRoadOffsetMeters}`
    );
  }
}

/** Reject pullouts that cannot exist as one continuous authored shape. */
function validatePullouts(pullouts: readonly RoadPullout[]): readonly RoadPullout[] {
  if (!Array.isArray(pullouts)) throw new TypeError('pullouts must be an array');
  const seenIds = new Set<string>();
  const validated = pullouts.map(pullout => {
    if (typeof pullout !== 'object' || pullout === null) {
      throw new TypeError('each pullout must be an object');
    }
    if (typeof pullout.id !== 'string' || pullout.id.length === 0) {
      throw new TypeError('pullout id must be a non-empty string');
    }
    if (seenIds.has(pullout.id)) throw new RangeError(`duplicate pullout: ${pullout.id}`);
    seenIds.add(pullout.id);
    assertSide(pullout.side);
    assertFinite(`${pullout.id}.startDistanceMeters`, pullout.startDistanceMeters);
    assertFinite(`${pullout.id}.endDistanceMeters`, pullout.endDistanceMeters);
    assertPositive(`${pullout.id}.taperMeters`, pullout.taperMeters);
    assertPositive(`${pullout.id}.depthMeters`, pullout.depthMeters);
    const lengthMeters = pullout.endDistanceMeters - pullout.startDistanceMeters;
    if (lengthMeters <= 0) {
      throw new RangeError(
        `${pullout.id}.endDistanceMeters must be greater than its startDistanceMeters, got ${pullout.endDistanceMeters} <= ${pullout.startDistanceMeters}`
      );
    }
    if (pullout.taperMeters * 2 > lengthMeters) {
      throw new RangeError(
        `${pullout.id}.taperMeters must leave a full-depth apron, got ${pullout.taperMeters} in ${lengthMeters} m`
      );
    }
    return Object.freeze({ ...pullout });
  });

  for (const side of ['left', 'right'] as const) {
    const ordered = validated
      .filter(pullout => pullout.side === side)
      .sort((first, second) => first.startDistanceMeters - second.startDistanceMeters);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (current.startDistanceMeters < previous.endDistanceMeters) {
        throw new RangeError(
          `pullouts ${previous.id} and ${current.id} overlap on the ${side} side`
        );
      }
    }
  }

  return Object.freeze(validated);
}

function assertSide(side: RoadSide): void {
  if (side !== 'left' && side !== 'right') {
    throw new TypeError(`Unknown pullout side: ${String(side)}`);
  }
}

function validateRoadTuning(tuning: RoadTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('RoadTuning must be an object');
  }

  assertFinite('laneCount', tuning.laneCount);
  assertFinite('laneWidthMeters', tuning.laneWidthMeters);
  assertFinite('shoulderWidthMeters', tuning.shoulderWidthMeters);
  assertFinite('markerCadenceMeters', tuning.markerCadenceMeters);
  assertFinite('markerLengthMeters', tuning.markerLengthMeters);

  if (!Number.isInteger(tuning.laneCount) || tuning.laneCount < 1) {
    throw new RangeError(`laneCount must be a positive integer, got ${tuning.laneCount}`);
  }
  assertPositive('laneWidthMeters', tuning.laneWidthMeters);
  assertNonNegative('shoulderWidthMeters', tuning.shoulderWidthMeters);
  assertPositive('markerCadenceMeters', tuning.markerCadenceMeters);
  assertPositive('markerLengthMeters', tuning.markerLengthMeters);
  if (tuning.markerLengthMeters >= tuning.markerCadenceMeters) {
    throw new RangeError(
      `markerLengthMeters must be less than markerCadenceMeters, got ${tuning.markerLengthMeters} >= ${tuning.markerCadenceMeters}`
    );
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function roundMeters(value: number): number {
  const rounded = Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
