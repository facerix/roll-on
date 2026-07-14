/**
 * Input adapter: raw keyboard events → abstract actions.
 *
 * Gameplay code asks "is `throttle` active?", never "is ArrowUp pressed?".
 * That's the contract; honor it and gamepad/touch backends drop in later
 * with zero gameplay churn.
 *
 * Three queries:
 *   - `isActive(a)`   — true while a bound key is held.
 *   - `wasPressed(a)` — latches true on any down-edge since the last
 *     `beginFrame()` call. Survives fast taps that go down-and-up between
 *     two frames (important for one-shots like the horn).
 *   - `wasReleased(a)` — symmetric for up-edges.
 *
 * Call `beginFrame()` once per game update, BEFORE reading any `wasPressed`/
 * `wasReleased`. This clears the latches so the next frame starts fresh.
 *
 * Design notes:
 *   - We listen on a generic `EventTarget`, not specifically `window`. Tests
 *     pass a stub; production passes `window`.
 *   - Bound keys get `preventDefault()` (arrow keys would otherwise scroll
 *     the page). Unbound keys do not — devtools shortcuts etc. still work.
 *   - Window blur releases all held actions. Without this, alt-tabbing
 *     leaves the throttle stuck on, which is a well-known footgun.
 *   - Browser key-repeat (`event.repeat === true`) is ignored for the
 *     press-latch. One physical press = one logical press.
 */

/** The full set of abstract actions. Add a new one here + bind it below. */
export type Action = 'throttle' | 'brake' | 'steerLeft' | 'steerRight' | 'horn';

/** Map of action → KeyboardEvent.code strings that trigger it. */
export type Bindings = Readonly<Record<Action, readonly string[]>>;

export const DEFAULT_BINDINGS: Bindings = {
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  steerLeft: ['ArrowLeft', 'KeyA'],
  steerRight: ['ArrowRight', 'KeyD'],
  horn: ['Space'],
};

export interface InputAdapterOptions {
  /** The EventTarget to listen on. Production: `window`. Tests: a stub. */
  target: EventTarget;
  /** Action → key-code bindings. Defaults to `DEFAULT_BINDINGS`. */
  bindings?: Bindings;
}

/**
 * Minimal shape we use off a KeyboardEvent. Declaring it locally keeps the
 * adapter testable without a real DOM `KeyboardEvent` constructor.
 */
interface KeyEventLike {
  code: string;
  repeat: boolean;
  preventDefault(): void;
}

export class InputAdapter {
  readonly #target: EventTarget;
  readonly #bindings: Bindings;
  /** Reverse index: key code → set of actions it triggers. */
  readonly #keyToActions: Map<string, Action[]>;

  readonly #held = new Set<Action>();
  readonly #pressed = new Set<Action>();
  readonly #released = new Set<Action>();

  #attached = false;
  // Bound handler references, kept so removeEventListener can find them.
  readonly #onKeyDown: (e: unknown) => void;
  readonly #onKeyUp: (e: unknown) => void;
  readonly #onBlur: (e: unknown) => void;

  constructor(opts: InputAdapterOptions) {
    this.#target = opts.target;
    this.#bindings = opts.bindings ?? DEFAULT_BINDINGS;
    this.#keyToActions = buildReverseIndex(this.#bindings);

    this.#onKeyDown = e => this.#handleKeyDown(e as KeyEventLike);
    this.#onKeyUp = e => this.#handleKeyUp(e as KeyEventLike);
    this.#onBlur = () => this.#handleBlur();
  }

  /** Wire up the DOM listeners. Idempotent. */
  attach(): void {
    if (this.#attached) return;
    this.#target.addEventListener('keydown', this.#onKeyDown);
    this.#target.addEventListener('keyup', this.#onKeyUp);
    this.#target.addEventListener('blur', this.#onBlur);
    this.#attached = true;
  }

  /** Remove the DOM listeners and clear all held state. Idempotent. */
  detach(): void {
    if (!this.#attached) return;
    this.#target.removeEventListener('keydown', this.#onKeyDown);
    this.#target.removeEventListener('keyup', this.#onKeyUp);
    this.#target.removeEventListener('blur', this.#onBlur);
    this.#attached = false;
    this.#held.clear();
    this.#pressed.clear();
    this.#released.clear();
  }

  /**
   * Call once per game update, BEFORE reading any wasPressed/wasReleased.
   * Clears the edge-trigger latches so they reflect only this frame.
   * `isActive` (held state) is NOT affected — that's continuous.
   */
  beginFrame(): void {
    this.#pressed.clear();
    this.#released.clear();
  }

  isActive(action: Action): boolean {
    return this.#held.has(action);
  }

  wasPressed(action: Action): boolean {
    return this.#pressed.has(action);
  }

  wasReleased(action: Action): boolean {
    return this.#released.has(action);
  }

  #handleKeyDown(e: KeyEventLike): void {
    const actions = this.#keyToActions.get(e.code);
    if (!actions) return; // unbound key — leave alone, no preventDefault
    e.preventDefault();
    // Ignore OS key-repeat for the press latch and held state. Held is
    // already true; pressed must reflect physical down-edges only.
    if (e.repeat) return;
    for (const a of actions) {
      this.#held.add(a);
      this.#pressed.add(a);
    }
  }

  #handleKeyUp(e: KeyEventLike): void {
    const actions = this.#keyToActions.get(e.code);
    if (!actions) return;
    e.preventDefault();
    for (const a of actions) {
      // Only register a release if we actually thought it was held — guards
      // against weird sequences (keyup with no prior keydown after detach
      // and reattach mid-press).
      if (this.#held.delete(a)) {
        this.#released.add(a);
      }
    }
  }

  #handleBlur(): void {
    // Release everything that was held. Gameplay sees these in wasReleased
    // for the frame following the blur, so it can e.g. cut engine audio.
    for (const a of this.#held) this.#released.add(a);
    this.#held.clear();
  }
}

function buildReverseIndex(bindings: Bindings): Map<string, Action[]> {
  const map = new Map<string, Action[]>();
  for (const action of Object.keys(bindings) as Action[]) {
    for (const code of bindings[action]) {
      let arr = map.get(code);
      if (!arr) {
        arr = [];
        map.set(code, arr);
      }
      arr.push(action);
    }
  }
  return map;
}
