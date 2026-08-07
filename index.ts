import '/components/UpdateNotification.js';
import '/components/TitleScreen.js';
import '/components/DispatchScreen.js';
import type { DispatchSelectEventDetail } from '/components/DispatchScreen.js';
import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import { h } from '/src/domUtils.js';
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
import { createRouteForSession } from '/src/game/sessionRoute.js';
import type { StageRunState } from '/src/game/stageRun.js';

function setupGame(): void {
  const titleScreen = document.querySelector('title-screen');
  const dispatchScreen = document.querySelector('dispatch-screen');
  if (!titleScreen || !dispatchScreen) throw new Error('missing required root elements');

  let activeGame: ReturnType<typeof startRoadGame> | null = null;
  let gameRoot: HTMLElement | null = null;
  let intermission: ReturnType<typeof createChallengeIntermissionView> | null = null;

  const startGame = (session: GameSession): void => {
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
    activeGame = startRoadGame({
      root: gameRoot,
      viewport: measureRoadViewport(),
      route: createRouteForSession(session),
      stageNumber: session.stage.stageNumber,
      initialCargoIntegrity: session.mode === 'challenge' ? session.carryover.cargoIntegrity : 1,
      initialFuelLevel: session.mode === 'challenge' ? session.carryover.fuelLevel : 1,
      onRetry: () => startGame(retrySession(session)),
      onExitToTitle: showTitleScreen,
      onStageResult: state => handleStageResult(session, state),
    });
  };

  function handleStageResult(session: GameSession, state: StageRunState): boolean {
    const terminalSnapshot = state.terminalSnapshot;
    if (terminalSnapshot === null) {
      throw new Error('terminal stage result is missing its snapshot');
    }

    if (session.mode === 'campaign') {
      return false;
    }

    if (state.phase === 'completed') {
      const completed = completeChallengeStage(session, {
        stageScore: terminalSnapshot.score,
        cargoIntegrity: terminalSnapshot.cargoIntegrity,
        fuelLevel: terminalSnapshot.fuelLevel,
        haulCurrencyEarned: 0,
      });
      showChallengeIntermission(completed);
      return true;
    }

    if (state.phase !== 'failed') {
      throw new Error(`unknown terminal stage phase: ${state.phase}`);
    }
    failChallengeRun(session, {
      stageScore: terminalSnapshot.score,
      routeDistanceMeters: terminalSnapshot.routeDistanceMeters,
      cargoIntegrity: terminalSnapshot.cargoIntegrity,
      fuelLevel: terminalSnapshot.fuelLevel,
    });
    return false;
  }

  function showChallengeIntermission(completed: ChallengeSession): void {
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
      onContinue: () => startGame(startNextChallengeStage(completed)),
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

  await serviceWorkerManager.register();
  setupGame();
});
