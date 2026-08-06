import { DEFAULT_GAME_HUD_UNIT_SYSTEM, buildGameHudSnapshot } from '/src/game/gameHud.js';
import { createGameHudView } from '/src/game/gameHudView.js';
import {
  createCruiseControlState,
  stepCruiseControl,
  type CruiseControlState,
} from '/src/game/cruiseControl.js';
import { createFuelState, DEFAULT_FUEL_TUNING, isFuelInFumes } from '/src/game/fuel.js';
import { stepDriving, ZERO_FUEL_BURN, type DrivingState } from '/src/game/drivingUpdate.js';
import { mountGame } from '/src/game/mount.js';
import { createDefaultStageRoute, createRoad, DEFAULT_ROAD_TUNING } from '/src/game/road.js';
import {
  buildRoadCamera,
  getVisibleWorldDistanceRange,
  stepRoadCameraRotation,
  type RoadViewport,
} from '/src/game/roadCamera.js';
import { sampleRoute, worldToRoute } from '/src/game/route.js';
import type { RoadBarrierImpact } from '/src/game/roadCollision.js';
import {
  buildRoadScene,
  DEFAULT_ROAD_SCENE_TUNING,
  type RoadSceneTruckDimensions,
} from '/src/game/roadScene.js';
import { buildRoadCameraTuning } from '/src/game/roadViewport.js';
import { calculateScore } from '/src/game/score.js';
import { createRunTerminalView } from '/src/game/runTerminalView.js';
import {
  STAGE_1_FINISH_DISTANCE_METERS,
  advanceElapsedRunSeconds,
  buildRunTerminalPresentation,
  createStageRunState,
  stepStageRun,
} from '/src/game/stageRun.js';
import { createTrafficState, stepTraffic, type TrafficState } from '/src/game/traffic.js';
import { createTruckState, DEFAULT_TRUCK_TUNING, type TruckControls } from '/src/game/truck.js';
import { buildTruckTelemetry, formatTruckTelemetry } from '/src/game/truckTelemetry.js';

const BARRIER_FLASH_DURATION_SECONDS = 0.18;
const BARRIER_FLASH_COLOR = '#ff5f1f';
const TRAFFIC_EVENT_DURATION_SECONDS = 0.9;
const INTEGRITY_SCORE_MULTIPLIER = 2_000;
const ROAD_RAGE_PENALTY = 250;
const BASE_POINTS_PER_METER = 10;

export interface RoadGame {
  dispose(): void;
}

export interface StartRoadGameOptions {
  readonly root: HTMLElement;
  readonly viewport: RoadViewport;
  readonly onRetry: () => void;
  readonly onExitToTitle: () => void;
}

export function startRoadGame(options: StartRoadGameOptions): RoadGame {
  const road = createRoad(DEFAULT_ROAD_TUNING, createDefaultStageRoute());
  if (road.route.totalLengthMeters !== STAGE_1_FINISH_DISTANCE_METERS) {
    throw new Error(
      `Stage 1 route and finish must agree, got ${road.route.totalLengthMeters} and ${STAGE_1_FINISH_DISTANCE_METERS}`
    );
  }
  const cameraTuning = buildRoadCameraTuning(road, options.viewport);
  const truckDimensions: RoadSceneTruckDimensions = {
    cabWidthMeters: 2.6,
    cabLengthMeters: 5.2,
    trailerWidthMeters: DEFAULT_TRUCK_TUNING.trailerWidthMeters,
    trailerLengthMeters: DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters,
    hitchGapMeters: -1.1,
  };
  let drivingState: DrivingState = createInitialDrivingState();
  let trafficState: TrafficState = createTrafficState();
  let lastBarrierImpact: RoadBarrierImpact | null = null;
  let barrierFlashSeconds = 0;
  let trafficEventSeconds = 0;
  let trafficEventText = '';
  let cameraRotationRadians = 0;
  let elapsedRunSeconds = 0;
  let stageRun = createStageRunState();
  let cruiseControl: CruiseControlState = createCruiseControlState();
  const worldFixedCamera = isWorldFixedCamera();
  const debugMode = isDebugMode();
  const hud = createGameHudView();
  const terminal = createRunTerminalView({
    onRetry: options.onRetry,
    onExitToTitle: options.onExitToTitle,
  });
  updateHud();

  const mountedGame = mountGame({
    root: options.root,
    update: (dt, input) => {
      elapsedRunSeconds = advanceElapsedRunSeconds(elapsedRunSeconds, dt, stageRun);
      if (stageRun.phase !== 'running') return;
      const previousRouteDistanceMeters = drivingState.routePosition.distanceAlongRouteMeters;
      const cruiseStep = stepCruiseControl(cruiseControl, {
        gas: input.isActive('throttle') ? 1 : 0,
        brake: input.isActive('brake') ? 1 : 0,
        currentSpeedMetersPerSecond: drivingState.truck.speedMetersPerSecond,
        dtSeconds: dt,
      });
      cruiseControl = cruiseStep.state;
      const controls: TruckControls = {
        ...cruiseStep.controls,
        steering: (input.isActive('steerRight') ? 1 : 0) - (input.isActive('steerLeft') ? 1 : 0),
      };
      const result = stepDriving({
        state: drivingState,
        controls,
        dtSeconds: dt,
        road,
        truckDimensions,
      });
      drivingState = result.state;
      const trafficResult = stepTraffic({
        state: trafficState,
        truck: drivingState.truck,
        truckRoutePosition: drivingState.routePosition,
        road,
        truckDimensions,
        dtSeconds: dt,
      });
      trafficState = trafficResult.state;
      const finalRouteProjection = worldToRoute(road.route, trafficResult.truck.position, {
        hintDistanceAlongRouteMeters: drivingState.routePosition.distanceAlongRouteMeters,
        searchRadiusMeters: 100,
      });
      drivingState = {
        ...drivingState,
        truck: trafficResult.truck,
        routePosition: {
          distanceAlongRouteMeters: finalRouteProjection.distanceAlongRouteMeters,
          lateralOffsetMeters: finalRouteProjection.lateralOffsetMeters,
        },
      };
      if (!worldFixedCamera) {
        cameraRotationRadians = stepRoadCameraRotation(
          cameraRotationRadians,
          sampleRoute(road.route, drivingState.routePosition.distanceAlongRouteMeters)
            .headingRadians,
          dt,
          cameraTuning.orientationResponsePerSecond ?? 4
        );
      }
      const trafficEvent = trafficResult.events.at(-1);
      if (trafficEvent) {
        trafficEventSeconds = TRAFFIC_EVENT_DURATION_SECONDS;
        trafficEventText =
          trafficEvent.kind === 'road-rage' ? `ROAD RAGE -${ROAD_RAGE_PENALTY}` : 'PATROL RAM';
      } else {
        trafficEventSeconds = Math.max(0, trafficEventSeconds - dt);
        if (trafficEventSeconds === 0) trafficEventText = '';
      }
      if (result.barrierImpact) {
        lastBarrierImpact = result.barrierImpact;
        barrierFlashSeconds = BARRIER_FLASH_DURATION_SECONDS;
      } else {
        barrierFlashSeconds = Math.max(0, barrierFlashSeconds - dt);
      }

      const nextStageRun = stepStageRun(stageRun, {
        previousRouteDistanceMeters,
        frame: {
          routeDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
          speedMetersPerSecond: drivingState.truck.speedMetersPerSecond,
          fuelLevel: drivingState.fuel.level,
          cargoIntegrity: drivingState.truck.cargoIntegrity,
          elapsedRunSeconds,
          score: buildCurrentScore(),
          roadRageCount: trafficState.takedowns,
          truckStatus: drivingState.truck.status,
        },
      });
      const didTerminate = nextStageRun !== stageRun;
      stageRun = nextStageRun;
      updateHud();
      if (didTerminate) {
        mountedGame.setInteractionEnabled(false);
        terminal.show(buildRunTerminalPresentation(stageRun));
      }
    },
    debugLines: () => {
      const camera = buildRoadCamera(
        drivingState.truck.position,
        options.viewport,
        cameraTuning,
        cameraRotationRadians
      );
      const visibleRange = getVisibleWorldDistanceRange(camera);
      return [
        ...formatTruckTelemetry(buildTruckTelemetry(drivingState.truck, DEFAULT_TRUCK_TUNING)),
        `camera: anchor ${camera.anchorX.toFixed(0)},${camera.anchorY.toFixed(
          0
        )} @ ${camera.pixelsPerMeter.toFixed(1)} px/m rot ${camera.rotationRadians.toFixed(3)}`,
        `route: ${drivingState.routePosition.distanceAlongRouteMeters.toFixed(
          1
        )} m lateral ${drivingState.routePosition.lateralOffsetMeters.toFixed(2)} m`,
        `visible: ${visibleRange.startDistanceMeters.toFixed(
          1
        )}..${visibleRange.endDistanceMeters.toFixed(1)} m`,
        `cargo: ${(drivingState.truck.cargoIntegrity * 100).toFixed(0)}%`,
        `fuel: ${(drivingState.fuel.level * 100).toFixed(0)}% ${
          isFuelInFumes(drivingState.fuel) ? 'FUMES' : 'normal'
        } burn ${drivingState.lastFuelBurn.drainRatePerSecond.toFixed(4)}/s`,
        `fuel burn: base ${drivingState.lastFuelBurn.baselineDrain.toFixed(
          4
        )} fast ${drivingState.lastFuelBurn.highSpeedDrain.toFixed(
          4
        )} gulp ${drivingState.lastFuelBurn.launchGulpDrain.toFixed(4)}`,
        `fuel cap: ${(
          DEFAULT_TRUCK_TUNING.maxForwardSpeedMetersPerSecond *
          DEFAULT_FUEL_TUNING.fumesTopSpeedMultiplier
        ).toFixed(1)} m/s`,
        `last barrier: ${
          lastBarrierImpact
            ? `${lastBarrierImpact.side} ${lastBarrierImpact.penetrationMeters.toFixed(2)} m`
            : 'none'
        } cooldown ${drivingState.barrierContactState.cooldownRemainingSeconds.toFixed(2)} s`,
        `traffic: ${trafficState.vehicles.length} active, ${trafficState.takedowns} takedowns`,
        `cruise: ${cruiseControl.targetSpeedMetersPerSecond.toFixed(1)} m/s`,
        `score: ${buildCurrentScore()}`,
        `stage: ${stageRun.phase}${stageRun.failureReason ? ` (${stageRun.failureReason})` : ''}`,
      ];
    },
    buildScene: () => {
      const camera = buildRoadCamera(
        drivingState.truck.position,
        options.viewport,
        cameraTuning,
        cameraRotationRadians
      );
      return buildRoadScene({
        road,
        camera,
        truck: drivingState.truck,
        traffic: trafficState.vehicles,
        debug: debugMode,
        debugWindow: debugMode
          ? {
              startDistanceMeters:
                drivingState.routePosition.distanceAlongRouteMeters -
                (options.viewport.height - camera.anchorY) / camera.pixelsPerMeter,
              endDistanceMeters:
                drivingState.routePosition.distanceAlongRouteMeters +
                camera.anchorY / camera.pixelsPerMeter,
            }
          : undefined,
        truckDimensions,
        focusDistanceAlongRouteMeters: drivingState.routePosition.distanceAlongRouteMeters,
        tuning: {
          ...DEFAULT_ROAD_SCENE_TUNING,
          barrierColor:
            barrierFlashSeconds > 0 ? BARRIER_FLASH_COLOR : DEFAULT_ROAD_SCENE_TUNING.barrierColor,
        },
        finishDistanceMeters: STAGE_1_FINISH_DISTANCE_METERS,
      });
    },
  });
  mountedGame.stage.appendChild(hud.root);
  mountedGame.stage.appendChild(terminal.root);

  return {
    dispose() {
      mountedGame.dispose();
      hud.root.remove();
      terminal.dispose();
    },
  };

  function buildCurrentScore(): number {
    return calculateScore({
      baseDeliveredCargo:
        Math.max(0, Math.floor(drivingState.routePosition.distanceAlongRouteMeters)) *
        BASE_POINTS_PER_METER,
      cargoIntegrity: drivingState.truck.cargoIntegrity,
      integrityMultiplier: INTEGRITY_SCORE_MULTIPLIER,
      takedownCount: trafficState.takedowns,
      takedownPenalty: ROAD_RAGE_PENALTY,
    });
  }

  function updateHud(): void {
    hud.update(
      buildGameHudSnapshot(drivingState.truck, DEFAULT_TRUCK_TUNING, drivingState.fuel, undefined, {
        score: buildCurrentScore(),
        takedowns: trafficState.takedowns,
        eventText: trafficEventText,
        routeDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
        routeLengthMeters: STAGE_1_FINISH_DISTANCE_METERS,
        elapsedRunSeconds,
        stageNumber: 1,
        unitSystem: DEFAULT_GAME_HUD_UNIT_SYSTEM,
        isStageComplete: stageRun.phase === 'completed',
        cruiseTargetSpeedMetersPerSecond: cruiseControl.targetSpeedMetersPerSecond,
      })
    );
  }
}

function createInitialDrivingState(): DrivingState {
  return {
    truck: createTruckState({
      position: { xMeters: 0, yMeters: 0 },
      headingRadians: 0,
      speedMetersPerSecond: 0,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: 0,
      massKilograms: 36_287,
      cargoIntegrity: 1,
      status: 'driving',
    }),
    routePosition: { distanceAlongRouteMeters: 0, lateralOffsetMeters: 0 },
    fuel: createFuelState(),
    barrierContactState: { cooldownRemainingSeconds: 0 },
    lastFuelBurn: ZERO_FUEL_BURN,
  };
}

function isWorldFixedCamera(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.has('worldFixed');
}

function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.has('debug');
}
