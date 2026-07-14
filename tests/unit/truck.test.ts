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
  engineAccelerationMetersPerSecondSquared: 6.2,
  coastDecelerationMetersPerSecondSquared: 0.5,
  brakeDecelerationMetersPerSecondSquared: 8,
  maxSteeringYawRateRadiansPerSecond: 0.75,
  steeringResponsePerSecond: 3,
  steeringFullResponseSpeedMetersPerSecond: 15,
  trailerWheelbaseMeters: 12,
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

function stepFor(
  initial: TruckState,
  controls: TruckControls,
  durationSeconds: number,
  dtSeconds = 1 / 60
): TruckState {
  let state = initial;
  const steps = Math.round(durationSeconds / dtSeconds);
  for (let i = 0; i < steps; i++) {
    state = stepTruck(state, controls, dtSeconds, TUNING);
  }
  return state;
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

test('full throttle reaches 50% of top speed in approximately 4–5 seconds', () => {
  let state = validState();
  const fullThrottle: TruckControls = { ...NO_CONTROLS, throttle: 1 };
  const halfSpeed = TUNING.maxForwardSpeedMetersPerSecond / 2;
  const dt = 1 / 60;
  let elapsed = 0;

  while (state.speedMetersPerSecond < halfSpeed && elapsed <= 6) {
    state = stepTruck(state, fullThrottle, dt, TUNING);
    elapsed += dt;
  }

  assert.ok(elapsed >= 4, `expected at least 4s, reached half speed in ${elapsed}s`);
  assert.ok(elapsed <= 5, `expected at most 5s, reached half speed in ${elapsed}s`);
});

test('engine acceleration diminishes as speed approaches top speed', () => {
  const fullThrottle: TruckControls = { ...NO_CONTROLS, throttle: 1 };
  const nearRest = validState();
  const nearTop = {
    ...validState(),
    speedMetersPerSecond: TUNING.maxForwardSpeedMetersPerSecond * 0.9,
  };

  const lowSpeedDelta =
    stepTruck(nearRest, fullThrottle, 1, TUNING).speedMetersPerSecond -
    nearRest.speedMetersPerSecond;
  const highSpeedDelta =
    stepTruck(nearTop, fullThrottle, 1, TUNING).speedMetersPerSecond - nearTop.speedMetersPerSecond;

  assert.ok(lowSpeedDelta > highSpeedDelta);
  assert.ok(highSpeedDelta > 0);
});

test('sustained throttle approaches but never exceeds top speed', () => {
  const state = stepFor(validState(), { ...NO_CONTROLS, throttle: 1 }, 60);

  assert.ok(state.speedMetersPerSecond > TUNING.maxForwardSpeedMetersPerSecond * 0.99);
  assert.ok(state.speedMetersPerSecond <= TUNING.maxForwardSpeedMetersPerSecond);
});

test('coasting loses speed more slowly than braking', () => {
  const moving = { ...validState(), speedMetersPerSecond: 20 };

  const coasted = stepTruck(moving, NO_CONTROLS, 1, TUNING);
  const braked = stepTruck(moving, { ...NO_CONTROLS, brake: 1 }, 1, TUNING);

  assert.ok(coasted.speedMetersPerSecond < moving.speedMetersPerSecond);
  assert.ok(braked.speedMetersPerSecond < coasted.speedMetersPerSecond);
});

test('braking clamps at rest and never produces reverse motion', () => {
  const movingSlowly = { ...validState(), speedMetersPerSecond: 1 };

  const stopped = stepTruck(movingSlowly, { ...NO_CONTROLS, brake: 1 }, 1, TUNING);

  assert.equal(stopped.speedMetersPerSecond, 0);
});

test('forward speed advances world position along cab heading', () => {
  const movingForward = { ...validState(), speedMetersPerSecond: 10, headingRadians: 0 };
  const movingSideways = {
    ...validState(),
    speedMetersPerSecond: 10,
    headingRadians: Math.PI / 2,
  };

  const forward = stepTruck(movingForward, { ...NO_CONTROLS, throttle: 1 }, 0.1, TUNING);
  const sideways = stepTruck(movingSideways, { ...NO_CONTROLS, throttle: 1 }, 0.1, TUNING);

  assert.equal(forward.position.lateralMeters, movingForward.position.lateralMeters);
  assert.ok(forward.position.distanceMeters > movingForward.position.distanceMeters);
  assert.ok(sideways.position.lateralMeters > movingSideways.position.lateralMeters);
  assert.ok(
    Math.abs(sideways.position.distanceMeters - movingSideways.position.distanceMeters) < 1e-12
  );
});

test('equivalent fixed-step simulations produce identical longitudinal state', () => {
  const controls: TruckControls = { throttle: 0.65, brake: 0, steering: 0 };

  const a = stepFor(validState(), controls, 8);
  const b = stepFor(validState(), controls, 8);

  assert.deepEqual(a, b);
});

test('zero steering preserves cab heading when yaw rate is settled', () => {
  const moving = {
    ...validState(),
    speedMetersPerSecond: 20,
    yawRateRadiansPerSecond: 0,
  };

  const next = stepTruck(moving, { ...NO_CONTROLS, throttle: 1 }, 0.5, TUNING);

  assert.equal(next.headingRadians, moving.headingRadians);
  assert.equal(next.yawRateRadiansPerSecond, 0);
});

test('steering cannot rotate the cab while the truck is at rest', () => {
  const state = validState();

  const next = stepTruck(state, { ...NO_CONTROLS, steering: 1 }, 1, TUNING);

  assert.equal(next.headingRadians, state.headingRadians);
  assert.equal(next.yawRateRadiansPerSecond, 0);
});

test('gentle steering produces a bounded cab heading change', () => {
  const moving = {
    ...validState(),
    headingRadians: 0,
    trailerHeadingRadians: 0,
    speedMetersPerSecond: 20,
  };

  const next = stepTruck(moving, { throttle: 1, brake: 0, steering: 0.25 }, 1, TUNING);

  assert.ok(next.headingRadians > 0);
  assert.ok(next.headingRadians < TUNING.maxSteeringYawRateRadiansPerSecond);
  assert.ok(next.yawRateRadiansPerSecond > 0);
  assert.ok(next.yawRateRadiansPerSecond < TUNING.maxSteeringYawRateRadiansPerSecond * 0.25);
});

test('trailer follows cab heading without snapping to it', () => {
  const articulated = {
    ...validState(),
    headingRadians: 0.5,
    trailerHeadingRadians: 0,
    speedMetersPerSecond: 20,
  };

  const next = stepTruck(articulated, { ...NO_CONTROLS, throttle: 1 }, 0.1, TUNING);

  assert.ok(next.trailerHeadingRadians > articulated.trailerHeadingRadians);
  assert.ok(next.trailerHeadingRadians < articulated.headingRadians);
});

test('hard steering makes the cab lead the delayed trailer', () => {
  const moving = {
    ...validState(),
    headingRadians: 0,
    trailerHeadingRadians: 0,
    speedMetersPerSecond: 25,
  };

  const next = stepFor(moving, { throttle: 1, brake: 0, steering: 1 }, 1);
  const articulation = angleDelta(next.headingRadians, next.trailerHeadingRadians);

  assert.ok(next.headingRadians > 0);
  assert.ok(next.trailerHeadingRadians > 0);
  assert.ok(articulation > 0);
});

test('steering reversal changes trailer heading continuously without snapping', () => {
  const moving = {
    ...validState(),
    headingRadians: 0,
    trailerHeadingRadians: 0,
    speedMetersPerSecond: 25,
  };
  const turningRight = stepFor(moving, { throttle: 1, brake: 0, steering: 1 }, 1);

  const firstLeftStep = stepTruck(
    turningRight,
    { throttle: 1, brake: 0, steering: -1 },
    1 / 60,
    TUNING
  );
  const trailerChange = Math.abs(
    angleDelta(firstLeftStep.trailerHeadingRadians, turningRight.trailerHeadingRadians)
  );

  assert.ok(trailerChange > 0);
  assert.ok(trailerChange < 0.1);
});

test('steering simulation is deterministic across equivalent fixed steps', () => {
  const moving = { ...validState(), speedMetersPerSecond: 15 };
  const controls: TruckControls = { throttle: 0.8, brake: 0, steering: -0.6 };

  const a = stepFor(moving, controls, 3);
  const b = stepFor(moving, controls, 3);

  assert.deepEqual(a, b);
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
        engineAccelerationMetersPerSecondSquared: 6.2,
        coastDecelerationMetersPerSecondSquared: 0.5,
        brakeDecelerationMetersPerSecondSquared: 8,
        maxSteeringYawRateRadiansPerSecond: 0.75,
        steeringResponsePerSecond: 3,
        steeringFullResponseSpeedMetersPerSecond: 15,
        trailerWheelbaseMeters: 12,
      }),
    TypeError
  );
  assert.throws(
    () => stepTruck(state, NO_CONTROLS, 1 / 60, { ...TUNING, maxForwardSpeedMetersPerSecond: 0 }),
    RangeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        engineAccelerationMetersPerSecondSquared: -1,
      }),
    RangeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        coastDecelerationMetersPerSecondSquared: Number.POSITIVE_INFINITY,
      }),
    TypeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        brakeDecelerationMetersPerSecondSquared: 0,
      }),
    RangeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        maxSteeringYawRateRadiansPerSecond: 0,
      }),
    RangeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        steeringResponsePerSecond: Number.NaN,
      }),
    TypeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        steeringFullResponseSpeedMetersPerSecond: -1,
      }),
    RangeError
  );
  assert.throws(
    () =>
      stepTruck(state, NO_CONTROLS, 1 / 60, {
        ...TUNING,
        trailerWheelbaseMeters: 0,
      }),
    RangeError
  );
});

test('stepTruck rejects non-finite or negative dt', () => {
  const state = validState();

  assert.throws(() => stepTruck(state, NO_CONTROLS, Number.NaN, TUNING), TypeError);
  assert.throws(() => stepTruck(state, NO_CONTROLS, Number.POSITIVE_INFINITY, TUNING), TypeError);
  assert.throws(() => stepTruck(state, NO_CONTROLS, -0.001, TUNING), RangeError);
});

function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
