import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAL_MAX_ANGLE_DEGREES,
  DIAL_MIN_ANGLE_DEGREES,
  buildGameHudSnapshot,
  formatDistanceMeters,
  formatElapsedTime,
  mapSpeedToDialAngleDegrees,
  resolveCargoIntegritySeverity,
  type GameHudRunStats,
} from '../../src/game/gameHud.ts';
import { createFuelState } from '../../src/game/fuel.ts';
import { createTruckState, DEFAULT_TRUCK_TUNING, type TruckState } from '../../src/game/truck.ts';

function truck(overrides: Partial<TruckState> = {}): TruckState {
  return createTruckState({
    position: { xMeters: 1.2, yMeters: -73 },
    headingRadians: 0,
    speedMetersPerSecond: 31.2928,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 0.876,
    status: 'driving',
    ...overrides,
  });
}

function runStats(overrides: Partial<GameHudRunStats> = {}): GameHudRunStats {
  return {
    score: 12_345,
    takedowns: 4,
    eventText: 'ROAD RAGE -250',
    routeDistanceMeters: 402.33,
    routeLengthMeters: 1_320,
    elapsedRunSeconds: 125.9,
    stageNumber: 1,
    unitSystem: 'imperial',
    isStageComplete: false,
    isCruiseActive: true,
    cruiseTargetSpeedMetersPerSecond: 25,
    ...overrides,
  };
}

test('game HUD snapshot exposes formatted values and bounded instrument inputs', () => {
  assert.deepEqual(
    buildGameHudSnapshot(
      truck(),
      DEFAULT_TRUCK_TUNING,
      createFuelState({ level: 0.42 }),
      undefined,
      runStats()
    ),
    {
      unitSystem: 'imperial',
      speedText: '70',
      speedUnitText: 'MPH',
      speedMetersPerSecondText: '31.3 m/s',
      isCruiseActive: true,
      cruiseSpeedText: '56',
      speedLevel: 0.78232,
      cruiseSpeedLevel: 0.625,
      cargoIntegrityText: '88%',
      cargoIntegrityLevel: 0.876,
      cargoIntegritySeverity: 'intact',
      fuelPercentText: '42%',
      fuelLevel: 0.42,
      isFuelInFumes: false,
      fuelStatusText: 'FUEL',
      distanceTraveledText: '0.2 mi',
      distanceRemainingText: '0.6 mi',
      routeProgress: 402.33 / 1_320,
      routeProgressText: '30%',
      elapsedTimeText: '02:05',
      stageText: 'STAGE 1',
      statusText: 'EVENT',
      scoreText: '12,345',
      takedownsText: '4',
      eventText: 'ROAD RAGE -250',
    }
  );
});

test('one unit preference converts both speed and route distance from SI truth', () => {
  const metric = buildGameHudSnapshot(
    truck({ speedMetersPerSecond: 10 }),
    DEFAULT_TRUCK_TUNING,
    createFuelState(),
    undefined,
    runStats({
      unitSystem: 'metric',
      routeDistanceMeters: 1_000,
      routeLengthMeters: 2_200,
      cruiseTargetSpeedMetersPerSecond: 20,
    })
  );

  assert.equal(metric.speedText, '36');
  assert.equal(metric.speedUnitText, 'KM/H');
  assert.equal(metric.cruiseSpeedText, '72');
  assert.equal(metric.distanceTraveledText, '1.0 km');
  assert.equal(metric.distanceRemainingText, '1.2 km');

  assert.equal(formatDistanceMeters(1_609.344, 'imperial'), '1.0 mi');
  assert.equal(formatDistanceMeters(1_000, 'metric'), '1.0 km');
});

test('inactive cruise presents OFF without exposing a stale target or dial marker', () => {
  const inactive = buildGameHudSnapshot(
    truck({ speedMetersPerSecond: 20 }),
    DEFAULT_TRUCK_TUNING,
    createFuelState(),
    undefined,
    runStats({ isCruiseActive: false, cruiseTargetSpeedMetersPerSecond: 25 })
  );

  assert.equal(inactive.isCruiseActive, false);
  assert.equal(inactive.cruiseSpeedText, 'OFF');
  assert.equal(inactive.cruiseSpeedLevel, 0);
});

test('dial mapping is deterministic at rest, cruise, maximum, and overspeed', () => {
  assert.equal(mapSpeedToDialAngleDegrees(0, 40), DIAL_MIN_ANGLE_DEGREES);
  assert.equal(mapSpeedToDialAngleDegrees(20, 40), 0);
  assert.equal(mapSpeedToDialAngleDegrees(40, 40), DIAL_MAX_ANGLE_DEGREES);
  assert.equal(mapSpeedToDialAngleDegrees(50, 40), DIAL_MAX_ANGLE_DEGREES);
});

test('elapsed time uses leading-zero MM:SS and permits minutes beyond 59', () => {
  assert.equal(formatElapsedTime(0), '00:00');
  assert.equal(formatElapsedTime(5.99), '00:05');
  assert.equal(formatElapsedTime(59.99), '00:59');
  assert.equal(formatElapsedTime(60), '01:00');
  assert.equal(formatElapsedTime(3_599.99), '59:59');
  assert.equal(formatElapsedTime(3_600), '60:00');
  assert.equal(formatElapsedTime(6_000), '100:00');
});

test('cargo integrity presentation bands have deterministic boundaries', () => {
  assert.equal(resolveCargoIntegritySeverity(1), 'intact');
  assert.equal(resolveCargoIntegritySeverity(0.6), 'intact');
  assert.equal(resolveCargoIntegritySeverity(0.599), 'damaged');
  assert.equal(resolveCargoIntegritySeverity(0.251), 'damaged');
  assert.equal(resolveCargoIntegritySeverity(0.25), 'critical');
  assert.equal(resolveCargoIntegritySeverity(0), 'critical');
});

test('normalized levels clamp overspeed and route overshoot without changing dial truth', () => {
  const snapshot = buildGameHudSnapshot(
    truck({ speedMetersPerSecond: 48, cargoIntegrity: 0 }),
    DEFAULT_TRUCK_TUNING,
    createFuelState({ level: 0.05 }),
    undefined,
    runStats({
      routeDistanceMeters: 1_350,
      routeLengthMeters: 1_320,
      isStageComplete: true,
      cruiseTargetSpeedMetersPerSecond: 0,
    })
  );

  assert.equal(snapshot.speedLevel, 1);
  assert.equal(snapshot.cruiseSpeedLevel, 0);
  assert.equal(snapshot.cargoIntegrityLevel, 0);
  assert.equal(snapshot.fuelLevel, 0.05);
  assert.equal(snapshot.routeProgress, 1);
  assert.equal(snapshot.distanceRemainingText, '0.0 mi');
  assert.equal(snapshot.isFuelInFumes, true);
  assert.equal(snapshot.statusText, 'STAGE COMPLETE');
});

test('Fumes limits actual speed without rescaling the authored full-speed dial', () => {
  const snapshot = buildGameHudSnapshot(
    truck({ speedMetersPerSecond: 16.8 }),
    DEFAULT_TRUCK_TUNING,
    createFuelState({ level: 0.05 }),
    undefined,
    runStats({ cruiseTargetSpeedMetersPerSecond: 20 })
  );

  assert.equal(snapshot.isFuelInFumes, true);
  assert.ok(Math.abs(snapshot.speedLevel - 0.42) < Number.EPSILON);
  assert.equal(snapshot.cruiseSpeedLevel, 0.5);
});

test('dashboard distance comes from curved-route progress, not Cartesian world y', () => {
  const snapshot = buildGameHudSnapshot(
    truck({ position: { xMeters: 800, yMeters: -900 } }),
    DEFAULT_TRUCK_TUNING,
    createFuelState(),
    undefined,
    runStats({ unitSystem: 'metric', routeDistanceMeters: 750, routeLengthMeters: 2_000 })
  );

  assert.equal(snapshot.distanceTraveledText, '0.8 km');
  assert.equal(snapshot.distanceRemainingText, '1.3 km');
  assert.equal(snapshot.routeProgress, 0.375);
});

test('status priority remains deterministic for overlapping urgent conditions', () => {
  const crashed = truck({ speedMetersPerSecond: 0, cargoIntegrity: 0.25, status: 'crashed' });
  const base = runStats({
    eventText: 'PATROL RAM',
    routeDistanceMeters: 50,
    routeLengthMeters: 100,
  });

  assert.equal(
    buildGameHudSnapshot(
      crashed,
      DEFAULT_TRUCK_TUNING,
      createFuelState({ level: 0.01 }),
      undefined,
      base
    ).statusText,
    'CRASHED'
  );
  assert.equal(
    buildGameHudSnapshot(
      crashed,
      DEFAULT_TRUCK_TUNING,
      createFuelState({ level: 0.01 }),
      undefined,
      { ...base, routeDistanceMeters: 100, isStageComplete: true }
    ).statusText,
    'STAGE COMPLETE'
  );
});

test('game HUD rejects invalid and internally inconsistent presentation inputs', () => {
  assert.throws(
    () =>
      buildGameHudSnapshot(truck(), DEFAULT_TRUCK_TUNING, createFuelState(), undefined, {
        ...runStats(),
        routeLengthMeters: 0,
      }),
    /routeLengthMeters must be positive/
  );
  assert.throws(() => formatElapsedTime(-1), /elapsedRunSeconds must be non-negative/);
  assert.throws(() => formatElapsedTime(Number.NaN), /elapsedRunSeconds must be finite/);
  assert.throws(() => mapSpeedToDialAngleDegrees(-1, 40), /speedMetersPerSecond/);
  assert.throws(() => resolveCargoIntegritySeverity(1.01), /cargoIntegrityLevel/);
  assert.throws(
    () =>
      buildGameHudSnapshot(truck(), DEFAULT_TRUCK_TUNING, createFuelState(), undefined, {
        ...runStats(),
        unitSystem: 'nautical' as GameHudRunStats['unitSystem'],
      }),
    /unitSystem/
  );
  assert.throws(
    () =>
      buildGameHudSnapshot(truck(), DEFAULT_TRUCK_TUNING, createFuelState(), undefined, {
        ...runStats(),
        routeDistanceMeters: 1_000,
        routeLengthMeters: 1_320,
        isStageComplete: true,
      }),
    /completed stage requires route distance/
  );
});
