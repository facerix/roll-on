import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCruiseControlState,
  DEFAULT_CRUISE_CONTROL_TUNING,
  stepCruiseControl,
} from '../../src/game/cruiseControl.ts';
import { DEFAULT_TRUCK_TUNING, createTruckState, stepTruck } from '../../src/game/truck.ts';

test('cruise control starts inactive without a hidden speed target', () => {
  assert.deepEqual(createCruiseControlState(), {
    isActive: false,
    targetSpeedMetersPerSecond: 0,
  });
});

test('inactive cruise passes held throttle and brake directly to the truck', () => {
  const initial = createCruiseControlState();
  const throttle = stepCruiseControl(initial, {
    throttle: 0.75,
    brake: 0,
    toggleCruise: false,
    currentSpeedMetersPerSecond: 20,
  });
  const brake = stepCruiseControl(throttle.state, {
    throttle: 0,
    brake: 0.6,
    toggleCruise: false,
    currentSpeedMetersPerSecond: 20,
  });
  const coast = stepCruiseControl(brake.state, {
    throttle: 0,
    brake: 0,
    toggleCruise: false,
    currentSpeedMetersPerSecond: 20,
  });

  assert.deepEqual(throttle.controls, { throttle: 0.75, brake: 0 });
  assert.deepEqual(brake.controls, { throttle: 0, brake: 0.6 });
  assert.deepEqual(coast.controls, { throttle: 0, brake: 0 });
  assert.equal(coast.state.isActive, false);
});

test('engaging cruise captures the current speed and exposes an active state', () => {
  const engaged = stepCruiseControl(createCruiseControlState(), {
    throttle: 0,
    brake: 0,
    toggleCruise: true,
    currentSpeedMetersPerSecond: 23.5,
  });

  assert.deepEqual(engaged.state, {
    isActive: true,
    targetSpeedMetersPerSecond: 23.5,
  });
  assert.ok(engaged.controls.throttle > 0, 'controller offsets rolling resistance');
  assert.equal(engaged.controls.brake, 0);
});

test('a second cruise command disengages without applying a hidden pedal', () => {
  const disengaged = stepCruiseControl(
    createCruiseControlState({ isActive: true, targetSpeedMetersPerSecond: 25 }),
    {
      throttle: 0,
      brake: 0,
      toggleCruise: true,
      currentSpeedMetersPerSecond: 25,
    }
  );

  assert.equal(disengaged.state.isActive, false);
  assert.deepEqual(disengaged.controls, { throttle: 0, brake: 0 });
});

test('throttle overrides active cruise and release resumes the captured target', () => {
  const cruise = createCruiseControlState({
    isActive: true,
    targetSpeedMetersPerSecond: 25,
  });
  const overridden = stepCruiseControl(cruise, {
    throttle: 1,
    brake: 0,
    toggleCruise: false,
    currentSpeedMetersPerSecond: 25,
  });
  const resumed = stepCruiseControl(overridden.state, {
    throttle: 0,
    brake: 0,
    toggleCruise: false,
    currentSpeedMetersPerSecond: 27,
  });

  assert.deepEqual(overridden.controls, { throttle: 1, brake: 0 });
  assert.deepEqual(overridden.state, cruise);
  assert.equal(resumed.state.isActive, true);
  assert.equal(resumed.state.targetSpeedMetersPerSecond, 25);
  assert.ok(resumed.controls.brake > 0, 'release resumes the captured target');
});

test('any service-brake input cancels cruise and remains direct', () => {
  const cruise = createCruiseControlState({
    isActive: true,
    targetSpeedMetersPerSecond: 25,
  });
  const cancelled = stepCruiseControl(cruise, {
    throttle: 0,
    brake: 0.4,
    toggleCruise: true,
    currentSpeedMetersPerSecond: 25,
  });

  assert.equal(cancelled.state.isActive, false);
  assert.deepEqual(cancelled.controls, { throttle: 0, brake: 0.4 });
});

test('an active controller converges on its captured target without a held throttle', () => {
  const cruise = createCruiseControlState({
    isActive: true,
    targetSpeedMetersPerSecond: 25,
  });
  let truck = createTruckState({
    position: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });

  for (let tick = 0; tick < 20 * 60; tick += 1) {
    const result = stepCruiseControl(cruise, {
      throttle: 0,
      brake: 0,
      toggleCruise: false,
      currentSpeedMetersPerSecond: truck.speedMetersPerSecond,
    });
    truck = stepTruck(truck, { ...result.controls, steering: 0 }, 1 / 60, DEFAULT_TRUCK_TUNING);
  }

  assert.ok(Math.abs(truck.speedMetersPerSecond - 25) < 0.2);
});

test('cruise control rejects corrupt state, input, and tuning', () => {
  assert.throws(
    () => createCruiseControlState({ targetSpeedMetersPerSecond: Number.NaN }),
    TypeError
  );
  assert.throws(() => createCruiseControlState({ targetSpeedMetersPerSecond: -1 }), RangeError);
  assert.throws(
    () =>
      stepCruiseControl(createCruiseControlState(), {
        throttle: 1.1,
        brake: 0,
        toggleCruise: false,
        currentSpeedMetersPerSecond: 0,
      }),
    RangeError
  );
  assert.throws(
    () =>
      stepCruiseControl(
        createCruiseControlState(),
        { throttle: 0, brake: 0, toggleCruise: false, currentSpeedMetersPerSecond: 0 },
        { ...DEFAULT_CRUISE_CONTROL_TUNING, fullControlErrorMetersPerSecond: 0 }
      ),
    RangeError
  );
});
