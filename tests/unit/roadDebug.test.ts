import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRoadCamera } from '../../src/game/roadCamera.ts';
import { buildRoadDebugDrawables } from '../../src/game/roadDebug.ts';
import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import { createRoute } from '../../src/game/route.ts';

const road = createRoad(
  DEFAULT_ROAD_TUNING,
  createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    constraints: { maximumAbsoluteRoadOffsetMeters: 12, minimumBendRadiusMeters: 40 },
    segments: [
      { kind: 'straight', lengthMeters: 40 },
      { kind: 'arc', lengthMeters: 60, curvaturePerMeter: 0.01 },
    ],
  })
);

test('debug geometry is deterministic, finite, and route-derived', () => {
  const camera = buildRoadCamera(
    { xMeters: 0, yMeters: 50 },
    { width: 800, height: 600 },
    { pixelsPerMeter: 8, anchorX: 400, anchorY: 420 },
    0.2
  );
  const options = {
    road,
    camera,
    window: { startDistanceMeters: 10, endDistanceMeters: 80 },
    maximumStepMeters: 10,
  } as const;
  const first = buildRoadDebugDrawables(options);
  const second = buildRoadDebugDrawables(options);

  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
  for (const drawable of first) {
    assert.equal(drawable.kind, 'polygon');
    for (const point of drawable.points) {
      assert.ok(Number.isFinite(point.x));
      assert.ok(Number.isFinite(point.y));
    }
  }
});
