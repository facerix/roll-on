import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEffectiveTruckTuning,
  buildFuelLimitedControls,
  createFuelState,
  DEFAULT_FUEL_TUNING,
  isFuelInFumes,
  limitTruckSpeedForFuel,
  stepFuel,
  type FuelTuning,
} from '../../src/game/fuel.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING, stepTruck } from '../../src/game/truck.ts';

const TUNING: FuelTuning = {
  efficientCruiseSpeedRatio: 0.5,
  baselineDrainPerSecond: 0.01,
  highSpeedDrainMultiplier: 3,
  highSpeedDrainExponent: 2,
  lowSpeedGulpSpeedRatio: 0.15,
  hardThrottleThreshold: 0.85,
  launchGulpDrain: 0.02,
  fumesThreshold: 0.05,
  fumesTopSpeedMultiplier: 0.4,
};

function input(
  overrides: Partial<Parameters<typeof stepFuel>[1]> = {}
): Parameters<typeof stepFuel>[1] {
  return {
    speedMetersPerSecond: 20,
    maxForwardSpeedMetersPerSecond: 40,
    throttle: 0.4,
    isTruckCrashed: false,
    ...overrides,
  };
}

test('valid fuel states are copied without mutation', () => {
  const initial = { level: 0.5, launchGulpArmed: false };
  const fuel = createFuelState(initial);

  assert.deepEqual(fuel, initial);
  assert.notEqual(fuel, initial);
});

test('fuel state rejects invalid normalized levels', () => {
  assert.throws(() => createFuelState({ level: Number.NaN }), TypeError);
  assert.throws(() => createFuelState({ level: -0.01 }), RangeError);
  assert.throws(() => createFuelState({ level: 1.01 }), RangeError);
});

test('cruising for T seconds drains by the expected baseline amount', () => {
  const result = stepFuel(createFuelState(), input(), 10, TUNING);

  assert.equal(result.burn.baselineDrain, 0.1);
  assert.equal(result.burn.highSpeedDrain, 0);
  assert.equal(result.fuel.level, 0.9);
});

test('flooring it at high speed drains faster than efficient cruise', () => {
  const cruise = stepFuel(
    createFuelState(),
    input({ speedMetersPerSecond: 20, throttle: 1 }),
    5,
    TUNING
  );
  const fast = stepFuel(
    createFuelState(),
    input({ speedMetersPerSecond: 40, throttle: 1 }),
    5,
    TUNING
  );

  assert.ok(fast.burn.totalDrain > cruise.burn.totalDrain);
  assert.ok(fast.burn.highSpeedDrain > 0);
});

test('hard throttle from low speed applies one launch gulp until rearmed', () => {
  const first = stepFuel(
    createFuelState(),
    input({ speedMetersPerSecond: 0, throttle: 1 }),
    1,
    TUNING
  );
  const second = stepFuel(first.fuel, input({ speedMetersPerSecond: 2, throttle: 1 }), 1, TUNING);
  const rearmed = stepFuel(second.fuel, input({ speedMetersPerSecond: 0, throttle: 0 }), 1, TUNING);
  const third = stepFuel(rearmed.fuel, input({ speedMetersPerSecond: 0, throttle: 1 }), 1, TUNING);

  assert.equal(first.burn.launchGulpDrain, 0.02);
  assert.equal(second.burn.launchGulpDrain, 0);
  assert.equal(rearmed.fuel.launchGulpArmed, true);
  assert.equal(third.burn.launchGulpDrain, 0.02);
});

test('zero dt is a no-op and fuel clamps at zero after drain', () => {
  const fuel = createFuelState({ level: 0.03 });
  const noOp = stepFuel(fuel, input({ speedMetersPerSecond: 40, throttle: 1 }), 0, TUNING);
  const drained = stepFuel(fuel, input({ speedMetersPerSecond: 40, throttle: 1 }), 10, TUNING);

  assert.deepEqual(noOp.fuel, fuel);
  assert.equal(noOp.burn.totalDrain, 0);
  assert.equal(drained.fuel.level, 0);
});

test('fumes threshold enters at exactly 5 percent and exits above it', () => {
  assert.equal(isFuelInFumes(createFuelState({ level: 0.05 }), TUNING), true);
  assert.equal(isFuelInFumes(createFuelState({ level: 0.050_001 }), TUNING), false);
  assert.equal(isFuelInFumes(createFuelState({ level: 0.2 }), TUNING), false);
});

test('fumes caps top speed without mutating default truck tuning', () => {
  const fuel = createFuelState({ level: 0.05 });
  const effective = buildEffectiveTruckTuning(DEFAULT_TRUCK_TUNING, fuel, TUNING);

  assert.equal(effective.maxForwardSpeedMetersPerSecond, 16);
  assert.equal(effective.jackknifeMinimumSpeedMetersPerSecond, 16);
  assert.equal(DEFAULT_TRUCK_TUNING.maxForwardSpeedMetersPerSecond, 40);
  assert.equal(DEFAULT_TRUCK_TUNING.jackknifeMinimumSpeedMetersPerSecond, 20);
});

test('fumes effective tuning remains valid for truck stepping', () => {
  const fuel = createFuelState({ level: 0.05 });
  const effective = buildEffectiveTruckTuning(DEFAULT_TRUCK_TUNING, fuel);
  const truck = createTruckState({
    position: { lateralMeters: 0, distanceMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: effective.maxForwardSpeedMetersPerSecond,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });

  assert.doesNotThrow(() =>
    stepTruck(truck, { throttle: 0, brake: 0, steering: 0 }, 1 / 60, effective)
  );
});

test('truck above fumes cap is clamped through an explicit rule', () => {
  const truck = createTruckState({
    position: { lateralMeters: 0, distanceMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 30,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });
  const limited = limitTruckSpeedForFuel(
    truck,
    DEFAULT_TRUCK_TUNING,
    createFuelState({ level: 0.05 }),
    TUNING
  );

  assert.equal(limited.speedMetersPerSecond, 16);
  assert.equal(truck.speedMetersPerSecond, 30);
});

test('empty fuel cuts positive throttle but preserves braking and steering', () => {
  assert.deepEqual(
    buildFuelLimitedControls(createFuelState({ level: 0 }), {
      throttle: 1,
      brake: 0.5,
      steering: -1,
    }),
    { throttle: 0, brake: 0.5, steering: -1 }
  );
});

test('default fuel tuning is internally valid', () => {
  assert.equal(isFuelInFumes(createFuelState({ level: DEFAULT_FUEL_TUNING.fumesThreshold })), true);
});
