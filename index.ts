import '/components/UpdateNotification.js';
import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import { h } from '/src/domUtils.js';
import { startRoadGame } from '/src/game/roadGame.js';
import { measureRoadViewport } from '/src/game/roadViewport.js';
import { installTitleScreenStartHandlers } from '/src/game/titleScreen.js';

function setupTitleScreen(): void {
  const titleScreen = document.getElementById('title-screen');
  if (!titleScreen) return;

  installTitleScreenStartHandlers({
    activationTarget: titleScreen,
    keyboardTarget: window,
    onStart: () => {
      console.log('[RollOn] Starting game...');
      titleScreen.remove();
      document.body.classList.add('is-playing');

      const gameRoot = h('main', { id: 'game-root', className: 'roll-on-playfield' });
      document.body.appendChild(gameRoot);
      startRoadGame({ root: gameRoot, viewport: measureRoadViewport() });
    },
  });
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
