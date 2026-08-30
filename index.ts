import '/components/UpdateNotification.js';
import '/components/TitleScreen.js';
import '/components/DispatchScreen.js';
import type { DispatchSelectEventDetail } from '/components/DispatchScreen.js';
import DataStore from '/src/DataStore.js';
import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import { h } from '/src/domUtils.js';
import { buildFinalTally } from '/src/game/finalTally.js';
import {
  completeChallengeStage,
  createGameSession,
  failChallengeRun,
  startNextChallengeStage,
  type ChallengeSession,
  type GameSession,
} from '/src/game/gameSession.js';
import { createChallengeIntermissionView } from '/src/game/challengeIntermissionView.js';
import { startRoadGame } from '/src/game/roadGame.js';
import { measureRoadViewport } from '/src/game/roadViewport.js';
import { createRoadForSession } from '/src/game/sessionRoute.js';
import { buildHighScoreTablePresentation, createRunResult } from '/src/game/runResults.js';
import type { RunTerminalResultDetails } from '/src/game/runTerminalView.js';
import type { StageRunState } from '/src/game/stageRun.js';
import { v4WithTimestamp } from '/src/uuid.js';

function setupGame(): void {
  const titleScreen = document.querySelector('title-screen');
  const dispatchScreen = document.querySelector('dispatch-screen');
  if (!titleScreen || !dispatchScreen) throw new Error('missing required root elements');

  let activeGame: ReturnType<typeof startRoadGame> | null = null;
  let gameRoot: HTMLElement | null = null;
  let intermission: ReturnType<typeof createChallengeIntermissionView> | null = null;

  const startGame = (session: GameSession, resultId: string = v4WithTimestamp()): void => {
    titleScreen?.hide();
    dispatchScreen.hide();
    intermission?.dispose();
    intermission = null;
    activeGame?.dispose();
    gameRoot?.remove();

    console.log('[RollOn] Starting game...');
    document.body.classList.add('is-playing');
    gameRoot = h('main', { id: 'game-root', className: 'roll-on-playfield' });
    document.body.appendChild(gameRoot);
    const sessionRoad = createRoadForSession(session);
    activeGame = startRoadGame({
      root: gameRoot,
      viewport: measureRoadViewport(),
      route: sessionRoad.route,
      pullouts: sessionRoad.pullouts,
      patrolEncounters: sessionRoad.patrolEncounters,
      stageNumber: session.stage.stageNumber,
      ...('trafficSeed' in session.stage ? { trafficSeed: session.stage.trafficSeed } : {}),
      initialCargoIntegrity: session.mode === 'challenge' ? session.carryover.cargoIntegrity : 1,
      initialFuelLevel: session.mode === 'challenge' ? session.carryover.fuelLevel : 1,
      onRetry: () => startGame(retrySession(session)),
      onExitToTitle: showTitleScreen,
      onStageResult: state => handleStageResult(session, state, resultId),
    });
  };

  function handleStageResult(
    session: GameSession,
    state: StageRunState,
    resultId: string
  ): RunTerminalResultDetails | null {
    const terminalSnapshot = state.terminalSnapshot;
    if (terminalSnapshot === null) {
      throw new Error('terminal stage result is missing its snapshot');
    }

    const finalStageTally = buildFinalTally(state);

    if (session.mode === 'campaign') {
      let currentResultId: string | undefined;
      if (state.phase === 'completed') {
        const result = createRunResult({
          id: resultId,
          completedAt: new Date().toISOString(),
          session,
          terminalState: state,
          finalStageTally,
        });
        DataStore.addRunResult(result);
        currentResultId = result.id;
      }
      return {
        score: finalStageTally.total,
        finalStageTally,
        highScores: buildHighScoreTablePresentation(
          DataStore.items,
          session.scoreChannel,
          currentResultId
        ),
      };
    }

    if (state.phase === 'completed') {
      const completed = completeChallengeStage(session, {
        stageScore: finalStageTally.total,
        cargoIntegrity: terminalSnapshot.cargoIntegrity,
        fuelLevel: terminalSnapshot.fuelLevel,
        haulCurrencyEarned: 0,
      });
      showChallengeIntermission(completed, resultId);
      return null;
    }

    if (state.phase !== 'failed') {
      throw new Error(`unknown terminal stage phase: ${state.phase}`);
    }
    const failed = failChallengeRun(session, {
      stageScore: finalStageTally.total,
      routeDistanceMeters: terminalSnapshot.routeDistanceMeters,
      cargoIntegrity: terminalSnapshot.cargoIntegrity,
      fuelLevel: terminalSnapshot.fuelLevel,
    });
    const result = createRunResult({
      id: resultId,
      completedAt: new Date().toISOString(),
      session: failed,
      terminalState: state,
      finalStageTally,
    });
    DataStore.addRunResult(result);
    return {
      score: result.score,
      finalStageTally,
      highScores: buildHighScoreTablePresentation(DataStore.items, failed.scoreChannel, result.id),
    };
  }

  function showChallengeIntermission(completed: ChallengeSession, resultId: string): void {
    activeGame?.dispose();
    activeGame = null;
    gameRoot?.remove();
    gameRoot = null;
    intermission?.dispose();
    intermission = createChallengeIntermissionView({
      completedStageNumber: completed.stage.stageNumber,
      nextStageNumber: completed.stage.stageNumber + 1,
      cumulativeScore: completed.cumulativeScore,
      cargoIntegrity: completed.carryover.cargoIntegrity,
      fuelLevel: completed.carryover.fuelLevel,
      onContinue: () => startGame(startNextChallengeStage(completed), resultId),
      onExitToTitle: showTitleScreen,
    });
    document.body.appendChild(intermission.root);
    intermission.show();
  }

  function retrySession(session: GameSession): GameSession {
    if (session.mode === 'campaign') return session;
    return createChallengeRun();
  }

  function createChallengeRun(): ChallengeSession {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    if (seed === undefined) throw new Error('failed to create Challenge run seed');
    return createGameSession({ mode: 'challenge', runSeed: seed });
  }

  function showDispatchScreen(): void {
    titleScreen?.hide();
    dispatchScreen?.setHighScores({
      campaign: buildHighScoreTablePresentation(DataStore.items, 'campaign'),
      challenge: buildHighScoreTablePresentation(DataStore.items, 'challenge'),
    });
    dispatchScreen?.show();
    dispatchScreen?.focus();
  }

  function showTitleScreen(): void {
    intermission?.dispose();
    intermission = null;
    activeGame?.dispose();
    activeGame = null;
    gameRoot?.remove();
    gameRoot = null;
    document.body.classList.remove('is-playing');
    dispatchScreen?.hide();

    titleScreen?.show();
    titleScreen?.focus();
  }

  titleScreen.addEventListener('title-select', () => {
    showDispatchScreen();
  });

  dispatchScreen.addEventListener('dispatch-select', event => {
    const { mode } = (event as CustomEvent<DispatchSelectEventDetail>).detail;
    if (mode === 'campaign') {
      startGame(
        createGameSession({
          mode: 'campaign',
          stageId: 'interstate-80',
          routeId: 'stage-1-authored-v1',
        })
      );
      return;
    }
    startGame(createChallengeRun());
  });
  dispatchScreen.addEventListener('dispatch-back', showTitleScreen);

  showTitleScreen();
}

const whenLoaded = Promise.all([
  customElements.whenDefined('update-notification'),
  customElements.whenDefined('title-screen'),
  customElements.whenDefined('dispatch-screen'),
]);

whenLoaded.then(async () => {
  const updateNotification = document.querySelector('update-notification');

  window.addEventListener('sw-update-available', event => {
    console.log('Service worker update available, showing notification');
    updateNotification?.show(event.detail.pendingWorker);
  });

  await DataStore.init();
  await serviceWorkerManager.register();
  setupGame();
});
