import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoad,
  DEFAULT_ROAD_TUNING,
  getVisibleLaneMarkerSpans,
  sampleRoad,
  sampleRoadWindow,
  type RoadTuning,
} from '../../src/game/road.ts';
import { createRoute, type Route } from '../../src/game/route.ts';

function tuning(overrides: Partial<RoadTuning> = {}): RoadTuning {
  return { ...DEFAULT_ROAD_TUNING, ...overrides };
}

function straightRoute(): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 100 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 10, minimumBendRadiusMeters: 30 },
  });
}

function sCurveRoute(): Route {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [
      { kind: 'straight', lengthMeters: 20 },
      { kind: 'arc', lengthMeters: 20, curvaturePerMeter: 0.01 },
      { kind: 'arc', lengthMeters: 20, curvaturePerMeter: -0.01 },
    ],
    constraints: { maximumAbsoluteRoadOffsetMeters: 10, minimumBendRadiusMeters: 30 },
  });
}

test('default road exposes world-space lane, shoulder, and barrier geometry', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING);

  assert.equal(road.laneCount, 4);
  assert.equal(road.laneWidthMeters, 3.7);
  assert.deepEqual(road.laneCenterOffsetsMeters, [-5.55, -1.85, 1.85, 5.55]);
  assert.equal(road.shoulderWidthMeters, 2.5);
  assert.equal(road.leftRoadEdgeMeters, -7.4);
  assert.equal(road.rightRoadEdgeMeters, 7.4);
  assert.equal(road.leftShoulderEdgeMeters, -9.9);
  assert.equal(road.rightShoulderEdgeMeters, 9.9);
  assert.equal(road.leftBarrierLateralMeters, -9.9);
  assert.equal(road.rightBarrierLateralMeters, 9.9);
});

test('lane centers remain symmetric around lateral zero', () => {
  const road = createRoad(
    tuning({ laneCount: 5, laneWidthMeters: 4 }),
    createRoute({
      origin: { xMeters: 0, yMeters: 0 },
      headingRadians: 0,
      segments: [{ kind: 'straight', lengthMeters: 100 }],
      constraints: { maximumAbsoluteRoadOffsetMeters: 13, minimumBendRadiusMeters: 30 },
    })
  );

  assert.deepEqual(road.laneCenterOffsetsMeters, [-8, -4, 0, 4, 8]);
  for (let i = 0; i < road.laneCenterOffsetsMeters.length; i++) {
    const opposite: number =
      road.laneCenterOffsetsMeters[road.laneCenterOffsetsMeters.length - 1 - i]!;
    assert.equal(road.laneCenterOffsetsMeters[i]! + opposite, 0);
  }
});

test('road creation rejects non-finite, negative, and inconsistent tuning', () => {
  assert.throws(() => createRoad(tuning({ laneCount: 0 })), RangeError);
  assert.throws(() => createRoad(tuning({ laneCount: 2.5 })), RangeError);
  assert.throws(() => createRoad(tuning({ laneWidthMeters: Number.NaN })), TypeError);
  assert.throws(() => createRoad(tuning({ shoulderWidthMeters: -1 })), RangeError);
  assert.throws(() => createRoad(tuning({ markerCadenceMeters: 0 })), RangeError);
  assert.throws(
    () => createRoad(tuning({ markerCadenceMeters: 10, markerLengthMeters: 10 })),
    RangeError
  );
});

test('shoulder and barrier bounds derive from lane geometry', () => {
  const road = createRoad(tuning({ laneCount: 2, laneWidthMeters: 4, shoulderWidthMeters: 3 }));

  assert.equal(road.leftRoadEdgeMeters, -4);
  assert.equal(road.rightRoadEdgeMeters, 4);
  assert.equal(road.leftShoulderEdgeMeters, -7);
  assert.equal(road.rightShoulderEdgeMeters, 7);
  assert.equal(road.leftBarrierLateralMeters, -7);
  assert.equal(road.rightBarrierLateralMeters, 7);
});

test('visible lane marker spans repeat from world cadence and clip to interval', () => {
  const road = createRoad(
    tuning({ laneCount: 3, laneWidthMeters: 4, markerCadenceMeters: 10, markerLengthMeters: 4 })
  );

  const spans = getVisibleLaneMarkerSpans(road, {
    startDistanceMeters: 8,
    endDistanceMeters: 23,
  });

  assert.deepEqual(spans, [
    { lateralMeters: -2, startDistanceMeters: 10, endDistanceMeters: 14 },
    { lateralMeters: 2, startDistanceMeters: 10, endDistanceMeters: 14 },
    { lateralMeters: -2, startDistanceMeters: 20, endDistanceMeters: 23 },
    { lateralMeters: 2, startDistanceMeters: 20, endDistanceMeters: 23 },
  ]);
});

test('road model contains no renderer-specific fields', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING);
  const fieldNames = Object.keys(road).join(' ');

  assert.doesNotMatch(fieldNames, /screen|canvas|pixel|sprite|dom/i);
});

test('road samples place every cross-section element in world space', () => {
  const road = createRoad(
    tuning({ laneCount: 2, laneWidthMeters: 4, shoulderWidthMeters: 3 }),
    straightRoute()
  );
  const sample = sampleRoad(road, 25);

  assert.deepEqual(sample.center, { xMeters: 0, yMeters: 25 });
  assert.deepEqual(sample.laneCenters, [
    { xMeters: -2, yMeters: 25 },
    { xMeters: 2, yMeters: 25 },
  ]);
  assert.deepEqual(sample.laneBoundaries, [{ xMeters: 0, yMeters: 25 }]);
  assert.deepEqual(sample.roadEdges, [
    { xMeters: -4, yMeters: 25 },
    { xMeters: 4, yMeters: 25 },
  ]);
  assert.deepEqual(sample.shoulderEdges, [
    { xMeters: -7, yMeters: 25 },
    { xMeters: 7, yMeters: 25 },
  ]);
  assert.deepEqual(sample.barrierEdges, sample.shoulderEdges);
});

test('curved road samples preserve signed offsets and lane ordering', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING, sCurveRoute());
  const sample = sampleRoad(road, 50);

  assert.ok(sample.laneCenters[0]!.xMeters < sample.laneCenters[3]!.xMeters);
  for (const point of [...sample.laneCenters, ...sample.laneBoundaries, ...sample.barrierEdges]) {
    assert.ok(Number.isFinite(point.xMeters) && Number.isFinite(point.yMeters));
  }
  assert.ok(sample.barrierEdges[0]!.xMeters < sample.barrierEdges[1]!.xMeters);
});

test('road window sampling includes endpoints and route joins exactly once', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING, sCurveRoute());
  const samples = sampleRoadWindow(road, { startDistanceMeters: 10, endDistanceMeters: 70 }, 15);
  const distances = samples.map(sample => sample.distanceAlongRouteMeters);

  assert.deepEqual(distances, [10, 20, 30, 40, 55, 70]);
});

test('road rejects a route whose curvature bounds are narrower than its barriers', () => {
  const route = createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'arc', lengthMeters: 10, curvaturePerMeter: 0.02 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 9, minimumBendRadiusMeters: 30 },
  });

  assert.throws(() => createRoad(DEFAULT_ROAD_TUNING, route), RangeError);
});

test('road sampling rejects invalid steps and windows', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING, straightRoute());
  assert.throws(
    () => sampleRoadWindow(road, { startDistanceMeters: 0, endDistanceMeters: 10 }, 0),
    RangeError
  );
  assert.throws(
    () => sampleRoadWindow(road, { startDistanceMeters: 10, endDistanceMeters: 0 }, 1),
    RangeError
  );
  assert.throws(() => sampleRoad(road, Number.NaN), TypeError);
});
