import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDefaultStageRoute } from '../../src/game/road.ts';
import {
  buildRouteFollowerSteering,
  DEFAULT_ROUTE_FOLLOWER_TUNING,
  isDebugRouteFollowerEnabled,
} from '../../src/game/routeFollower.ts';

const ROUTE = createDefaultStageRoute();

test('an aligned truck on a straight needs no route-following steering', () => {
  assert.equal(
    buildRouteFollowerSteering({
      route: ROUTE,
      routeDistanceMeters: 100,
      lateralOffsetMeters: 0,
      headingRadians: 0,
    }),
    0
  );
});

test('lookahead begins steering into an upcoming bend before the truck reaches it', () => {
  const steering = buildRouteFollowerSteering({
    route: ROUTE,
    routeDistanceMeters: 315,
    lateralOffsetMeters: 0,
    headingRadians: 0,
  });

  assert.ok(
    steering > 0,
    `the first positive-curvature sweeper needs right steering, got ${steering}`
  );
});

test('lateral error steers back toward the route center', () => {
  const fromRight = buildRouteFollowerSteering({
    route: ROUTE,
    routeDistanceMeters: 100,
    lateralOffsetMeters: 4,
    headingRadians: 0,
  });
  const fromLeft = buildRouteFollowerSteering({
    route: ROUTE,
    routeDistanceMeters: 100,
    lateralOffsetMeters: -4,
    headingRadians: 0,
  });

  assert.ok(fromRight < 0);
  assert.ok(fromLeft > 0);
});

test('route-following steering is bounded and rejects corrupt tuning or frames', () => {
  assert.equal(
    buildRouteFollowerSteering({
      route: ROUTE,
      routeDistanceMeters: 100,
      lateralOffsetMeters: 100,
      headingRadians: 0,
    }),
    -1
  );
  assert.throws(
    () =>
      buildRouteFollowerSteering({
        route: ROUTE,
        routeDistanceMeters: Number.NaN,
        lateralOffsetMeters: 0,
        headingRadians: 0,
      }),
    /routeDistanceMeters/
  );
  assert.throws(
    () =>
      buildRouteFollowerSteering(
        { route: ROUTE, routeDistanceMeters: 100, lateralOffsetMeters: 0, headingRadians: 0 },
        { ...DEFAULT_ROUTE_FOLLOWER_TUNING, lookaheadMeters: 0 }
      ),
    /lookaheadMeters/
  );
});

test('route following is gated behind both explicit debug URL flags', () => {
  assert.equal(isDebugRouteFollowerEnabled('?debug&routeFollow=1'), true);
  assert.equal(isDebugRouteFollowerEnabled('?debug'), false);
  assert.equal(isDebugRouteFollowerEnabled('?routeFollow=1'), false);
  assert.equal(isDebugRouteFollowerEnabled(''), false);
});
