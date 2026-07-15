import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoad,
  DEFAULT_ROAD_TUNING,
  getVisibleLaneMarkerSpans,
  type RoadTuning,
} from '../../src/game/road.ts';

function tuning(overrides: Partial<RoadTuning> = {}): RoadTuning {
  return { ...DEFAULT_ROAD_TUNING, ...overrides };
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
  const road = createRoad(tuning({ laneCount: 5, laneWidthMeters: 4 }));

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
