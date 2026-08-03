import type { RoadDistanceWindow } from '/src/game/road.js';
import {
  normalizeHeading,
  shortestHeadingDelta,
  validatePoint,
  type WorldPoint,
} from '/src/game/worldGeometry.js';

export interface RoadViewport {
  readonly width: number;
  readonly height: number;
}

export interface RoadCameraTuning {
  readonly pixelsPerMeter: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly orientationResponsePerSecond?: number;
}

export interface RoadCamera {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pixelsPerMeter: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly focus: WorldPoint;
  /** World heading aligned to the camera's local forward axis. Zero is world-fixed. */
  readonly rotationRadians: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_ROAD_CAMERA_TUNING: RoadCameraTuning = Object.freeze({
  pixelsPerMeter: 10,
  anchorX: 160,
  anchorY: 360,
  orientationResponsePerSecond: 4,
});

export function buildRoadCamera(
  focus: WorldPoint,
  viewport: RoadViewport,
  tuning: RoadCameraTuning,
  rotationRadians = 0
): RoadCamera {
  validatePoint('focus', focus);
  validateViewport(viewport);
  validateTuning(tuning, viewport);
  assertFinite('rotationRadians', rotationRadians);

  return Object.freeze({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    pixelsPerMeter: tuning.pixelsPerMeter,
    anchorX: tuning.anchorX,
    anchorY: tuning.anchorY,
    focus: Object.freeze({ xMeters: focus.xMeters, yMeters: focus.yMeters }),
    rotationRadians: normalizeHeading(rotationRadians),
  });
}

/** Exponential, frame-rate-independent camera orientation follow. */
export function stepRoadCameraRotation(
  currentRotationRadians: number,
  targetRotationRadians: number,
  dtSeconds: number,
  responsePerSecond: number
): number {
  assertFinite('currentRotationRadians', currentRotationRadians);
  assertFinite('targetRotationRadians', targetRotationRadians);
  assertFinite('dtSeconds', dtSeconds);
  assertFinite('responsePerSecond', responsePerSecond);
  if (dtSeconds < 0) throw new RangeError(`dtSeconds must be non-negative, got ${dtSeconds}`);
  if (responsePerSecond <= 0) {
    throw new RangeError(`responsePerSecond must be positive, got ${responsePerSecond}`);
  }
  const fraction = 1 - Math.exp(-responsePerSecond * dtSeconds);
  return normalizeHeading(
    currentRotationRadians +
      shortestHeadingDelta(targetRotationRadians, currentRotationRadians) * fraction
  );
}

export function projectWorldPoint(camera: RoadCamera, position: WorldPoint): ScreenPoint {
  validateCamera(camera);
  validatePoint('position', position);

  const deltaX = position.xMeters - camera.focus.xMeters;
  const deltaY = position.yMeters - camera.focus.yMeters;
  const sin = Math.sin(camera.rotationRadians);
  const cos = Math.cos(camera.rotationRadians);
  const localAcross = cos * deltaX - sin * deltaY;
  const localForward = sin * deltaX + cos * deltaY;
  return {
    x: camera.anchorX + localAcross * camera.pixelsPerMeter,
    y: camera.anchorY - localForward * camera.pixelsPerMeter,
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
  assertFinite('camera.rotationRadians', camera.rotationRadians);
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
  if (tuning.orientationResponsePerSecond !== undefined) {
    assertFinite('orientationResponsePerSecond', tuning.orientationResponsePerSecond);
    assertPositive('orientationResponsePerSecond', tuning.orientationResponsePerSecond);
  }
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
