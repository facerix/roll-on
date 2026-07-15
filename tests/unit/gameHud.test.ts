import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGameHudSnapshot } from '../../src/game/gameHud.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';

test('game HUD snapshot formats persistent driving values', () => {
  const truck = createTruckState({
    position: { lateralMeters: 1.2, distanceMeters: 402.33 },
    headingRadians: 0,
    speedMetersPerSecond: 31.2928,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 0.876,
    status: 'driving',
  });

  assert.deepEqual(buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING), {
    speedMphText: '70',
    speedMetersPerSecondText: '31.3 m/s',
    topSpeedPercentText: '78%',
    cargoIntegrityText: '88%',
    distanceText: '402 m',
    statusText: 'DRIVING',
  });
});

test('game HUD snapshot clamps display percentages without mutating state', () => {
  const truck = createTruckState({
    position: { lateralMeters: 0, distanceMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 0,
    status: 'crashed',
  });

  const snapshot = buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING);

  assert.equal(snapshot.speedMphText, '0');
  assert.equal(snapshot.topSpeedPercentText, '0%');
  assert.equal(snapshot.cargoIntegrityText, '0%');
  assert.equal(snapshot.statusText, 'CRASHED');
  assert.equal(truck.cargoIntegrity, 0);
});
