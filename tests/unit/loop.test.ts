/**
 * Fixed-step game loop tests.
 *
 * The loop is the foundation everything else stands on. We test it via the
 * synchronous `step(realDt)` seam — production `start()`/`stop()` just wires
 * `step` to requestAnimationFrame, which we deliberately do NOT exercise
 * here (rAF is not unit-test territory).
 *
 * Invariants we lock in:
 *   1. `update` receives the fixed dt, not the real dt — physics is
 *      deterministic regardless of frame timing.
 *   2. Real time is accumulated across ticks; fractional dt carries over.
 *   3. `render` is called exactly once per `step` call, with an
 *      interpolation alpha in [0, 1).
 *   4. Spiral-of-death is capped: a huge real-dt spike does not run an
 *      unbounded number of updates in one tick.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FixedStepLoop } from '../../src/engine/loop.ts';

/** Build a loop with spies for update/render. fixedDt = 1/60 s by default. */
function buildLoop(opts: { fixedDt?: number; maxStepsPerTick?: number } = {}) {
  const updates: number[] = []; // each entry is the dt update was called with
  const renders: number[] = []; // each entry is the alpha render was called with
  const loop = new FixedStepLoop({
    update: dt => updates.push(dt),
    render: alpha => renders.push(alpha),
    fixedDt: opts.fixedDt ?? 1 / 60,
    maxStepsPerTick: opts.maxStepsPerTick,
  });
  return { loop, updates, renders };
}

test('step(fixedDt) runs update exactly once with the fixed dt', () => {
  const { loop, updates, renders } = buildLoop();
  const result = loop.step(1 / 60);
  assert.equal(result.updates, 1);
  assert.deepEqual(updates, [1 / 60]);
  assert.equal(renders.length, 1);
  // No leftover time -> alpha is 0.
  assert.equal(renders[0], 0);
});

test('step(2 * fixedDt) runs update exactly twice', () => {
  const { loop, updates } = buildLoop();
  const result = loop.step(2 / 60);
  assert.equal(result.updates, 2);
  assert.equal(updates.length, 2);
  // Each update receives the fixed dt, not the real dt.
  assert.equal(updates[0], 1 / 60);
  assert.equal(updates[1], 1 / 60);
});

test('fractional dt accumulates across ticks', () => {
  // Two half-frames should produce one update on the second call, not the first.
  const { loop, updates } = buildLoop();
  let r = loop.step(1 / 120);
  assert.equal(r.updates, 0, 'half a frame should not trigger an update');
  assert.equal(updates.length, 0);

  r = loop.step(1 / 120);
  assert.equal(r.updates, 1, 'two halves should trigger one update');
  assert.equal(updates.length, 1);
});

test('render alpha reports leftover-fraction of fixedDt in [0, 1)', () => {
  const { loop, renders } = buildLoop();
  // 1.5 frames: one update happens, half a frame of real time remains.
  const r = loop.step(1.5 / 60);
  assert.equal(r.updates, 1);
  assert.ok(Math.abs(r.alpha - 0.5) < 1e-9, `alpha should be ~0.5, got ${r.alpha}`);
  assert.equal(renders.length, 1);
  assert.ok(Math.abs(renders[0] - 0.5) < 1e-9);
});

test('render is called once per step, even when no update runs', () => {
  const { loop, renders } = buildLoop();
  loop.step(1 / 120); // not enough for an update
  loop.step(1 / 120); // triggers one
  loop.step(1 / 120); // not enough for another
  assert.equal(renders.length, 3, 'render fires once per step regardless');
});

test('spiral-of-death cap bounds updates per tick', () => {
  // A 1s real-dt spike at 60Hz would naively schedule 60 updates. Cap at 5.
  const { loop, updates } = buildLoop({ maxStepsPerTick: 5 });
  const r = loop.step(1.0);
  assert.equal(r.updates, 5);
  assert.equal(updates.length, 5);
  // Excess accumulated time is discarded, not carried forward — otherwise we
  // never catch up and the cap is meaningless. Next normal tick should
  // produce exactly one update, not many.
  const next = loop.step(1 / 60);
  assert.equal(next.updates, 1, 'leftover time from spike must be discarded');
});

test('non-finite or negative real dt crashes (no silent corruption)', () => {
  const { loop } = buildLoop();
  // Non-finite values are a TypeError — the input isn't a usable number at all.
  assert.throws(() => loop.step(NaN), TypeError);
  assert.throws(() => loop.step(Infinity), TypeError);
  // Negative dt is finite but out of range.
  assert.throws(() => loop.step(-0.1), RangeError);
});

test('constructor rejects pathological fixedDt', () => {
  assert.throws(
    () =>
      new FixedStepLoop({
        update: () => {},
        render: () => {},
        fixedDt: 0,
      }),
    RangeError
  );
  assert.throws(
    () =>
      new FixedStepLoop({
        update: () => {},
        render: () => {},
        fixedDt: -1 / 60,
      }),
    RangeError
  );
});
