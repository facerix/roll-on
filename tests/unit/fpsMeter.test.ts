/**
 * FpsMeter tests.
 *
 * FPS reported raw (1 / dt) flickers wildly with any frame-time jitter,
 * which makes the on-screen number unreadable. We use an exponential
 * moving average instead. Invariants we lock in:
 *   - Steady-state input converges to the true FPS.
 *   - Zero dt is rejected (would be 1/0).
 *   - Non-finite/negative dt crashes (no silent corruption).
 *   - Before any sample, value() reports null rather than NaN/0.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FpsMeter } from '../../src/engine/fpsMeter.ts';

test('value() is null before any samples', () => {
  const m = new FpsMeter();
  assert.equal(m.value(), null);
});

test('a single sample reports an exact instant FPS', () => {
  const m = new FpsMeter();
  m.tick(1 / 60);
  // First sample bypasses smoothing — otherwise the meter would take many
  // frames to "warm up" from 0, which looks broken on the debug HUD.
  const v = m.value();
  assert.ok(v !== null);
  assert.ok(Math.abs(v - 60) < 1e-9, `expected ~60, got ${v}`);
});

test('steady 60Hz input converges to ~60 FPS', () => {
  const m = new FpsMeter();
  for (let i = 0; i < 100; i++) m.tick(1 / 60);
  const v = m.value()!;
  assert.ok(Math.abs(v - 60) < 0.01, `expected ~60, got ${v}`);
});

test('a one-frame stall does not crater the reading', () => {
  const m = new FpsMeter();
  // Warm up at 60Hz.
  for (let i = 0; i < 60; i++) m.tick(1 / 60);
  // One bad frame: 100ms (= 10 FPS instantaneous).
  m.tick(0.1);
  // The smoothed value should drop, but nowhere near to 10 FPS (the
  // instantaneous reading for a 100ms frame). We just want it to stay in
  // the "readable" zone — well above instant-FPS, below steady state.
  const v = m.value()!;
  assert.ok(v > 30, `expected smoothed > 30 (not cratered to instant 10), got ${v}`);
  assert.ok(v < 60, `expected smoothed < 60 after a stall, got ${v}`);
});

test('tick rejects non-finite or non-positive dt', () => {
  const m = new FpsMeter();
  assert.throws(() => m.tick(NaN), TypeError);
  assert.throws(() => m.tick(Infinity), TypeError);
  assert.throws(() => m.tick(0), RangeError);
  assert.throws(() => m.tick(-0.01), RangeError);
});

test('reset() returns the meter to its pre-sample state', () => {
  const m = new FpsMeter();
  m.tick(1 / 60);
  m.tick(1 / 60);
  m.reset();
  assert.equal(m.value(), null);
});
