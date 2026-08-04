import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { detectRigidBodyContact, type RigidBody } from '../../src/game/rigidBody.ts';
import { buildTruckFootprint } from '../../src/game/roadCollision.ts';
import {
  createTruckState,
  getTrailerSwipeHitZone,
  DEFAULT_TRUCK_TUNING,
} from '../../src/game/truck.ts';

/**
 * M5.1 guards. The prototype used one `{ lateralMeters, distanceMeters }` pair
 * for two different spaces: a Cartesian plane for truck integration and a
 * road-relative frame for lanes and progress. Curved roads separate them, so
 * world-space code must not be able to drift back to the ambiguous names.
 */

const WORLD_SPACE_MODULES = [
  'src/game/worldGeometry.ts',
  'src/game/truck.ts',
  'src/game/rigidBody.ts',
  'src/game/roadCollision.ts',
  'src/game/roadCamera.ts',
];

/** Modules that own Cartesian truth and must stay ignorant of the road/route. */
const ROUTE_FREE_MODULES = ['src/game/truck.ts', 'src/game/rigidBody.ts'];

function readModule(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('world-space modules do not use the ambiguous lateral/distance field names', () => {
  for (const relativePath of WORLD_SPACE_MODULES) {
    const source = readModule(relativePath);
    assert.equal(
      /\blateralMeters\b/.test(source),
      false,
      `${relativePath} still refers to lateralMeters`
    );
    assert.equal(
      /\bdistanceMeters\b/.test(source),
      false,
      `${relativePath} still refers to distanceMeters`
    );
  }
});

test('Cartesian modules import no road, route, or traffic concepts', () => {
  for (const relativePath of ROUTE_FREE_MODULES) {
    const source = readModule(relativePath);
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]!);
    for (const specifier of imports) {
      assert.equal(
        /road|route|traffic/i.test(specifier),
        false,
        `${relativePath} imports road-aware module ${specifier}`
      );
    }
    assert.equal(/\blaneIndex\b/.test(source), false, `${relativePath} refers to lane indices`);
  }
});

test('truck world state is expressed as Cartesian world points', () => {
  const truck = createTruckState({
    position: { xMeters: 2.5, yMeters: 100 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_000,
    cargoIntegrity: 1,
    status: 'driving',
  });

  assert.deepEqual(Object.keys(truck.position).sort(), ['xMeters', 'yMeters']);

  const jackknifed = createTruckState({ ...truck, status: 'jackknifed' });
  const hitZone = getTrailerSwipeHitZone(jackknifed, DEFAULT_TRUCK_TUNING);
  assert.ok(hitZone);
  assert.deepEqual(Object.keys(hitZone.segment.start).sort(), ['xMeters', 'yMeters']);
  assert.deepEqual(Object.keys(hitZone.segment.end).sort(), ['xMeters', 'yMeters']);
});

test('truck footprint boxes retain Cartesian orientation', () => {
  const truck = createTruckState({
    position: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_000,
    cargoIntegrity: 1,
    status: 'driving',
  });
  const [cab] = buildTruckFootprint(truck, {
    cabWidthMeters: 2.5,
    cabLengthMeters: 6,
    trailerWidthMeters: 2.6,
    trailerLengthMeters: 14,
    hitchGapMeters: 0.4,
  });

  assert.deepEqual(Object.keys(cab).sort(), [
    'center',
    'headingRadians',
    'lengthMeters',
    'widthMeters',
  ]);
});

test('rigid bodies carry Cartesian position and velocity', () => {
  const body: RigidBody = {
    id: 'a',
    position: { xMeters: 0, yMeters: 0 },
    velocity: { xMetersPerSecond: 0, yMetersPerSecond: 0 },
    headingRadians: 0,
    angularVelocityRadiansPerSecond: 0,
    widthMeters: 2,
    lengthMeters: 4,
    massKilograms: 1_500,
  };
  const overlapping: RigidBody = { ...body, id: 'b', position: { xMeters: 1, yMeters: 0 } };

  assert.deepEqual(Object.keys(body.position).sort(), ['xMeters', 'yMeters']);
  assert.deepEqual(Object.keys(body.velocity).sort(), ['xMetersPerSecond', 'yMetersPerSecond']);

  const contact = detectRigidBodyContact(body, overlapping);
  assert.ok(contact);
  assert.deepEqual(Object.keys(contact.normal).sort(), ['xMeters', 'yMeters']);
  assert.deepEqual(Object.keys(contact.point).sort(), ['xMeters', 'yMeters']);
});
