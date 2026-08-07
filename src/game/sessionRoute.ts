import { createDefaultStageRoute } from '/src/game/road.js';
import { createRoute, type Route } from '/src/game/route.js';
import type { GameSession } from '/src/game/gameSession.js';

/** Resolve the selected session's persisted route identity into the active compiled route. */
export function createRouteForSession(session: GameSession): Route {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('game session must be an object');
  }

  if (session.mode === 'campaign') {
    if (session.stage.routeSource.routeId !== 'stage-1-authored-v1') {
      throw new RangeError(`unknown Campaign route: ${session.stage.routeSource.routeId}`);
    }
    return createDefaultStageRoute();
  }

  if (session.mode === 'challenge') {
    return createRoute(session.stage.routeSource.definition);
  }

  throw new TypeError(`unknown game session mode: ${String((session as { mode: unknown }).mode)}`);
}
