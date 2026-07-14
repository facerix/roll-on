import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import '/components/UpdateNotification.js';
import { h } from '/src/domUtils.js';
import { mountGame } from '/src/game/mount.js';
import type { Scene } from '/src/engine/renderer.js';
import { installTitleScreenStartHandlers } from '/src/game/titleScreen.js';
import {
  createTruckState,
  DEFAULT_TRUCK_TUNING,
  stepTruck,
  type TruckControls,
} from '/src/game/truck.js';

function startSmokeTestGame(): void {
  // M1.2 playable checkpoint: world-space longitudinal truck motion projected
  // onto the blank prototype canvas. Steering intentionally lands in M1.3.
  const gameRoot = h('main', { id: 'game-root', style: 'background:#000;' });
  document.body.appendChild(gameRoot);

  const width = 320;
  const height = 480;
  const truckWidth = 24;
  const truckHeight = 48;
  const pixelsPerMeter = 0.75;
  const startingScreenY = height - truckHeight - 24;
  let truck = createTruckState({
    position: { lateralMeters: 0, distanceMeters: 0 },
    headingRadians: 0,
    speedMetersPerSecond: 0,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
  });

  mountGame({
    root: gameRoot,
    width,
    height,
    update: (dt, input) => {
      const controls: TruckControls = {
        throttle: input.isActive('throttle') ? 1 : 0,
        brake: input.isActive('brake') ? 1 : 0,
        steering: (input.isActive('steerRight') ? 1 : 0) - (input.isActive('steerLeft') ? 1 : 0),
      };
      truck = stepTruck(truck, controls, dt, DEFAULT_TRUCK_TUNING);
    },
    buildScene: (): Scene => {
      // Projection belongs here, outside simulation. Cab heading is zero until
      // M1.3, so forward world distance travels upward on screen.
      const truckScreenX =
        width / 2 - truckWidth / 2 + truck.position.lateralMeters * pixelsPerMeter;
      const truckScreenY = startingScreenY - truck.position.distanceMeters * pixelsPerMeter;

      return {
        clear: '#0c0c2e',
        width,
        height,
        drawables: [
          {
            kind: 'rect',
            x: truckScreenX,
            y: truckScreenY,
            w: truckWidth,
            h: truckHeight,
            color: '#f5c542',
          },
        ],
      };
    },
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
