import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoute,
  sampleRoute,
  MAX_ROUTE_LENGTH_METERS,
  type RouteConstraints,
  type RouteDefinition,
  type RouteSegmentDefinition,
} from '../../src/game/route.ts';
import { clockwiseCross, createWorldPoint } from '../../src/game/worldGeometry.ts';

const TOLERANCE_METERS = 1e-9;
const TOLERANCE_RADIANS = 1e-9;

const CONSTRAINTS: RouteConstraints = Object.freeze({
  maximumAbsoluteRoadOffsetMeters: 10,
  minimumBendRadiusMeters: 60,
});

function definition(overrides: Partial<RouteDefinition> = {}): RouteDefinition {
  return {
    origin: createWorldPoint(0, 0),
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters: 100 }],
    constraints: CONSTRAINTS,
    ...overrides,
  };
}

function route(
  segments: readonly RouteSegmentDefinition[],
  overrides: Partial<RouteDefinition> = {}
) {
  return createRoute(definition({ segments, ...overrides }));
}

function assertClose(actual: number, expected: number, tolerance = TOLERANCE_METERS): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

// --- straight segments -------------------------------------------------------

test('a straight route samples centers, unit frames, heading, and zero curvature', () => {
  const straight = route([{ kind: 'straight', lengthMeters: 100 }]);

  for (const distanceMeters of [0, 25, 100]) {
    const sample = sampleRoute(straight, distanceMeters);

    assert.equal(sample.distanceAlongRouteMeters, distanceMeters);
    assertClose(sample.center.xMeters, 0);
    assertClose(sample.center.yMeters, distanceMeters);
    assertClose(sample.tangent.xMeters, 0);
    assertClose(sample.tangent.yMeters, 1);
    assertClose(sample.normal.xMeters, 1);
    assertClose(sample.normal.yMeters, 0);
    assertClose(sample.headingRadians, 0, TOLERANCE_RADIANS);
    assert.equal(sample.curvaturePerMeter, 0);
  }
});

test('a straight route honors its authored origin and heading', () => {
  const straight = route([{ kind: 'straight', lengthMeters: 10 }], {
    origin: createWorldPoint(5, -3),
    headingRadians: Math.PI / 2,
  });

  const sample = sampleRoute(straight, 10);

  assertClose(sample.center.xMeters, 15);
  assertClose(sample.center.yMeters, -3);
  assertClose(sample.tangent.xMeters, 1);
  assertClose(sample.tangent.yMeters, 0);
  // Normal points to the driver's right, which is -y when heading is +x.
  assertClose(sample.normal.xMeters, 0);
  assertClose(sample.normal.yMeters, -1);
});

// --- arc segments ------------------------------------------------------------

test('a positive-curvature arc bends toward +x and matches its analytic quarter circle', () => {
  const radiusMeters = 100;
  const quarterMeters = (Math.PI / 2) * radiusMeters;
  const arc = route([
    { kind: 'arc', lengthMeters: quarterMeters, curvaturePerMeter: 1 / radiusMeters },
  ]);

  const end = sampleRoute(arc, quarterMeters);
  assertClose(end.center.xMeters, radiusMeters);
  assertClose(end.center.yMeters, radiusMeters);
  assertClose(end.headingRadians, Math.PI / 2, TOLERANCE_RADIANS);
  assertClose(end.curvaturePerMeter, 1 / radiusMeters);

  // Every sampled center sits on the circle centered one radius to the right of the start.
  const centerOfCurvature = { xMeters: radiusMeters, yMeters: 0 };
  for (const distanceMeters of [0, 40, 90, quarterMeters]) {
    const sample = sampleRoute(arc, distanceMeters);
    const dx = sample.center.xMeters - centerOfCurvature.xMeters;
    const dy = sample.center.yMeters - centerOfCurvature.yMeters;
    assertClose(Math.hypot(dx, dy), radiusMeters);
  }
});

test('a negative-curvature arc bends toward -x', () => {
  const radiusMeters = 100;
  const quarterMeters = (Math.PI / 2) * radiusMeters;
  const arc = route([
    { kind: 'arc', lengthMeters: quarterMeters, curvaturePerMeter: -1 / radiusMeters },
  ]);

  const end = sampleRoute(arc, quarterMeters);
  assertClose(end.center.xMeters, -radiusMeters);
  assertClose(end.center.yMeters, radiusMeters);
  assertClose(end.headingRadians, -Math.PI / 2, TOLERANCE_RADIANS);
});

test('a half-circle arc returns to its starting lateral axis', () => {
  const radiusMeters = 100;
  const halfMeters = Math.PI * radiusMeters;
  const arc = route([
    { kind: 'arc', lengthMeters: halfMeters, curvaturePerMeter: 1 / radiusMeters },
  ]);

  const end = sampleRoute(arc, halfMeters);
  assertClose(end.center.xMeters, 2 * radiusMeters);
  assertClose(end.center.yMeters, 0);
  assertClose(Math.abs(end.headingRadians), Math.PI, 1e-9);
});

// --- chaining ----------------------------------------------------------------

test('consecutive segments share an endpoint and a tangent', () => {
  const chained = route([
    { kind: 'straight', lengthMeters: 50 },
    { kind: 'arc', lengthMeters: 80, curvaturePerMeter: 0.004 },
    { kind: 'straight', lengthMeters: 40 },
    { kind: 'arc', lengthMeters: 80, curvaturePerMeter: -0.004 },
  ]);

  for (const segment of chained.segments) {
    const atStart = sampleRoute(chained, segment.startDistanceMeters);
    const atEnd = sampleRoute(chained, segment.endDistanceMeters);

    assertClose(atStart.center.xMeters, segment.start.xMeters);
    assertClose(atStart.center.yMeters, segment.start.yMeters);
    assertClose(atEnd.center.xMeters, segment.end.xMeters);
    assertClose(atEnd.center.yMeters, segment.end.yMeters);
  }

  for (let i = 1; i < chained.segments.length; i++) {
    const previous = chained.segments[i - 1]!;
    const current = chained.segments[i]!;

    assert.equal(previous.endDistanceMeters, current.startDistanceMeters);
    assertClose(previous.end.xMeters, current.start.xMeters);
    assertClose(previous.end.yMeters, current.start.yMeters);
    assertClose(
      Math.cos(previous.endHeadingRadians - current.startHeadingRadians),
      1,
      TOLERANCE_RADIANS
    );
  }
});

test('a left arc followed by an equal right arc produces a deterministic shallow S-curve', () => {
  const curvaturePerMeter = 0.004;
  const armMeters = 120;
  const sCurve = route([
    { kind: 'arc', lengthMeters: armMeters, curvaturePerMeter: -curvaturePerMeter },
    { kind: 'arc', lengthMeters: armMeters, curvaturePerMeter },
  ]);

  const middle = sampleRoute(sCurve, armMeters);
  const end = sampleRoute(sCurve, 2 * armMeters);

  // The bend peaks at the join and unwinds to the original heading.
  assertClose(middle.headingRadians, -curvaturePerMeter * armMeters, TOLERANCE_RADIANS);
  assertClose(end.headingRadians, 0, TOLERANCE_RADIANS);
  // Net lateral displacement is to the left, and the route keeps advancing.
  assert.ok(end.center.xMeters < middle.center.xMeters);
  assert.ok(end.center.yMeters > middle.center.yMeters);
  assertClose(sCurve.totalLengthMeters, 2 * armMeters);

  // Same definition, same numbers.
  const twin = route([
    { kind: 'arc', lengthMeters: armMeters, curvaturePerMeter: -curvaturePerMeter },
    { kind: 'arc', lengthMeters: armMeters, curvaturePerMeter },
  ]);
  assert.deepEqual(sampleRoute(twin, 2 * armMeters), end);
});

// --- frames ------------------------------------------------------------------

test('tangent and normal stay unit length, perpendicular, and right-handed', () => {
  const sCurve = route([
    { kind: 'straight', lengthMeters: 30 },
    { kind: 'arc', lengthMeters: 120, curvaturePerMeter: 0.008 },
    { kind: 'arc', lengthMeters: 120, curvaturePerMeter: -0.008 },
  ]);

  for (let distanceMeters = -20; distanceMeters <= 300; distanceMeters += 7.5) {
    const sample = sampleRoute(sCurve, distanceMeters);

    assert.ok(Number.isFinite(sample.center.xMeters));
    assert.ok(Number.isFinite(sample.center.yMeters));
    assertClose(Math.hypot(sample.tangent.xMeters, sample.tangent.yMeters), 1);
    assertClose(Math.hypot(sample.normal.xMeters, sample.normal.yMeters), 1);
    assertClose(
      sample.tangent.xMeters * sample.normal.xMeters +
        sample.tangent.yMeters * sample.normal.yMeters,
      0
    );
    // The normal is always the tangent turned toward the driver's right.
    assertClose(clockwiseCross(sample.tangent, sample.normal), 1);
    assertClose(sample.tangent.xMeters, Math.sin(sample.headingRadians));
    assertClose(sample.tangent.yMeters, Math.cos(sample.headingRadians));
  }
});

// --- segment lookup ----------------------------------------------------------

test('segment lookup is deterministic at boundaries and reports the upcoming curvature', () => {
  const chained = route([
    { kind: 'straight', lengthMeters: 50 },
    { kind: 'arc', lengthMeters: 80, curvaturePerMeter: 0.004 },
  ]);

  // A boundary distance belongs to the segment that starts there.
  assert.equal(sampleRoute(chained, 50).curvaturePerMeter, 0.004);
  assert.equal(sampleRoute(chained, 49.999999).curvaturePerMeter, 0);
  // The final segment owns its own end.
  assert.equal(sampleRoute(chained, 130).curvaturePerMeter, 0.004);
  assert.deepEqual(sampleRoute(chained, 50), sampleRoute(chained, 50));
});

// --- continuation outside the authored range --------------------------------

test('straight continuation before and after authored geometry preserves the endpoint tangent', () => {
  const radiusMeters = 125;
  const quarterMeters = (Math.PI / 2) * radiusMeters;
  const arc = route([
    { kind: 'arc', lengthMeters: quarterMeters, curvaturePerMeter: 1 / radiusMeters },
  ]);

  const before = sampleRoute(arc, -40);
  assertClose(before.center.xMeters, 0);
  assertClose(before.center.yMeters, -40);
  assertClose(before.headingRadians, 0, TOLERANCE_RADIANS);
  assert.equal(before.curvaturePerMeter, 0);

  const end = sampleRoute(arc, quarterMeters);
  const after = sampleRoute(arc, quarterMeters + 60);
  assertClose(after.center.xMeters, end.center.xMeters + 60);
  assertClose(after.center.yMeters, end.center.yMeters);
  assertClose(after.headingRadians, Math.PI / 2, TOLERANCE_RADIANS);
  assert.equal(after.curvaturePerMeter, 0);
});

// --- immutability ------------------------------------------------------------

test('compiled routes are frozen and sampling does not mutate them', () => {
  const source = definition({
    segments: [
      { kind: 'straight', lengthMeters: 50 },
      { kind: 'arc', lengthMeters: 80, curvaturePerMeter: 0.004 },
    ],
  });
  const compiled = createRoute(source);
  const snapshot = JSON.stringify(compiled);

  assert.ok(Object.isFrozen(compiled));
  assert.ok(Object.isFrozen(compiled.segments));
  for (const segment of compiled.segments) {
    assert.ok(Object.isFrozen(segment));
  }

  sampleRoute(compiled, 0);
  sampleRoute(compiled, 65);
  sampleRoute(compiled, 1000);
  assert.equal(JSON.stringify(compiled), snapshot);
  assert.ok(Object.isFrozen(sampleRoute(compiled, 65)));
});

test('mutating the definition after compilation does not change the route', () => {
  const segments: RouteSegmentDefinition[] = [{ kind: 'straight', lengthMeters: 50 }];
  const compiled = createRoute(definition({ segments }));

  segments.push({ kind: 'straight', lengthMeters: 999 });

  assert.equal(compiled.segments.length, 1);
  assert.equal(compiled.totalLengthMeters, 50);
});

// --- validation --------------------------------------------------------------

test('route definitions reject empty segment lists', () => {
  assert.throws(() => createRoute(definition({ segments: [] })), RangeError);
});

test('route definitions reject non-positive and non-finite segment lengths', () => {
  for (const lengthMeters of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => route([{ kind: 'straight', lengthMeters }]),
      (error: unknown) => {
        assert.ok(error instanceof RangeError || error instanceof TypeError);
        return true;
      }
    );
  }
});

test('route definitions reject non-finite origins and headings', () => {
  assert.throws(
    () => createRoute(definition({ origin: { xMeters: Number.NaN, yMeters: 0 } })),
    TypeError
  );
  assert.throws(() => createRoute(definition({ headingRadians: Number.NaN })), TypeError);
});

test('an arc must declare non-zero curvature so straights stay explicit', () => {
  assert.throws(() => route([{ kind: 'arc', lengthMeters: 50, curvaturePerMeter: 0 }]), /straight/);
  assert.throws(
    () => route([{ kind: 'arc', lengthMeters: 50, curvaturePerMeter: Number.NaN }]),
    TypeError
  );
});

test('an unknown segment kind fails loudly', () => {
  assert.throws(
    () => route([{ kind: 'spiral', lengthMeters: 50 } as unknown as RouteSegmentDefinition]),
    /spiral/
  );
});

test('curvature that folds the road edge through the curve center is rejected', () => {
  // Radius 10 m equals the maximum road offset: the inner edge collapses onto the center.
  assert.throws(
    () => route([{ kind: 'arc', lengthMeters: 5, curvaturePerMeter: 1 / 10 }]),
    /curvaturePerMeter/
  );
  assert.throws(
    () => route([{ kind: 'arc', lengthMeters: 5, curvaturePerMeter: -1 / 5 }]),
    /curvaturePerMeter/
  );
});

test('curvature tighter than the authored minimum bend radius is rejected', () => {
  // Geometrically valid (radius 30 m > 10 m of road) but unplayable for an 18-wheeler.
  assert.throws(
    () => route([{ kind: 'arc', lengthMeters: 20, curvaturePerMeter: 1 / 30 }]),
    /minimumBendRadiusMeters/
  );
  assert.doesNotThrow(() => route([{ kind: 'arc', lengthMeters: 20, curvaturePerMeter: 1 / 60 }]));
});

test('route constraints must be finite, positive, and mutually consistent', () => {
  const bad = (constraints: Partial<RouteConstraints>) =>
    createRoute(
      definition({ constraints: { ...CONSTRAINTS, ...constraints } as RouteConstraints })
    );

  assert.throws(() => bad({ maximumAbsoluteRoadOffsetMeters: 0 }), RangeError);
  assert.throws(() => bad({ maximumAbsoluteRoadOffsetMeters: Number.NaN }), TypeError);
  assert.throws(() => bad({ minimumBendRadiusMeters: -1 }), RangeError);
  // A gameplay bound looser than the geometric bound would be a silent lie.
  assert.throws(() => bad({ minimumBendRadiusMeters: 10 }), RangeError);
});

test('accumulated route length beyond the safe maximum is rejected', () => {
  assert.throws(
    () =>
      route([
        { kind: 'straight', lengthMeters: MAX_ROUTE_LENGTH_METERS },
        { kind: 'straight', lengthMeters: 1 },
      ]),
    RangeError
  );
  assert.doesNotThrow(() => route([{ kind: 'straight', lengthMeters: MAX_ROUTE_LENGTH_METERS }]));
});

test('sampling rejects non-finite distances', () => {
  const straight = route([{ kind: 'straight', lengthMeters: 50 }]);
  for (const distanceMeters of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => sampleRoute(straight, distanceMeters), TypeError);
  }
});
