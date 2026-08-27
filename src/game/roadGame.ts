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
import { createRoad, DEFAULT_ROAD_TUNING, type RoadPullout } from '/src/game/road.js';
import {
  buildRoadCamera,
  getVisibleWorldDistanceRange,
  stepRoadCameraRotation,
  type RoadViewport,
} from '/src/game/roadCamera.js';
import { sampleRoute, worldToRoute, type Route } from '/src/game/route.js';
import {
  buildRouteFollowerSteering,
  isDebugRouteFollowerEnabled,
} from '/src/game/routeFollower.js';
import type { RoadBarrierImpact } from '/src/game/roadCollision.js';
import {
  buildRoadScene,
  DEFAULT_ROAD_SCENE_TUNING,
  type RoadSceneTruckDimensions,
} from '/src/game/roadScene.js';
import { buildRoadCameraTuning } from '/src/game/roadViewport.js';
import { calculateScore } from '/src/game/score.js';
import { createRunTerminalView } from '/src/game/runTerminalView.js';
import { createPauseMenuView, type PauseMenuView } from '/src/game/pauseMenuView.js';
import {
  advanceElapsedRunSeconds,
  buildRunTerminalPresentation,
  createStageRunState,
  stepStageRun,
  type StageRunState,
} from '/src/game/stageRun.js';
import {
  addPatrolCruiser,
  createTrafficState,
  removeTrafficVehicle,
  stagePatrolCruiser,
  stepTraffic,
  type PatrolVehicleCommand,
  type TrafficEvent,
  type TrafficState,
  type TrafficVehicle,
} from '/src/game/traffic.js';
import {
  createPatrolEncounterState,
  getActivePatrolEncounter,
  stepPatrolEncounter,
  type PatrolAttackSide,
  type PatrolEncounterDefinition,
  type PatrolEncounterState,
} from '/src/game/patrolEncounter.js';
import {
  applyPatrolHit,
  buildPatrolCommand,
  buildPatrolStagingPose,
  DEFAULT_PATROL_PURSUIT_TUNING,
  observePatrolSurroundings,
  parkedCruiserPose,
} from '/src/game/patrolPursuit.js';
import {
  buildPatrolGlareDrawables,
  buildPatrolGlareSnapshot,
  type PatrolGlareSnapshot,
} from '/src/game/patrolGlare.js';
import { createTruckState, DEFAULT_TRUCK_TUNING, type TruckControls } from '/src/game/truck.js';
import { buildTruckTelemetry, formatTruckTelemetry } from '/src/game/truckTelemetry.js';

const BARRIER_FLASH_DURATION_SECONDS = 0.18;
const BARRIER_FLASH_COLOR = '#ff5f1f';
const TRAFFIC_EVENT_DURATION_SECONDS = 0.9;
const INTEGRITY_SCORE_MULTIPLIER = 2_000;
const ROAD_RAGE_PENALTY = 250;
const BASE_POINTS_PER_METER = 10;
/** How far behind the truck an unowned cruiser may fall before it is removed. */
const RELEASED_CRUISER_CULL_BEHIND_METERS = 60;

export interface RoadGame {
  dispose(): void;
}

export interface StartRoadGameOptions {
  readonly root: HTMLElement;
  readonly viewport: RoadViewport;
  readonly route: Route;
  /** Authored road features for this stage, such as speed-trap pullouts. */
  readonly pullouts?: readonly RoadPullout[];
  /** Authored patrol encounters posted for this stage. */
  readonly patrolEncounters?: readonly PatrolEncounterDefinition[];
  readonly stageNumber: number;
  readonly initialCargoIntegrity?: number;
  readonly initialFuelLevel?: number;
  readonly onRetry: () => void;
  readonly onExitToTitle: () => void;
  /** Return true when the caller owns terminal presentation for this result. */
  readonly onStageResult?: (state: StageRunState) => boolean;
}

export function startRoadGame(options: StartRoadGameOptions): RoadGame {
  const road = createRoad(DEFAULT_ROAD_TUNING, options.route, { pullouts: options.pullouts ?? [] });
  const finishDistanceMeters = road.route.totalLengthMeters;
  const cameraTuning = buildRoadCameraTuning(road, options.viewport);
  const truckDimensions: RoadSceneTruckDimensions = {
    cabWidthMeters: 2.6,
    cabLengthMeters: 5.2,
    trailerWidthMeters: DEFAULT_TRUCK_TUNING.trailerWidthMeters,
    trailerLengthMeters: DEFAULT_TRUCK_TUNING.trailerWheelbaseMeters,
    hitchGapMeters: -1.1,
  };
  let drivingState: DrivingState = createInitialDrivingState({
    cargoIntegrity: options.initialCargoIntegrity,
    fuelLevel: options.initialFuelLevel,
  });
  let trafficState: TrafficState = createTrafficState();
  let patrolState: PatrolEncounterState = createPatrolEncounterState({
    definitions: options.patrolEncounters ?? [],
  });
  let patrolGlare: PatrolGlareSnapshot = { isVisible: false, intensity: 0, side: null };
  let patrolAttackSide: PatrolAttackSide | null = null;
  let pendingPatrolCommand: PatrolVehicleCommand | null = null;
  const patrolCruiserIdsByEncounter = new Map<string, number>();
  const releasedCruiserIds = new Set<number>();
  let lastBarrierImpact: RoadBarrierImpact | null = null;
  let barrierFlashSeconds = 0;
  let trafficEventSeconds = 0;
  let trafficEventText = '';
  let cameraRotationRadians = 0;
  let elapsedRunSeconds = 0;
  let isPaused = false;
  let stageRun = createStageRunState();
  let cruiseControl: CruiseControlState = createCruiseControlState();
  const worldFixedCamera = isWorldFixedCamera();
  const debugMode = isDebugMode();
  const debugRouteFollow = isDebugRouteFollowMode();
  const hud = createGameHudView();
  const terminal = createRunTerminalView({
    stageNumber: options.stageNumber,
    onRetry: options.onRetry,
    onExitToTitle: options.onExitToTitle,
  });
  let pauseMenu: PauseMenuView | null = null;
  postParkedCruisers();
  updateHud();

  const mountedGame = mountGame({
    root: options.root,
    update: (dt, input) => {
      if (isPaused) return;
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
        steering: debugRouteFollow
          ? buildRouteFollowerSteering({
              route: road.route,
              routeDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
              lateralOffsetMeters: drivingState.routePosition.lateralOffsetMeters,
              headingRadians: drivingState.truck.headingRadians,
            })
          : (input.isActive('steerRight') ? 1 : 0) - (input.isActive('steerLeft') ? 1 : 0),
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
        ...(pendingPatrolCommand === null ? {} : { patrolCommand: pendingPatrolCommand }),
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
      stepPatrolEnforcement({
        dtSeconds: dt,
        previousRouteDistanceMeters,
        trafficEvents: trafficResult.events,
        isTerminal: false,
      });
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
      if (didTerminate) {
        // Terminal state cancels enforcement before any consequence can land.
        stepPatrolEnforcement({
          dtSeconds: 0,
          previousRouteDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
          trafficEvents: [],
          isTerminal: true,
        });
      }
      updateHud();
      if (didTerminate) {
        pauseMenu?.hide();
        mountedGame.setInteractionEnabled(false);
        if (options.onStageResult?.(stageRun) !== true) {
          terminal.show(buildRunTerminalPresentation(stageRun));
        }
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
        `patrol: ${describePatrolTelemetry()}`,
        `steering: ${debugRouteFollow ? 'route follower' : 'player'}`,
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
        finishDistanceMeters,
        routePreviewDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
        patrolGlare: buildPatrolGlareDrawables({
          snapshot: patrolGlare,
          viewport: options.viewport,
          elapsedSeconds: elapsedRunSeconds,
          reducedMotion: prefersReducedMotion(),
        }),
      });
    },
  });
  mountedGame.stage.appendChild(hud.root);
  mountedGame.stage.appendChild(terminal.root);
  pauseMenu = createPauseMenuView({
    onPause: () => {
      isPaused = true;
      mountedGame.setInteractionEnabled(false);
    },
    onResume: () => {
      isPaused = false;
      mountedGame.setInteractionEnabled(true);
    },
    onExitToTitle: options.onExitToTitle,
  });
  mountedGame.stage.appendChild(pauseMenu.root);
  pauseMenu.show();

  return {
    dispose() {
      mountedGame.dispose();
      hud.root.remove();
      terminal.dispose();
      pauseMenu?.dispose();
    },
  };

  /** Put every authored trap's cruiser in its apron before the run starts. */
  function postParkedCruisers(): void {
    for (const encounter of patrolState.encounters) {
      if (encounter.phase !== 'posted') continue;
      const pose = parkedCruiserPose(road, encounter.triggerDistanceMeters);
      const added = addPatrolCruiser(trafficState, {
        distanceMeters: pose.distanceMeters,
        lateralMeters: pose.lateralMeters,
        speedMetersPerSecond: pose.speedMetersPerSecond,
        headingOffsetRadians: pose.headingOffsetRadians,
        road,
      });
      trafficState = added.state;
      patrolCruiserIdsByEncounter.set(encounter.id, added.vehicleId);
    }
  }

  function findCruiser(encounterId: string | undefined): TrafficVehicle | null {
    if (encounterId === undefined) return null;
    const vehicleId = patrolCruiserIdsByEncounter.get(encounterId);
    if (vehicleId === undefined) return null;
    return trafficState.vehicles.find(vehicle => vehicle.id === vehicleId) ?? null;
  }

  /**
   * Advance enforcement from what the world just did. Traffic reports contacts
   * and Road Rage; the encounter model decides what they mean; this applies the
   * consequences and prepares the cruiser's next motion order.
   */
  function stepPatrolEnforcement(step: {
    readonly dtSeconds: number;
    readonly previousRouteDistanceMeters: number;
    readonly trafficEvents: readonly TrafficEvent[];
    readonly isTerminal: boolean;
  }): void {
    const activeBefore = getActivePatrolEncounter(patrolState);
    const cruiser = findCruiser(activeBefore?.id);
    const surroundings = observePatrolSurroundings({
      road,
      truckRoutePosition: drivingState.routePosition,
      cruiser,
      traffic: trafficState.vehicles,
    });
    const patrolResult = stepPatrolEncounter({
      state: patrolState,
      frame: {
        dtSeconds: step.dtSeconds,
        previousRouteDistanceMeters: step.previousRouteDistanceMeters,
        routeDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
        speedMetersPerSecond: drivingState.truck.speedMetersPerSecond,
        maximumSpeedMetersPerSecond: DEFAULT_TRUCK_TUNING.maxForwardSpeedMetersPerSecond,
        patrolGapMeters: surroundings.patrolGapMeters,
        leftClearanceMeters: surroundings.leftClearanceMeters,
        rightClearanceMeters: surroundings.rightClearanceMeters,
        hasPatrolContact:
          cruiser !== null &&
          step.trafficEvents.some(
            event => event.kind === 'patrol-contact' && event.vehicleId === cruiser.id
          ),
        roadRageIncidents: step.trafficEvents.filter(event => event.kind === 'road-rage').length,
        isTerminal: step.isTerminal,
      },
    });
    patrolState = patrolResult.state;

    for (const event of patrolResult.events) {
      if (event.kind === 'pursuit-started' && !patrolCruiserIdsByEncounter.has(event.encounterId)) {
        const added = addPatrolCruiser(trafficState, {
          distanceMeters:
            drivingState.routePosition.distanceAlongRouteMeters -
            DEFAULT_PATROL_PURSUIT_TUNING.responseSpawnGapMeters,
          lateralMeters: drivingState.routePosition.lateralOffsetMeters,
          speedMetersPerSecond: drivingState.truck.speedMetersPerSecond,
          road,
        });
        trafficState = added.state;
        patrolCruiserIdsByEncounter.set(event.encounterId, added.vehicleId);
      }
      if (event.kind === 'closing-started') {
        const vehicleId = patrolCruiserIdsByEncounter.get(event.encounterId);
        if (vehicleId === undefined) {
          throw new RangeError(`active patrol ${event.encounterId} has no cruiser to stage`);
        }
        const stagingCruiser = trafficState.vehicles.find(vehicle => vehicle.id === vehicleId);
        if (stagingCruiser?.kind !== 'patrol') {
          throw new RangeError(`active patrol ${event.encounterId} has no cruiser to stage`);
        }
        const pose = buildPatrolStagingPose({
          truckRouteDistanceMeters: drivingState.routePosition.distanceAlongRouteMeters,
          truckSpeedMetersPerSecond: drivingState.truck.speedMetersPerSecond,
          cruiser: stagingCruiser,
          traffic: trafficState.vehicles,
        });
        trafficState = stagePatrolCruiser(trafficState, vehicleId, { ...pose, road });
      }
      if (event.kind === 'attack-hit') {
        drivingState = {
          ...drivingState,
          truck: applyPatrolHit(drivingState.truck, event.side, DEFAULT_PATROL_PURSUIT_TUNING),
        };
        trafficEventSeconds = TRAFFIC_EVENT_DURATION_SECONDS;
        trafficEventText = `PATROL HIT ${event.side.toUpperCase()}`;
      }
      // A cruiser whose encounter is over stops being owned. It keeps its pose
      // and is culled like ordinary traffic once it is well behind, so nothing
      // pops out of existence in view.
      if (event.kind === 'resolved' || event.kind === 'trap-resolved') {
        const vehicleId = patrolCruiserIdsByEncounter.get(event.encounterId);
        if (vehicleId !== undefined) {
          releasedCruiserIds.add(vehicleId);
          patrolCruiserIdsByEncounter.delete(event.encounterId);
        }
      }
    }

    for (const vehicleId of releasedCruiserIds) {
      const cruiserBehind = trafficState.vehicles.find(vehicle => vehicle.id === vehicleId);
      if (
        cruiserBehind === undefined ||
        drivingState.routePosition.distanceAlongRouteMeters - cruiserBehind.distanceMeters >
          RELEASED_CRUISER_CULL_BEHIND_METERS
      ) {
        trafficState = removeTrafficVehicle(trafficState, vehicleId);
        releasedCruiserIds.delete(vehicleId);
      }
    }

    const active = getActivePatrolEncounter(patrolState);
    const activeCruiser = findCruiser(active?.id);
    pendingPatrolCommand =
      active === null || activeCruiser === null
        ? null
        : buildPatrolCommand({
            encounter: active,
            cruiser: activeCruiser,
            road,
            truck: drivingState.truck,
            truckRoutePosition: drivingState.routePosition,
          });
    patrolGlare = buildPatrolGlareSnapshot({
      encounter: active,
      patrolGapMeters: surroundings.patrolGapMeters,
    });
    patrolAttackSide =
      active?.phase === 'telegraphing' || active?.phase === 'sideswiping'
        ? active.chosenSide
        : null;
  }

  /** One diagnosable line: source, state, gap, window end, timer, avoids, side. */
  function describePatrolTelemetry(): string {
    const pending = patrolState.pendingResponse;
    const active = getActivePatrolEncounter(patrolState);
    if (active === null) {
      const posted = patrolState.encounters.filter(
        encounter => encounter.phase === 'posted'
      ).length;
      return pending === null
        ? `idle, ${posted} posted`
        : `response in ${pending.secondsRemaining.toFixed(1)} s`;
    }

    const cruiser = findCruiser(active.id);
    const gapMeters =
      cruiser === null
        ? Number.NaN
        : drivingState.routePosition.distanceAlongRouteMeters - cruiser.distanceMeters;
    const timerSeconds = 'phaseSecondsRemaining' in active ? active.phaseSecondsRemaining : 0;
    const side = 'chosenSide' in active ? active.chosenSide : 'none';
    return [
      `${active.source} ${active.phase}`,
      `gap ${gapMeters.toFixed(1)} m`,
      `until ${active.windowEndDistanceMeters.toFixed(0)} m`,
      `t ${timerSeconds.toFixed(2)} s`,
      `avoids ${active.recordedAvoids}/${active.requiredAvoids}`,
      `side ${side}`,
    ].join(' ');
  }

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
        routeLengthMeters: finishDistanceMeters,
        elapsedRunSeconds,
        stageNumber: options.stageNumber,
        unitSystem: DEFAULT_GAME_HUD_UNIT_SYSTEM,
        isStageComplete: stageRun.phase === 'completed',
        cruiseTargetSpeedMetersPerSecond: cruiseControl.targetSpeedMetersPerSecond,
        patrolWarning: { isPursuing: patrolGlare.isVisible, attackSide: patrolAttackSide },
      })
    );
  }
}

function createInitialDrivingState(
  initial: {
    readonly cargoIntegrity?: number;
    readonly fuelLevel?: number;
  } = {}
): DrivingState {
  return {
    truck: createTruckState({
      position: { xMeters: 0, yMeters: 0 },
      headingRadians: 0,
      speedMetersPerSecond: 0,
      yawRateRadiansPerSecond: 0,
      trailerHeadingRadians: 0,
      massKilograms: 36_287,
      cargoIntegrity: initial.cargoIntegrity ?? 1,
      status: 'driving',
    }),
    routePosition: { distanceAlongRouteMeters: 0, lateralOffsetMeters: 0 },
    fuel: createFuelState({ level: initial.fuelLevel }),
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

function isDebugRouteFollowMode(): boolean {
  if (typeof window === 'undefined') return false;
  return isDebugRouteFollowerEnabled(window.location.search);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
