import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import '/components/UpdateNotification.js';
import { h } from '/src/domUtils.js';
import { mountGame } from '/src/game/mount.js';
import type { Scene } from '/src/engine/renderer.js';
import { installTitleScreenStartHandlers } from '/src/game/titleScreen.js';
import {
  createTruckState,
  DEFAULT_TRUCK_TUNING,
  resolveTruckImpact,
  stepTruck,
  type TruckControls,
} from '/src/game/truck.js';
import {
  buildRoadCamera,
  getVisibleWorldDistanceRange,
  type RoadCameraTuning,
  type RoadViewport,
} from '/src/game/roadCamera.js';
import { createRoad, DEFAULT_ROAD_TUNING, type Road } from '/src/game/road.js';
import { buildGameHudSnapshot, type GameHudSnapshot } from '/src/game/gameHud.js';
import {
  buildRoadScene,
  DEFAULT_ROAD_SCENE_TUNING,
  type RoadSceneTruckDimensions,
} from '/src/game/roadScene.js';
import {
  buildTruckFootprint,
  DEFAULT_ROAD_COLLISION_TUNING,
  detectRoadBarrierImpact,
  resolveRoadBarrierContact,
  type BarrierContactState,
  type RoadBarrierImpact,
} from '/src/game/roadCollision.js';
import { buildTruckTelemetry, formatTruckTelemetry } from '/src/game/truckTelemetry.js';

interface GameHud {
  readonly root: HTMLElement;
  update(snapshot: GameHudSnapshot): void;
}

function createGameHud(): GameHud {
  const speedValue = h('span', { className: 'roll-on-hud-speed-value', textContent: '0' });
  const speedUnit = h('span', { className: 'roll-on-hud-speed-unit', textContent: 'MPH' });
  const speedMetric = h('span', { className: 'roll-on-hud-subvalue', textContent: '0.0 m/s' });
  const topSpeed = h('span', { className: 'roll-on-hud-value', textContent: '0%' });
  const cargo = h('span', { className: 'roll-on-hud-value', textContent: '100%' });
  const distance = h('span', { className: 'roll-on-hud-value', textContent: '0 m' });
  const status = h('span', { className: 'roll-on-hud-status', textContent: 'DRIVING' });

  const root = h('section', { className: 'roll-on-hud', ariaLabel: 'Driving status' }, [
    h('div', { className: 'roll-on-hud-brand', textContent: 'ROLL ON' }),
    h('div', { className: 'roll-on-hud-speed' }, [
      speedValue,
      h('div', { className: 'roll-on-hud-speed-meta' }, [speedUnit, speedMetric]),
    ]),
    h('dl', { className: 'roll-on-hud-readouts' }, [
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Top' }),
        h('dd', {}, [topSpeed]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Cargo' }),
        h('dd', {}, [cargo]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Run' }),
        h('dd', {}, [distance]),
      ]),
    ]),
    status,
  ]);

  return {
    root,
    update(snapshot) {
      speedValue.textContent = snapshot.speedMphText;
      speedMetric.textContent = snapshot.speedMetersPerSecondText;
      topSpeed.textContent = snapshot.topSpeedPercentText;
      cargo.textContent = snapshot.cargoIntegrityText;
      distance.textContent = snapshot.distanceText;
      status.textContent = snapshot.statusText;
      status.dataset.status = snapshot.statusText.toLowerCase();
    },
  };
}

function getGameViewport(): RoadViewport {
  if (typeof window === 'undefined') return { width: 320, height: 480 };
  return {
    width: Math.max(320, Math.round(window.innerWidth)),
    height: Math.max(480, Math.round(window.innerHeight)),
  };
}

function buildViewportCameraTuning(road: Road, viewport: RoadViewport): RoadCameraTuning {
  const roadWidthMeters = road.rightShoulderEdgeMeters - road.leftShoulderEdgeMeters;
  const widthScale = viewport.width / (roadWidthMeters * 1.35);
  const heightScale = viewport.height / 30;
  return {
    pixelsPerMeter: clamp(Math.min(widthScale, heightScale), 8, 20),
    anchorX: viewport.width / 2,
    anchorY: viewport.height * 0.58,
  };
}

function startRoadGame(): void {
  // M2.3 playable checkpoint: road/camera/truck scene composition flows
  // through the production renderer seam.
  document.body.classList.add('is-playing');
  const gameRoot = h('main', { id: 'game-root', className: 'roll-on-playfield' });
  document.body.appendChild(gameRoot);

  const viewport = getGameViewport();
  const road = createRoad(DEFAULT_ROAD_TUNING);
  const cameraTuning = buildViewportCameraTuning(road, viewport);
  const truckDimensions: RoadSceneTruckDimensions = {
    cabWidthMeters: 2.6,
    cabLengthMeters: 4,
    trailerWidthMeters: DEFAULT_TRUCK_TUNING.trailerWidthMeters,
    trailerLengthMeters: DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters,
    hitchGapMeters: 0.7,
  };
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
  let barrierContactState: BarrierContactState = { cooldownRemainingSeconds: 0 };
  let lastBarrierImpact: RoadBarrierImpact | null = null;
  let barrierFlashSeconds = 0;
  const hud = createGameHud();
  hud.update(buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING));

  mountGame({
    root: gameRoot,
    width: viewport.width,
    height: viewport.height,
    update: (dt, input) => {
      const controls: TruckControls = {
        throttle: input.isActive('throttle') ? 1 : 0,
        brake: input.isActive('brake') ? 1 : 0,
        steering: (input.isActive('steerRight') ? 1 : 0) - (input.isActive('steerLeft') ? 1 : 0),
      };
      truck = stepTruck(truck, controls, dt, DEFAULT_TRUCK_TUNING);
      const footprint = buildTruckFootprint(truck, truckDimensions);
      const barrierImpact = detectRoadBarrierImpact(road, footprint);
      const barrierResult = resolveRoadBarrierContact({
        truck,
        impact: barrierImpact,
        contactState: barrierContactState,
        dtSeconds: dt,
        tuning: DEFAULT_ROAD_COLLISION_TUNING,
        resolveImpact: resolveTruckImpact,
      });
      truck = barrierResult.truck;
      barrierContactState = barrierResult.contactState;
      if (barrierImpact) {
        lastBarrierImpact = barrierImpact;
        barrierFlashSeconds = 0.18;
      } else {
        barrierFlashSeconds = Math.max(0, barrierFlashSeconds - dt);
      }
      hud.update(buildGameHudSnapshot(truck, DEFAULT_TRUCK_TUNING));
    },
    debugLines: () => {
      const camera = buildRoadCamera(truck.position, viewport, cameraTuning);
      const visibleRange = getVisibleWorldDistanceRange(camera);
      return [
        ...formatTruckTelemetry(buildTruckTelemetry(truck, DEFAULT_TRUCK_TUNING)),
        `camera: anchor ${camera.anchorX.toFixed(0)},${camera.anchorY.toFixed(
          0
        )} @ ${camera.pixelsPerMeter.toFixed(1)} px/m`,
        `visible: ${visibleRange.startDistanceMeters.toFixed(
          1
        )}..${visibleRange.endDistanceMeters.toFixed(1)} m`,
        `cargo: ${(truck.cargoIntegrity * 100).toFixed(0)}%`,
        `last barrier: ${
          lastBarrierImpact
            ? `${lastBarrierImpact.side} ${lastBarrierImpact.penetrationMeters.toFixed(2)} m`
            : 'none'
        } cooldown ${barrierContactState.cooldownRemainingSeconds.toFixed(2)} s`,
      ];
    },
    buildScene: (): Scene => {
      const camera = buildRoadCamera(truck.position, viewport, cameraTuning);
      return buildRoadScene({
        road,
        camera,
        truck,
        truckDimensions,
        tuning: {
          ...DEFAULT_ROAD_SCENE_TUNING,
          barrierColor:
            barrierFlashSeconds > 0 ? '#ff5f1f' : DEFAULT_ROAD_SCENE_TUNING.barrierColor,
        },
      });
    },
  });
  gameRoot.appendChild(hud.root);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
      startRoadGame();
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
