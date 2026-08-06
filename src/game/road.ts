import {
  createRoute,
  routeToWorld,
  sampleRoute,
  type Route,
  type RouteSample,
  type RouteSegmentDefinition,
} from '/src/game/route.js';
import type { WorldPoint } from '/src/game/worldGeometry.js';

export interface RoadTuning {
  readonly laneCount: number;
  readonly laneWidthMeters: number;
  readonly shoulderWidthMeters: number;
  readonly markerCadenceMeters: number;
  readonly markerLengthMeters: number;
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

/**
 * The authored Stage 1 route. Its sections share boundaries with the encounter
 * timeline so geometry and traffic pressure can be tuned as one rhythm.
 */
export function createDefaultStageRoute(): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: STAGE_1_ROUTE_SECTIONS.flatMap(section => section.segments),
    constraints: {
      maximumAbsoluteRoadOffsetMeters: 10,
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

export function createRoad(tuning: RoadTuning, route: Route = defaultStraightRoute()): Road {
  validateRoadTuning(tuning);
  validateRouteForRoad(route, tuning);

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
  });
}

export function sampleRoad(road: Road, distanceAlongRouteMeters: number): RoadCrossSectionSample {
  validateRoad(road);
  assertFinite('distanceAlongRouteMeters', distanceAlongRouteMeters);
  const routeSample = sampleRoute(road.route, distanceAlongRouteMeters);
  const pointAt = (lateralMeters: number): WorldPoint =>
    routeToWorld(road.route, { distanceAlongRouteMeters, lateralOffsetMeters: lateralMeters });

  return Object.freeze({
    distanceAlongRouteMeters,
    center: routeSample.center,
    laneCenters: Object.freeze(road.laneCenterOffsetsMeters.map(pointAt)),
    laneBoundaries: Object.freeze(road.laneBoundaryOffsetsMeters.map(pointAt)),
    roadEdges: Object.freeze([
      pointAt(road.leftRoadEdgeMeters),
      pointAt(road.rightRoadEdgeMeters),
    ] as [WorldPoint, WorldPoint]),
    shoulderEdges: Object.freeze([
      pointAt(road.leftShoulderEdgeMeters),
      pointAt(road.rightShoulderEdgeMeters),
    ] as [WorldPoint, WorldPoint]),
    barrierEdges: Object.freeze([
      pointAt(road.leftBarrierLateralMeters),
      pointAt(road.rightBarrierLateralMeters),
    ] as [WorldPoint, WorldPoint]),
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
  for (const segment of road.route.segments) {
    if (
      segment.startDistanceMeters > window.startDistanceMeters &&
      segment.startDistanceMeters < window.endDistanceMeters
    ) {
      distances.add(segment.startDistanceMeters);
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
  validateRouteForRoad(road.route, road);
}

function defaultStraightRoute(): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 1 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 10, minimumBendRadiusMeters: 30 },
  });
}

function validateRouteForRoad(route: Route, tuning: RoadTuning): void {
  if (typeof route !== 'object' || route === null || !Array.isArray(route.segments)) {
    throw new TypeError('route must be a compiled Route');
  }
  const maximumOffset =
    (tuning.laneCount * tuning.laneWidthMeters) / 2 + tuning.shoulderWidthMeters;
  if (maximumOffset > route.constraints.maximumAbsoluteRoadOffsetMeters) {
    throw new RangeError(
      `road outer offset ${maximumOffset} exceeds route constraint ${route.constraints.maximumAbsoluteRoadOffsetMeters}`
    );
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
