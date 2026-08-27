import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameSession } from '../../src/game/gameSession.ts';
import { createDefaultStageRoute, STAGE_1_ROAD_PULLOUTS } from '../../src/game/road.ts';
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
});

test('Challenge session resolves the recorded definition, not a fresh route choice', () => {
  const session = createGameSession({ mode: 'challenge', runSeed: 0x51_51_51 });
  const first = createRoadForSession(session);
  const second = createRoadForSession(session);

  assert.deepEqual(first, second);
  assert.deepEqual(first.route, createRoute(session.stage.routeSource.definition));
});

test('Challenge stages carry no authored Campaign pullout', () => {
  const session = createGameSession({ mode: 'challenge', runSeed: 0x24_24_24 });

  assert.deepEqual(createRoadForSession(session).pullouts, []);
});

test('unknown authored route identities fail loudly', () => {
  const session = createGameSession({
    mode: 'campaign',
    stageId: 'interstate-80',
    routeId: 'future-route',
  });

  assert.throws(() => createRoadForSession(session), /unknown Campaign route/);
});
