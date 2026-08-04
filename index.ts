import '/components/UpdateNotification.js';
import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import { h } from '/src/domUtils.js';
import { startRoadGame } from '/src/game/roadGame.js';
import { measureRoadViewport } from '/src/game/roadViewport.js';
import { installTitleScreenStartHandlers } from '/src/game/titleScreen.js';

function setupTitleScreen(): void {
  let activeGame: ReturnType<typeof startRoadGame> | null = null;
  let gameRoot: HTMLElement | null = null;
  let disposeTitleHandlers: (() => void) | null = null;

  const startGame = (): void => {
    disposeTitleHandlers?.();
    disposeTitleHandlers = null;
    document.getElementById('title-screen')?.remove();
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

  function showTitleScreen(): void {
    activeGame?.dispose();
    activeGame = null;
    gameRoot?.remove();
    gameRoot = null;
    document.body.classList.remove('is-playing');

    const titleScreen =
      document.getElementById('title-screen') ??
      h('main', { id: 'title-screen', role: 'button', tabIndex: 0, ariaLabel: 'Start game' }, [
        h('p', { id: 'start-hint', textContent: 'Press Start' }),
      ]);
    if (!titleScreen.isConnected) document.body.appendChild(titleScreen);

    disposeTitleHandlers?.();
    disposeTitleHandlers = installTitleScreenStartHandlers({
      activationTarget: titleScreen,
      keyboardTarget: window,
      onStart: startGame,
    });
    titleScreen.focus();
  }

  showTitleScreen();
}

const whenLoaded = customElements.whenDefined('update-notification');

whenLoaded.then(async () => {
  const updateNotification = document.querySelector('update-notification');

  window.addEventListener('sw-update-available', event => {
    console.log('Service worker update available, showing notification');
    updateNotification?.show(event.detail.pendingWorker);
  });

  await serviceWorkerManager.register();
  setupTitleScreen();
});
