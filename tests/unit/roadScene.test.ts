import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Drawable, OrientedRectDrawable, RectDrawable } from '../../src/engine/renderer.ts';
import { buildRoadCamera } from '../../src/game/roadCamera.ts';
import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import {
  buildRoadScene,
  DEFAULT_PARALLAX_LAYERS,
  DEFAULT_ROAD_SCENE_TUNING,
  type RoadSceneTruckDimensions,
} from '../../src/game/roadScene.ts';
import { createTruckState, type TruckState } from '../../src/game/truck.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING);
const VIEWPORT = { width: 320, height: 480 };
const CAMERA_TUNING = { pixelsPerMeter: 10, anchorX: 160, anchorY: 360 };
const TRUCK_DIMENSIONS: RoadSceneTruckDimensions = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 4,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: 0.7,
};

function truckAt(distanceMeters: number): TruckState {
  return createTruckState({
    position: { lateralMeters: 0, distanceMeters },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });
}

function sceneFor(truck: TruckState) {
  const camera = buildRoadCamera(truck.position, VIEWPORT, CAMERA_TUNING);
  return buildRoadScene({
    road: ROAD,
    camera,
    truck,
    truckDimensions: TRUCK_DIMENSIONS,
  });
}

function rects(drawables: readonly Drawable[]): RectDrawable[] {
  return drawables.filter((d): d is RectDrawable => d.kind === 'rect');
}

function orientedRects(drawables: readonly Drawable[]): OrientedRectDrawable[] {
  return drawables.filter((d): d is OrientedRectDrawable => d.kind === 'oriented-rect');
}

test('road scene emits drawables in back-to-front order', () => {
  const scene = sceneFor(truckAt(0));
  const colors = scene.drawables.map(drawable => drawable.color);
  const firstShoulderIndex = colors.indexOf(DEFAULT_ROAD_SCENE_TUNING.shoulderColor);

  assert.equal(colors[0], DEFAULT_ROAD_SCENE_TUNING.backgroundColor);
  assert.ok(firstShoulderIndex > 1);
  assert.ok(
    colors
      .slice(1, firstShoulderIndex)
      .every(color => DEFAULT_PARALLAX_LAYERS.some(layer => layer.color === color))
  );
  assert.equal(colors[firstShoulderIndex], DEFAULT_ROAD_SCENE_TUNING.shoulderColor);
  assert.equal(colors[firstShoulderIndex + 1], DEFAULT_ROAD_SCENE_TUNING.shoulderColor);
  assert.equal(colors[firstShoulderIndex + 2], DEFAULT_ROAD_SCENE_TUNING.roadColor);
  assert.equal(colors[firstShoulderIndex + 3], DEFAULT_ROAD_SCENE_TUNING.barrierColor);
  assert.equal(colors[firstShoulderIndex + 4], DEFAULT_ROAD_SCENE_TUNING.barrierColor);
  assert.ok(colors.includes(DEFAULT_ROAD_SCENE_TUNING.laneMarkerColor));
  assert.deepEqual(
    scene.drawables.slice(-2).map(drawable => drawable.kind),
    ['oriented-rect', 'oriented-rect']
  );
});

test('lane marker drawables repeat from world cadence and shift with camera distance', () => {
  const nearScene = sceneFor(truckAt(0));
  const farScene = sceneFor(truckAt(3));

  const nearMarkerYs = rects(nearScene.drawables)
    .filter(drawable => drawable.color === DEFAULT_ROAD_SCENE_TUNING.laneMarkerColor)
    .map(drawable => drawable.y);
  const farMarkerYs = rects(farScene.drawables)
    .filter(drawable => drawable.color === DEFAULT_ROAD_SCENE_TUNING.laneMarkerColor)
    .map(drawable => drawable.y);

  assert.ok(nearMarkerYs.length > 3);
  assert.ok(farMarkerYs.length > 3);
  assert.notDeepEqual(farMarkerYs, nearMarkerYs);
  assert.ok(farMarkerYs.some(y => nearMarkerYs.includes(y - 30)));
});

test('parallax drawables shift with camera distance more slowly than lane markers', () => {
  const nearScene = sceneFor(truckAt(0));
  const farScene = sceneFor(truckAt(10));
  const parallaxColor = DEFAULT_PARALLAX_LAYERS[0]!.color;

  const nearParallaxYs = rects(nearScene.drawables)
    .filter(drawable => drawable.color === parallaxColor)
    .map(drawable => drawable.y);
  const farParallaxYs = rects(farScene.drawables)
    .filter(drawable => drawable.color === parallaxColor)
    .map(drawable => drawable.y);

  assert.ok(nearParallaxYs.length > 0);
  assert.ok(farParallaxYs.length > 0);
  assert.notDeepEqual(farParallaxYs, nearParallaxYs);
  assert.ok(Math.abs(farParallaxYs[0]! - nearParallaxYs[0]!) < 10 * CAMERA_TUNING.pixelsPerMeter);
});

test('road scene drawables remain finite for normal viewport and truck positions', () => {
  const scene = sceneFor(
    createTruckState({
      ...truckAt(128),
      position: { lateralMeters: 3.4, distanceMeters: 128 },
      headingRadians: 0.1,
      trailerHeadingRadians: -0.08,
    })
  );

  for (const drawable of scene.drawables) {
    const values = Object.values(drawable).filter(
      (value): value is number => typeof value === 'number'
    );
    assert.ok(values.length > 0);
    assert.ok(values.every(Number.isFinite));
  }
});

test('truck cab projects to the camera anchor and draws over road', () => {
  const scene = sceneFor(truckAt(42));
  const truckDrawables = orientedRects(scene.drawables);
  const cab = truckDrawables.at(-1)!;

  assert.equal(cab.centerX, CAMERA_TUNING.anchorX);
  assert.equal(cab.centerY, CAMERA_TUNING.anchorY);
  assert.equal(cab.w, TRUCK_DIMENSIONS.cabWidthMeters * CAMERA_TUNING.pixelsPerMeter);
  assert.equal(cab.h, TRUCK_DIMENSIONS.cabLengthMeters * CAMERA_TUNING.pixelsPerMeter);
});
