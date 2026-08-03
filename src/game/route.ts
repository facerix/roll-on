/**
 * Route geometry: the single source of truth for where the road's centerline
 * goes in the Cartesian world plane.
 *
 * A route is a chain of authored segments — straights and constant-curvature
 * arcs — compiled once into deterministic, sampleable geometry. Rendering,
 * collision, traffic AI, and progress are all consumers of the same samples;
 * none of them may redefine the curve.
 *
 * Conventions, all inherited from `worldGeometry.ts`:
 *
 * - `headingRadians` is measured from `+y` toward `+x`, so the unit tangent is
 *   `{ sin(heading), cos(heading) }` and positive rotation turns right.
 * - `curvaturePerMeter` is `dHeading / dDistance`. Positive curvature bends the
 *   route toward the driver's right (`+x` when heading is zero); negative bends
 *   left. Zero curvature is spelled `{ kind: 'straight' }`, never an arc with a
 *   magic epsilon.
 * - The sample `normal` is the tangent turned toward the driver's right, so a
 *   positive lateral route offset is a right-of-center offset. This matches the
 *   sign of `road.ts` lane offsets on the straight prototype road.
 * - Sample headings are normalized to `(-pi, pi]`, the same convention truck
 *   state uses. Headings are therefore continuous across segment joins only
 *   modulo `2*pi`; consumers comparing headings must use shortest-path deltas,
 *   as they already must against truck heading.
 *
 * A route knows nothing about lanes, lane width, shoulders, sprites, cameras,
 * or pixels. That cross-section belongs to `road.ts`, laid over this centerline.
 *
 * Outside the authored range the route continues straight along its endpoint
 * tangent in both directions, with zero curvature. That keeps trailer geometry
 * behind the starting line well defined and lets the open-ended prototype keep
 * driving past the last authored meter.
 */

import {
  createWorldPoint,
  createWorldVector,
  dotVectors,
  headingToUnitVector,
  normalizeHeading,
  shortestHeadingDelta,
  validatePoint,
  type WorldPoint,
  type WorldVector,
} from '/src/game/worldGeometry.js';

/** Longest accumulated route we will compile, in meters. */
export const MAX_ROUTE_LENGTH_METERS = 1_000_000;

export type RouteSegmentDefinition =
  | { readonly kind: 'straight'; readonly lengthMeters: number }
  | {
      readonly kind: 'arc';
      readonly lengthMeters: number;
      readonly curvaturePerMeter: number;
    };

/**
 * Bounds a route must satisfy. Supplied by the caller because the route itself
 * does not know how wide the road laid over it will be.
 */
export interface RouteConstraints {
  /**
   * The largest absolute lateral offset any consumer will lay over this route —
   * for a road, the outermost barrier edge. An arc whose radius is not strictly
   * greater than this would fold the inner edge through the curve center.
   */
  readonly maximumAbsoluteRoadOffsetMeters: number;
  /**
   * The tightest bend the game accepts. Stricter than geometric validity: the
   * geometric bound prevents corrupt geometry, this one prevents technically
   * valid hairpins an 18-wheeler cannot read or navigate.
   */
  readonly minimumBendRadiusMeters: number;
}

export interface RouteDefinition {
  readonly origin: WorldPoint;
  readonly headingRadians: number;
  readonly segments: readonly RouteSegmentDefinition[];
  readonly constraints: RouteConstraints;
}

/** An authored segment with its chained start pose and cumulative distances. */
export interface RouteSegment {
  readonly index: number;
  readonly kind: RouteSegmentDefinition['kind'];
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
  readonly lengthMeters: number;
  readonly curvaturePerMeter: number;
  readonly start: WorldPoint;
  readonly startHeadingRadians: number;
  readonly end: WorldPoint;
  readonly endHeadingRadians: number;
}

export interface Route {
  readonly segments: readonly RouteSegment[];
  readonly totalLengthMeters: number;
  readonly constraints: RouteConstraints;
}

export interface RouteSample {
  readonly distanceAlongRouteMeters: number;
  readonly center: WorldPoint;
  readonly tangent: WorldVector;
  readonly normal: WorldVector;
  readonly headingRadians: number;
  readonly curvaturePerMeter: number;
}

/** A route-relative position: distance along the centerline plus signed lateral offset. */
export interface RoutePosition {
  readonly distanceAlongRouteMeters: number;
  /** Signed offset along the sample normal; positive is right-of-center. */
  readonly lateralOffsetMeters: number;
}

export interface WorldToRouteOptions {
  /** A nearby route distance used to select among candidate solutions and bound the search. */
  readonly hintDistanceAlongRouteMeters: number;
  /**
   * Half-width, in route-distance meters, of the window searched around the hint. Also the
   * maximum tolerated projection error: a point whose true nearest route position falls further
   * than this from the search window is reported as lost acquisition rather than silently
   * returned as a best-effort guess.
   */
  readonly searchRadiusMeters: number;
}

export interface RouteProjection {
  readonly distanceAlongRouteMeters: number;
  readonly lateralOffsetMeters: number;
  /** Nearest point on the route centerline, i.e. `routeToWorld` at zero lateral offset. */
  readonly point: WorldPoint;
  readonly tangent: WorldVector;
  readonly normal: WorldVector;
  readonly headingRadians: number;
  readonly curvaturePerMeter: number;
  /**
   * Residual distance, along the local tangent, between the queried point and the reported
   * nearest position. Zero for an unclamped analytic solution; positive when the true closest
   * point was clamped to a segment or search-window boundary.
   */
  readonly errorMeters: number;
}

export function createRoute(definition: RouteDefinition): Route {
  if (typeof definition !== 'object' || definition === null) {
    throw new TypeError('route definition must be an object');
  }
  validatePoint('origin', definition.origin);
  assertFinite('headingRadians', definition.headingRadians);
  validateConstraints(definition.constraints);

  if (!Array.isArray(definition.segments) || definition.segments.length === 0) {
    throw new RangeError('route definition must contain at least one segment');
  }

  const segments: RouteSegment[] = [];
  let startDistanceMeters = 0;
  let start = createWorldPoint(definition.origin.xMeters, definition.origin.yMeters);
  let startHeadingRadians = definition.headingRadians;

  for (const [index, source] of definition.segments.entries()) {
    const label = `segments[${index}]`;
    const curvaturePerMeter = readCurvature(label, source, definition.constraints);
    const lengthMeters = readLength(label, source);

    const endDistanceMeters = startDistanceMeters + lengthMeters;
    if (endDistanceMeters > MAX_ROUTE_LENGTH_METERS) {
      throw new RangeError(
        `accumulated route length must stay <= ${MAX_ROUTE_LENGTH_METERS} meters, got ${endDistanceMeters} at ${label}`
      );
    }

    const endHeadingRadians = startHeadingRadians + curvaturePerMeter * lengthMeters;
    const end = advance(start, startHeadingRadians, curvaturePerMeter, lengthMeters);

    segments.push(
      Object.freeze({
        index,
        kind: source.kind,
        startDistanceMeters,
        endDistanceMeters,
        lengthMeters,
        curvaturePerMeter,
        start,
        startHeadingRadians: normalizeHeading(startHeadingRadians),
        end,
        endHeadingRadians: normalizeHeading(endHeadingRadians),
      })
    );

    startDistanceMeters = endDistanceMeters;
    start = end;
    startHeadingRadians = endHeadingRadians;
  }

  return Object.freeze({
    segments: Object.freeze(segments),
    totalLengthMeters: startDistanceMeters,
    constraints: Object.freeze({ ...definition.constraints }),
  });
}

export function sampleRoute(route: Route, distanceAlongRouteMeters: number): RouteSample {
  validateRoute(route);
  assertFinite('distanceAlongRouteMeters', distanceAlongRouteMeters);

  const first = route.segments[0]!;
  const last = route.segments[route.segments.length - 1]!;

  // Outside the authored range the route continues straight along its endpoint
  // tangent, so trailers behind the start and open-ended driving past the end
  // both have well-defined geometry.
  if (distanceAlongRouteMeters < 0) {
    return continuation(
      distanceAlongRouteMeters,
      first.start,
      first.startHeadingRadians,
      distanceAlongRouteMeters
    );
  }
  if (distanceAlongRouteMeters > route.totalLengthMeters) {
    return continuation(
      distanceAlongRouteMeters,
      last.end,
      last.endHeadingRadians,
      distanceAlongRouteMeters - route.totalLengthMeters
    );
  }

  const segment = route.segments[findSegmentIndex(route, distanceAlongRouteMeters)]!;
  const offsetMeters = distanceAlongRouteMeters - segment.startDistanceMeters;
  const headingRadians = segment.startHeadingRadians + segment.curvaturePerMeter * offsetMeters;

  return buildSample(
    distanceAlongRouteMeters,
    advance(segment.start, segment.startHeadingRadians, segment.curvaturePerMeter, offsetMeters),
    headingRadians,
    segment.curvaturePerMeter
  );
}

/**
 * Index of the segment owning a distance inside `[0, totalLengthMeters]`.
 *
 * A distance exactly on a join belongs to the segment that starts there, so the
 * reported curvature is the one the driver is entering. The final segment owns
 * its own end.
 */
export function findSegmentIndex(route: Route, distanceAlongRouteMeters: number): number {
  validateRoute(route);
  assertFinite('distanceAlongRouteMeters', distanceAlongRouteMeters);
  if (distanceAlongRouteMeters < 0 || distanceAlongRouteMeters > route.totalLengthMeters) {
    throw new RangeError(
      `distanceAlongRouteMeters must be within [0, ${route.totalLengthMeters}], got ${distanceAlongRouteMeters}`
    );
  }

  let low = 0;
  let high = route.segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (route.segments[middle]!.startDistanceMeters <= distanceAlongRouteMeters) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** Places a route-relative position in the Cartesian world plane. Zero lateral offset lands on the centerline. */
export function routeToWorld(route: Route, routePosition: RoutePosition): WorldPoint {
  validateRoute(route);
  if (typeof routePosition !== 'object' || routePosition === null) {
    throw new TypeError('routePosition must be an object');
  }
  assertFinite('routePosition.distanceAlongRouteMeters', routePosition.distanceAlongRouteMeters);
  assertFinite('routePosition.lateralOffsetMeters', routePosition.lateralOffsetMeters);

  const sample = sampleRoute(route, routePosition.distanceAlongRouteMeters);
  return createWorldPoint(
    sample.center.xMeters + sample.normal.xMeters * routePosition.lateralOffsetMeters,
    sample.center.yMeters + sample.normal.yMeters * routePosition.lateralOffsetMeters
  );
}

/**
 * Bounded, hint-assisted projection of a world point onto the route. Searches only the segment
 * geometry within `hintDistanceAlongRouteMeters ± searchRadiusMeters`; it never scans the whole
 * route, so it stays deterministic and cheap regardless of total route length.
 *
 * Fails explicitly — rather than returning a misleading best guess — when the true nearest route
 * position falls outside that search window.
 */
export function worldToRoute(
  route: Route,
  worldPoint: WorldPoint,
  options: WorldToRouteOptions
): RouteProjection {
  validateRoute(route);
  validatePoint('worldPoint', worldPoint);
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('options must be an object');
  }
  assertFinite('options.hintDistanceAlongRouteMeters', options.hintDistanceAlongRouteMeters);
  assertPositive('options.searchRadiusMeters', options.searchRadiusMeters);

  const windowStartMeters = options.hintDistanceAlongRouteMeters - options.searchRadiusMeters;
  const windowEndMeters = options.hintDistanceAlongRouteMeters + options.searchRadiusMeters;

  let bestDistanceAlongRouteMeters: number | undefined;
  let bestSquaredMeters = Number.POSITIVE_INFINITY;

  const consider = (
    candidateLocalMeters: number,
    loLocalMeters: number,
    hiLocalMeters: number,
    globalStartMeters: number
  ): void => {
    if (loLocalMeters > hiLocalMeters) {
      return;
    }
    const clampedLocalMeters = Math.min(
      Math.max(candidateLocalMeters, loLocalMeters),
      hiLocalMeters
    );
    const distanceAlongRouteMeters = globalStartMeters + clampedLocalMeters;
    const sample = sampleRoute(route, distanceAlongRouteMeters);
    const dx = worldPoint.xMeters - sample.center.xMeters;
    const dy = worldPoint.yMeters - sample.center.yMeters;
    const squaredMeters = dx * dx + dy * dy;
    if (squaredMeters < bestSquaredMeters) {
      bestSquaredMeters = squaredMeters;
      bestDistanceAlongRouteMeters = distanceAlongRouteMeters;
    }
  };

  const first = route.segments[0]!;
  const last = route.segments[route.segments.length - 1]!;

  if (windowStartMeters < 0) {
    const t = projectOntoStraight(worldPoint, first.start, first.startHeadingRadians);
    consider(t, windowStartMeters, Math.min(windowEndMeters, 0), 0);
  }

  for (const segment of route.segments) {
    const loGlobalMeters = Math.max(windowStartMeters, segment.startDistanceMeters);
    const hiGlobalMeters = Math.min(windowEndMeters, segment.endDistanceMeters);
    if (loGlobalMeters > hiGlobalMeters) {
      continue;
    }
    const loLocalMeters = loGlobalMeters - segment.startDistanceMeters;
    const hiLocalMeters = hiGlobalMeters - segment.startDistanceMeters;

    if (segment.curvaturePerMeter === 0) {
      const t = projectOntoStraight(worldPoint, segment.start, segment.startHeadingRadians);
      consider(t, loLocalMeters, hiLocalMeters, segment.startDistanceMeters);
    } else {
      for (const t of projectOntoArc(
        worldPoint,
        segment.start,
        segment.startHeadingRadians,
        segment.curvaturePerMeter
      )) {
        consider(t, loLocalMeters, hiLocalMeters, segment.startDistanceMeters);
      }
    }
  }

  if (windowEndMeters > route.totalLengthMeters) {
    const t = projectOntoStraight(worldPoint, last.end, last.endHeadingRadians);
    consider(
      t,
      Math.max(windowStartMeters, route.totalLengthMeters) - route.totalLengthMeters,
      windowEndMeters - route.totalLengthMeters,
      route.totalLengthMeters
    );
  }

  if (bestDistanceAlongRouteMeters === undefined) {
    throw new RangeError('worldToRoute search window did not overlap any route geometry');
  }

  const sample = sampleRoute(route, bestDistanceAlongRouteMeters);
  const relative = createWorldVector(
    worldPoint.xMeters - sample.center.xMeters,
    worldPoint.yMeters - sample.center.yMeters
  );
  const lateralOffsetMeters = dotVectors(relative, sample.normal);
  const errorMeters = Math.abs(dotVectors(relative, sample.tangent));

  if (errorMeters > options.searchRadiusMeters) {
    throw new RangeError(
      `worldToRoute lost acquisition: nearest route position is ${errorMeters} m beyond the ` +
        `${options.searchRadiusMeters} m search window around hint ${options.hintDistanceAlongRouteMeters}`
    );
  }

  return Object.freeze({
    distanceAlongRouteMeters: bestDistanceAlongRouteMeters,
    lateralOffsetMeters,
    point: sample.center,
    tangent: sample.tangent,
    normal: sample.normal,
    headingRadians: sample.headingRadians,
    curvaturePerMeter: sample.curvaturePerMeter,
    errorMeters,
  });
}

/** Signed local distance from `anchor` along its tangent to the closest approach of `point`. */
function projectOntoStraight(
  point: WorldPoint,
  anchor: WorldPoint,
  headingRadians: number
): number {
  const tangent = headingToUnitVector(headingRadians);
  return dotVectors(
    createWorldVector(point.xMeters - anchor.xMeters, point.yMeters - anchor.yMeters),
    tangent
  );
}

/**
 * Candidate local distances (unclamped) from an arc's start where the arc's underlying circle
 * comes closest to `point`. A circle has exactly one true closest point, but the affine map from
 * that point's angle back to arc-local distance is only unique modulo one full revolution, so
 * three representative candidates (one period apart) are returned; the caller clamps each to its
 * valid range and keeps whichever is genuinely closest.
 */
function projectOntoArc(
  point: WorldPoint,
  start: WorldPoint,
  startHeadingRadians: number,
  curvaturePerMeter: number
): readonly number[] {
  const radiusMeters = 1 / curvaturePerMeter;
  const normalAtStart = createWorldVector(
    Math.cos(startHeadingRadians),
    -Math.sin(startHeadingRadians)
  );
  const center = createWorldPoint(
    start.xMeters + normalAtStart.xMeters * radiusMeters,
    start.yMeters + normalAtStart.yMeters * radiusMeters
  );

  const relative = {
    xMeters: point.xMeters - center.xMeters,
    yMeters: point.yMeters - center.yMeters,
  };
  const targetHeadingRadians = Math.atan2(
    curvaturePerMeter * relative.yMeters,
    -curvaturePerMeter * relative.xMeters
  );

  const deltaRadians = shortestHeadingDelta(
    targetHeadingRadians,
    normalizeHeading(startHeadingRadians)
  );
  const baseLocalMeters = deltaRadians / curvaturePerMeter;
  const periodMeters = (2 * Math.PI) / Math.abs(curvaturePerMeter);

  return [baseLocalMeters - periodMeters, baseLocalMeters, baseLocalMeters + periodMeters];
}

/** Position reached by travelling `lengthMeters` from a pose at fixed curvature. */
function advance(
  start: WorldPoint,
  startHeadingRadians: number,
  curvaturePerMeter: number,
  lengthMeters: number
): WorldPoint {
  if (curvaturePerMeter === 0) {
    return createWorldPoint(
      start.xMeters + Math.sin(startHeadingRadians) * lengthMeters,
      start.yMeters + Math.cos(startHeadingRadians) * lengthMeters
    );
  }

  // Integrating the unit tangent over a constant-curvature arc:
  //   x(s) = x0 + (cos(h0) - cos(h0 + k*s)) / k
  //   y(s) = y0 + (sin(h0 + k*s) - sin(h0)) / k
  const endHeadingRadians = startHeadingRadians + curvaturePerMeter * lengthMeters;
  return createWorldPoint(
    start.xMeters +
      (Math.cos(startHeadingRadians) - Math.cos(endHeadingRadians)) / curvaturePerMeter,
    start.yMeters +
      (Math.sin(endHeadingRadians) - Math.sin(startHeadingRadians)) / curvaturePerMeter
  );
}

function continuation(
  distanceAlongRouteMeters: number,
  anchor: WorldPoint,
  headingRadians: number,
  overshootMeters: number
): RouteSample {
  return buildSample(
    distanceAlongRouteMeters,
    advance(anchor, headingRadians, 0, overshootMeters),
    headingRadians,
    0
  );
}

function buildSample(
  distanceAlongRouteMeters: number,
  center: WorldPoint,
  headingRadians: number,
  curvaturePerMeter: number
): RouteSample {
  const normalizedHeadingRadians = normalizeHeading(headingRadians);
  const sin = Math.sin(normalizedHeadingRadians);
  const cos = Math.cos(normalizedHeadingRadians);

  return Object.freeze({
    distanceAlongRouteMeters,
    center,
    tangent: createWorldVector(sin, cos),
    // The tangent turned toward the driver's right: +x when heading is zero.
    normal: createWorldVector(cos, -sin),
    headingRadians: normalizedHeadingRadians,
    curvaturePerMeter,
  });
}

function readLength(label: string, segment: RouteSegmentDefinition): number {
  assertFinite(`${label}.lengthMeters`, segment.lengthMeters);
  if (segment.lengthMeters <= 0) {
    throw new RangeError(`${label}.lengthMeters must be positive, got ${segment.lengthMeters}`);
  }
  return segment.lengthMeters;
}

function readCurvature(
  label: string,
  segment: RouteSegmentDefinition,
  constraints: RouteConstraints
): number {
  if (typeof segment !== 'object' || segment === null) {
    throw new TypeError(`${label} must be an object`);
  }

  if (segment.kind === 'straight') {
    return 0;
  }
  if (segment.kind !== 'arc') {
    throw new TypeError(
      `${label}.kind must be 'straight' or 'arc', got ${JSON.stringify((segment as { kind: unknown }).kind)}`
    );
  }

  assertFinite(`${label}.curvaturePerMeter`, segment.curvaturePerMeter);
  if (segment.curvaturePerMeter === 0) {
    throw new RangeError(
      `${label}.curvaturePerMeter must be non-zero; use { kind: 'straight' } for zero curvature`
    );
  }

  const radiusMeters = 1 / Math.abs(segment.curvaturePerMeter);
  if (radiusMeters <= constraints.maximumAbsoluteRoadOffsetMeters) {
    throw new RangeError(
      `${label}.curvaturePerMeter bends tighter than the road is wide: radius ${radiusMeters} m <= maximumAbsoluteRoadOffsetMeters ${constraints.maximumAbsoluteRoadOffsetMeters} m`
    );
  }
  if (radiusMeters < constraints.minimumBendRadiusMeters) {
    throw new RangeError(
      `${label}.curvaturePerMeter bends tighter than minimumBendRadiusMeters: radius ${radiusMeters} m < ${constraints.minimumBendRadiusMeters} m`
    );
  }

  return segment.curvaturePerMeter;
}

function validateConstraints(constraints: RouteConstraints): void {
  if (typeof constraints !== 'object' || constraints === null) {
    throw new TypeError('constraints must be an object');
  }
  assertPositive(
    'constraints.maximumAbsoluteRoadOffsetMeters',
    constraints.maximumAbsoluteRoadOffsetMeters
  );
  assertPositive('constraints.minimumBendRadiusMeters', constraints.minimumBendRadiusMeters);
  if (constraints.minimumBendRadiusMeters <= constraints.maximumAbsoluteRoadOffsetMeters) {
    throw new RangeError(
      `constraints.minimumBendRadiusMeters must exceed maximumAbsoluteRoadOffsetMeters, got ${constraints.minimumBendRadiusMeters} <= ${constraints.maximumAbsoluteRoadOffsetMeters}`
    );
  }
}

function validateRoute(route: Route): void {
  if (typeof route !== 'object' || route === null) {
    throw new TypeError('route must be an object');
  }
  if (!Array.isArray(route.segments) || route.segments.length === 0) {
    throw new RangeError('route must contain at least one segment');
  }
  assertFinite('route.totalLengthMeters', route.totalLengthMeters);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive, got ${value}`);
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}
