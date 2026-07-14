import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../../src/rng.ts';

test('Rng differs across distinct seeds', () => {
  const a = new Rng(42);
  const b = new Rng(43);
  // First call differs with overwhelming probability for any well-mixed PRNG.
  assert.notEqual(a.next(), b.next());
});

test('Rng.next always returns a float in [0, 1)', () => {
  const r = new Rng(0xdeadbeef);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `value ${v} out of [0, 1)`);
  }
});

test('Rng requires a finite seed', () => {
  assert.throws(() => new Rng(NaN), TypeError);
  // Cast: the runtime guard exists for untyped callers (e.g. corrupt save
  // data deserialized from JSON), not for TS-clean call sites.
  assert.throws(() => new Rng(undefined as unknown as number), TypeError);
});

test('Rng.next reproduces from the same seed', () => {
  const a = new Rng(7);
  const b = new Rng(7);
  for (let i = 0; i < 20; i++) {
    assert.equal(a.next(), b.next());
  }
});

test('Rng.intRange returns integers in [min, max)', () => {
  const r = new Rng(1);
  for (let i = 0; i < 500; i++) {
    const v = r.intRange(3, 10);
    assert.ok(Number.isInteger(v), 'result must be integer');
    assert.ok(v >= 3 && v < 10, `value ${v} out of bounds`);
  }
});

test('Rng.intRange crashes on empty range (no silent clamp)', () => {
  const r = new Rng(1);
  assert.throws(() => r.intRange(5, 5), RangeError);
  assert.throws(() => r.intRange(5, 3), RangeError);
  assert.throws(() => r.intRange(1.5, 5), TypeError);
});

test('Rng.chance returns a boolean and respects extremes', () => {
  const r = new Rng(99);
  assert.equal(r.chance(0), false, 'p=0 never hits');
  assert.equal(r.chance(1), true, 'p=1 always hits');
  assert.throws(() => r.chance(-0.1), RangeError);
  assert.throws(() => r.chance(1.5), RangeError);
});

test('Rng.pick returns a member of a non-empty array', () => {
  const r = new Rng(2024);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) {
    assert.ok(arr.includes(r.pick(arr)));
  }
  assert.throws(() => r.pick([]), TypeError);
});

test('Rng.setState resumes the stream from a captured state', () => {
  const a = new Rng(123);
  // Burn a few values to advance the stream.
  a.next();
  a.next();
  a.next();
  const checkpoint = a.state;
  const expected = [a.next(), a.next(), a.next()];

  const b = new Rng(0);
  b.setState(checkpoint);
  assert.deepEqual([b.next(), b.next(), b.next()], expected);
});

test('Rng.fork yields a stable, independent substream', () => {
  const a = new Rng(50);
  const b = new Rng(50);
  const fa = a.fork('combat');
  const fb = b.fork('combat');
  // Same parent state + label → same fork sequence.
  assert.equal(fa.next(), fb.next());

  const fOther = a.fork('mapgen');
  // Different label → different stream (overwhelmingly).
  assert.notEqual(fa.next(), fOther.next());
});

test('Rng.fork does not advance the parent stream', () => {
  // Documented behavior: forking is pure w.r.t. the parent. Two forks with
  // the same label from an unchanged parent yield identical substreams,
  // and the parent's own next() value is unchanged by intervening forks.
  const a = new Rng(777);
  const b = new Rng(777);

  const expectedParentNext = b.next();

  const f1 = a.fork('traffic');
  const f2 = a.fork('traffic');
  assert.equal(f1.next(), f2.next(), 'repeated forks from same state must match');

  // Parent's next value must be unaffected by the forks above.
  assert.equal(a.next(), expectedParentNext);
});
