/**
 * Fixed-step game loop.
 *
 * We use the classic fixed-timestep accumulator pattern (Glenn Fiedler,
 * "Fix Your Timestep"): real elapsed time is accumulated, then drained in
 * fixed-size update steps. Render runs once per outer tick with an
 * interpolation alpha for sub-step smoothing.
 *
 * Why fixed-step:
 *   - Deterministic physics. Same inputs + same dt sequence → same state.
 *     Pairs with our seeded `Rng` so future replay/ghost-runs stay on the
 *     table without a costly retrofit.
 *   - Stable simulation regardless of frame rate. A 144Hz monitor and a
 *     30Hz monitor run the same physics.
 *
 * Why the `step(realDt)` seam:
 *   - Production `start()`/`stop()` wires `step` to requestAnimationFrame.
 *     Tests call `step()` directly with synthetic dt — no rAF, no real
 *     clock, no flake.
 *
 * What we deliberately do NOT do here:
 *   - Catch update/render exceptions. If gameplay throws, we want the page
 *     to crash loudly (per project directive: crash > silent corruption).
 */

export interface FixedStepLoopOptions {
  /** Called once per fixed-size simulation step. dt is always `fixedDt`. */
  update: (dt: number) => void;
  /**
   * Called once per outer tick. `alpha` is the fraction of a fixed step
   * remaining in the accumulator, useful for visual interpolation between
   * the two most recent simulation states. Always in [0, 1).
   */
  render: (alpha: number) => void;
  /** Fixed simulation step size in seconds. Default 1/60. */
  fixedDt?: number;
  /**
   * Maximum simulation steps per `step()` call. Caps the spiral-of-death:
   * if the page is backgrounded for several seconds, we don't try to
   * simulate all the missed time in one frame. Default 5.
   */
  maxStepsPerTick?: number;
}

export interface StepResult {
  /** Number of update() calls fired during this tick. */
  updates: number;
  /** The alpha passed to render() this tick. */
  alpha: number;
}

const DEFAULT_FIXED_DT = 1 / 60;
const DEFAULT_MAX_STEPS_PER_TICK = 5;

export class FixedStepLoop {
  readonly fixedDt: number;
  readonly maxStepsPerTick: number;

  readonly #update: (dt: number) => void;
  readonly #render: (alpha: number) => void;

  /**
   * Unconsumed real time, in seconds. Drained in `fixedDt` chunks each tick.
   * INVARIANT: 0 ≤ accumulator < fixedDt at the end of any successful step.
   */
  #accumulator = 0;

  // rAF handle for production start/stop. Null when not running.
  #rafHandle: number | null = null;
  // Wall-clock timestamp of the previous rAF callback, used to derive real dt.
  #lastFrameMs: number | null = null;

  constructor(opts: FixedStepLoopOptions) {
    const fixedDt = opts.fixedDt ?? DEFAULT_FIXED_DT;
    if (!Number.isFinite(fixedDt) || fixedDt <= 0) {
      throw new RangeError(`fixedDt must be a positive finite number, got ${fixedDt}`);
    }
    const maxStepsPerTick = opts.maxStepsPerTick ?? DEFAULT_MAX_STEPS_PER_TICK;
    if (!Number.isInteger(maxStepsPerTick) || maxStepsPerTick <= 0) {
      throw new RangeError(`maxStepsPerTick must be a positive integer, got ${maxStepsPerTick}`);
    }

    this.fixedDt = fixedDt;
    this.maxStepsPerTick = maxStepsPerTick;
    this.#update = opts.update;
    this.#render = opts.render;
  }

  /**
   * Advance the loop by `realDtSeconds` of wall-clock time. Runs update() in
   * fixed-dt chunks until the accumulator is drained (or the spiral-of-death
   * cap is hit), then renders once with the leftover-fraction alpha.
   *
   * This is the public testable seam. Tests drive it directly with synthetic
   * dt. Production uses start()/stop() which calls this from rAF.
   */
  step(realDtSeconds: number): StepResult {
    if (!Number.isFinite(realDtSeconds)) {
      throw new TypeError(`realDtSeconds must be finite, got ${realDtSeconds}`);
    }
    if (realDtSeconds < 0) {
      throw new RangeError(`realDtSeconds must be non-negative, got ${realDtSeconds}`);
    }

    this.#accumulator += realDtSeconds;

    let updates = 0;
    while (this.#accumulator >= this.fixedDt && updates < this.maxStepsPerTick) {
      this.#update(this.fixedDt);
      this.#accumulator -= this.fixedDt;
      updates += 1;
    }

    // Spiral-of-death cap reached: discard any further accumulated time.
    // Carrying it forward would mean we never catch up and the cap is
    // meaningless. Dropping a few simulated frames after a long pause is
    // the lesser evil vs. the page locking up trying to catch up.
    if (this.#accumulator >= this.fixedDt) {
      this.#accumulator = 0;
    }

    const alpha = this.#accumulator / this.fixedDt;
    this.#render(alpha);
    return { updates, alpha };
  }

  /** True iff the rAF-driven loop is currently running. */
  get isRunning(): boolean {
    return this.#rafHandle !== null;
  }

  /**
   * Begin driving `step()` from requestAnimationFrame. Idempotent: calling
   * start() twice does nothing on the second call. The first rAF callback
   * uses dt=0 (we don't yet know how long the gap was), so no update runs
   * but the initial render does.
   */
  start(): void {
    if (this.#rafHandle !== null) return;
    this.#lastFrameMs = null;
    const tick = (nowMs: number): void => {
      const lastMs = this.#lastFrameMs;
      const realDt = lastMs === null ? 0 : (nowMs - lastMs) / 1000;
      this.#lastFrameMs = nowMs;
      this.step(realDt);
      // Re-check isRunning after step() in case update/render called stop().
      if (this.#rafHandle !== null) {
        this.#rafHandle = requestAnimationFrame(tick);
      }
    };
    this.#rafHandle = requestAnimationFrame(tick);
  }

  /** Stop the rAF-driven loop. Idempotent. */
  stop(): void {
    if (this.#rafHandle === null) return;
    cancelAnimationFrame(this.#rafHandle);
    this.#rafHandle = null;
    this.#lastFrameMs = null;
  }
}
