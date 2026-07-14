import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import '/components/UpdateNotification.js';
import { h } from '/src/domUtils.js';
import { mountGame } from '/src/game/mount.js';
import type { Scene } from '/src/engine/renderer.js';
import { installTitleScreenStartHandlers } from '/src/game/titleScreen.js';

function startSmokeTestGame(): void {
  // Smoke test for M0: a single moving rect driven by arrow keys / WASD.
  // Proves loop + renderer + input + mount are all talking to each other.
  // Will be torn out and replaced with the real game in M1+.
  const gameRoot = h('main', { id: 'game-root', style: 'background:#000;' });
  document.body.appendChild(gameRoot);

  const width = 320;
  const height = 480;
  // Truck-shaped placeholder at world origin.
  const state = { x: width / 2 - 12, y: height / 2 - 24, speed: 180 /* px/s */ };

  mountGame({
    root: gameRoot,
    width,
    height,
    update: (dt, input) => {
      const dx = (input.isActive('steerRight') ? 1 : 0) - (input.isActive('steerLeft') ? 1 : 0);
      const dy = (input.isActive('brake') ? 1 : 0) - (input.isActive('throttle') ? 1 : 0);
      state.x = Math.max(0, Math.min(width - 24, state.x + dx * state.speed * dt));
      state.y = Math.max(0, Math.min(height - 48, state.y + dy * state.speed * dt));
    },
    buildScene: (): Scene => ({
      clear: '#0c0c2e',
      width,
      height,
      drawables: [{ kind: 'rect', x: state.x, y: state.y, w: 24, h: 48, color: '#f5c542' }],
    }),
  });
}

function setupTitleScreen(): void {
  const titleScreen = document.getElementById('title-screen');
  if (!titleScreen) return;

  installTitleScreenStartHandlers({
    activationTarget: titleScreen,
    keyboardTarget: window,
    onStart: () => {
      console.log('[RollOn] Starting game...');
      titleScreen.remove();
      startSmokeTestGame();
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
