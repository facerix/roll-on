import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameSession } from '../../src/game/gameSession.ts';
import { createDefaultStageRoute } from '../../src/game/road.ts';
import { createRoute } from '../../src/game/route.ts';
import { createRouteForSession } from '../../src/game/sessionRoute.ts';

test('Campaign session resolves its authored route identity', () => {
  const session = createGameSession({
    mode: 'campaign',
    stageId: 'interstate-80',
    routeId: 'stage-1-authored-v1',
  });

  assert.deepEqual(createRouteForSession(session), createDefaultStageRoute());
});

test('Challenge session resolves the recorded definition, not a fresh route choice', () => {
  const session = createGameSession({ mode: 'challenge', runSeed: 0x51_51_51 });
  const first = createRouteForSession(session);
  const second = createRouteForSession(session);

  assert.deepEqual(first, second);
  assert.deepEqual(first, createRoute(session.stage.routeSource.definition));
});

test('unknown authored route identities fail loudly', () => {
  const session = createGameSession({
    mode: 'campaign',
    stageId: 'interstate-80',
    routeId: 'future-route',
  });

  assert.throws(() => createRouteForSession(session), /unknown Campaign route/);
});
