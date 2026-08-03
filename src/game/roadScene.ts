import type { Drawable, Scene } from '/src/engine/renderer.js';
import { sampleRoad, sampleRoadWindow, type LaneMarkerSpan, type Road } from '/src/game/road.js';
import { projectWorldPoint, type RoadCamera } from '/src/game/roadCamera.js';
import { routeToWorld } from '/src/game/route.js';
import type { TruckState } from '/src/game/truck.js';
import type { WorldPoint } from '/src/game/worldGeometry.js';
import type { TrafficVehicle } from '/src/game/traffic.js';

export const COMMUTER_SPRITES = Object.freeze([
  '/images/vehicles/commuter-blue.png',
  '/images/vehicles/commuter-green.png',
  '/images/vehicles/commuter-red.png',
  '/images/vehicles/commuter-yellow.png',
] as const);

export const PATROL_SPRITE = '/images/vehicles/patrol.png';
export const TRUCK_CAB_SPRITE = '/images/vehicles/truck-cab-yellow.png';
export const TRUCK_TRAILER_SPRITE = '/images/vehicles/truck-trailer-white.png';

export interface RoadSceneTruckDimensions {
  readonly cabWidthMeters: number;
  readonly cabLengthMeters: number;
  readonly trailerWidthMeters: number;
  readonly trailerLengthMeters: number;
  /** Signed edge offset: positive leaves a gap; negative overlaps cab and trailer. */
  readonly hitchGapMeters: number;
}

export interface RoadSceneTuning {
  readonly backgroundColor: string;
  readonly shoulderColor: string;
  readonly roadColor: string;
  readonly barrierColor: string;
  readonly laneMarkerColor: string;
  readonly laneMarkerWidthMeters: number;
  readonly parallaxLayers: readonly ParallaxLayerTuning[];
  readonly commuterColor: string;
  readonly patrolColor: string;
  readonly disabledTrafficColor: string;
  readonly commuterWidthMeters: number;
  readonly commuterLengthMeters: number;
  readonly patrolWidthMeters: number;
  readonly patrolLengthMeters: number;
}

export interface ParallaxLayerTuning {
  readonly color: string;
  /** 0 is static sky, values below 1 move slower than the foreground road. */
  readonly speedRatio: number;
  readonly cadenceMeters: number;
  readonly bandLengthMeters: number;
  readonly bandWidthMeters: number;
  readonly lateralGapMeters: number;
}

export interface ParallaxBand {
  readonly color: string;
  readonly speedRatio: number;
  readonly leftLateralMeters: number;
  readonly rightLateralMeters: number;
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
}

export interface BuildParallaxBandsOptions {
  readonly camera: RoadCamera;
  readonly road: Road;
  readonly layers: readonly ParallaxLayerTuning[];
}

export interface BuildRoadSceneOptions {
  readonly road: Road;
  readonly camera: RoadCamera;
  readonly truck: TruckState;
  readonly traffic?: readonly TrafficVehicle[];
  readonly truckDimensions: RoadSceneTruckDimensions;
  readonly tuning?: RoadSceneTuning;
}

export const DEFAULT_PARALLAX_LAYERS: readonly ParallaxLayerTuning[] = Object.freeze([
  Object.freeze({
    color: '#26333a',
    speedRatio: 0.12,
    cadenceMeters: 34,
    bandLengthMeters: 14,
    bandWidthMeters: 4.4,
    lateralGapMeters: 3.8,
  }),
  Object.freeze({
    color: '#33434a',
    speedRatio: 0.32,
    cadenceMeters: 18,
    bandLengthMeters: 5,
    bandWidthMeters: 2.2,
    lateralGapMeters: 1.2,
  }),
]);

export const DEFAULT_ROAD_SCENE_TUNING: RoadSceneTuning = Object.freeze({
  backgroundColor: '#192327',
  shoulderColor: '#5b5145',
  roadColor: '#30343b',
  barrierColor: '#d8d2c4',
  laneMarkerColor: '#f6d96d',
  laneMarkerWidthMeters: 0.18,
  parallaxLayers: DEFAULT_PARALLAX_LAYERS,
  commuterColor: '#4fd1c5',
  patrolColor: '#e9f4ff',
  disabledTrafficColor: '#ff5f1f',
  commuterWidthMeters: 1.9,
  commuterLengthMeters: 4.5,
  patrolWidthMeters: 2,
  patrolLengthMeters: 4.8,
});

export function buildParallaxOffsetMeters(
  cameraDistanceMeters: number,
  layer: ParallaxLayerTuning
): number {
  assertFinite('cameraDistanceMeters', cameraDistanceMeters);
  validateParallaxLayer(layer);

  return positiveModulo(cameraDistanceMeters * layer.speedRatio, layer.cadenceMeters);
}

export function buildParallaxBands(options: BuildParallaxBandsOptions): readonly ParallaxBand[] {
  const bands: ParallaxBand[] = [];
  for (const layer of options.layers) {
    validateParallaxLayer(layer);
    const focusDistanceMeters = options.camera.focus.yMeters * layer.speedRatio;
    const windowStart =
      focusDistanceMeters -
      (options.camera.viewportHeight - options.camera.anchorY) / options.camera.pixelsPerMeter;
    const windowEnd = focusDistanceMeters + options.camera.anchorY / options.camera.pixelsPerMeter;
    const firstCadenceIndex = Math.floor(windowStart / layer.cadenceMeters);

    for (
      let bandStart = firstCadenceIndex * layer.cadenceMeters;
      bandStart <= windowEnd;
      bandStart += layer.cadenceMeters
    ) {
      const bandEnd = bandStart + layer.bandLengthMeters;
      const clippedStart = Math.max(bandStart, windowStart);
      const clippedEnd = Math.min(bandEnd, windowEnd);
      if (clippedEnd <= clippedStart) continue;

      bands.push(
        {
          color: layer.color,
          speedRatio: layer.speedRatio,
          leftLateralMeters:
            options.road.leftShoulderEdgeMeters - layer.lateralGapMeters - layer.bandWidthMeters,
          rightLateralMeters: options.road.leftShoulderEdgeMeters - layer.lateralGapMeters,
          startDistanceMeters: clippedStart,
          endDistanceMeters: clippedEnd,
        },
        {
          color: layer.color,
          speedRatio: layer.speedRatio,
          leftLateralMeters: options.road.rightShoulderEdgeMeters + layer.lateralGapMeters,
          rightLateralMeters:
            options.road.rightShoulderEdgeMeters + layer.lateralGapMeters + layer.bandWidthMeters,
          startDistanceMeters: clippedStart,
          endDistanceMeters: clippedEnd,
        }
      );
    }
  }

  return bands;
}

export function buildRoadScene(options: BuildRoadSceneOptions): Scene {
  const tuning = options.tuning ?? DEFAULT_ROAD_SCENE_TUNING;
  validateTruckDimensions(options.truckDimensions);
  assertPositive('laneMarkerWidthMeters', tuning.laneMarkerWidthMeters);
  assertPositive('commuterWidthMeters', tuning.commuterWidthMeters);
  assertPositive('commuterLengthMeters', tuning.commuterLengthMeters);
  assertPositive('patrolWidthMeters', tuning.patrolWidthMeters);
  assertPositive('patrolLengthMeters', tuning.patrolLengthMeters);

  const drawables: Drawable[] = [
    {
      kind: 'rect',
      x: 0,
      y: 0,
      w: options.camera.viewportWidth,
      h: options.camera.viewportHeight,
      color: tuning.backgroundColor,
    },
  ];

  for (const band of buildParallaxBands({
    camera: options.camera,
    road: options.road,
    layers: tuning.parallaxLayers,
  })) {
    drawables.push(parallaxBand(options.camera, band));
  }

  if (hasCurvature(options.road)) {
    drawables.push(...buildCurvedRoadDrawables(options.road, options.camera, tuning));
  } else {
    drawables.push(
      horizontalBand(
        options.camera,
        options.road.leftShoulderEdgeMeters,
        options.road.leftRoadEdgeMeters,
        tuning.shoulderColor
      ),
      horizontalBand(
        options.camera,
        options.road.rightRoadEdgeMeters,
        options.road.rightShoulderEdgeMeters,
        tuning.shoulderColor
      ),
      horizontalBand(
        options.camera,
        options.road.leftRoadEdgeMeters,
        options.road.rightRoadEdgeMeters,
        tuning.roadColor
      ),
      barrier(options.camera, options.road.leftBarrierLateralMeters, tuning.barrierColor),
      barrier(options.camera, options.road.rightBarrierLateralMeters, tuning.barrierColor)
    );

    for (const marker of visibleLaneMarkerSpans(options.road, options.camera)) {
      drawables.push(
        straightMarker(options.camera, marker, tuning.laneMarkerWidthMeters, tuning.laneMarkerColor)
      );
    }
  }

  for (const vehicle of options.traffic ?? []) {
    if (vehicle.kind !== 'commuter' && vehicle.kind !== 'patrol') {
      throw new TypeError(`Unknown traffic vehicle kind: ${String(vehicle.kind)}`);
    }
    const center = projectWorldPoint(options.camera, vehicle.worldPosition);
    const isPatrol = vehicle.kind === 'patrol';
    drawables.push({
      kind: 'oriented-sprite',
      centerX: center.x,
      centerY: center.y,
      w:
        (isPatrol ? tuning.patrolWidthMeters : tuning.commuterWidthMeters) *
        options.camera.pixelsPerMeter,
      h:
        (isPatrol ? tuning.patrolLengthMeters : tuning.commuterLengthMeters) *
        options.camera.pixelsPerMeter,
      rotationRadians: vehicle.headingRadians,
      src: isPatrol ? PATROL_SPRITE : commuterSpriteForId(vehicle.id),
    });
  }

  drawables.push(...buildTruckDrawables(options.camera, options.truck, options.truckDimensions));

  return {
    clear: tuning.backgroundColor,
    width: options.camera.viewportWidth,
    height: options.camera.viewportHeight,
    drawables,
  };
}

export function commuterSpriteForId(id: number): (typeof COMMUTER_SPRITES)[number] {
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new RangeError(`traffic vehicle id must be a non-negative safe integer, got ${id}`);
  }
  return COMMUTER_SPRITES[id % COMMUTER_SPRITES.length]!;
}

function visibleLaneMarkerSpans(road: Road, camera: RoadCamera): readonly LaneMarkerSpan[] {
  const window = {
    startDistanceMeters:
      camera.focus.yMeters - (camera.viewportHeight - camera.anchorY) / camera.pixelsPerMeter,
    endDistanceMeters: camera.focus.yMeters + camera.anchorY / camera.pixelsPerMeter,
  };
  const spans: LaneMarkerSpan[] = [];
  const firstCadenceIndex = Math.floor(window.startDistanceMeters / road.markerCadenceMeters);

  for (
    let markerStart = firstCadenceIndex * road.markerCadenceMeters;
    markerStart <= window.endDistanceMeters;
    markerStart += road.markerCadenceMeters
  ) {
    const markerEnd = markerStart + road.markerLengthMeters;
    const clippedStart = Math.max(markerStart, window.startDistanceMeters);
    const clippedEnd = Math.min(markerEnd, window.endDistanceMeters);
    if (clippedEnd <= clippedStart) continue;

    for (const lateralMeters of road.laneBoundaryOffsetsMeters) {
      spans.push({
        lateralMeters,
        startDistanceMeters: clippedStart,
        endDistanceMeters: clippedEnd,
      });
    }
  }

  return spans;
}

function hasCurvature(road: Road): boolean {
  return road.route.segments.some(segment => segment.curvaturePerMeter !== 0);
}

function buildCurvedRoadDrawables(
  road: Road,
  camera: RoadCamera,
  tuning: RoadSceneTuning
): readonly Drawable[] {
  const startDistanceMeters =
    camera.focus.yMeters - (camera.viewportHeight - camera.anchorY) / camera.pixelsPerMeter;
  const endDistanceMeters = camera.focus.yMeters + camera.anchorY / camera.pixelsPerMeter;
  const samples = sampleRoadWindow(
    road,
    { startDistanceMeters, endDistanceMeters },
    Math.max(2, 24 / camera.pixelsPerMeter)
  );
  const drawables: Drawable[] = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    drawables.push(
      crossSectionQuad(
        camera,
        previous.shoulderEdges[0],
        previous.roadEdges[0],
        current.roadEdges[0],
        current.shoulderEdges[0],
        tuning.shoulderColor
      ),
      crossSectionQuad(
        camera,
        previous.roadEdges[1],
        previous.shoulderEdges[1],
        current.shoulderEdges[1],
        current.roadEdges[1],
        tuning.shoulderColor
      ),
      crossSectionQuad(
        camera,
        previous.roadEdges[0],
        previous.roadEdges[1],
        current.roadEdges[1],
        current.roadEdges[0],
        tuning.roadColor
      ),
      barrierSegment(camera, road, previous, current, 'left', tuning.barrierColor),
      barrierSegment(camera, road, previous, current, 'right', tuning.barrierColor)
    );
  }

  for (const marker of visibleLaneMarkerSpans(road, camera)) {
    const halfWidth = tuning.laneMarkerWidthMeters / 2;
    const startLeft = routeToWorld(road.route, {
      distanceAlongRouteMeters: marker.startDistanceMeters,
      lateralOffsetMeters: marker.lateralMeters - halfWidth,
    });
    const startRight = routeToWorld(road.route, {
      distanceAlongRouteMeters: marker.startDistanceMeters,
      lateralOffsetMeters: marker.lateralMeters + halfWidth,
    });
    const endLeft = routeToWorld(road.route, {
      distanceAlongRouteMeters: marker.endDistanceMeters,
      lateralOffsetMeters: marker.lateralMeters - halfWidth,
    });
    const endRight = routeToWorld(road.route, {
      distanceAlongRouteMeters: marker.endDistanceMeters,
      lateralOffsetMeters: marker.lateralMeters + halfWidth,
    });
    drawables.push(
      crossSectionQuad(camera, startLeft, startRight, endRight, endLeft, tuning.laneMarkerColor)
    );
  }
  return drawables;
}

function barrierSegment(
  camera: RoadCamera,
  road: Road,
  previous: ReturnType<typeof sampleRoad>,
  current: ReturnType<typeof sampleRoad>,
  side: 'left' | 'right',
  color: string
): Drawable {
  const lateral = side === 'left' ? road.leftBarrierLateralMeters : road.rightBarrierLateralMeters;
  const halfWidth = 0.09;
  const previousInner = routeToWorld(road.route, {
    distanceAlongRouteMeters: previous.distanceAlongRouteMeters,
    lateralOffsetMeters: lateral - (side === 'left' ? -halfWidth : halfWidth),
  });
  const previousOuter = routeToWorld(road.route, {
    distanceAlongRouteMeters: previous.distanceAlongRouteMeters,
    lateralOffsetMeters: lateral + (side === 'left' ? -halfWidth : halfWidth),
  });
  const currentInner = routeToWorld(road.route, {
    distanceAlongRouteMeters: current.distanceAlongRouteMeters,
    lateralOffsetMeters: lateral - (side === 'left' ? -halfWidth : halfWidth),
  });
  const currentOuter = routeToWorld(road.route, {
    distanceAlongRouteMeters: current.distanceAlongRouteMeters,
    lateralOffsetMeters: lateral + (side === 'left' ? -halfWidth : halfWidth),
  });
  return crossSectionQuad(camera, previousInner, previousOuter, currentOuter, currentInner, color);
}

function crossSectionQuad(
  camera: RoadCamera,
  a: WorldPoint,
  b: WorldPoint,
  c: WorldPoint,
  d: WorldPoint,
  color: string
): Drawable {
  return {
    kind: 'polygon',
    points: [a, b, c, d].map(point => projectWorldPoint(camera, point)),
    color,
  };
}

function straightMarker(
  camera: RoadCamera,
  marker: LaneMarkerSpan,
  widthMeters: number,
  color: string
): Drawable {
  const top = projectWorldPoint(camera, {
    xMeters: marker.lateralMeters,
    yMeters: marker.endDistanceMeters,
  });
  const bottom = projectWorldPoint(camera, {
    xMeters: marker.lateralMeters,
    yMeters: marker.startDistanceMeters,
  });
  const width = widthMeters * camera.pixelsPerMeter;
  return { kind: 'rect', x: top.x - width / 2, y: top.y, w: width, h: bottom.y - top.y, color };
}

function horizontalBand(
  camera: RoadCamera,
  leftLateralMeters: number,
  rightLateralMeters: number,
  color: string
): Drawable {
  const left = projectWorldPoint(camera, {
    xMeters: leftLateralMeters,
    yMeters: camera.focus.yMeters,
  });
  const right = projectWorldPoint(camera, {
    xMeters: rightLateralMeters,
    yMeters: camera.focus.yMeters,
  });

  return {
    kind: 'rect',
    x: left.x,
    y: 0,
    w: right.x - left.x,
    h: camera.viewportHeight,
    color,
  };
}

function parallaxBand(camera: RoadCamera, band: ParallaxBand): Drawable {
  const left = projectWorldPoint(camera, {
    xMeters: band.leftLateralMeters,
    yMeters: camera.focus.yMeters,
  });
  const right = projectWorldPoint(camera, {
    xMeters: band.rightLateralMeters,
    yMeters: camera.focus.yMeters,
  });
  const focusDistanceMeters = camera.focus.yMeters * band.speedRatio;
  const topY =
    camera.anchorY - (band.endDistanceMeters - focusDistanceMeters) * camera.pixelsPerMeter;
  const bottomY =
    camera.anchorY - (band.startDistanceMeters - focusDistanceMeters) * camera.pixelsPerMeter;

  return {
    kind: 'rect',
    x: left.x,
    y: topY,
    w: right.x - left.x,
    h: bottomY - topY,
    color: band.color,
  };
}

function barrier(camera: RoadCamera, lateralMeters: number, color: string): Drawable {
  const center = projectWorldPoint(camera, {
    xMeters: lateralMeters,
    yMeters: camera.focus.yMeters,
  });
  const width = Math.max(2, camera.pixelsPerMeter * 0.18);

  return {
    kind: 'rect',
    x: center.x - width / 2,
    y: 0,
    w: width,
    h: camera.viewportHeight,
    color,
  };
}

function buildTruckDrawables(
  camera: RoadCamera,
  truck: TruckState,
  dimensions: RoadSceneTruckDimensions
): readonly Drawable[] {
  const cabCenter = projectWorldPoint(camera, truck.position);
  const hitchLengthMeters =
    dimensions.cabLengthMeters / 2 + dimensions.trailerLengthMeters / 2 + dimensions.hitchGapMeters;
  const trailerCenter = projectWorldPoint(camera, {
    xMeters: truck.position.xMeters - Math.sin(truck.trailerHeadingRadians) * hitchLengthMeters,
    yMeters: truck.position.yMeters - Math.cos(truck.trailerHeadingRadians) * hitchLengthMeters,
  });
  return [
    {
      kind: 'oriented-sprite',
      centerX: cabCenter.x,
      centerY: cabCenter.y,
      w: dimensions.cabWidthMeters * camera.pixelsPerMeter,
      h: dimensions.cabLengthMeters * camera.pixelsPerMeter,
      rotationRadians: truck.headingRadians,
      src: TRUCK_CAB_SPRITE,
    },
    {
      kind: 'oriented-sprite',
      centerX: trailerCenter.x,
      centerY: trailerCenter.y,
      w: dimensions.trailerWidthMeters * camera.pixelsPerMeter,
      h: dimensions.trailerLengthMeters * camera.pixelsPerMeter,
      rotationRadians: truck.trailerHeadingRadians,
      src: TRUCK_TRAILER_SPRITE,
    },
  ];
}

function validateTruckDimensions(dimensions: RoadSceneTruckDimensions): void {
  if (typeof dimensions !== 'object' || dimensions === null) {
    throw new TypeError('RoadSceneTruckDimensions must be an object');
  }
  assertPositive('cabWidthMeters', dimensions.cabWidthMeters);
  assertPositive('cabLengthMeters', dimensions.cabLengthMeters);
  assertPositive('trailerWidthMeters', dimensions.trailerWidthMeters);
  assertPositive('trailerLengthMeters', dimensions.trailerLengthMeters);
  validateHitchOffset(
    'hitchGapMeters',
    dimensions.hitchGapMeters,
    dimensions.cabLengthMeters,
    dimensions.trailerLengthMeters
  );
}

function validateHitchOffset(
  label: string,
  hitchGapMeters: number,
  cabLengthMeters: number,
  trailerLengthMeters: number
): void {
  assertFinite(label, hitchGapMeters);
  const centerDistanceMeters = cabLengthMeters / 2 + trailerLengthMeters / 2 + hitchGapMeters;
  if (centerDistanceMeters <= 0) {
    throw new RangeError(
      `${label} must keep the trailer center behind the cab center, got ${hitchGapMeters}`
    );
  }
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function validateParallaxLayer(layer: ParallaxLayerTuning): void {
  if (typeof layer !== 'object' || layer === null) {
    throw new TypeError('ParallaxLayerTuning must be an object');
  }
  assertFinite('speedRatio', layer.speedRatio);
  assertFinite('cadenceMeters', layer.cadenceMeters);
  assertFinite('bandLengthMeters', layer.bandLengthMeters);
  assertFinite('bandWidthMeters', layer.bandWidthMeters);
  assertFinite('lateralGapMeters', layer.lateralGapMeters);

  if (layer.speedRatio < 0 || layer.speedRatio >= 1) {
    throw new RangeError(`speedRatio must be in [0, 1), got ${layer.speedRatio}`);
  }
  assertPositive('cadenceMeters', layer.cadenceMeters);
  assertPositive('bandLengthMeters', layer.bandLengthMeters);
  assertPositive('bandWidthMeters', layer.bandWidthMeters);
  assertNonNegative('lateralGapMeters', layer.lateralGapMeters);
  if (layer.bandLengthMeters >= layer.cadenceMeters) {
    throw new RangeError(
      `bandLengthMeters must be less than cadenceMeters, got ${layer.bandLengthMeters} >= ${layer.cadenceMeters}`
    );
  }
}

function positiveModulo(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}
