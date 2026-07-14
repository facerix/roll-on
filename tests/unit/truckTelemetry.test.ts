import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTruckTelemetry, formatTruckTelemetry } from '../../src/game/truckTelemetry.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';

const state = createTruckState({
  position: { lateralMeters: 0, distanceMeters: 0 },
  headingRadians: Math.PI / 6,
  speedMetersPerSecond: 10,
  yawRateRadiansPerSecond: -Math.PI / 12,
  trailerHeadingRadians: Math.PI / 18,
  massKilograms: 36_287,
  cargoIntegrity: 1,
  status: 'jackknifed',
});

test('truck telemetry exposes tuning measurements without presentation state', () => {
  const telemetry = buildTruckTelemetry(state, DEFAULT_TRUCK_TUNING);

  assert.deepEqual(
    { ...telemetry, articulationRadians: 0 },
    {
      speedMetersPerSecond: 10,
      normalizedTopSpeed: 0.25,
      headingRadians: Math.PI / 6,
      yawRateRadiansPerSecond: -Math.PI / 12,
      articulationRadians: 0,
      status: 'jackknifed',
      jackknifeEntryAngleRadians: (12 * Math.PI) / 180,
      jackknifeRecoveryAngleRadians: (7 * Math.PI) / 180,
      jackknifeMinimumSpeedMetersPerSecond: 20,
    }
  );
  assert.ok(Math.abs(telemetry.articulationRadians - (2 * Math.PI) / 18) < 1e-12);
  assert.equal('canvas' in telemetry, false);
  assert.equal('screen' in telemetry, false);
  assert.equal('pixels' in telemetry, false);
});

test('truck telemetry formats compact readable tuning lines', () => {
  assert.deepEqual(formatTruckTelemetry(buildTruckTelemetry(state, DEFAULT_TRUCK_TUNING)), [
    'speed: 10.0 m/s (25%)',
    'cab: 30.0 deg  yaw: -15.0 deg/s',
    'articulation: 20.0 deg',
    'status: jackknifed',
    'jackknife: 12.0 deg enter / 7.0 deg recover @ 20.0 m/s',
  ]);
});

test('truck telemetry normalizes wrapped articulation to the shortest angle', () => {
  const wrapped = createTruckState({
    ...state,
    headingRadians: Math.PI - 0.1,
    trailerHeadingRadians: -Math.PI + 0.1,
  });

  const telemetry = buildTruckTelemetry(wrapped, DEFAULT_TRUCK_TUNING);

  assert.ok(Math.abs(telemetry.articulationRadians + 0.2) < 1e-12);
});
