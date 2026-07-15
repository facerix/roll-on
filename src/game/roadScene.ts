import type { Drawable, Scene } from '/src/engine/renderer.js';
import type { LaneMarkerSpan, Road } from '/src/game/road.js';
import type { RoadCamera, ScreenPoint } from '/src/game/roadCamera.js';
import type { TruckState } from '/src/game/truck.js';

export interface RoadSceneTruckDimensions {
  readonly cabWidthMeters: number;
  readonly cabLengthMeters: number;
  readonly trailerWidthMeters: number;
  readonly trailerLengthMeters: number;
  readonly hitchGapMeters: number;
}

export interface RoadSceneTuning {
  readonly backgroundColor: string;
  readonly shoulderColor: string;
  readonly roadColor: string;
  readonly barrierColor: string;
  readonly laneMarkerColor: string;
  readonly laneMarkerWidthMeters: number;
}

export interface BuildRoadSceneOptions {
  readonly road: Road;
  readonly camera: RoadCamera;
  readonly truck: TruckState;
  readonly truckDimensions: RoadSceneTruckDimensions;
  readonly tuning?: RoadSceneTuning;
}

export const DEFAULT_ROAD_SCENE_TUNING: RoadSceneTuning = Object.freeze({
  backgroundColor: '#192327',
  shoulderColor: '#5b5145',
  roadColor: '#30343b',
  barrierColor: '#d8d2c4',
  laneMarkerColor: '#f6d96d',
  laneMarkerWidthMeters: 0.18,
});

export function buildRoadScene(options: BuildRoadSceneOptions): Scene {
  const tuning = options.tuning ?? DEFAULT_ROAD_SCENE_TUNING;
  validateTruckDimensions(options.truckDimensions);
  assertPositive('laneMarkerWidthMeters', tuning.laneMarkerWidthMeters);

  const drawables: Drawable[] = [
    {
      kind: 'rect',
      x: 0,
      y: 0,
      w: options.camera.viewportWidth,
      h: options.camera.viewportHeight,
      color: tuning.backgroundColor,
    },
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
    barrier(options.camera, options.road.rightBarrierLateralMeters, tuning.barrierColor),
  ];

  for (const marker of visibleLaneMarkerSpans(options.road, options.camera)) {
    const top = projectWorldPoint(options.camera, {
      lateralMeters: marker.lateralMeters,
      distanceMeters: marker.endDistanceMeters,
    });
    const bottom = projectWorldPoint(options.camera, {
      lateralMeters: marker.lateralMeters,
      distanceMeters: marker.startDistanceMeters,
    });
    const width = tuning.laneMarkerWidthMeters * options.camera.pixelsPerMeter;
    drawables.push({
      kind: 'rect',
      x: top.x - width / 2,
      y: top.y,
      w: width,
      h: bottom.y - top.y,
      color: tuning.laneMarkerColor,
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

function visibleLaneMarkerSpans(road: Road, camera: RoadCamera): readonly LaneMarkerSpan[] {
  const window = {
    startDistanceMeters:
      camera.focus.distanceMeters -
      (camera.viewportHeight - camera.anchorY) / camera.pixelsPerMeter,
    endDistanceMeters: camera.focus.distanceMeters + camera.anchorY / camera.pixelsPerMeter,
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

function projectWorldPoint(camera: RoadCamera, position: TruckState['position']): ScreenPoint {
  return {
    x:
      camera.anchorX +
      (position.lateralMeters - camera.focus.lateralMeters) * camera.pixelsPerMeter,
    y:
      camera.anchorY -
      (position.distanceMeters - camera.focus.distanceMeters) * camera.pixelsPerMeter,
  };
}

function horizontalBand(
  camera: RoadCamera,
  leftLateralMeters: number,
  rightLateralMeters: number,
  color: string
): Drawable {
  const left = projectWorldPoint(camera, {
    lateralMeters: leftLateralMeters,
    distanceMeters: camera.focus.distanceMeters,
  });
  const right = projectWorldPoint(camera, {
    lateralMeters: rightLateralMeters,
    distanceMeters: camera.focus.distanceMeters,
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

function barrier(camera: RoadCamera, lateralMeters: number, color: string): Drawable {
  const center = projectWorldPoint(camera, {
    lateralMeters,
    distanceMeters: camera.focus.distanceMeters,
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

  return [
    {
      kind: 'oriented-rect',
      centerX: trailerCenter.x,
      centerY: trailerCenter.y,
      w: dimensions.trailerWidthMeters * camera.pixelsPerMeter,
      h: dimensions.trailerLengthMeters * camera.pixelsPerMeter,
      rotationRadians: truck.trailerHeadingRadians,
      color: colors.trailer,
    },
    {
      kind: 'oriented-rect',
      centerX: cabCenter.x,
      centerY: cabCenter.y,
      w: dimensions.cabWidthMeters * camera.pixelsPerMeter,
      h: dimensions.cabLengthMeters * camera.pixelsPerMeter,
      rotationRadians: truck.headingRadians,
      color: colors.cab,
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
  assertNonNegative('hitchGapMeters', dimensions.hitchGapMeters);
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
