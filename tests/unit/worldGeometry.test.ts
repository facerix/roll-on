import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addVectors,
  addVelocities,
  angularVelocityAtPoint,
  clockwiseCross,
  createWorldPoint,
  createWorldVector,
  createWorldVelocity,
  dotVectors,
  dotVelocityWithVector,
  headingToUnitVector,
  normalizeHeading,
  scaleVector,
  shortestHeadingDelta,
  subtractVectors,
  subtractVelocities,
  velocityAlongHeading,
} from '../../src/game/worldGeometry.ts';

const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

test('world points and vectors expose Cartesian x/y meters only', () => {
  assert.deepEqual(Object.keys(createWorldPoint(1, 2)).sort(), ['xMeters', 'yMeters']);
  assert.deepEqual(Object.keys(createWorldVector(1, 2)).sort(), ['xMeters', 'yMeters']);
  assert.deepEqual(Object.keys(createWorldVelocity(1, 2)).sort(), [
    'xMetersPerSecond',
    'yMetersPerSecond',
  ]);
});

test('world geometry constructors copy their inputs and freeze the result', () => {
  const point = createWorldPoint(3, -4);
  assert.equal(point.xMeters, 3);
  assert.equal(point.yMeters, -4);
  assert.ok(Object.isFrozen(point));
  assert.ok(Object.isFrozen(createWorldVector(0, 0)));
  assert.ok(Object.isFrozen(createWorldVelocity(0, 0)));
});

test('world geometry constructors reject non-finite values', () => {
  for (const value of NON_FINITE) {
    assert.throws(() => createWorldPoint(value, 0), TypeError);
    assert.throws(() => createWorldPoint(0, value), TypeError);
    assert.throws(() => createWorldVector(value, 0), TypeError);
    assert.throws(() => createWorldVector(0, value), TypeError);
    assert.throws(() => createWorldVelocity(value, 0), TypeError);
    assert.throws(() => createWorldVelocity(0, value), TypeError);
  }
});

test('heading zero points along +y and positive heading rotates toward +x', () => {
  const forward = headingToUnitVector(0);
  assert.ok(Math.abs(forward.xMeters - 0) < 1e-12);
  assert.ok(Math.abs(forward.yMeters - 1) < 1e-12);

  const right = headingToUnitVector(Math.PI / 2);
  assert.ok(Math.abs(right.xMeters - 1) < 1e-12);
  assert.ok(Math.abs(right.yMeters - 0) < 1e-12);

  const arbitrary = headingToUnitVector(0.7);
  assert.ok(Math.abs(Math.hypot(arbitrary.xMeters, arbitrary.yMeters) - 1) < 1e-12);
});

test('velocityAlongHeading scales the heading unit vector by speed', () => {
  const velocity = velocityAlongHeading(0, 25);
  assert.ok(Math.abs(velocity.xMetersPerSecond - 0) < 1e-12);
  assert.equal(velocity.yMetersPerSecond, 25);

  const angled = velocityAlongHeading(Math.PI / 2, 10);
  assert.ok(Math.abs(angled.xMetersPerSecond - 10) < 1e-12);
  assert.ok(Math.abs(angled.yMetersPerSecond - 0) < 1e-12);
});

test('vector arithmetic operates componentwise', () => {
  const a = createWorldVector(3, 4);
  const b = createWorldVector(1, -2);

  assert.deepEqual({ ...addVectors(a, b) }, { xMeters: 4, yMeters: 2 });
  assert.deepEqual({ ...subtractVectors(a, b) }, { xMeters: 2, yMeters: 6 });
  assert.deepEqual({ ...scaleVector(a, 2) }, { xMeters: 6, yMeters: 8 });
  assert.equal(dotVectors(a, b), 3 * 1 + 4 * -2);
});

test('velocity arithmetic operates componentwise', () => {
  const a = createWorldVelocity(3, 4);
  const b = createWorldVelocity(1, -2);

  assert.deepEqual({ ...addVelocities(a, b) }, { xMetersPerSecond: 4, yMetersPerSecond: 2 });
  assert.deepEqual({ ...subtractVelocities(a, b) }, { xMetersPerSecond: 2, yMetersPerSecond: 6 });
  assert.equal(dotVelocityWithVector(a, createWorldVector(1, -2)), 3 * 1 + 4 * -2);
});

test('clockwiseCross is positive rotating from +y toward +x', () => {
  const forward = createWorldVector(0, 1);
  const right = createWorldVector(1, 0);

  assert.equal(clockwiseCross(forward, right), 1);
  assert.equal(clockwiseCross(right, forward), -1);
  assert.equal(clockwiseCross(forward, forward), 0);
});

test('angularVelocityAtPoint swings a forward arm toward +x for positive spin', () => {
  const swing = angularVelocityAtPoint(1, createWorldVector(0, 1));
  assert.equal(swing.xMetersPerSecond, 1);
  assert.equal(Math.abs(swing.yMetersPerSecond), 0);

  const stationary = angularVelocityAtPoint(0, createWorldVector(3, -2));
  assert.equal(Math.abs(stationary.xMetersPerSecond), 0);
  assert.equal(Math.abs(stationary.yMetersPerSecond), 0);
});

test('vector helpers reject non-finite operands', () => {
  const valid = createWorldVector(1, 1);
  const invalid = { xMeters: Number.NaN, yMeters: 0 };

  assert.throws(() => addVectors(valid, invalid), TypeError);
  assert.throws(() => subtractVectors(invalid, valid), TypeError);
  assert.throws(() => scaleVector(valid, Number.POSITIVE_INFINITY), TypeError);
  assert.throws(() => dotVectors(valid, invalid), TypeError);
  assert.throws(() => headingToUnitVector(Number.NaN), TypeError);
  assert.throws(() => velocityAlongHeading(0, Number.NaN), TypeError);
  assert.throws(() => angularVelocityAtPoint(Number.NaN, valid), TypeError);
});

test('normalizeHeading wraps a heading into (-pi, pi]', () => {
  assert.equal(normalizeHeading(0), 0);
  assert.ok(Math.abs(normalizeHeading(Math.PI / 2 + 2 * Math.PI) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(normalizeHeading((-3 * Math.PI) / 2) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(normalizeHeading(-0.75 - 4 * Math.PI) + 0.75) < 1e-12);
  for (const value of NON_FINITE) {
    assert.throws(() => normalizeHeading(value), TypeError);
  }
});

test('shortestHeadingDelta takes the short way around and is positive turning right', () => {
  assert.ok(Math.abs(shortestHeadingDelta(0.1, -0.1) - 0.2) < 1e-12);
  assert.ok(Math.abs(shortestHeadingDelta(-0.1, 0.1) + 0.2) < 1e-12);

  // Across the +/-pi seam: a small right turn, not a nearly-full left one.
  const acrossSeam = shortestHeadingDelta(-3, 3);
  assert.ok(acrossSeam > 0);
  assert.ok(Math.abs(acrossSeam - (2 * Math.PI - 6)) < 1e-12);

  for (const value of NON_FINITE) {
    assert.throws(() => shortestHeadingDelta(value, 0), TypeError);
    assert.throws(() => shortestHeadingDelta(0, value), TypeError);
  }
});
