import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoutePreviewDrawables,
  buildRoutePreviewGeometry,
  DEFAULT_ROUTE_PREVIEW_TUNING,
} from '../../src/game/routePreview.ts';
import { createRoute } from '../../src/game/route.ts';

const FRAME = Object.freeze({ x: 10, y: 20, width: 80, height: 100 });

const CURVED_ROUTE = createRoute({
  origin: { xMeters: -80, yMeters: -120 },
  headingRadians: 0,
  segments: [
    { kind: 'straight', lengthMeters: 40 },
    { kind: 'arc', lengthMeters: 90, curvaturePerMeter: 0.008 },
    { kind: 'arc', lengthMeters: 90, curvaturePerMeter: -0.008 },
    { kind: 'straight', lengthMeters: 60 },
  ],
  constraints: { maximumAbsoluteRoadOffsetMeters: 10, minimumBendRadiusMeters: 100 },
});

test('route preview fits translated curved geometry inside a padded aspect-preserving frame', () => {
  const preview = buildRoutePreviewGeometry({
    route: CURVED_ROUTE,
    distanceAlongRouteMeters: 120,
    frame: FRAME,
    paddingPixels: 8,
    sampleSpacingMeters: 12,
  });

  assert.ok(preview.routePoints.length > CURVED_ROUTE.segments.length);
  for (const point of preview.routePoints) {
    assert.ok(point.x >= 18 && point.x <= 82, `x ${point.x} escaped padded frame`);
    assert.ok(point.y >= 28 && point.y <= 112, `y ${point.y} escaped padded frame`);
  }
  assert.ok(Number.isFinite(preview.pixelsPerMeter));
  assert.ok(preview.pixelsPerMeter > 0);

  const screenStart = preview.routePoints[0]!;
  const screenEnd = preview.routePoints.at(-1)!;
  const worldStart = CURVED_ROUTE.segments[0]!.start;
  const worldEnd = CURVED_ROUTE.segments.at(-1)!.end;
  assert.ok(
    Math.abs(
      Math.hypot(screenEnd.x - screenStart.x, screenEnd.y - screenStart.y) -
        Math.hypot(worldEnd.xMeters - worldStart.xMeters, worldEnd.yMeters - worldStart.yMeters) *
          preview.pixelsPerMeter
    ) < 1e-10
  );
});

test('straight and endpoint-clamped previews stay finite and center their degenerate axis', () => {
  const route = createRoute({
    origin: { xMeters: -30, yMeters: -50 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 200 }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 10, minimumBendRadiusMeters: 100 },
  });
  const beforeStart = buildRoutePreviewGeometry({
    route,
    distanceAlongRouteMeters: -40,
    frame: FRAME,
    paddingPixels: 8,
    sampleSpacingMeters: 25,
  });
  const afterFinish = buildRoutePreviewGeometry({
    route,
    distanceAlongRouteMeters: 240,
    frame: FRAME,
    paddingPixels: 8,
    sampleSpacingMeters: 25,
  });

  assert.ok(beforeStart.routePoints.every(point => point.x === FRAME.x + FRAME.width / 2));
  assert.deepEqual(beforeStart.playerPoint, beforeStart.startPoint);
  assert.deepEqual(afterFinish.playerPoint, afterFinish.finishPoint);
  assert.ok(
    [...beforeStart.routePoints, ...afterFinish.routePoints].every(
      point => Number.isFinite(point.x) && Number.isFinite(point.y)
    )
  );
});

test('route preview is deterministic and includes exact progress in its completed path', () => {
  const options = {
    route: CURVED_ROUTE,
    distanceAlongRouteMeters: 117.5,
    frame: FRAME,
    paddingPixels: 8,
    sampleSpacingMeters: 20,
  } as const;
  const first = buildRoutePreviewGeometry(options);
  const second = buildRoutePreviewGeometry(options);

  assert.deepEqual(second, first);
  assert.deepEqual(first.completedPoints.at(-1), first.playerPoint);
  assert.notDeepEqual(first.playerPoint, first.startPoint);
  assert.notDeepEqual(first.playerPoint, first.finishPoint);
});

test('route preview drawables layer frame, full route, progress, endpoints, and player marker', () => {
  const drawables = buildRoutePreviewDrawables({
    route: CURVED_ROUTE,
    distanceAlongRouteMeters: 120,
    frame: FRAME,
  });

  assert.equal(drawables[0]!.kind, 'rect');
  assert.equal(drawables[1]!.kind, 'rect');
  assert.deepEqual(
    drawables.filter(drawable => drawable.kind === 'polyline').map(drawable => drawable.color),
    [
      DEFAULT_ROUTE_PREVIEW_TUNING.routeShadowColor,
      DEFAULT_ROUTE_PREVIEW_TUNING.routeColor,
      DEFAULT_ROUTE_PREVIEW_TUNING.completedColor,
    ]
  );
  assert.equal(drawables.at(-2)!.kind, 'polygon');
  assert.equal(drawables.at(-1)!.kind, 'polygon');
});

test('route preview rejects invalid presentation bounds instead of emitting corrupt geometry', () => {
  assert.throws(
    () =>
      buildRoutePreviewGeometry({
        route: CURVED_ROUTE,
        distanceAlongRouteMeters: 0,
        frame: { ...FRAME, width: Number.NaN },
        paddingPixels: 8,
        sampleSpacingMeters: 10,
      }),
    TypeError
  );
  assert.throws(
    () =>
      buildRoutePreviewGeometry({
        route: CURVED_ROUTE,
        distanceAlongRouteMeters: 0,
        frame: FRAME,
        paddingPixels: 50,
        sampleSpacingMeters: 10,
      }),
    RangeError
  );
  assert.throws(
    () =>
      buildRoutePreviewGeometry({
        route: CURVED_ROUTE,
        distanceAlongRouteMeters: Number.POSITIVE_INFINITY,
        frame: FRAME,
        paddingPixels: 8,
        sampleSpacingMeters: 10,
      }),
    TypeError
  );
});
