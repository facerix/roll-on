import type { RoadDistanceWindow } from '/src/game/road.js';
import { validatePoint, type WorldPoint } from '/src/game/worldGeometry.js';

export interface RoadViewport {
  readonly width: number;
  readonly height: number;
}

export interface RoadCameraTuning {
  readonly pixelsPerMeter: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface RoadCamera {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pixelsPerMeter: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly focus: WorldPoint;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_ROAD_CAMERA_TUNING: RoadCameraTuning = Object.freeze({
  pixelsPerMeter: 10,
  anchorX: 160,
  anchorY: 360,
});

export function buildRoadCamera(
  focus: WorldPoint,
  viewport: RoadViewport,
  tuning: RoadCameraTuning
): RoadCamera {
  validatePoint('focus', focus);
  validateViewport(viewport);
  validateTuning(tuning, viewport);

  return Object.freeze({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    pixelsPerMeter: tuning.pixelsPerMeter,
    anchorX: tuning.anchorX,
    anchorY: tuning.anchorY,
    focus: Object.freeze({ xMeters: focus.xMeters, yMeters: focus.yMeters }),
  });
}

export function projectWorldPoint(camera: RoadCamera, position: WorldPoint): ScreenPoint {
  validateCamera(camera);
  validatePoint('position', position);

  return {
    x: camera.anchorX + (position.xMeters - camera.focus.xMeters) * camera.pixelsPerMeter,
    y: camera.anchorY - (position.yMeters - camera.focus.yMeters) * camera.pixelsPerMeter,
  };
}

export function getVisibleWorldDistanceRange(camera: RoadCamera): RoadDistanceWindow {
  validateCamera(camera);

  return {
    startDistanceMeters:
      camera.focus.yMeters - (camera.viewportHeight - camera.anchorY) / camera.pixelsPerMeter,
    endDistanceMeters: camera.focus.yMeters + camera.anchorY / camera.pixelsPerMeter,
  };
}

function validateCamera(camera: RoadCamera): void {
  if (typeof camera !== 'object' || camera === null) {
    throw new TypeError('RoadCamera must be an object');
  }
  validatePoint('camera.focus', camera.focus);
  validateViewport({ width: camera.viewportWidth, height: camera.viewportHeight });
  validateTuning(
    {
      pixelsPerMeter: camera.pixelsPerMeter,
      anchorX: camera.anchorX,
      anchorY: camera.anchorY,
    },
    { width: camera.viewportWidth, height: camera.viewportHeight }
  );
}

function validateViewport(viewport: RoadViewport): void {
  if (typeof viewport !== 'object' || viewport === null) {
    throw new TypeError('RoadViewport must be an object');
  }
  assertFinite('viewport.width', viewport.width);
  assertFinite('viewport.height', viewport.height);
  assertPositive('viewport.width', viewport.width);
  assertPositive('viewport.height', viewport.height);
}

function validateTuning(tuning: RoadCameraTuning, viewport: RoadViewport): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('RoadCameraTuning must be an object');
  }
  assertFinite('pixelsPerMeter', tuning.pixelsPerMeter);
  assertFinite('anchorX', tuning.anchorX);
  assertFinite('anchorY', tuning.anchorY);
  assertPositive('pixelsPerMeter', tuning.pixelsPerMeter);
  assertRange('anchorX', tuning.anchorX, 0, viewport.width);
  assertRange('anchorY', tuning.anchorY, 0, viewport.height);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  if (value <= 0) {
    throw new RangeError(`${label} must be positive, got ${value}`);
  }
}

function assertRange(label: string, value: number, min: number, max: number): void {
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}
