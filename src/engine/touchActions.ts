/**
 * Pointer bookkeeping for on-screen touch controls.
 *
 * This is the *logic* half of the touch pad; `components/TouchPad.ts` is the
 * DOM half. Splitting them follows the `gameHud` / `gameHudView` pattern:
 * everything worth testing lives here and needs no DOM.
 *
 * The job looks trivial ("finger down = action held") and isn't, because
 * multi-touch makes several things possible at once:
 *
 *   - Two fingers on the SAME button. Lifting one must NOT release the
 *     action — hence refcounting, not a boolean.
 *   - A finger on gas and another on a steer arrow, released in any order.
 *     Each pointer is tracked independently by its `pointerId`.
 *   - A pointer that vanishes without a `pointerup` (`pointercancel` when the
 *     OS steals the touch for a system gesture, or a lost pointer capture).
 *     `release()` on an unknown id is a no-op, so redundant release paths can
 *     all fire safely — belt and braces beats a stuck throttle.
 *
 * Methods return the *edge* they caused (or `null` for "nothing changed") so
 * the caller emits exactly one `action-down` per logical press. They never
 * return "still held" — a caller that faithfully forwards every non-null
 * change stays in sync with the tracker by construction.
 */

import type { Action } from '/src/engine/input.js';

/** Actions with implemented mechanics that the touch pad may expose. */
export const TOUCH_PAD_ACTIONS = Object.freeze([
  'steerLeft',
  'steerRight',
  'brake',
  'throttle',
  'cruise',
] as const satisfies readonly Action[]);

/** A logical hold/release edge for one action. */
export interface ActionChange {
  readonly action: Action;
  readonly held: boolean;
}

export class TouchActionTracker {
  /** pointerId → the action that pointer is holding. */
  readonly #byPointer = new Map<number, Action>();
  /** action → how many pointers are currently holding it. Never stores 0. */
  readonly #holdCounts = new Map<Action, number>();

  /**
   * Register a pointer as holding `action`.
   *
   * Returns the down-edge only when this is the first pointer on that action.
   * A `pointerId` already being tracked is ignored entirely (returns `null`) —
   * a second `pointerdown` for the same id means we missed an up somewhere,
   * and double-counting it would leave the action held forever.
   */
  press(pointerId: number, action: Action): ActionChange | null {
    if (this.#byPointer.has(pointerId)) return null;
    this.#byPointer.set(pointerId, action);
    const next = (this.#holdCounts.get(action) ?? 0) + 1;
    this.#holdCounts.set(action, next);
    return next === 1 ? { action, held: true } : null;
  }

  /**
   * Release a pointer. Returns the up-edge only when it was the last pointer
   * holding that action. Unknown ids return `null`, so `pointerup`,
   * `pointercancel` and `lostpointercapture` can all call this for the same
   * pointer without stacking releases.
   */
  release(pointerId: number): ActionChange | null {
    const action = this.#byPointer.get(pointerId);
    if (action === undefined) return null;
    this.#byPointer.delete(pointerId);
    const next = (this.#holdCounts.get(action) ?? 1) - 1;
    if (next > 0) {
      this.#holdCounts.set(action, next);
      return null;
    }
    this.#holdCounts.delete(action);
    return { action, held: false };
  }

  /**
   * Drop every pointer. Returns one up-edge per action that was held, in no
   * guaranteed order. Used when the window blurs, the tab is hidden, or the
   * pad hides itself — all cases where the OS may never send us the matching
   * `pointerup`.
   */
  releaseAll(): ActionChange[] {
    const changes = [...this.#holdCounts.keys()].map(action => ({ action, held: false }));
    this.#byPointer.clear();
    this.#holdCounts.clear();
    return changes;
  }

  isHeld(action: Action): boolean {
    return this.#holdCounts.has(action);
  }

  /** Pointers currently tracked. Exposed for tests and debug readouts. */
  get activePointerCount(): number {
    return this.#byPointer.size;
  }
}
