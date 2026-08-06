/**
 * Renderer-seam tests.
 *
 * The `Renderer` interface accepts a `Scene` (plain data) and draws it. The
 * concrete `Canvas2DRenderer` is tested against a fake `CanvasRenderingContext2D`
 * that records every method call and property assignment in order. This lets
 * us assert *exact* draw behavior without needing a real DOM/canvas.
 *
 * Why a fake context (not jsdom): jsdom's canvas is a no-op stub by default;
 * a hand-rolled spy gives precise, inspectable call logs and zero deps.
 *
 * What we lock in:
 *   1. The frame is cleared with the scene's clear color before any drawable.
 *   2. Drawables render in array order (caller controls z-order; the
 *      renderer must NOT silently sort).
 *   3. Pixel-art crispness: `imageSmoothingEnabled` is set to false at least
 *      once during the lifetime of the renderer (we don't care whether it's
 *      set in the constructor or per-frame).
 *   4. An empty drawables list still clears the frame — no half-rendered
 *      ghost of the previous frame.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Canvas2DRenderer } from '../../src/engine/renderer.ts';
import type { Scene } from '../../src/engine/renderer.ts';

/** Logged context operations. Each entry is one method call or property set. */
type Op =
  | { kind: 'set'; prop: string; value: unknown }
  | { kind: 'call'; method: string; args: unknown[] };

interface FakeCtx {
  ops: Op[];
  // Minimal surface the renderer is allowed to use. Extend as the renderer grows.
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

function makeFakeCtx(): FakeCtx {
  const ops: Op[] = [];
  const ctx: FakeCtx = {
    ops,
    // Backing fields; the proxy below intercepts to log writes.
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    imageSmoothingEnabled: true,
    fillRect(x, y, w, h) {
      ops.push({ kind: 'call', method: 'fillRect', args: [x, y, w, h] });
    },
    beginPath() {
      ops.push({ kind: 'call', method: 'beginPath', args: [] });
    },
    moveTo(x, y) {
      ops.push({ kind: 'call', method: 'moveTo', args: [x, y] });
    },
    lineTo(x, y) {
      ops.push({ kind: 'call', method: 'lineTo', args: [x, y] });
    },
    closePath() {
      ops.push({ kind: 'call', method: 'closePath', args: [] });
    },
    fill() {
      ops.push({ kind: 'call', method: 'fill', args: [] });
    },
    stroke() {
      ops.push({ kind: 'call', method: 'stroke', args: [] });
    },
    save() {
      ops.push({ kind: 'call', method: 'save', args: [] });
    },
    restore() {
      ops.push({ kind: 'call', method: 'restore', args: [] });
    },
    translate(x, y) {
      ops.push({ kind: 'call', method: 'translate', args: [x, y] });
    },
    rotate(radians) {
      ops.push({ kind: 'call', method: 'rotate', args: [radians] });
    },
    drawImage(image, dx, dy, dw, dh) {
      ops.push({ kind: 'call', method: 'drawImage', args: [image, dx, dy, dw, dh] });
    },
  };
  // Wrap in a proxy so property assignments are logged. We also re-bind
  // method properties so logged calls land in `ops` not on a copy.
  return new Proxy(ctx, {
    set(target, prop, value) {
      if (prop !== 'ops') {
        ops.push({ kind: 'set', prop: String(prop), value });
      }
      (target as unknown as Record<string, unknown>)[String(prop)] = value;
      return true;
    },
  });
}

/** Convenience: filter ops to just the calls of a given method. */
function calls(ops: Op[], method: string): Op[] {
  return ops.filter(o => o.kind === 'call' && o.method === method);
}

test('Canvas2DRenderer clears the frame with the scene clear color', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  const scene: Scene = { clear: '#000033', width: 320, height: 240, drawables: [] };
  r.draw(scene);

  const fillRects = calls(ctx.ops, 'fillRect');
  assert.ok(fillRects.length >= 1, 'must issue at least one fillRect to clear');
  // The clear fillRect covers the whole viewport. It is the first fillRect.
  assert.deepEqual(fillRects[0]!.kind === 'call' ? fillRects[0]!.args : null, [0, 0, 320, 240]);

  // The fillStyle in effect at the moment of that first fillRect must be the clear color.
  // We assert by walking ops in order and finding the most recent fillStyle set
  // before the first fillRect.
  const firstFillIdx = ctx.ops.findIndex(o => o.kind === 'call' && o.method === 'fillRect');
  const styleBefore = ctx.ops
    .slice(0, firstFillIdx)
    .reverse()
    .find(o => o.kind === 'set' && o.prop === 'fillStyle');
  assert.ok(styleBefore, 'fillStyle must be set before the clear');
  assert.equal((styleBefore as { value: string }).value, '#000033');
});

test('Canvas2DRenderer renders rect drawables in array order', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  const scene: Scene = {
    clear: '#000',
    width: 100,
    height: 100,
    drawables: [
      { kind: 'rect', x: 1, y: 2, w: 3, h: 4, color: '#ff0000' },
      { kind: 'rect', x: 10, y: 20, w: 30, h: 40, color: '#00ff00' },
      { kind: 'rect', x: 50, y: 60, w: 5, h: 5, color: '#0000ff' },
    ],
  };
  r.draw(scene);

  const fillRects = calls(ctx.ops, 'fillRect');
  // 1 clear + 3 drawables = 4 fillRects.
  assert.equal(fillRects.length, 4);
  // Skip the clear (index 0) and check the order/positions of the drawables.
  const drawCallArgs = fillRects.slice(1).map(o => (o.kind === 'call' ? o.args : null));
  assert.deepEqual(drawCallArgs, [
    [1, 2, 3, 4],
    [10, 20, 30, 40],
    [50, 60, 5, 5],
  ]);
});

test('Canvas2DRenderer sets the drawable color before each fillRect', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  const scene: Scene = {
    clear: '#111',
    width: 100,
    height: 100,
    drawables: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#abc' },
      { kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#def' },
    ],
  };
  r.draw(scene);

  // For each fillRect after the clear, the most recent fillStyle set must
  // match the drawable color. Walk ops in order.
  const expectedColors = ['#111', '#abc', '#def'];
  let drawableIdx = 0;
  let lastStyle: string | null = null;
  for (const op of ctx.ops) {
    if (op.kind === 'set' && op.prop === 'fillStyle') {
      lastStyle = op.value as string;
    } else if (op.kind === 'call' && op.method === 'fillRect') {
      assert.equal(lastStyle, expectedColors[drawableIdx], `fillRect #${drawableIdx} color`);
      drawableIdx += 1;
    }
  }
  assert.equal(drawableIdx, 3, 'should have observed 3 fillRects total');
});

test('Canvas2DRenderer renders an oriented rect around its declared center', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);

  r.draw({
    clear: '#000',
    width: 100,
    height: 100,
    drawables: [
      {
        kind: 'oriented-rect',
        centerX: 40,
        centerY: 50,
        w: 10,
        h: 30,
        rotationRadians: 0.75,
        color: '#fedc00',
      },
    ],
  });

  assert.deepEqual(
    calls(ctx.ops, 'save').map(op => (op.kind === 'call' ? op.args : null)),
    [[]]
  );
  assert.deepEqual(
    calls(ctx.ops, 'translate').map(op => (op.kind === 'call' ? op.args : null)),
    [[40, 50]]
  );
  assert.deepEqual(
    calls(ctx.ops, 'rotate').map(op => (op.kind === 'call' ? op.args : null)),
    [[0.75]]
  );
  assert.deepEqual(
    calls(ctx.ops, 'fillRect').map(op => (op.kind === 'call' ? op.args : null)),
    [
      [0, 0, 100, 100],
      [-5, -15, 10, 30],
    ]
  );
  assert.deepEqual(
    calls(ctx.ops, 'restore').map(op => (op.kind === 'call' ? op.args : null)),
    [[]]
  );
});

test('Canvas2DRenderer loads each sprite source once and draws loaded sprites around their centers', () => {
  const ctx = makeFakeCtx();
  const image = {
    complete: true,
    naturalWidth: 29,
    naturalHeight: 75,
    src: '',
    addEventListener() {},
  } as unknown as HTMLImageElement;
  let imageCreations = 0;
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D, {
    createImage: () => {
      imageCreations += 1;
      return image;
    },
  });
  const sprite = {
    kind: 'oriented-sprite' as const,
    centerX: 40,
    centerY: 50,
    w: 18,
    h: 45,
    rotationRadians: 0.75,
    src: '/images/vehicles/commuter-blue.png',
  };

  r.draw({ clear: '#000', width: 100, height: 100, drawables: [sprite, sprite] });

  assert.equal(imageCreations, 1);
  assert.equal(image.src, sprite.src);
  assert.deepEqual(
    calls(ctx.ops, 'drawImage').map(op => (op.kind === 'call' ? op.args.slice(1) : null)),
    [
      [-9, -22.5, 18, 45],
      [-9, -22.5, 18, 45],
    ]
  );
  assert.deepEqual(
    calls(ctx.ops, 'translate').map(op => (op.kind === 'call' ? op.args : null)),
    [
      [40, 50],
      [40, 50],
    ]
  );
});

test('Canvas2DRenderer waits for a sprite to load instead of drawing incomplete pixels', () => {
  const ctx = makeFakeCtx();
  const image = {
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    src: '',
    addEventListener() {},
  } as unknown as HTMLImageElement;
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D, {
    createImage: () => image,
  });

  r.draw({
    clear: '#000',
    width: 100,
    height: 100,
    drawables: [
      {
        kind: 'oriented-sprite',
        centerX: 40,
        centerY: 50,
        w: 18,
        h: 45,
        rotationRadians: 0,
        src: '/images/vehicles/commuter-blue.png',
      },
    ],
  });

  assert.equal(calls(ctx.ops, 'drawImage').length, 0);
});

test('Canvas2DRenderer fails loudly when a sprite cannot load', () => {
  const ctx = makeFakeCtx();
  const image = {
    complete: true,
    naturalWidth: 0,
    naturalHeight: 0,
    src: '',
    addEventListener() {},
  } as unknown as HTMLImageElement;
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D, {
    createImage: () => image,
  });

  assert.throws(
    () =>
      r.draw({
        clear: '#000',
        width: 100,
        height: 100,
        drawables: [
          {
            kind: 'oriented-sprite',
            centerX: 40,
            centerY: 50,
            w: 18,
            h: 45,
            rotationRadians: 0,
            src: '/images/vehicles/missing.png',
          },
        ],
      }),
    /Failed to load sprite: \/images\/vehicles\/missing\.png/
  );
});

test('Canvas2DRenderer disables image smoothing for crisp pixel art', () => {
  const ctx = makeFakeCtx();
  new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  // Renderer must have set imageSmoothingEnabled to false at construction OR
  // we can call draw() to give it a chance. We assert across both phases.
  const ctx2 = makeFakeCtx();
  const r2 = new Canvas2DRenderer(ctx2 as unknown as CanvasRenderingContext2D);
  r2.draw({ clear: '#000', width: 1, height: 1, drawables: [] });

  const allOps = [...ctx.ops, ...ctx2.ops];
  const smoothingSets = allOps.filter(o => o.kind === 'set' && o.prop === 'imageSmoothingEnabled');
  assert.ok(smoothingSets.length >= 1, 'imageSmoothingEnabled must be set');
  // Every set we issue must be `false`. If the renderer ever turns it back on,
  // that's a bug.
  for (const o of smoothingSets) {
    assert.equal((o as { value: unknown }).value, false);
  }
});

test('Canvas2DRenderer clears on every frame even with no drawables', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  r.draw({ clear: '#abc', width: 50, height: 50, drawables: [] });
  r.draw({ clear: '#def', width: 50, height: 50, drawables: [] });

  const fillRects = calls(ctx.ops, 'fillRect');
  assert.equal(fillRects.length, 2, 'one clear per frame');
});

test('Canvas2DRenderer rejects scenes with non-finite dimensions', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  assert.throws(() => r.draw({ clear: '#000', width: NaN, height: 100, drawables: [] }), TypeError);
  assert.throws(() => r.draw({ clear: '#000', width: 100, height: -5, drawables: [] }), RangeError);
});

test('Canvas2DRenderer fills polygon points in caller order and closes the path', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);

  r.draw({
    clear: '#000',
    width: 100,
    height: 100,
    drawables: [
      {
        kind: 'polygon',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
          { x: 20, y: 40 },
        ],
        color: '#abc',
      },
    ],
  });

  assert.deepEqual(
    ctx.ops
      .filter(op => op.kind === 'call')
      .map(op => (op.kind === 'call' ? [op.method, ...op.args] : null)),
    [
      ['fillRect', 0, 0, 100, 100],
      ['beginPath'],
      ['moveTo', 10, 20],
      ['lineTo', 30, 20],
      ['lineTo', 20, 40],
      ['closePath'],
      ['fill'],
    ]
  );
});

test('Canvas2DRenderer rejects insufficient or non-finite polygons', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  const base = { clear: '#000', width: 100, height: 100 };
  assert.throws(
    () =>
      r.draw({
        ...base,
        drawables: [{ kind: 'polygon', points: [{ x: 0, y: 0 }], color: '#fff' }],
      }),
    RangeError
  );
  assert.throws(
    () =>
      r.draw({
        ...base,
        drawables: [
          {
            kind: 'polygon',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: Number.NaN, y: 1 },
            ],
            color: '#fff',
          },
        ],
      }),
    TypeError
  );
});

test('Canvas2DRenderer strokes polyline points in caller order without closing the path', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);

  r.draw({
    clear: '#000',
    width: 100,
    height: 100,
    drawables: [
      {
        kind: 'polyline',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
          { x: 20, y: 40 },
        ],
        width: 3,
        color: '#abc',
      },
    ],
  });

  assert.deepEqual(
    ctx.ops
      .filter(op => op.kind === 'call')
      .map(op => (op.kind === 'call' ? [op.method, ...op.args] : null)),
    [
      ['fillRect', 0, 0, 100, 100],
      ['beginPath'],
      ['moveTo', 10, 20],
      ['lineTo', 30, 20],
      ['lineTo', 20, 40],
      ['stroke'],
    ]
  );
  assert.ok(
    ctx.ops.some(op => op.kind === 'set' && op.prop === 'strokeStyle' && op.value === '#abc')
  );
  assert.ok(ctx.ops.some(op => op.kind === 'set' && op.prop === 'lineWidth' && op.value === 3));
});

test('Canvas2DRenderer rejects invalid polylines', () => {
  const ctx = makeFakeCtx();
  const r = new Canvas2DRenderer(ctx as unknown as CanvasRenderingContext2D);
  const base = { clear: '#000', width: 100, height: 100 };

  assert.throws(
    () =>
      r.draw({
        ...base,
        drawables: [{ kind: 'polyline', points: [{ x: 0, y: 0 }], width: 1, color: '#fff' }],
      }),
    RangeError
  );
  assert.throws(
    () =>
      r.draw({
        ...base,
        drawables: [
          {
            kind: 'polyline',
            points: [
              { x: 0, y: 0 },
              { x: Number.NaN, y: 1 },
            ],
            width: 1,
            color: '#fff',
          },
        ],
      }),
    TypeError
  );
  assert.throws(
    () =>
      r.draw({
        ...base,
        drawables: [
          {
            kind: 'polyline',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            width: 0,
            color: '#fff',
          },
        ],
      }),
    RangeError
  );
});
