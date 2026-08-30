/**
 * Game mount module — DOM glue between the engine and the page.
 *
 * Responsibilities (and ONLY these):
 *   - Create a fixed logical stage and fit it responsively into its host.
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

import '/components/TouchPad.js';
import type { TouchPadActionEvent } from '/components/TouchPad.js';
import { h } from '/src/domUtils.js';
import { FixedStepLoop } from '/src/engine/loop.js';
import { Canvas2DRenderer } from '/src/engine/renderer.js';
import type { Scene } from '/src/engine/renderer.js';
import { InputAdapter } from '/src/engine/input.js';
import { FpsMeter } from '/src/engine/fpsMeter.js';
import { calculateArcadeSidecarLayout } from '/src/game/arcadeSidecars.js';
import { calculateTouchPadLayout } from '/src/game/touchPadLayout.js';
import { runGameUpdate } from '/src/game/update.js';
import {
  HUD_HEIGHT_PIXELS,
  ROAD_VIEWPORT_HEIGHT_PIXELS,
  STAGE_HEIGHT_PIXELS,
  STAGE_WIDTH_PIXELS,
  calculateStageLayout,
} from '/src/game/stageLayout.js';

export interface MountOptions {
  /** Where to mount the canvas (and the debug HUD, if enabled). */
  root: HTMLElement;
  /** Per-frame simulation step. Called with the fixed dt. */
  update: (dt: number, input: InputAdapter) => void;
  /** Per-frame scene producer. `alpha` is interpolation fraction in [0, 1). */
  buildScene: (alpha: number) => Scene;
  /** Show the FPS HUD. Default: true iff URL has `?debug`. */
  debug?: boolean;
  /**
   * Overlay the on-screen touch controls. Default: true. The pad decides for
   * itself whether to actually show (coarse pointer, or `?touch`); this flag
   * only controls whether it exists at all.
   */
  touchControls?: boolean;
  /** Optional semantic desktop chrome placed outside the scaled stage. */
  arcadeSidecars?: HTMLElement;
  /** Additional debug lines supplied by gameplay; read only when the HUD is visible. */
  debugLines?: () => readonly string[];
}

export interface MountedGame {
  /** The created canvas. Exposed for tests / manual inspection. */
  readonly canvas: HTMLCanvasElement;
  /** Input adapter — pass-through for gameplay that wants direct queries. */
  readonly input: InputAdapter;
  /** Fixed logical-stage wrapper for HUD and other presentation overlays. */
  readonly stage: HTMLElement;
  /** Enable or suspend keyboard/touch driving input without stopping rendering. */
  setInteractionEnabled(enabled: boolean): void;
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

export function mountGame(opts: MountOptions): MountedGame {
  const canvas = h('canvas', {
    width: STAGE_WIDTH_PIXELS,
    height: ROAD_VIEWPORT_HEIGHT_PIXELS,
    className: 'roll-on-canvas',
    tabIndex: 0, // canvas needs tabindex to receive focus; arcade key capture wants focus
  });
  // imageSmoothing OFF in CSS too, for any browser-side upscale of the
  // CSS-px canvas to physical pixels.
  canvas.style.imageRendering = 'pixelated';

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

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
          'position:absolute;top:4px;left:4px;white-space:pre;font:12px ui-monospace,Menlo,monospace;color:#0f0;text-shadow:0 0 2px #000;pointer-events:none;z-index:10;',
        textContent: 'fps: …',
      })
    : null;

  // Touch controls: a self-contained overlay component that emits abstract
  // actions. We translate them into virtual holds on the same InputAdapter
  // the keyboard feeds, so gameplay never learns touch exists.
  const touchPad = (opts.touchControls ?? true) ? h('touch-pad') : null;
  const arcadeSidecars = opts.arcadeSidecars ?? null;
  const onPadDown = (event: Event): void =>
    input.setVirtual((event as TouchPadActionEvent).detail.action, true);
  const onPadUp = (event: Event): void =>
    input.setVirtual((event as TouchPadActionEvent).detail.action, false);
  if (touchPad) {
    touchPad.addEventListener('action-down', onPadDown);
    touchPad.addEventListener('action-up', onPadUp);
  }

  const overlays = [canvas, debugEl].filter(el => el !== null);
  const stage = h(
    'div',
    {
      className: 'roll-on-game-stage',
      style: `position:absolute;width:${STAGE_WIDTH_PIXELS}px;height:${STAGE_HEIGHT_PIXELS}px;--roll-on-hud-height:${HUD_HEIGHT_PIXELS}px;transform-origin:top left;`,
    },
    overlays
  );
  const shell = h('div', {
    className: 'roll-on-game-shell',
    style:
      'position:absolute;inset:0;overflow:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);',
  });
  shell.appendChild(stage);
  if (arcadeSidecars) shell.appendChild(arcadeSidecars);
  if (touchPad) shell.appendChild(touchPad);
  opts.root.appendChild(shell);

  const finePointerMedia = arcadeSidecars ? window.matchMedia('(pointer: fine)') : null;

  const applyStageLayout = (): void => {
    const shellRect = shell.getBoundingClientRect();
    const style = getComputedStyle(shell);
    const viewport = { width: shellRect.width, height: shellRect.height };
    const safeAreaInsets = {
      top: Number.parseFloat(style.paddingTop),
      right: Number.parseFloat(style.paddingRight),
      bottom: Number.parseFloat(style.paddingBottom),
      left: Number.parseFloat(style.paddingLeft),
    };
    const layout = calculateStageLayout({
      viewport,
      safeAreaInsets,
    });
    stage.style.transform = `translate(${layout.displayX}px, ${layout.displayY}px) scale(${layout.scale})`;

    if (arcadeSidecars) {
      const sidecarLayout = calculateArcadeSidecarLayout({
        viewport,
        safeAreaInsets,
        stage: layout,
        hasFinePointer: finePointerMedia?.matches ?? false,
      });
      arcadeSidecars.hidden = !sidecarLayout.visible;
      arcadeSidecars.dataset.visible = String(sidecarLayout.visible);
      const properties = {
        '--sidecar-card-width': sidecarLayout.cardWidth,
        '--sidecar-display-center-y': sidecarLayout.displayCenterY,
        '--sidecar-left-x': sidecarLayout.leftX,
        '--sidecar-right-x': sidecarLayout.rightX,
      } as const;
      for (const [property, value] of Object.entries(properties)) {
        arcadeSidecars.style.setProperty(property, `${value}px`);
      }
    }

    if (touchPad) {
      const padLayout = calculateTouchPadLayout({ viewport, safeAreaInsets, stage: layout });
      const properties = {
        '--pad-stage-left': padLayout.stageLeft,
        '--pad-stage-right': padLayout.stageRight,
        '--pad-stage-center-x': padLayout.stageCenterX,
        '--pad-road-top': padLayout.roadTop,
        '--pad-road-bottom': padLayout.roadBottom,
        '--pad-portrait-steer-y': padLayout.portraitSteerY,
        '--pad-landscape-control-y': padLayout.landscapeControlY,
        '--pad-left-cluster-x': padLayout.leftClusterX,
        '--pad-right-cluster-x': padLayout.rightClusterX,
      } as const;
      for (const [property, value] of Object.entries(properties)) {
        touchPad.style.setProperty(property, `${value}px`);
      }
    }
  };
  applyStageLayout();
  window.addEventListener('resize', applyStageLayout);
  finePointerMedia?.addEventListener('change', applyStageLayout);

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
        const fpsLine = v === null ? 'fps: …' : `fps: ${v.toFixed(1)}`;
        debugEl.textContent = [fpsLine, ...(opts.debugLines?.() ?? [])].join('\n');
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
  let interactionEnabled = true;
  return {
    canvas,
    input,
    stage,
    setInteractionEnabled(enabled) {
      if (disposed || enabled === interactionEnabled) return;
      interactionEnabled = enabled;
      touchPad?.toggleAttribute('hidden', !enabled);
      canvas.tabIndex = enabled ? 0 : -1;
      if (enabled) {
        input.attach();
        canvas.focus();
      } else {
        input.detach();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.stop();
      if (rafForFps !== null) cancelAnimationFrame(rafForFps);
      touchPad?.removeEventListener('action-down', onPadDown);
      touchPad?.removeEventListener('action-up', onPadUp);
      input.detach();
      window.removeEventListener('resize', applyStageLayout);
      finePointerMedia?.removeEventListener('change', applyStageLayout);
      shell.remove();
    },
  };
}
