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
 * There are two input *sources*: the keyboard, and a "virtual" source driven
 * by `setVirtual()` (the on-screen touch pad — see `components/TouchPad.ts`).
 * An action is active while EITHER source holds it, and the press/release
 * latches fire on edges of that union — so holding gas on the touch pad and
 * then also pressing `ArrowUp` is one logical press, not two. Gameplay code
 * cannot tell the sources apart, which is the whole point.
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

  /** Actions held by a physical key. */
  readonly #held = new Set<Action>();
  /** Actions held by the virtual source (touch pad). Kept separate from
   *  `#held` so a key release can't cancel a finger that's still down. */
  readonly #virtual = new Set<Action>();
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
    this.#virtual.clear();
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
    return this.#held.has(action) || this.#virtual.has(action);
  }

  wasPressed(action: Action): boolean {
    return this.#pressed.has(action);
  }

  wasReleased(action: Action): boolean {
    return this.#released.has(action);
  }

  /**
   * Drive an action from a non-keyboard source (the on-screen touch pad).
   *
   * Edge latches fire on the union with keyboard state, so a virtual hold on
   * an already-key-held action is not a second press. Callers must pair every
   * `true` with a matching `false`; the pad's own cleanup paths (pointer
   * cancel, blur, hide) exist for exactly that reason.
   */
  setVirtual(action: Action, held: boolean): void {
    this.#applyHold(this.#virtual, action, held);
  }

  /** Drop all virtual holds, emitting release edges for anything it was the
   *  last source for. Idempotent. */
  clearVirtual(): void {
    // Snapshot first: `setVirtual` mutates `#virtual` as we go.
    const held = Array.from(this.#virtual);
    for (const a of held) this.setVirtual(a, false);
  }

  /**
   * Add/remove `action` from one source's held set, latching a press or
   * release only when the *combined* active state actually flipped.
   */
  #applyHold(source: Set<Action>, action: Action, held: boolean): void {
    const wasActive = this.isActive(action);
    if (held) source.add(action);
    else source.delete(action);
    const isActive = this.isActive(action);
    if (isActive === wasActive) return;
    if (isActive) this.#pressed.add(action);
    else this.#released.add(action);
  }

  #handleKeyDown(e: KeyEventLike): void {
    const actions = this.#keyToActions.get(e.code);
    if (!actions) return; // unbound key — leave alone, no preventDefault
    e.preventDefault();
    // Ignore OS key-repeat for the press latch and held state. Held is
    // already true; pressed must reflect physical down-edges only.
    if (e.repeat) return;
    for (const a of actions) this.#applyHold(this.#held, a, true);
  }

  #handleKeyUp(e: KeyEventLike): void {
    const actions = this.#keyToActions.get(e.code);
    if (!actions) return;
    e.preventDefault();
    // `#applyHold` only latches a release when the action actually stops
    // being active, which also guards weird sequences (a keyup with no prior
    // keydown after detach/reattach mid-press).
    for (const a of actions) this.#applyHold(this.#held, a, false);
  }

  #handleBlur(): void {
    // Release everything that was held, from BOTH sources. Gameplay sees
    // these in wasReleased for the frame following the blur, so it can e.g.
    // cut engine audio. The touch pad also clears itself on blur, so the two
    // stay in sync; doing it here too means a stuck throttle can't survive
    // an alt-tab even if a pointer event goes missing.
    for (const a of this.#held) this.#released.add(a);
    for (const a of this.#virtual) if (!this.#held.has(a)) this.#released.add(a);
    this.#held.clear();
    this.#virtual.clear();
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
