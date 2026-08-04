import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCruiseControlState,
  DEFAULT_CRUISE_CONTROL_TUNING,
  stepCruiseControl,
} from '../../src/game/cruiseControl.ts';
import { DEFAULT_TRUCK_TUNING, createTruckState, stepTruck } from '../../src/game/truck.ts';

test('cruise control starts at the efficient highway setpoint', () => {
  assert.deepEqual(createCruiseControlState(), { targetSpeedMetersPerSecond: 20 });
});

test('gas and brake adjust the target and releasing both pedals retains it', () => {
  const initial = createCruiseControlState();
  const raised = stepCruiseControl(initial, {
    gas: 1,
    brake: 0,
    currentSpeedMetersPerSecond: 20,
    dtSeconds: 0.5,
  });
  const held = stepCruiseControl(raised.state, {
    gas: 0,
    brake: 0,
    currentSpeedMetersPerSecond: 20,
    dtSeconds: 1,
  });
  const lowered = stepCruiseControl(held.state, {
    gas: 0,
    brake: 1,
    currentSpeedMetersPerSecond: 20,
    dtSeconds: 0.25,
  });

  assert.equal(raised.state.targetSpeedMetersPerSecond, 25);
  assert.equal(held.state.targetSpeedMetersPerSecond, 25);
  assert.equal(lowered.state.targetSpeedMetersPerSecond, 22.5);
});

test('opposed pedals cancel target adjustment and target speed clamps to truck limits', () => {
  const initial = createCruiseControlState({ targetSpeedMetersPerSecond: 39 });
  const opposed = stepCruiseControl(initial, {
    gas: 1,
    brake: 1,
    currentSpeedMetersPerSecond: 20,
    dtSeconds: 1,
  });
  const maximum = stepCruiseControl(opposed.state, {
    gas: 1,
    brake: 0,
    currentSpeedMetersPerSecond: 20,
    dtSeconds: 10,
  });
  const minimum = stepCruiseControl(maximum.state, {
    gas: 0,
    brake: 1,
    currentSpeedMetersPerSecond: 20,
    dtSeconds: 10,
  });

  assert.equal(opposed.state.targetSpeedMetersPerSecond, 39);
  assert.equal(maximum.state.targetSpeedMetersPerSecond, 40);
  assert.equal(minimum.state.targetSpeedMetersPerSecond, 0);
});

test('released pedals generate throttle or brake to pursue and hold the retained target', () => {
  const target = createCruiseControlState({ targetSpeedMetersPerSecond: 25 });
  const below = stepCruiseControl(target, {
    gas: 0,
    brake: 0,
    currentSpeedMetersPerSecond: 15,
    dtSeconds: 1 / 60,
  });
  const above = stepCruiseControl(target, {
    gas: 0,
    brake: 0,
    currentSpeedMetersPerSecond: 30,
    dtSeconds: 1 / 60,
  });
  const atTarget = stepCruiseControl(target, {
    gas: 0,
    brake: 0,
    currentSpeedMetersPerSecond: 25,
    dtSeconds: 1 / 60,
  });

  assert.ok(below.controls.throttle > 0);
  assert.equal(below.controls.brake, 0);
  assert.equal(above.controls.throttle, 0);
  assert.ok(above.controls.brake > 0);
  assert.ok(atTarget.controls.throttle > 0, 'controller offsets rolling resistance');
  assert.equal(atTarget.controls.brake, 0);
});

test('the truck converges on its cruise target without a held gas input', () => {
  const cruise = createCruiseControlState({ targetSpeedMetersPerSecond: 25 });
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
      gas: 0,
      brake: 0,
      currentSpeedMetersPerSecond: truck.speedMetersPerSecond,
      dtSeconds: 1 / 60,
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
        gas: 1.1,
        brake: 0,
        currentSpeedMetersPerSecond: 0,
        dtSeconds: 1,
      }),
    RangeError
  );
  assert.throws(
    () =>
      stepCruiseControl(
        createCruiseControlState(),
        { gas: 0, brake: 0, currentSpeedMetersPerSecond: 0, dtSeconds: -1 },
        { ...DEFAULT_CRUISE_CONTROL_TUNING, targetAdjustmentMetersPerSecondSquared: 0 }
      ),
    RangeError
  );
});
