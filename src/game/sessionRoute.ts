import {
  createDefaultStageRoute,
  STAGE_1_PATROL_ENCOUNTERS,
  STAGE_1_ROAD_PULLOUTS,
  type RoadPullout,
} from '/src/game/road.js';
import type { PatrolEncounterDefinition } from '/src/game/patrolEncounter.js';
import { createRoute, type Route } from '/src/game/route.js';
import type { GameSession } from '/src/game/gameSession.js';

/** The compiled geometry plus the authored road features one stage drives on. */
export interface SessionRoad {
  readonly route: Route;
  readonly pullouts: readonly RoadPullout[];
  readonly patrolEncounters: readonly PatrolEncounterDefinition[];
}

/** Resolve the selected session's persisted route identity into its active road. */
export function createRoadForSession(session: GameSession): SessionRoad {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('game session must be an object');
  }

  if (session.mode === 'campaign') {
    if (session.stage.routeSource.routeId !== 'stage-1-authored-v1') {
      throw new RangeError(`unknown Campaign route: ${session.stage.routeSource.routeId}`);
    }
    return {
      route: createDefaultStageRoute(),
      pullouts: STAGE_1_ROAD_PULLOUTS,
      patrolEncounters: STAGE_1_PATROL_ENCOUNTERS,
    };
  }

  if (session.mode === 'challenge') {
    // Generated stages author no road features yet; their trap geometry and
    // seeded enforcement arrive with the Challenge encounter slice.
    return {
      route: createRoute(session.stage.routeSource.definition),
      pullouts: [],
      patrolEncounters: [],
    };
  }

  throw new TypeError(`unknown game session mode: ${String((session as { mode: unknown }).mode)}`);
}
