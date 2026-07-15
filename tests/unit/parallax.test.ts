import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRoadCamera } from '../../src/game/roadCamera.ts';
import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import {
  buildParallaxBands,
  buildParallaxOffsetMeters,
  DEFAULT_PARALLAX_LAYERS,
  type ParallaxLayerTuning,
} from '../../src/game/roadScene.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING);
const CAMERA_TUNING = { pixelsPerMeter: 10, anchorX: 160, anchorY: 360 };
const VIEWPORT = { width: 320, height: 480 };

function cameraAt(distanceMeters: number) {
  return buildRoadCamera({ lateralMeters: 0, distanceMeters }, VIEWPORT, CAMERA_TUNING);
}

function layer(overrides: Partial<ParallaxLayerTuning> = {}): ParallaxLayerTuning {
  return {
    color: '#123456',
    speedRatio: 0.25,
    cadenceMeters: 20,
    bandLengthMeters: 6,
    bandWidthMeters: 2,
    lateralGapMeters: 1,
    ...overrides,
  };
}

test('parallax offsets are pure functions of camera distance and layer speed', () => {
  const tuned = layer({ speedRatio: 0.25, cadenceMeters: 20 });

  assert.equal(buildParallaxOffsetMeters(40, tuned), 10);
  assert.equal(buildParallaxOffsetMeters(88, tuned), 2);
  assert.equal(buildParallaxOffsetMeters(88, { ...tuned, speedRatio: 0.5 }), 4);
});

test('parallax layer speeds are validated and cannot reverse or outrun foreground', () => {
  assert.throws(() => buildParallaxOffsetMeters(10, layer({ speedRatio: -0.01 })), RangeError);
  assert.throws(() => buildParallaxOffsetMeters(10, layer({ speedRatio: 1 })), RangeError);
  assert.throws(() => buildParallaxOffsetMeters(10, layer({ speedRatio: Number.NaN })), TypeError);
});

test('background scene data is deterministic for the same camera snapshot', () => {
  const camera = cameraAt(128);
  const a = buildParallaxBands({ camera, road: ROAD, layers: DEFAULT_PARALLAX_LAYERS });
  const b = buildParallaxBands({ camera, road: ROAD, layers: DEFAULT_PARALLAX_LAYERS });

  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
});

test('parallax bands stay outside the road body and leave road state untouched', () => {
  const before = structuredClone(ROAD);
  const bands = buildParallaxBands({
    camera: cameraAt(42),
    road: ROAD,
    layers: [layer({ lateralGapMeters: 1.5, bandWidthMeters: 2 })],
  });

  assert.deepEqual(ROAD, before);
  assert.ok(bands.length > 0);
  assert.ok(
    bands.every(
      band =>
        band.rightLateralMeters <= ROAD.leftShoulderEdgeMeters ||
        band.leftLateralMeters >= ROAD.rightShoulderEdgeMeters
    )
  );
});
