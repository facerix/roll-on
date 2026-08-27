import { sampleRoute, type Route } from '/src/game/route.js';
import { shortestHeadingDelta } from '/src/game/worldGeometry.js';

export interface RouteFollowerTuning {
  readonly lookaheadMeters: number;
  readonly lateralCorrectionDistanceMeters: number;
  readonly headingGain: number;
}

export interface RouteFollowerFrame {
  readonly route: Route;
  readonly routeDistanceMeters: number;
  readonly lateralOffsetMeters: number;
  readonly headingRadians: number;
}

export const DEFAULT_ROUTE_FOLLOWER_TUNING: RouteFollowerTuning = Object.freeze({
  lookaheadMeters: 25,
  lateralCorrectionDistanceMeters: 35,
  headingGain: 3,
});

/**
 * Debug-only steering controller used to keep long-running gameplay probes on
 * the authored route. It deliberately owns steering alone: acceleration,
 * braking, cruise control, collisions, and encounter behavior remain live.
 */
export function buildRouteFollowerSteering(
  frame: RouteFollowerFrame,
  tuning: RouteFollowerTuning = DEFAULT_ROUTE_FOLLOWER_TUNING
): number {
  assertFinite('routeDistanceMeters', frame.routeDistanceMeters);
  assertFinite('lateralOffsetMeters', frame.lateralOffsetMeters);
  assertFinite('headingRadians', frame.headingRadians);
  assertPositive('lookaheadMeters', tuning.lookaheadMeters);
  assertPositive('lateralCorrectionDistanceMeters', tuning.lateralCorrectionDistanceMeters);
  assertPositive('headingGain', tuning.headingGain);

  const target = sampleRoute(frame.route, frame.routeDistanceMeters + tuning.lookaheadMeters);
  const lateralCorrectionRadians = -Math.atan(
    frame.lateralOffsetMeters / tuning.lateralCorrectionDistanceMeters
  );
  const headingErrorRadians = shortestHeadingDelta(
    target.headingRadians + lateralCorrectionRadians,
    frame.headingRadians
  );

  return clamp(headingErrorRadians * tuning.headingGain, -1, 1);
}

/** Both flags are required so `routeFollow` can never change ordinary play. */
export function isDebugRouteFollowerEnabled(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('debug') && params.has('routeFollow');
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
