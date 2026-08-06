import '/components/UpdateNotification.js';
import '/components/TitleScreen.js';
import '/components/DispatchScreen.js';
import type { DispatchSelectEventDetail } from '/components/DispatchScreen.js';
import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import { h } from '/src/domUtils.js';
import { startRoadGame } from '/src/game/roadGame.js';
import { measureRoadViewport } from '/src/game/roadViewport.js';

function setupGame(): void {
  const titleScreen = document.querySelector('title-screen');
  const dispatchScreen = document.querySelector('dispatch-screen');
  if (!titleScreen || !dispatchScreen) throw new Error('missing required root elements');

  let activeGame: ReturnType<typeof startRoadGame> | null = null;
  let gameRoot: HTMLElement | null = null;

  const startGame = (): void => {
    titleScreen?.hide();
    dispatchScreen.hide();
    activeGame?.dispose();
    gameRoot?.remove();

    console.log('[RollOn] Starting game...');
    document.body.classList.add('is-playing');
    gameRoot = h('main', { id: 'game-root', className: 'roll-on-playfield' });
    document.body.appendChild(gameRoot);
    activeGame = startRoadGame({
      root: gameRoot,
      viewport: measureRoadViewport(),
      onRetry: startGame,
      onExitToTitle: showTitleScreen,
    });
  };

  function showDispatchScreen(): void {
    titleScreen?.hide();
    dispatchScreen?.show();
    dispatchScreen?.focus();
  }

  function showTitleScreen(): void {
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
      startGame();
      return;
    }
    // ENDLESS BLACKTOP has no route generator or session wiring yet (M8.3).
    console.log(`[RollOn] Dispatch mode not implemented yet: ${mode}`);
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
