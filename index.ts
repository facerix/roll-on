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
  // M1.3 playable checkpoint: world-space articulated truck motion projected
  // as separate rotated cab and trailer placeholders on a blank canvas.
  const gameRoot = h('main', { id: 'game-root', style: 'background:#000;' });
  document.body.appendChild(gameRoot);

  const width = 320;
  const height = 480;
  const cabWidth = 20;
  const cabHeight = 28;
  const trailerWidth = 18;
  const trailerHeight = 42;
  const hitchLength = cabHeight / 2 + trailerHeight / 2 + 3;
  const pixelsPerMeter = 0.75;
  const startingScreenY = height - 100;
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
      // Projection belongs here, outside simulation. Positive world distance
      // travels upward on screen; positive heading rotates clockwise/right.
      const cabCenterX = width / 2 + truck.position.lateralMeters * pixelsPerMeter;
      const cabCenterY = startingScreenY - truck.position.distanceMeters * pixelsPerMeter;
      const trailerCenterX = cabCenterX - Math.sin(truck.trailerHeadingRadians) * hitchLength;
      const trailerCenterY = cabCenterY + Math.cos(truck.trailerHeadingRadians) * hitchLength;
      const colors =
        truck.status === 'crashed'
          ? { cab: '#ff1744', trailer: '#8b0000' }
          : truck.status === 'jackknifed'
            ? { cab: '#ff9500', trailer: '#ff3b30' }
            : { cab: '#f5c542', trailer: '#d29f2b' };

      return {
        clear: '#0c0c2e',
        width,
        height,
        drawables: [
          {
            kind: 'oriented-rect',
            centerX: trailerCenterX,
            centerY: trailerCenterY,
            w: trailerWidth,
            h: trailerHeight,
            rotationRadians: truck.trailerHeadingRadians,
            color: colors.trailer,
          },
          {
            kind: 'oriented-rect',
            centerX: cabCenterX,
            centerY: cabCenterY,
            w: cabWidth,
            h: cabHeight,
            rotationRadians: truck.headingRadians,
            color: colors.cab,
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
