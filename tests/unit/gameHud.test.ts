import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGameHudSnapshot } from '../../src/game/gameHud.ts';
import { createFuelState } from '../../src/game/fuel.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING } from '../../src/game/truck.ts';

test('game HUD snapshot formats persistent driving values', () => {
  const truck = createTruckState({
    position: { xMeters: 1.2, yMeters: 402.33 },
    headingRadians: 0,
    speedMetersPerSecond: 31.2928,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 0.876,
    status: 'driving',
  });

  assert.deepEqual(
    buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING, createFuelState({ level: 0.42 }), undefined, {
      score: 12_345,
      takedowns: 4,
      eventText: 'ROAD RAGE -250',
      routeDistanceMeters: 402.33,
      routeLengthMeters: 1_320,
      isStageComplete: false,
      cruiseTargetSpeedMetersPerSecond: 25,
    }),
    {
      speedMphText: '70',
      speedMetersPerSecondText: '31.3 m/s',
      cruiseSpeedMphText: '56',
      cargoIntegrityText: '88%',
      fuelPercentText: '42%',
      fuelLevel: 0.42,
      isFuelInFumes: false,
      fuelStatusText: 'FUEL',
      distanceText: '402 m',
      routeProgressText: '30%',
      statusText: 'EVENT',
      scoreText: '12,345',
      takedownsText: '4',
      eventText: 'ROAD RAGE -250',
    }
  );
});

test('game HUD snapshot clamps display percentages without mutating state', () => {
  const truck = createTruckState({
    position: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 0,
    status: 'crashed',
  });

  const snapshot = buildGameHudSnapshot(
    truck,
    DEFAULT_TRUCK_TUNING,
    createFuelState({ level: 0.05 }),
    undefined,
    {
      score: 0,
      takedowns: 0,
      eventText: '',
      routeDistanceMeters: 0,
      routeLengthMeters: 1,
      isStageComplete: false,
      cruiseTargetSpeedMetersPerSecond: 0,
    }
  );

  assert.equal(snapshot.speedMphText, '0');
  assert.equal(snapshot.cruiseSpeedMphText, '0');
  assert.equal(snapshot.cargoIntegrityText, '0%');
  assert.equal(snapshot.fuelPercentText, '5%');
  assert.equal(snapshot.isFuelInFumes, true);
  assert.equal(snapshot.fuelStatusText, 'FUMES');
  assert.equal(snapshot.routeProgressText, '0%');
  assert.equal(snapshot.statusText, 'CRASHED');
  assert.equal(snapshot.scoreText, '0');
  assert.equal(snapshot.takedownsText, '0');
  assert.equal(snapshot.eventText, '');
  assert.equal(truck.cargoIntegrity, 0);
});

test('game HUD status priority is deterministic for overlapping urgent conditions', () => {
  const truck = createTruckState({
    position: { xMeters: 0, yMeters: 50 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 0.25,
    status: 'crashed',
  });

  const base = {
    score: 0,
    takedowns: 0,
    eventText: 'PATROL RAM',
    routeDistanceMeters: 50,
    routeLengthMeters: 100,
    cruiseTargetSpeedMetersPerSecond: 20,
  };

  assert.equal(
    buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING, createFuelState({ level: 0.01 }), undefined, {
      ...base,
      isStageComplete: false,
    }).statusText,
    'CRASHED'
  );
  assert.equal(
    buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING, createFuelState({ level: 0.01 }), undefined, {
      ...base,
      isStageComplete: true,
    }).statusText,
    'STAGE COMPLETE'
  );
});

test('game HUD rejects corrupt route progress instead of guessing a display value', () => {
  const truck = createTruckState({
    position: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });

  assert.throws(
    () =>
      buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING, createFuelState(), undefined, {
        score: 0,
        takedowns: 0,
        eventText: '',
        routeDistanceMeters: 0,
        routeLengthMeters: 0,
        isStageComplete: false,
        cruiseTargetSpeedMetersPerSecond: 20,
      }),
    /routeLengthMeters must be positive/
  );
});

test('game HUD rejects a cruise target outside the configured truck range', () => {
  const truck = createTruckState({
    position: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });

  assert.throws(
    () =>
      buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING, createFuelState(), undefined, {
        score: 0,
        takedowns: 0,
        eventText: '',
        routeDistanceMeters: 0,
        routeLengthMeters: 100,
        isStageComplete: false,
        cruiseTargetSpeedMetersPerSecond: 41,
      }),
    /cruiseTargetSpeedMetersPerSecond/
  );
});
