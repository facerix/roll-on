import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameSession } from '../../src/game/gameSession.ts';
import {
  createDefaultStageRoute,
  STAGE_1_PATROL_ENCOUNTERS,
  STAGE_1_ROAD_PULLOUTS,
} from '../../src/game/road.ts';
import { createRoute } from '../../src/game/route.ts';
import { createRoadForSession } from '../../src/game/sessionRoute.ts';

test('Campaign session resolves its authored route identity and road features', () => {
  const session = createGameSession({
    mode: 'campaign',
    stageId: 'interstate-80',
    routeId: 'stage-1-authored-v1',
  });
  const road = createRoadForSession(session);

  assert.deepEqual(road.route, createDefaultStageRoute());
  assert.deepEqual(road.pullouts, STAGE_1_ROAD_PULLOUTS);
  assert.deepEqual(road.patrolEncounters, STAGE_1_PATROL_ENCOUNTERS);
});

test('Challenge session resolves the recorded definition, not a fresh route choice', () => {
  const session = createGameSession({ mode: 'challenge', runSeed: 0x51_51_51 });
  const first = createRoadForSession(session);
  const second = createRoadForSession(session);

  assert.deepEqual(first, second);
  assert.deepEqual(first.route, createRoute(session.stage.routeSource.definition));
});

test('Challenge stages resolve their recorded generated features', () => {
  const session = createGameSession({ mode: 'challenge', runSeed: 0x24_24_24 });
  const road = createRoadForSession(session);

  assert.deepEqual(road.pullouts, session.stage.roadFeatureSource.pullouts);
  assert.deepEqual(road.patrolEncounters, session.stage.roadFeatureSource.patrolEncounters);
  assert.notDeepEqual(road.pullouts, STAGE_1_ROAD_PULLOUTS);
});

test('Challenge road resolution rejects recorded features that do not fit the recorded route', () => {
  const session = createGameSession({ mode: 'challenge', runSeed: 0x70_70_70 });
  const invalid = structuredClone(session);
  (invalid.stage.roadFeatureSource.pullouts[0] as { depthMeters: number }).depthMeters = 40;

  assert.throws(() => createRoadForSession(invalid), /exceeds route constraint/);
});

test('unknown authored route identities fail loudly', () => {
  const session = createGameSession({
    mode: 'campaign',
    stageId: 'interstate-80',
    routeId: 'future-route',
  });

  assert.throws(() => createRoadForSession(session), /unknown Campaign route/);
});
