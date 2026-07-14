/**
 * Smoothed FPS meter for the debug HUD.
 *
 * Raw `1 / dt` flickers too violently to read. We use an exponential moving
 * average over the *frame time* (not over FPS itself — averaging FPS would
 * be biased by Jensen's inequality since FPS is a non-linear function of
 * dt). At the end we invert the averaged frame time to get FPS.
 *
 * The first sample bypasses smoothing so the HUD shows a real number on
 * frame 1 instead of slowly ramping up from 0.
 */

/** EMA weight on the new sample. ~0.1 → ~10-frame window. */
const DEFAULT_ALPHA = 0.1;

export class FpsMeter {
  readonly #alpha: number;
  #smoothedFrameTime: number | null = null;

  constructor(alpha: number = DEFAULT_ALPHA) {
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      throw new RangeError(`alpha must be in (0, 1], got ${alpha}`);
    }
    this.#alpha = alpha;
  }

  tick(realDtSeconds: number): void {
    if (!Number.isFinite(realDtSeconds)) {
      throw new TypeError(`realDtSeconds must be finite, got ${realDtSeconds}`);
    }
    if (realDtSeconds <= 0) {
      throw new RangeError(`realDtSeconds must be > 0, got ${realDtSeconds}`);
    }
    if (this.#smoothedFrameTime === null) {
      this.#smoothedFrameTime = realDtSeconds;
    } else {
      this.#smoothedFrameTime =
        this.#alpha * realDtSeconds + (1 - this.#alpha) * this.#smoothedFrameTime;
    }
  }

  /** Smoothed FPS, or `null` if no samples have been taken yet. */
  value(): number | null {
    return this.#smoothedFrameTime === null ? null : 1 / this.#smoothedFrameTime;
  }

  reset(): void {
    this.#smoothedFrameTime = null;
  }
}
