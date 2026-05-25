import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import '/components/UpdateNotification.js';

function setupTitleScreen(): void {
  const titleScreen = document.getElementById('title-screen');
  if (!titleScreen) return;

  const handleStart = (): void => {
    console.log('[RollOn] Starting game...');
    // TODO: transition from title screen to gameplay
  };

  titleScreen.addEventListener('click', handleStart);

  // Accept keyboard start (Enter/Space already work via role="button", but also arcade-style any-key)
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // Ignore modifier keys and Tab (for accessibility navigation)
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab') return;
      handleStart();
    },
    { once: true }
  );
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
