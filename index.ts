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
import {
  buildRoadCamera,
  DEFAULT_ROAD_CAMERA_TUNING,
  getVisibleWorldDistanceRange,
  projectWorldPoint,
} from '/src/game/roadCamera.js';
import { buildTruckTelemetry, formatTruckTelemetry } from '/src/game/truckTelemetry.js';

function startSmokeTestGame(): void {
  // M2.2 playable checkpoint: world-space articulated truck motion projected
  // through the road camera so the truck stays vertically anchored.
  const gameRoot = h('main', { id: 'game-root', style: 'background:#000;' });
  document.body.appendChild(gameRoot);

  const width = 320;
  const height = 480;
  const viewport = { width, height };
  const cabWidthMeters = 2.6;
  const cabLengthMeters = 4;
  const trailerWidthMeters = DEFAULT_TRUCK_TUNING.trailerWidthMeters;
  const trailerLengthMeters = DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters;
  const hitchLengthMeters = cabLengthMeters / 2 + trailerLengthMeters / 2 + 0.7;
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
    debugLines: () => {
      const camera = buildRoadCamera(truck.position, viewport, DEFAULT_ROAD_CAMERA_TUNING);
      const visibleRange = getVisibleWorldDistanceRange(camera);
      return [
        ...formatTruckTelemetry(buildTruckTelemetry(truck, DEFAULT_TRUCK_TUNING)),
        `camera: anchor ${camera.anchorX.toFixed(0)},${camera.anchorY.toFixed(
          0
        )} @ ${camera.pixelsPerMeter.toFixed(1)} px/m`,
        `visible: ${visibleRange.startDistanceMeters.toFixed(
          1
        )}..${visibleRange.endDistanceMeters.toFixed(1)} m`,
      ];
    },
    buildScene: (): Scene => {
      const camera = buildRoadCamera(truck.position, viewport, DEFAULT_ROAD_CAMERA_TUNING);
      const cabCenter = projectWorldPoint(camera, truck.position);
      const trailerCenter = projectWorldPoint(camera, {
        lateralMeters:
          truck.position.lateralMeters - Math.sin(truck.trailerHeadingRadians) * hitchLengthMeters,
        distanceMeters:
          truck.position.distanceMeters - Math.cos(truck.trailerHeadingRadians) * hitchLengthMeters,
      });
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
            centerX: trailerCenter.x,
            centerY: trailerCenter.y,
            w: trailerWidthMeters * camera.pixelsPerMeter,
            h: trailerLengthMeters * camera.pixelsPerMeter,
            rotationRadians: truck.trailerHeadingRadians,
            color: colors.trailer,
          },
          {
            kind: 'oriented-rect',
            centerX: cabCenter.x,
            centerY: cabCenter.y,
            w: cabWidthMeters * camera.pixelsPerMeter,
            h: cabLengthMeters * camera.pixelsPerMeter,
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
