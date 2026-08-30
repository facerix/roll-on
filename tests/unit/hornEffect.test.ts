import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PolylineDrawable } from '../../src/engine/renderer.ts';
import {
  buildHornEffectDrawables,
  createHornEffect,
  DEFAULT_HORN_EFFECT_TUNING,
  stepHornEffect,
} from '../../src/game/hornEffect.ts';
import { buildRoadCamera } from '../../src/game/roadCamera.ts';
import { createTruckState } from '../../src/game/truck.ts';

const CAMERA = buildRoadCamera(
  { xMeters: 0, yMeters: 100 },
  { width: 320, height: 480 },
  { pixelsPerMeter: 10, anchorX: 160, anchorY: 360 },
  0
);
const TRUCK = createTruckState({
  position: { xMeters: 0, yMeters: 100 },
  headingRadians: 0,
  speedMetersPerSecond: 10,
  yawRateRadiansPerSecond: 0,
  trailerHeadingRadians: 0,
  massKilograms: 36_000,
  cargoIntegrity: 1,
  status: 'driving',
});

function draw(status: 'cleared' | 'cooldown' | 'no-target' | 'blocked', elapsedSeconds: number) {
  return buildHornEffectDrawables({
    snapshot: { status, elapsedSeconds },
    camera: CAMERA,
    truck: TRUCK,
    cabLengthMeters: 5.2,
  }) as readonly PolylineDrawable[];
}

function maximumDistanceFromOrigin(drawables: readonly PolylineDrawable[]): number {
  // Cab front is 2.6 m = 26 px ahead of the camera anchor.
  const origin = { x: CAMERA.anchorX, y: CAMERA.anchorY - 26 };
  return Math.max(
    ...drawables.flatMap(line =>
      line.points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y))
    )
  );
}

test('successful horn use emits three amber wavefronts that expand ahead of the cab', () => {
  const early = draw('cleared', 0.05);
  const later = draw('cleared', 0.3);

  assert.equal(early.length, 3);
  assert.ok(early.every(line => line.kind === 'polyline'));
  assert.ok(early.every(line => line.color.startsWith('rgba(246, 217, 109,')));
  assert.ok(maximumDistanceFromOrigin(later) > maximumDistanceFromOrigin(early));
  assert.ok(later.flatMap(line => line.points).every(point => point.y <= CAMERA.anchorY - 26));
});

test('unsuccessful outcomes share a compact red broken-wave vocabulary', () => {
  for (const status of ['cooldown', 'no-target', 'blocked'] as const) {
    const failed = draw(status, 0.1);
    assert.equal(failed.length, 4, status);
    assert.ok(
      failed.every(line => line.color.startsWith('rgba(255, 95, 31,')),
      status
    );
    assert.ok(
      maximumDistanceFromOrigin(failed) < maximumDistanceFromOrigin(draw('cleared', 0.3)),
      status
    );
  }
});

test('reduced motion holds wave geometry steady while retaining a visible fade', () => {
  const at = (elapsedSeconds: number) =>
    buildHornEffectDrawables({
      snapshot: { status: 'cleared', elapsedSeconds },
      camera: CAMERA,
      truck: TRUCK,
      cabLengthMeters: 5.2,
      reducedMotion: true,
    }) as readonly PolylineDrawable[];

  const early = at(0.05);
  const later = at(0.3);
  assert.deepEqual(
    early.map(line => line.points),
    later.map(line => line.points)
  );
  assert.notDeepEqual(
    early.map(line => line.color),
    later.map(line => line.color)
  );
});

test('effect lifecycle expires success and failure snapshots at their tuned durations', () => {
  const success = createHornEffect('cleared');
  const failure = createHornEffect('blocked');

  assert.deepEqual(success, { status: 'cleared', elapsedSeconds: 0 });
  assert.ok(
    stepHornEffect(success, DEFAULT_HORN_EFFECT_TUNING.successDurationSeconds - 0.01) !== null
  );
  assert.equal(stepHornEffect(success, DEFAULT_HORN_EFFECT_TUNING.successDurationSeconds), null);
  assert.equal(stepHornEffect(failure, DEFAULT_HORN_EFFECT_TUNING.failureDurationSeconds), null);
});

test('rotated camera and truck headings still emit finite screen-space geometry', () => {
  const camera = buildRoadCamera(
    TRUCK.position,
    { width: 320, height: 480 },
    { pixelsPerMeter: 10, anchorX: 160, anchorY: 360 },
    0.4
  );
  const drawables = buildHornEffectDrawables({
    snapshot: createHornEffect('cleared'),
    camera,
    truck: { ...TRUCK, headingRadians: 0.7 },
    cabLengthMeters: 5.2,
  }) as readonly PolylineDrawable[];

  assert.ok(
    drawables.flatMap(line => line.points).every(point => Number.isFinite(point.x + point.y))
  );
});

test('effect rejects idle outcomes and corrupt presentation inputs', () => {
  assert.throws(() => createHornEffect('idle'), /idle/);
  assert.throws(
    () =>
      buildHornEffectDrawables({
        snapshot: { status: 'cleared', elapsedSeconds: Number.NaN },
        camera: CAMERA,
        truck: TRUCK,
        cabLengthMeters: 5.2,
      }),
    /elapsedSeconds/
  );
  assert.throws(() => stepHornEffect(createHornEffect('cleared'), -1), /dtSeconds/);
});
