import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTruckState,
  stepTruck,
  type TruckControls,
  type TruckState,
  type TruckTuning,
} from '../../src/game/truck.ts';

const TUNING: TruckTuning = {
  maxForwardSpeedMetersPerSecond: 40,
};

const NO_CONTROLS: TruckControls = {
  throttle: 0,
  brake: 0,
  steering: 0,
};

function validState(): TruckState {
  return createTruckState({
    position: { lateralMeters: 2.5, distanceMeters: 100 },
    headingRadians: 0.25,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0.25,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });
}

test('createTruckState creates a validated world-space state from explicit values', () => {
  const state = validState();

  assert.deepEqual(state, {
    position: { lateralMeters: 2.5, distanceMeters: 100 },
    headingRadians: 0.25,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0.25,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });
});

test('truck state contains world simulation data, not presentation data', () => {
  assert.deepEqual(Object.keys(validState()).sort(), [
    'cargoIntegrity',
    'headingRadians',
    'massKilograms',
    'position',
    'speedMetersPerSecond',
    'status',
    'trailerHeadingRadians',
    'yawRateRadiansPerSecond',
  ]);
  assert.deepEqual(Object.keys(validState().position).sort(), ['distanceMeters', 'lateralMeters']);
});

test('stepTruck is deterministic for identical inputs', () => {
  const state = validState();

  const a = stepTruck(state, NO_CONTROLS, 1 / 60, TUNING);
  const b = stepTruck(state, NO_CONTROLS, 1 / 60, TUNING);

  assert.deepEqual(a, b);
});

test('stepTruck returns fresh state without mutating its input', () => {
  const state = validState();
  const before = structuredClone(state);
  Object.freeze(state.position);
  Object.freeze(state);

  const next = stepTruck(state, NO_CONTROLS, 1 / 60, TUNING);

  assert.deepEqual(state, before);
  assert.notStrictEqual(next, state);
  assert.notStrictEqual(next.position, state.position);
});

test('zero controls at rest leave the truck at rest', () => {
  const state = validState();

  const next = stepTruck(state, NO_CONTROLS, 1 / 60, TUNING);

  assert.deepEqual(next, state);
});

test('createTruckState rejects non-finite state values', () => {
  const state = validState();

  assert.throws(() => createTruckState({ ...state, headingRadians: Number.NaN }), TypeError);
  assert.throws(
    () =>
      createTruckState({
        ...state,
        position: { ...state.position, distanceMeters: Number.POSITIVE_INFINITY },
      }),
    TypeError
  );
});

test('createTruckState rejects physically invalid state ranges', () => {
  const state = validState();

  assert.throws(() => createTruckState({ ...state, speedMetersPerSecond: -1 }), RangeError);
  assert.throws(() => createTruckState({ ...state, massKilograms: 0 }), RangeError);
  assert.throws(() => createTruckState({ ...state, cargoIntegrity: -0.01 }), RangeError);
  assert.throws(() => createTruckState({ ...state, cargoIntegrity: 1.01 }), RangeError);
  assert.throws(
    () => createTruckState({ ...state, status: 'on-fire' as TruckState['status'] }),
    TypeError
  );
});

test('stepTruck validates state against the supplied tuning', () => {
  const state = validState();

  assert.throws(
    () => stepTruck({ ...state, speedMetersPerSecond: 41 }, NO_CONTROLS, 1 / 60, TUNING),
    RangeError
  );
});

test('stepTruck rejects invalid controls', () => {
  const state = validState();

  assert.throws(
    () => stepTruck(state, { ...NO_CONTROLS, throttle: Number.NaN }, 1 / 60, TUNING),
    TypeError
  );
  assert.throws(
    () => stepTruck(state, { ...NO_CONTROLS, throttle: 1.01 }, 1 / 60, TUNING),
    RangeError
  );
  assert.throws(
    () => stepTruck(state, { ...NO_CONTROLS, brake: -0.01 }, 1 / 60, TUNING),
    RangeError
  );
  assert.throws(
    () => stepTruck(state, { ...NO_CONTROLS, steering: -1.01 }, 1 / 60, TUNING),
    RangeError
  );
  assert.throws(
    () => stepTruck(state, { ...NO_CONTROLS, steering: 1.01 }, 1 / 60, TUNING),
    RangeError
  );
});

test('stepTruck rejects invalid tuning', () => {
  const state = validState();

  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        maxForwardSpeedMetersPerSecond: Number.NaN,
      }),
    TypeError
  );
  assert.throws(
    () => stepTruck(state, NO_CONTROLS, 1 / 60, { maxForwardSpeedMetersPerSecond: 0 }),
    RangeError
  );
});

test('stepTruck rejects non-finite or negative dt', () => {
  const state = validState();

  assert.throws(() => stepTruck(state, NO_CONTROLS, Number.NaN, TUNING), TypeError);
  assert.throws(() => stepTruck(state, NO_CONTROLS, Number.POSITIVE_INFINITY, TUNING), TypeError);
  assert.throws(() => stepTruck(state, NO_CONTROLS, -0.001, TUNING), RangeError);
});
