/**
 * Game mount module — DOM glue between the engine and the page.
 *
 * Responsibilities (and ONLY these):
 *   - Create and size the `<canvas>` (handling devicePixelRatio so pixel
 *     art stays crisp on retina displays).
 *   - Construct the engine pieces: loop, renderer, input.
 *   - Provide a "tick" callback that the loop drives, which runs whatever
 *     the current scene's update + render is.
 *   - Show an FPS readout when the URL has `?debug`.
 *   - Tear everything down on `dispose()`.
 *
 * Explicitly NOT in here: gameplay logic. The mount just plumbs systems
 * together. Gameplay lives behind the `update` / `buildScene` callbacks
 * passed in.
 *
 * Design choice: canvas in light DOM, NOT inside a web component.
 * Rationale recorded in `docs/kaizen.md` (Resolved: "Game surface is not
 * a web component"). TL;DR: Shadow DOM around a canvas adds focus,
 * pointer, and HUD-overlay friction with zero offsetting benefit when
 * there's only one game on the page.
 */

import { h } from '/src/domUtils.js';
import { FixedStepLoop } from '/src/engine/loop.js';
import { Canvas2DRenderer } from '/src/engine/renderer.js';
import type { Scene } from '/src/engine/renderer.js';
import { InputAdapter } from '/src/engine/input.js';
import { FpsMeter } from '/src/engine/fpsMeter.js';
import { runGameUpdate } from '/src/game/update.js';

export interface MountOptions {
  /** Where to mount the canvas (and the debug HUD, if enabled). */
  root: HTMLElement;
  /** Logical (CSS-pixel) viewport width. */
  width: number;
  /** Logical (CSS-pixel) viewport height. */
  height: number;
  /** Per-frame simulation step. Called with the fixed dt. */
  update: (dt: number, input: InputAdapter) => void;
  /** Per-frame scene producer. `alpha` is interpolation fraction in [0, 1). */
  buildScene: (alpha: number) => Scene;
  /** Show the FPS HUD. Default: true iff URL has `?debug`. */
  debug?: boolean;
}

export interface MountedGame {
  /** The created canvas. Exposed for tests / manual inspection. */
  readonly canvas: HTMLCanvasElement;
  /** Input adapter — pass-through for gameplay that wants direct queries. */
  readonly input: InputAdapter;
  /** Stop the loop, remove DOM nodes and listeners. Idempotent. */
  dispose(): void;
}

function isDebugFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(window.location.href).searchParams.has('debug');
  } catch {
    return false;
  }
}

/**
 * Size the canvas's backing store to `cssWidth × cssHeight × devicePixelRatio`
 * while leaving the CSS box at the logical size. This gives crisp pixels on
 * retina without changing the coordinate system game code uses.
 *
 * The renderer's coordinates remain in CSS pixels; we scale the context to
 * compensate.
 *
 * TODO(kaizen): once we want the true retro CRT vibe, we'll likely flip to
 * a fixed-internal-resolution canvas with CSS upscale (no DPR scaling), so
 * pixels are blocky on purpose. Recorded in `docs/kaizen.md`.
 */
function sizeCanvasForDpr(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  // Reset any prior transform before scaling, so re-sizing is idempotent.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

export function mountGame(opts: MountOptions): MountedGame {
  if (!Number.isFinite(opts.width) || !Number.isFinite(opts.height)) {
    throw new TypeError(
      `width/height must be finite, got width=${opts.width}, height=${opts.height}`
    );
  }
  if (opts.width <= 0 || opts.height <= 0) {
    throw new RangeError(
      `width/height must be positive, got width=${opts.width}, height=${opts.height}`
    );
  }

  const canvas = h('canvas', {
    width: opts.width,
    height: opts.height,
    className: 'roll-on-canvas',
    tabIndex: 0, // canvas needs tabindex to receive focus; arcade key capture wants focus
  });
  // imageSmoothing OFF in CSS too, for any browser-side upscale of the
  // CSS-px canvas to physical pixels.
  canvas.style.imageRendering = 'pixelated';

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  sizeCanvasForDpr(canvas, ctx, opts.width, opts.height);

  // Re-apply DPR sizing on devicePixelRatio change (e.g. moving the window
  // between a retina and non-retina monitor). Cheap, idempotent.
  const dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onDprChange = (): void => sizeCanvasForDpr(canvas, ctx, opts.width, opts.height);
  dprMedia.addEventListener('change', onDprChange);

  const renderer = new Canvas2DRenderer(ctx);
  const input = new InputAdapter({ target: window });
  input.attach();

  // Debug HUD: lightweight DOM overlay positioned absolutely on top of the
  // canvas. Not painted into the canvas itself — we want it readable and
  // selectable without fighting pixelated upscaling.
  const showDebug = opts.debug ?? isDebugFromUrl();
  const fpsMeter = new FpsMeter();
  const debugEl = showDebug
    ? h('div', {
        className: 'roll-on-debug-hud',
        style:
          'position:absolute;top:4px;left:4px;font:12px ui-monospace,Menlo,monospace;color:#0f0;text-shadow:0 0 2px #000;pointer-events:none;z-index:10;',
        textContent: 'fps: …',
      })
    : null;

  const container = h(
    'div',
    {
      className: 'roll-on-game-container',
      style: 'position:relative;display:inline-block;',
    },
    debugEl ? [canvas, debugEl] : [canvas]
  );
  opts.root.appendChild(container);

  // Driving wall-clock for the FPS HUD. We use rAF timestamps via the loop's
  // start(); but the loop doesn't currently surface real dt. To keep the
  // loop's responsibilities narrow, we track wall-clock dt here.
  let lastFrameMs: number | null = null;
  let rafForFps: number | null = null;
  const fpsTick = (nowMs: number): void => {
    if (lastFrameMs !== null) {
      const realDt = (nowMs - lastFrameMs) / 1000;
      if (realDt > 0 && Number.isFinite(realDt)) fpsMeter.tick(realDt);
      if (debugEl) {
        const v = fpsMeter.value();
        debugEl.textContent = v === null ? 'fps: …' : `fps: ${v.toFixed(1)}`;
      }
    }
    lastFrameMs = nowMs;
    rafForFps = requestAnimationFrame(fpsTick);
  };
  rafForFps = requestAnimationFrame(fpsTick);

  const loop = new FixedStepLoop({
    update: dt => {
      runGameUpdate(dt, input, opts.update);
    },
    render: alpha => {
      renderer.draw(opts.buildScene(alpha));
    },
  });
  loop.start();

  // Focus the canvas so keyboard input lands. If the page hasn't been
  // interacted with yet, this may be a no-op until first click — fine.
  canvas.focus();

  let disposed = false;
  return {
    canvas,
    input,
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.stop();
      if (rafForFps !== null) cancelAnimationFrame(rafForFps);
      input.detach();
      dprMedia.removeEventListener('change', onDprChange);
      container.remove();
    },
  };
}
