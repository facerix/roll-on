/**
 * TouchPad Web Component
 *
 * On-screen driving controls for phones and tablets. Overlays the playfield:
 *
 *   |---------|
 *   |         |
 *   |←       →|   portrait: steer at thumb height
 *   |         |
 *   |  [b][g] |   brake, gas
 *   |---------|
 *
 * In landscape, the fixed game stage becomes a narrow centre column. The
 * controls leave that column and form steering / pedal clusters in the side
 * gutters so both thumbs get full-size targets.
 *
 * It knows nothing about the game. It emits abstract `Action` names as DOM
 * events and `src/game/mount.ts` forwards them into `InputAdapter.setVirtual`,
 * so gameplay reads `input.isActive('throttle')` exactly as it does for the
 * keyboard. Pointer bookkeeping (multi-touch, refcounting, lost pointers)
 * lives in `src/engine/touchActions.ts` where it can be tested without a DOM.
 *
 * Events (both bubble and cross the shadow boundary):
 *   - `action-down` — detail `{ action }`, once per logical press
 *   - `action-up`   — detail `{ action }`, once per logical release
 *
 * Visibility is self-managed: shown when `(pointer: coarse)` matches, which
 * tracks the actual input device rather than guessing from viewport width (a
 * narrow desktop window is not a phone; a landscape tablet is not a desktop).
 * `?touch` on the URL forces it on for desktop testing, `?touch=0` forces it
 * off — mirroring the existing `?debug` convention in `mount.ts`.
 *
 * Note: this is the game surface's ONE web component exception, and it earns
 * it — it is self-contained chrome with its own styling, exactly the case
 * `docs/kaizen.md` reserves Shadow DOM for. The canvas itself stays in light
 * DOM.
 */

import { h, CreateSvg } from '/src/domUtils.js';
import type { Action } from '/src/engine/input.js';
import {
  TOUCH_PAD_ACTIONS,
  TouchActionTracker,
  type ActionChange,
} from '/src/engine/touchActions.js';

/** Detail payload on `action-down` / `action-up`. */
export interface TouchPadActionDetail {
  readonly action: Action;
}

export type TouchPadActionEvent = CustomEvent<TouchPadActionDetail>;

type TouchPadAction = (typeof TOUCH_PAD_ACTIONS)[number];

interface ControlAppearance {
  /** Slot in the layout grid; drives placement, size and colour. */
  readonly role: 'steer-left' | 'steer-right' | 'brake' | 'gas';
  readonly label: string;
  /** Visible face: text for pedals, an arrow glyph for the steer controls. */
  readonly glyph: 'arrow-left' | 'arrow-right' | 'text';
}

const CONTROL_APPEARANCE: Readonly<Record<TouchPadAction, ControlAppearance>> = Object.freeze({
  steerLeft: { role: 'steer-left', label: 'Steer left', glyph: 'arrow-left' },
  steerRight: { role: 'steer-right', label: 'Steer right', glyph: 'arrow-right' },
  brake: { role: 'brake', label: 'Brake', glyph: 'text' },
  throttle: { role: 'gas', label: 'Gas', glyph: 'text' },
});

// Chunky solid triangles rather than thin chevrons — reads at a glance in
// peripheral vision, and suits the pixel-art aesthetic.
const arrowLeftSvg = CreateSvg('<path d="M16 2L5 12l11 10z" fill="currentColor"/>', '100%', '100%');
const arrowRightSvg = CreateSvg('<path d="M8 2l11 10L8 22z" fill="currentColor"/>', '100%', '100%');

const CSS = `
:host {
  /* Physical-screen dimensions: this overlay deliberately lives outside the
     scaled logical stage. Edges keep clear of notches and home indicators. */
  --pad-edge-left: max(14px, env(safe-area-inset-left, 0px));
  --pad-edge-right: max(14px, env(safe-area-inset-right, 0px));
  --pad-control-inset: clamp(12px, 3vmin, 18px);
  --pad-half-gap: clamp(6px, 1.5vmin, 10px);
  --pad-steer-size: clamp(64px, 17vmin, 96px);
  --pad-pedal-size: clamp(72px, 19vmin, 108px);
  --pad-ink: #f7ecd7;
  --pad-face: rgba(5, 6, 8, 0.46);
  --pad-corner: clamp(12px, 4vmin, 18px);
  --pad-idle-opacity: 0.5;

  /* Screen-space anchors supplied by mount.ts whenever the stage is fitted. */
  --pad-stage-left: 0px;
  --pad-stage-right: 100%;
  --pad-stage-center-x: 50%;
  --pad-road-top: 0px;
  --pad-road-bottom: calc(100% - 126px);
  --pad-portrait-steer-y: 50%;
  --pad-landscape-control-y: 60%;
  --pad-left-cluster-x: 25%;
  --pad-right-cluster-x: 75%;

  /* On exceptionally narrow landscape screens the gutters cannot contain a
     whole cluster. Clamp its centre so targets remain on-screen and allow the
     cluster to overlap the road edge instead. */
  --pad-left-thumb-x: clamp(
    calc(var(--pad-edge-left) + var(--pad-pedal-size) + var(--pad-half-gap)),
    var(--pad-left-cluster-x),
    calc(
      100% - var(--pad-edge-right) - var(--pad-pedal-size) - var(--pad-half-gap)
    )
  );
  --pad-right-thumb-x: clamp(
    calc(var(--pad-edge-left) + var(--pad-pedal-size) + var(--pad-half-gap)),
    var(--pad-right-cluster-x),
    calc(
      100% - var(--pad-edge-right) - var(--pad-pedal-size) - var(--pad-half-gap)
    )
  );

  position: absolute;
  inset: 0;
  /* Above the transformed stage and its HUD. */
  z-index: 30;
  display: none;
  /* The overlay itself must never eat taps meant for the canvas. */
  pointer-events: none;
  font-family: 'BigSquareDots', 'Courier New', Courier, monospace;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

:host([data-active='true']) {
  display: block;
}

:host([hidden]) {
  display: none !important;
}

button {
  position: absolute;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 3px solid currentColor;
  border-radius: var(--pad-corner);
  background: var(--pad-face);
  color: var(--pad-ink);
  font: inherit;
  cursor: pointer;
  opacity: var(--pad-idle-opacity);
  /* Stop the browser treating a drag on a control as a scroll or pinch. */
  touch-action: none;
  pointer-events: auto;
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  box-shadow:
    inset 0 0 0 2px rgba(5, 6, 8, 0.55),
    0 3px 0 rgba(5, 6, 8, 0.5);
}

button:focus {
  outline: none;
}

button[data-pressed='true'] {
  opacity: 1;
  background: color-mix(in srgb, currentColor 30%, rgba(5, 6, 8, 0.6));
  box-shadow:
    inset 0 0 0 2px rgba(5, 6, 8, 0.55),
    inset 0 0 14px color-mix(in srgb, currentColor 45%, transparent),
    0 0 16px color-mix(in srgb, currentColor 55%, transparent);
  transform: translateY(2px);
}

button svg {
  width: 46%;
  height: 46%;
  display: block;
  filter: drop-shadow(0 2px 0 rgba(5, 6, 8, 0.8));
}

.label {
  font-size: clamp(0.6rem, 2.2vmin, 0.95rem);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: 0 2px 0 rgba(5, 6, 8, 0.85);
}

/* --- Layout ------------------------------------------------------------ */

[data-role='steer-left'],
[data-role='steer-right'] {
  top: var(--pad-portrait-steer-y);
  width: var(--pad-steer-size);
  height: var(--pad-steer-size);
  transform: translateY(-50%);
}

[data-role='steer-left'][data-pressed='true'],
[data-role='steer-right'][data-pressed='true'] {
  transform: translateY(calc(-50% + 2px));
}

[data-role='steer-left'] {
  left: max(
    var(--pad-edge-left),
    calc(var(--pad-stage-left) + var(--pad-control-inset))
  );
}

[data-role='steer-right'] {
  right: max(
    var(--pad-edge-right),
    calc(100% - var(--pad-stage-right) + var(--pad-control-inset))
  );
}

/* Brake and gas sit just above the displayed HUD, even when the stage is
   vertically letterboxed. Gas stays on the right, matching a pedal box. */
[data-role='brake'],
[data-role='gas'] {
  top: calc(var(--pad-road-bottom) - var(--pad-pedal-size) - var(--pad-control-inset));
  width: var(--pad-pedal-size);
  height: var(--pad-pedal-size);
}

[data-role='brake'] {
  right: calc(100% - var(--pad-stage-center-x) + var(--pad-half-gap));
  color: #ff5f1f;
}

[data-role='gas'] {
  left: calc(var(--pad-stage-center-x) + var(--pad-half-gap));
  color: #f6d96d;
}

/* Landscape turns the otherwise empty side gutters into two broad thumb
   zones. Keeping each action pair together also avoids reaching across the
   road while the player is steering. */
@media (orientation: landscape) {
  :host {
    --pad-steer-size: clamp(64px, 18vmin, 88px);
    --pad-pedal-size: clamp(72px, 20vmin, 96px);
  }

  [data-role='steer-left'],
  [data-role='steer-right'],
  [data-role='brake'],
  [data-role='gas'] {
    top: var(--pad-landscape-control-y);
    bottom: auto;
    transform: translateY(-50%);
  }

  [data-role='steer-left'] {
    right: calc(100% - var(--pad-left-thumb-x) + var(--pad-half-gap));
    left: auto;
  }

  [data-role='steer-right'] {
    right: auto;
    left: calc(var(--pad-left-thumb-x) + var(--pad-half-gap));
  }

  [data-role='brake'] {
    right: calc(100% - var(--pad-right-thumb-x) + var(--pad-half-gap));
    left: auto;
  }

  [data-role='gas'] {
    right: auto;
    left: calc(var(--pad-right-thumb-x) + var(--pad-half-gap));
  }

  [data-role='steer-left'][data-pressed='true'],
  [data-role='steer-right'][data-pressed='true'],
  [data-role='brake'][data-pressed='true'],
  [data-role='gas'][data-pressed='true'] {
    transform: translateY(calc(-50% + 2px));
  }
}

@media (prefers-reduced-motion: no-preference) {
  button {
    transition:
      opacity 0.08s ease-out,
      background-color 0.08s ease-out,
      transform 0.08s ease-out;
  }
}

`;

/** Read the `?touch` override. `null` = auto-detect. */
function readTouchOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URL(window.location.href).searchParams.get('touch');
    if (value === null) return null;
    return value !== '0' && value !== 'false';
  } catch {
    return null;
  }
}

class TouchPad extends HTMLElement {
  readonly #tracker = new TouchActionTracker();
  readonly #buttons = new Map<Action, HTMLButtonElement>();
  #built = false;
  #active = false;
  #media: MediaQueryList | null = null;

  readonly #onMediaChange = (): void => this.#syncActive();
  // A blurred window or a backgrounded tab may never deliver the matching
  // pointerup. Releasing here is what keeps the throttle from sticking on.
  readonly #onWindowBlur = (): void => this.#releaseAll();
  readonly #onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.#releaseAll();
  };

  connectedCallback(): void {
    if (!this.#built) this.#build();

    this.#media = window.matchMedia('(pointer: coarse)');
    this.#media.addEventListener('change', this.#onMediaChange);
    window.addEventListener('blur', this.#onWindowBlur);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#syncActive();
  }

  disconnectedCallback(): void {
    this.#media?.removeEventListener('change', this.#onMediaChange);
    this.#media = null;
    window.removeEventListener('blur', this.#onWindowBlur);
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    // Emit the releases even though we're leaving the tree — whoever wired us
    // up still holds the virtual state and needs the up-edges.
    this.#releaseAll();
  }

  /** True when the pad is currently shown. Exposed for tests and debug. */
  get isActive(): boolean {
    return this.#active;
  }

  #build(): void {
    this.#built = true;
    const shadow = this.attachShadow({ mode: 'open' });
    const styles = h('style', { textContent: CSS });
    shadow.appendChild(styles);

    // The group is announced as a whole; the individual buttons stay out of
    // the tab order (tabIndex -1) because they duplicate keyboard bindings
    // and would otherwise steal focus from the canvas, which needs it to
    // receive keystrokes.
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', 'Touch driving controls');

    for (const action of TOUCH_PAD_ACTIONS) {
      const spec = CONTROL_APPEARANCE[action];
      const face =
        spec.glyph === 'text'
          ? h('span', { className: 'label', textContent: spec.label })
          : ((spec.glyph === 'arrow-left' ? arrowLeftSvg : arrowRightSvg).cloneNode(
              true
            ) as SVGSVGElement);

      const button = h(
        'button',
        {
          type: 'button',
          tabIndex: -1,
          ariaLabel: spec.label,
          dataset: { role: spec.role, action, pressed: 'false' },
        },
        [face]
      );

      button.addEventListener('pointerdown', event => this.#onPointerDown(event, action));
      // With pointer capture set on pointerdown, the up/cancel for that
      // pointer is guaranteed to land on this button even if the finger has
      // slid off it. `lostpointercapture` is the backstop for the cases where
      // the browser drops capture on us; releasing an untracked pointer is a
      // no-op, so the overlap is harmless.
      button.addEventListener('pointerup', event => this.#onPointerRelease(event));
      button.addEventListener('pointercancel', event => this.#onPointerRelease(event));
      button.addEventListener('lostpointercapture', event => this.#onPointerRelease(event));
      // Suppress the synthetic click/contextmenu a long press produces.
      button.addEventListener('contextmenu', event => event.preventDefault());

      this.#buttons.set(action, button);
      shadow.appendChild(button);
    }
  }

  #onPointerDown(event: PointerEvent, action: Action): void {
    // Stops the button taking focus (the canvas needs to keep it) and blocks
    // the compatibility mouse events that would otherwise double-fire.
    event.preventDefault();
    try {
      this.#buttons.get(action)?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already gone (it can end between dispatch and handling).
      // The press below still resolves via pointercancel, or failing that
      // the blur / visibility backstops.
    }
    this.#emit(this.#tracker.press(event.pointerId, action));
  }

  #onPointerRelease(event: PointerEvent): void {
    this.#emit(this.#tracker.release(event.pointerId));
  }

  #releaseAll(): void {
    for (const change of this.#tracker.releaseAll()) this.#emit(change);
  }

  #emit(change: ActionChange | null): void {
    if (!change) return;
    const button = this.#buttons.get(change.action);
    if (button) button.dataset.pressed = String(change.held);
    this.dispatchEvent(
      new CustomEvent<TouchPadActionDetail>(change.held ? 'action-down' : 'action-up', {
        detail: { action: change.action },
        bubbles: true,
        composed: true,
      })
    );
  }

  #syncActive(): void {
    const override = readTouchOverride();
    const active = override ?? this.#media?.matches ?? false;
    if (active === this.#active) return;
    this.#active = active;
    this.dataset.active = String(active);
    // Hiding while a finger is down would strand the hold — no element left
    // to receive the pointerup.
    if (!active) this.#releaseAll();
  }
}

customElements.define('touch-pad', TouchPad);

declare global {
  interface HTMLElementTagNameMap {
    'touch-pad': TouchPad;
  }
}

export default TouchPad;
