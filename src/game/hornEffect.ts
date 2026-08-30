import type { Drawable, PolylineDrawable } from '/src/engine/renderer.js';
import type { HornStatus } from '/src/game/horn.js';
import { projectWorldPoint, type RoadCamera } from '/src/game/roadCamera.js';
import type { TruckState } from '/src/game/truck.js';
import { shortestHeadingDelta } from '/src/game/worldGeometry.js';

export type HornEffectStatus = Exclude<HornStatus, 'idle'>;

export interface HornEffectSnapshot {
  readonly status: HornEffectStatus;
  readonly elapsedSeconds: number;
}

export interface HornEffectTuning {
  readonly successDurationSeconds: number;
  readonly failureDurationSeconds: number;
  readonly successMinimumRadiusPixels: number;
  readonly successTravelPixels: number;
  readonly successWaveGapPixels: number;
  readonly failureRadiusPixels: number;
  readonly failureStutterPixels: number;
  readonly successColor: readonly [number, number, number];
  readonly failureColor: readonly [number, number, number];
  readonly arcSegments: number;
}

export interface BuildHornEffectDrawablesOptions {
  readonly snapshot: HornEffectSnapshot;
  readonly camera: RoadCamera;
  readonly truck: TruckState;
  readonly cabLengthMeters: number;
  readonly reducedMotion?: boolean;
  readonly tuning?: HornEffectTuning;
}

export const DEFAULT_HORN_EFFECT_TUNING: HornEffectTuning = Object.freeze({
  successDurationSeconds: 0.65,
  failureDurationSeconds: 0.36,
  successMinimumRadiusPixels: 14,
  successTravelPixels: 72,
  successWaveGapPixels: 9,
  failureRadiusPixels: 15,
  failureStutterPixels: 4,
  successColor: Object.freeze([246, 217, 109] as const),
  failureColor: Object.freeze([255, 95, 31] as const),
  arcSegments: 12,
});

export function createHornEffect(status: HornStatus): HornEffectSnapshot {
  assertEffectStatus(status);
  return Object.freeze({ status, elapsedSeconds: 0 });
}

export function stepHornEffect(
  snapshot: HornEffectSnapshot | null,
  dtSeconds: number,
  tuning: HornEffectTuning = DEFAULT_HORN_EFFECT_TUNING
): HornEffectSnapshot | null {
  assertNonNegative('dtSeconds', dtSeconds);
  validateTuning(tuning);
  if (snapshot === null) return null;
  validateSnapshot(snapshot);
  const elapsedSeconds = snapshot.elapsedSeconds + dtSeconds;
  if (elapsedSeconds >= durationFor(snapshot.status, tuning)) return null;
  return Object.freeze({ ...snapshot, elapsedSeconds });
}

/**
 * Build screen-space wavefronts from the front of the cab. Success travels
 * conspicuously down-road; unsuccessful attempts stay close to the truck and
 * break the arc in two. Reduced motion holds the geometry still and fades it.
 */
export function buildHornEffectDrawables(
  options: BuildHornEffectDrawablesOptions
): readonly Drawable[] {
  const tuning = options.tuning ?? DEFAULT_HORN_EFFECT_TUNING;
  validateTuning(tuning);
  validateSnapshot(options.snapshot);
  assertPositive('cabLengthMeters', options.cabLengthMeters);
  assertFinite('truck.headingRadians', options.truck.headingRadians);
  const duration = durationFor(options.snapshot.status, tuning);
  if (options.snapshot.elapsedSeconds >= duration) return Object.freeze([]);

  const progress = clamp01(options.snapshot.elapsedSeconds / duration);
  const rotationRadians = shortestHeadingDelta(
    options.truck.headingRadians,
    options.camera.rotationRadians
  );
  const forward = { x: Math.sin(rotationRadians), y: -Math.cos(rotationRadians) };
  const right = { x: Math.cos(rotationRadians), y: Math.sin(rotationRadians) };
  const cabCenter = projectWorldPoint(options.camera, options.truck.position);
  const cabFrontDistancePixels = (options.cabLengthMeters / 2) * options.camera.pixelsPerMeter;
  const origin = {
    x: cabCenter.x + forward.x * cabFrontDistancePixels,
    y: cabCenter.y + forward.y * cabFrontDistancePixels,
  };

  return options.snapshot.status === 'cleared'
    ? buildSuccessWaves(origin, forward, right, progress, options.reducedMotion === true, tuning)
    : buildFailureWaves(origin, forward, right, progress, options.reducedMotion === true, tuning);
}

function buildSuccessWaves(
  origin: Point,
  forward: Point,
  right: Point,
  progress: number,
  reducedMotion: boolean,
  tuning: HornEffectTuning
): readonly PolylineDrawable[] {
  const travelProgress = reducedMotion ? 0.28 : easeOutCubic(progress);
  const baseRadius =
    tuning.successMinimumRadiusPixels + tuning.successTravelPixels * travelProgress;
  return Object.freeze(
    Array.from({ length: 3 }, (_, index) => ({
      kind: 'polyline' as const,
      points: arcPoints(
        origin,
        forward,
        right,
        baseRadius + index * tuning.successWaveGapPixels,
        -Math.PI / 2,
        Math.PI / 2,
        tuning.arcSegments
      ),
      width: 3 - index * 0.55,
      color: rgba(tuning.successColor, (1 - progress) * (0.9 - index * 0.16)),
    }))
  );
}

function buildFailureWaves(
  origin: Point,
  forward: Point,
  right: Point,
  progress: number,
  reducedMotion: boolean,
  tuning: HornEffectTuning
): readonly PolylineDrawable[] {
  const stutter = reducedMotion ? 0 : Math.sin(progress * Math.PI * 4);
  const baseRadius = tuning.failureRadiusPixels + tuning.failureStutterPixels * stutter;
  const alpha = (1 - progress) * 0.95;
  const drawables: PolylineDrawable[] = [];
  for (let index = 0; index < 2; index += 1) {
    const radius = baseRadius + index * tuning.successWaveGapPixels * 0.75;
    for (const [start, end] of [
      [-Math.PI / 2, -0.2],
      [0.2, Math.PI / 2],
    ] as const) {
      drawables.push({
        kind: 'polyline',
        points: arcPoints(origin, forward, right, radius, start, end, tuning.arcSegments / 2),
        width: 2.75 - index * 0.6,
        color: rgba(tuning.failureColor, alpha * (1 - index * 0.22)),
      });
    }
  }
  return Object.freeze(drawables);
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function arcPoints(
  origin: Point,
  forward: Point,
  right: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  segmentCount: number
): readonly Point[] {
  return Object.freeze(
    Array.from({ length: segmentCount + 1 }, (_, index) => {
      const angle = startAngle + ((endAngle - startAngle) * index) / segmentCount;
      return Object.freeze({
        x: origin.x + forward.x * Math.cos(angle) * radius + right.x * Math.sin(angle) * radius,
        y: origin.y + forward.y * Math.cos(angle) * radius + right.y * Math.sin(angle) * radius,
      });
    })
  );
}

function durationFor(status: HornEffectStatus, tuning: HornEffectTuning): number {
  return status === 'cleared' ? tuning.successDurationSeconds : tuning.failureDurationSeconds;
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function rgba(color: readonly [number, number, number], alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.round(clamp01(alpha) * 1_000) / 1_000})`;
}

function validateSnapshot(snapshot: HornEffectSnapshot): void {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new TypeError('HornEffectSnapshot must be an object');
  }
  assertEffectStatus(snapshot.status);
  assertNonNegative('snapshot.elapsedSeconds', snapshot.elapsedSeconds);
}

function assertEffectStatus(status: HornStatus): asserts status is HornEffectStatus {
  if (status === 'idle') throw new RangeError('idle horn outcome has no visual effect');
  if (
    status !== 'cleared' &&
    status !== 'cooldown' &&
    status !== 'no-target' &&
    status !== 'blocked'
  ) {
    throw new TypeError(`Unknown horn effect status: ${String(status)}`);
  }
}

function validateTuning(tuning: HornEffectTuning): void {
  assertPositive('successDurationSeconds', tuning.successDurationSeconds);
  assertPositive('failureDurationSeconds', tuning.failureDurationSeconds);
  assertPositive('successMinimumRadiusPixels', tuning.successMinimumRadiusPixels);
  assertPositive('successTravelPixels', tuning.successTravelPixels);
  assertPositive('successWaveGapPixels', tuning.successWaveGapPixels);
  assertPositive('failureRadiusPixels', tuning.failureRadiusPixels);
  assertNonNegative('failureStutterPixels', tuning.failureStutterPixels);
  if (!Number.isSafeInteger(tuning.arcSegments) || tuning.arcSegments < 4) {
    throw new RangeError(`arcSegments must be an integer of at least 4, got ${tuning.arcSegments}`);
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}
