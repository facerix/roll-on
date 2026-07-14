/**
 * Renderer seam.
 *
 * Game code builds a `Scene` (plain data: drawables + viewport + clear
 * color) and hands it to a `Renderer`. The concrete `Canvas2DRenderer`
 * paints that scene to a `CanvasRenderingContext2D`.
 *
 * Why a seam: this is the *one* abstraction we want between gameplay and
 * the underlying graphics API. If/when we swap to WebGL during the polish
 * pass (CRT/scanline/bloom shaders), only the `Renderer` implementation
 * changes — gameplay continues to emit the same `Scene` data.
 *
 * Design rules for `Scene`:
 *   - Plain serializable data. No callbacks, no canvas refs, no DOM.
 *   - The caller controls draw order via array order. The renderer MUST
 *     NOT reorder drawables; that would silently change z-order.
 *   - Coordinates are in CSS-pixel space relative to the viewport origin
 *     (top-left). devicePixelRatio handling lives in the mount module
 *     that owns the canvas, not in the renderer or in scene data.
 */

/** CSS color string. We don't validate format; the canvas will. */
export type Color = string;

/** Solid-color rect. Programmer-art primitive for the prototype phase. */
export interface RectDrawable {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  color: Color;
}

/** Solid rectangle rotated around its center point. */
export interface OrientedRectDrawable {
  kind: 'oriented-rect';
  centerX: number;
  centerY: number;
  w: number;
  h: number;
  rotationRadians: number;
  color: Color;
}

/**
 * Discriminated union. Grows over time (sprites, lines, text). The `kind`
 * tag exists so the renderer's switch is exhaustiveness-checked by TS.
 */
export type Drawable = RectDrawable | OrientedRectDrawable;

export interface Scene {
  /** Background color painted before any drawable. */
  clear: Color;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Drawables in back-to-front order. The renderer renders them in array order. */
  drawables: readonly Drawable[];
}

/** The seam. `Canvas2DRenderer` is the only impl today; a WebGL one may follow. */
export interface Renderer {
  draw(scene: Scene): void;
}

export class Canvas2DRenderer implements Renderer {
  readonly #ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.#ctx = ctx;
    // Disable image smoothing once at construction. Browsers reset some
    // context state across context-loss events, but for the prototype this
    // is sufficient — we'll revisit if we hit a context-lost recovery path.
    this.#ctx.imageSmoothingEnabled = false;
  }

  draw(scene: Scene): void {
    // Validate viewport dimensions up front. A negative or non-finite
    // width/height would silently produce a no-op fillRect, hiding bugs.
    // Per project directive: crash > silent corruption.
    if (!Number.isFinite(scene.width) || !Number.isFinite(scene.height)) {
      throw new TypeError(
        `Scene dimensions must be finite, got width=${scene.width}, height=${scene.height}`
      );
    }
    if (scene.width < 0 || scene.height < 0) {
      throw new RangeError(
        `Scene dimensions must be non-negative, got width=${scene.width}, height=${scene.height}`
      );
    }

    const ctx = this.#ctx;

    // Clear pass. We use fillRect rather than clearRect because the scene
    // declares an explicit clear color (neon sunset later); clearRect would
    // give us transparent pixels on top of whatever was there.
    ctx.fillStyle = scene.clear;
    ctx.fillRect(0, 0, scene.width, scene.height);

    // Drawables in caller-controlled order.
    for (const d of scene.drawables) {
      switch (d.kind) {
        case 'rect':
          ctx.fillStyle = d.color;
          ctx.fillRect(d.x, d.y, d.w, d.h);
          break;
        case 'oriented-rect':
          ctx.fillStyle = d.color;
          ctx.save();
          ctx.translate(d.centerX, d.centerY);
          ctx.rotate(d.rotationRadians);
          ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
          ctx.restore();
          break;
        default: {
          const exhaustive: never = d;
          throw new Error(`Unhandled drawable kind: ${String(exhaustive)}`);
        }
      }
    }
  }
}
