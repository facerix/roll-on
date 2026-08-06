import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultStageRoute, STAGE_1_ROUTE_SECTIONS } from '../../src/game/road.ts';
import { sampleRoute } from '../../src/game/route.ts';
import { STAGE_1_FINISH_DISTANCE_METERS } from '../../src/game/stageRun.ts';

const EXPECTED_SECTION_BOUNDARIES = [0, 250, 700, 950, 1_200, 1_700, 1_900, 2_200];

test('Stage 1 sections exactly cover the accepted finish distance', () => {
  const sectionBoundaries = [
    0,
    ...STAGE_1_ROUTE_SECTIONS.map(section => section.endDistanceMeters),
  ];

  assert.deepEqual(sectionBoundaries, EXPECTED_SECTION_BOUNDARIES);
  assert.equal(createDefaultStageRoute().totalLengthMeters, STAGE_1_FINISH_DISTANCE_METERS);
});

test('Stage 1 route has intentional direction changes distributed around encounter bands', () => {
  const curvatureSignsBySection = STAGE_1_ROUTE_SECTIONS.map(section =>
    section.segments
      .filter(segment => segment.kind === 'arc')
      .map(segment => Math.sign(segment.curvaturePerMeter))
  );

  assert.deepEqual(
    STAGE_1_ROUTE_SECTIONS.map(section => section.id),
    [
      'launch-and-onboarding',
      'opening-alternating-sweepers',
      'patrol-sightline',
      'technical-lull',
      'mixed-pressure-sweepers',
      'recovery',
      'final-gauntlet',
    ]
  );
  assert.deepEqual(curvatureSignsBySection, [[], [1, -1], [-1], [1, -1], [1, -1], [], [-1, 1]]);
});

test('Stage 1 bends satisfy road constraints and compile to finite continuous geometry', () => {
  const route = createDefaultStageRoute();
  const minimumRadiusMeters = route.constraints.minimumBendRadiusMeters;

  for (const segment of route.segments) {
    if (segment.curvaturePerMeter !== 0) {
      assert.ok(1 / Math.abs(segment.curvaturePerMeter) >= minimumRadiusMeters);
    }

    for (const distance of [segment.startDistanceMeters, segment.endDistanceMeters]) {
      const sample = sampleRoute(route, distance);
      assert.ok(Number.isFinite(sample.center.xMeters));
      assert.ok(Number.isFinite(sample.center.yMeters));
      assert.ok(Number.isFinite(sample.headingRadians));
      assert.ok(Number.isFinite(sample.tangent.xMeters));
      assert.ok(Number.isFinite(sample.tangent.yMeters));
    }
  }

  for (let index = 1; index < route.segments.length; index += 1) {
    const previous = route.segments[index - 1]!;
    const current = route.segments[index]!;
    assert.deepEqual(current.start, previous.end);
    assert.equal(current.startHeadingRadians, previous.endHeadingRadians);
  }
});

test('the final gauntlet is a distinct late challenge rather than an empty straight', () => {
  const finalGauntlet = STAGE_1_ROUTE_SECTIONS.at(-1)!;
  const finalCurvatures = finalGauntlet.segments
    .filter(segment => segment.kind === 'arc')
    .map(segment => Math.abs(segment.curvaturePerMeter));

  assert.equal(
    finalGauntlet.segments.reduce((total, segment) => total + segment.lengthMeters, 0),
    300
  );
  assert.equal(finalGauntlet.segments.at(-1)?.kind, 'arc');
  assert.ok(finalCurvatures.every(curvature => curvature >= 0.006));
});
