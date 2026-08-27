import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultStageRoute,
  createRoad,
  DEFAULT_ROAD_TUNING,
  getBarrierLateralMeters,
  STAGE_1_ROAD_PULLOUTS,
  STAGE_1_ROUTE_SECTIONS,
  STAGE_1_SPEED_TRAP_DISTANCE_METERS,
} from '../../src/game/road.ts';
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

test('Stage 1 posts one right-side speed-trap pullout readable before the trap line', () => {
  assert.equal(STAGE_1_ROAD_PULLOUTS.length, 1);
  const pullout = STAGE_1_ROAD_PULLOUTS[0]!;
  const precedingStraightStartMeters = 625;

  assert.equal(pullout.side, 'right');
  assert.equal(STAGE_1_SPEED_TRAP_DISTANCE_METERS, 700);
  assert.ok(
    pullout.startDistanceMeters >= precedingStraightStartMeters,
    `the opening must begin inside the preceding straight, got ${pullout.startDistanceMeters} m`
  );
  assert.ok(pullout.startDistanceMeters < STAGE_1_SPEED_TRAP_DISTANCE_METERS);
  assert.ok(
    pullout.startDistanceMeters + pullout.taperMeters <= STAGE_1_SPEED_TRAP_DISTANCE_METERS,
    'the cruiser must sit at full apron depth by the trap line'
  );
  assert.ok(
    pullout.endDistanceMeters - pullout.taperMeters >= STAGE_1_SPEED_TRAP_DISTANCE_METERS,
    'the apron must stay at full depth through the trap line'
  );
  assert.ok(pullout.endDistanceMeters <= 950, 'the pullout must close inside the patrol band');
});

test('the Stage 1 apron physically contains a perpendicular cruiser clear of the lanes', () => {
  const road = createRoad(DEFAULT_ROAD_TUNING, createDefaultStageRoute(), {
    pullouts: STAGE_1_ROAD_PULLOUTS,
  });
  const cruiserLengthMeters = 4.8;
  const clearanceMeters = 0.5;

  const barrierAtTrap = getBarrierLateralMeters(road, 'right', STAGE_1_SPEED_TRAP_DISTANCE_METERS);
  const apronWidthMeters = barrierAtTrap - road.rightRoadEdgeMeters;

  assert.ok(
    apronWidthMeters >= cruiserLengthMeters + 2 * clearanceMeters,
    `a rotated ${cruiserLengthMeters} m cruiser needs room off the lanes, apron is ${apronWidthMeters} m`
  );
  assert.ok(
    road.route.constraints.maximumAbsoluteRoadOffsetMeters >= barrierAtTrap,
    'the authored route must permit the widened outer bound'
  );
  assert.equal(
    getBarrierLateralMeters(road, 'right', 500),
    road.rightBarrierLateralMeters,
    'the rest of Stage 1 keeps its ordinary barrier'
  );
});
