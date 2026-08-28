import type { Drawable } from '/src/engine/renderer.js';
import { sampleRoute, type Route } from '/src/game/route.js';

const MAX_ROUTE_PREVIEW_POINTS = 4_096;

export interface RoutePreviewFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RoutePreviewPoint {
  readonly x: number;
  readonly y: number;
}

export interface RoutePreviewGeometry {
  readonly frame: RoutePreviewFrame;
  readonly routePoints: readonly RoutePreviewPoint[];
  readonly completedPoints: readonly RoutePreviewPoint[];
  readonly startPoint: RoutePreviewPoint;
  readonly finishPoint: RoutePreviewPoint;
  readonly playerPoint: RoutePreviewPoint;
  readonly pixelsPerMeter: number;
}

export interface BuildRoutePreviewGeometryOptions {
  readonly route: Route;
  readonly distanceAlongRouteMeters: number;
  readonly frame: RoutePreviewFrame;
  readonly paddingPixels: number;
  readonly sampleSpacingMeters: number;
}

export interface RoutePreviewTuning {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly edgeInsetPixels: number;
  readonly paddingPixels: number;
  readonly sampleSpacingMeters: number;
  readonly frameColor: string;
  readonly backgroundColor: string;
  readonly routeShadowColor: string;
  readonly routeColor: string;
  readonly completedColor: string;
  readonly startColor: string;
  readonly finishColor: string;
  readonly playerOutlineColor: string;
  readonly playerColor: string;
}

export interface BuildRoutePreviewDrawablesOptions {
  readonly route: Route;
  readonly distanceAlongRouteMeters: number;
  readonly frame: RoutePreviewFrame;
  readonly tuning?: RoutePreviewTuning;
}

export const DEFAULT_ROUTE_PREVIEW_TUNING: RoutePreviewTuning = Object.freeze({
  widthPixels: 72,
  heightPixels: 104,
  edgeInsetPixels: 8,
  paddingPixels: 8,
  sampleSpacingMeters: 16,
  frameColor: '#859bb3',
  backgroundColor: '#081019',
  routeShadowColor: '#020304',
  routeColor: '#7d9298',
  completedColor: '#f6d96d',
  startColor: '#62c77b',
  finishColor: '#f7ecd7',
  playerOutlineColor: '#020304',
  playerColor: '#ff5f1f',
});

/**
 * Sample the active route and fit it into a screen-space frame. World +y is
 * flipped so a northbound route reads from the bottom of the inset toward the
 * top. One uniform scale preserves the route's world-space aspect ratio.
 */
export function buildRoutePreviewGeometry(
  options: BuildRoutePreviewGeometryOptions
): RoutePreviewGeometry {
  validateFrame(options.frame);
  assertNonNegativeFinite('paddingPixels', options.paddingPixels);
  assertPositiveFinite('sampleSpacingMeters', options.sampleSpacingMeters);
  assertFinite('distanceAlongRouteMeters', options.distanceAlongRouteMeters);

  const innerWidth = options.frame.width - options.paddingPixels * 2;
  const innerHeight = options.frame.height - options.paddingPixels * 2;
  if (innerWidth <= 0 || innerHeight <= 0) {
    throw new RangeError(
      `paddingPixels must leave positive preview space, got ${options.paddingPixels} for ${options.frame.width}x${options.frame.height}`
    );
  }

  const distances = routeSampleDistances(options.route, options.sampleSpacingMeters);
  const samples = distances.map(distance => sampleRoute(options.route, distance).center);
  const xs = samples.map(point => point.xMeters);
  const ys = samples.map(point => point.yMeters);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scaleX = spanX === 0 ? Number.POSITIVE_INFINITY : innerWidth / spanX;
  const scaleY = spanY === 0 ? Number.POSITIVE_INFINITY : innerHeight / spanY;
  const pixelsPerMeter = Math.min(scaleX, scaleY);
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) {
    throw new RangeError('route preview requires geometry with a positive spatial extent');
  }

  const centerX = options.frame.x + options.frame.width / 2;
  const centerY = options.frame.y + options.frame.height / 2;
  const worldCenterX = (minX + maxX) / 2;
  const worldCenterY = (minY + maxY) / 2;
  const project = (point: {
    readonly xMeters: number;
    readonly yMeters: number;
  }): RoutePreviewPoint =>
    Object.freeze({
      x: centerX + (point.xMeters - worldCenterX) * pixelsPerMeter,
      y: centerY - (point.yMeters - worldCenterY) * pixelsPerMeter,
    });

  const clampedDistance = clamp(
    options.distanceAlongRouteMeters,
    0,
    options.route.totalLengthMeters
  );
  const routePoints = Object.freeze(samples.map(project));
  const completedDistances = distances.filter(distance => distance < clampedDistance);
  completedDistances.push(clampedDistance);
  const completedPoints = Object.freeze(
    completedDistances.map(distance => project(sampleRoute(options.route, distance).center))
  );

  return Object.freeze({
    frame: Object.freeze({ ...options.frame }),
    routePoints,
    completedPoints,
    startPoint: routePoints[0]!,
    finishPoint: routePoints.at(-1)!,
    playerPoint: completedPoints.at(-1)!,
    pixelsPerMeter,
  });
}

export function buildRoutePreviewDrawables(
  options: BuildRoutePreviewDrawablesOptions
): readonly Drawable[] {
  const tuning = options.tuning ?? DEFAULT_ROUTE_PREVIEW_TUNING;
  validateTuning(tuning);
  const preview = buildRoutePreviewGeometry({
    route: options.route,
    distanceAlongRouteMeters: options.distanceAlongRouteMeters,
    frame: options.frame,
    paddingPixels: tuning.paddingPixels,
    sampleSpacingMeters: tuning.sampleSpacingMeters,
  });
  const { frame } = preview;
  const drawables: Drawable[] = [
    {
      kind: 'rect',
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
      color: tuning.frameColor,
    },
    {
      kind: 'rect',
      x: frame.x + 2,
      y: frame.y + 2,
      w: frame.width - 4,
      h: frame.height - 4,
      color: tuning.backgroundColor,
    },
    {
      kind: 'polyline',
      points: preview.routePoints,
      width: 5,
      color: tuning.routeShadowColor,
    },
    {
      kind: 'polyline',
      points: preview.routePoints,
      width: 3,
      color: tuning.routeColor,
    },
  ];

  if (preview.completedPoints.length >= 2) {
    drawables.push({
      kind: 'polyline',
      points: preview.completedPoints,
      width: 2,
      color: tuning.completedColor,
    });
  }

  drawables.push(
    markerRect(preview.startPoint, 4, tuning.startColor),
    markerRect(preview.finishPoint, 5, tuning.finishColor),
    diamond(preview.playerPoint, 5, tuning.playerOutlineColor),
    diamond(preview.playerPoint, 3, tuning.playerColor)
  );
  return Object.freeze(drawables);
}

function routeSampleDistances(route: Route, sampleSpacingMeters: number): number[] {
  sampleRoute(route, 0);
  const estimatedPointCount =
    Math.ceil(route.totalLengthMeters / sampleSpacingMeters) + route.segments.length * 2 + 1;
  if (estimatedPointCount > MAX_ROUTE_PREVIEW_POINTS) {
    throw new RangeError(
      `route preview would exceed ${MAX_ROUTE_PREVIEW_POINTS} points, got approximately ${estimatedPointCount}`
    );
  }

  const distances = new Set<number>([0, route.totalLengthMeters]);
  for (
    let distance = sampleSpacingMeters;
    distance < route.totalLengthMeters;
    distance += sampleSpacingMeters
  ) {
    distances.add(distance);
  }
  for (const segment of route.segments) {
    distances.add(segment.startDistanceMeters);
    distances.add(segment.endDistanceMeters);
  }
  return [...distances].sort((a, b) => a - b);
}

function markerRect(point: RoutePreviewPoint, size: number, color: string): Drawable {
  return {
    kind: 'rect',
    x: point.x - size / 2,
    y: point.y - size / 2,
    w: size,
    h: size,
    color,
  };
}

function diamond(point: RoutePreviewPoint, radius: number, color: string): Drawable {
  return {
    kind: 'polygon',
    points: [
      { x: point.x, y: point.y - radius },
      { x: point.x + radius, y: point.y },
      { x: point.x, y: point.y + radius },
      { x: point.x - radius, y: point.y },
    ],
    color,
  };
}

function validateFrame(frame: RoutePreviewFrame): void {
  if (typeof frame !== 'object' || frame === null) {
    throw new TypeError('route preview frame must be an object');
  }
  assertFinite('frame.x', frame.x);
  assertFinite('frame.y', frame.y);
  assertPositiveFinite('frame.width', frame.width);
  assertPositiveFinite('frame.height', frame.height);
}

function validateTuning(tuning: RoutePreviewTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('route preview tuning must be an object');
  }
  assertPositiveFinite('widthPixels', tuning.widthPixels);
  assertPositiveFinite('heightPixels', tuning.heightPixels);
  assertNonNegativeFinite('edgeInsetPixels', tuning.edgeInsetPixels);
  assertNonNegativeFinite('paddingPixels', tuning.paddingPixels);
  assertPositiveFinite('sampleSpacingMeters', tuning.sampleSpacingMeters);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function assertPositiveFinite(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegativeFinite(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
