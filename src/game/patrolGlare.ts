import type { Drawable } from '/src/engine/renderer.js';
import type { PatrolAttackSide, PatrolEncounter } from '/src/game/patrolEncounter.js';

/**
 * Red-and-blue pursuit glare across the bottom of the road view. It is a pure
 * presentation of encounter state: it holds no timers of its own, adds no
 * proximity model, and never feeds anything back into the simulation.
 */
export interface PatrolGlareSnapshot {
  readonly isVisible: boolean;
  /** Normalized cruiser proximity; `1` means alongside. */
  readonly intensity: number;
  /** The locked attack side, or `null` before one is chosen. */
  readonly side: PatrolAttackSide | null;
}

export interface PatrolGlareTuning {
  /** Gap at which the glare first appears, fading in as it closes. */
  readonly visibleRangeMeters: number;
  readonly bandHeightFraction: number;
  readonly flashHertz: number;
  readonly reducedMotionHertz: number;
  readonly minimumAlpha: number;
  readonly maximumAlpha: number;
  /** Width share the locked side takes; the other half keeps the remainder. */
  readonly lockedSideWidthFraction: number;
  readonly redColor: readonly [number, number, number];
  readonly blueColor: readonly [number, number, number];
}

export interface BuildPatrolGlareSnapshotOptions {
  readonly encounter: PatrolEncounter | null;
  readonly patrolGapMeters: number;
  readonly tuning?: PatrolGlareTuning;
}

export interface BuildPatrolGlareDrawablesOptions {
  readonly snapshot: PatrolGlareSnapshot;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly elapsedSeconds: number;
  readonly reducedMotion?: boolean;
  readonly tuning?: PatrolGlareTuning;
}

export const DEFAULT_PATROL_GLARE_TUNING: PatrolGlareTuning = Object.freeze({
  visibleRangeMeters: 45,
  bandHeightFraction: 0.22,
  flashHertz: 3,
  reducedMotionHertz: 0.5,
  minimumAlpha: 0.12,
  maximumAlpha: 0.62,
  lockedSideWidthFraction: 0.65,
  redColor: Object.freeze([255, 45, 45] as const),
  blueColor: Object.freeze([60, 120, 255] as const),
});

export function buildPatrolGlareSnapshot(
  options: BuildPatrolGlareSnapshotOptions
): PatrolGlareSnapshot {
  const tuning = options.tuning ?? DEFAULT_PATROL_GLARE_TUNING;
  validateTuning(tuning);
  assertFinite('patrolGapMeters', options.patrolGapMeters);
  const encounter = options.encounter;
  if (
    encounter === null ||
    encounter.phase === 'posted' ||
    encounter.phase === 'resolved' ||
    encounter.phase === 'disengaging'
  ) {
    return Object.freeze({ isVisible: false, intensity: 0, side: null });
  }

  const intensity = clamp01(1 - Math.max(0, options.patrolGapMeters) / tuning.visibleRangeMeters);
  const side =
    encounter.phase === 'telegraphing' || encounter.phase === 'sideswiping'
      ? encounter.chosenSide
      : null;

  return Object.freeze({ isVisible: true, intensity, side });
}

export function buildPatrolGlareDrawables(
  options: BuildPatrolGlareDrawablesOptions
): readonly Drawable[] {
  const tuning = options.tuning ?? DEFAULT_PATROL_GLARE_TUNING;
  validateTuning(tuning);
  validateSnapshot(options.snapshot);
  assertNonNegative('elapsedSeconds', options.elapsedSeconds);
  assertPositive('viewport.width', options.viewport.width);
  assertPositive('viewport.height', options.viewport.height);
  if (!options.snapshot.isVisible || options.snapshot.intensity <= 0) return Object.freeze([]);

  const isReducedMotion = options.reducedMotion === true;
  const hertz = isReducedMotion ? tuning.reducedMotionHertz : tuning.flashHertz;
  const phase = (options.elapsedSeconds * hertz) % 1;
  // Reduced motion crossfades the two colors; the ordinary glare snaps between
  // them, which reads as an emergency light without changing the encounter.
  const redShare = isReducedMotion
    ? 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI)
    : phase < 0.5
      ? 1
      : 0;
  const floorAlpha = isReducedMotion ? tuning.minimumAlpha * 2 : tuning.minimumAlpha;
  const bandHeight = options.viewport.height * tuning.bandHeightFraction;
  const y = options.viewport.height - bandHeight;
  const leftWidthFraction =
    options.snapshot.side === 'left'
      ? tuning.lockedSideWidthFraction
      : options.snapshot.side === 'right'
        ? 1 - tuning.lockedSideWidthFraction
        : 0.5;
  const leftWidth = options.viewport.width * leftWidthFraction;

  const alphaFor = (share: number): number =>
    clamp01((floorAlpha + (tuning.maximumAlpha - floorAlpha) * share) * options.snapshot.intensity);

  return Object.freeze([
    {
      kind: 'rect' as const,
      x: 0,
      y,
      w: leftWidth,
      h: bandHeight,
      color: rgba(tuning.redColor, alphaFor(redShare)),
    },
    {
      kind: 'rect' as const,
      x: options.viewport.width / 2,
      y,
      w: options.viewport.width - options.viewport.width / 2,
      h: bandHeight,
      color: rgba(tuning.blueColor, alphaFor(1 - redShare)),
    },
  ]);
}

function rgba(color: readonly [number, number, number], alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${roundAlpha(alpha)})`;
}

function roundAlpha(alpha: number): number {
  return Math.round(alpha * 1_000) / 1_000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validateSnapshot(snapshot: PatrolGlareSnapshot): void {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new TypeError('PatrolGlareSnapshot must be an object');
  }
  if (typeof snapshot.isVisible !== 'boolean') {
    throw new TypeError('snapshot.isVisible must be a boolean');
  }
  assertFinite('snapshot.intensity', snapshot.intensity);
  if (snapshot.intensity < 0 || snapshot.intensity > 1) {
    throw new RangeError(`snapshot.intensity must be in [0, 1], got ${snapshot.intensity}`);
  }
  if (snapshot.side !== null && snapshot.side !== 'left' && snapshot.side !== 'right') {
    throw new TypeError(`Unknown glare side: ${String(snapshot.side)}`);
  }
}

function validateTuning(tuning: PatrolGlareTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('PatrolGlareTuning must be an object');
  }
  assertPositive('visibleRangeMeters', tuning.visibleRangeMeters);
  assertPositive('bandHeightFraction', tuning.bandHeightFraction);
  if (tuning.bandHeightFraction > 1) {
    throw new RangeError(`bandHeightFraction must be <= 1, got ${tuning.bandHeightFraction}`);
  }
  assertPositive('flashHertz', tuning.flashHertz);
  assertPositive('reducedMotionHertz', tuning.reducedMotionHertz);
  if (tuning.reducedMotionHertz >= tuning.flashHertz) {
    throw new RangeError('reducedMotionHertz must be slower than flashHertz');
  }
  assertNonNegative('minimumAlpha', tuning.minimumAlpha);
  assertPositive('maximumAlpha', tuning.maximumAlpha);
  if (tuning.maximumAlpha <= tuning.minimumAlpha || tuning.maximumAlpha > 1) {
    throw new RangeError('maximumAlpha must be greater than minimumAlpha and at most 1');
  }
  assertPositive('lockedSideWidthFraction', tuning.lockedSideWidthFraction);
  if (tuning.lockedSideWidthFraction >= 1) {
    throw new RangeError('lockedSideWidthFraction must be below 1');
  }
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
