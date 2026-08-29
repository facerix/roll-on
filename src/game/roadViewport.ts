import type { Road } from '/src/game/road.js';
import type { RoadCameraTuning, RoadViewport } from '/src/game/roadCamera.js';
import type { TruckFootprintDimensions } from '/src/game/roadCollision.js';
import { ROAD_VIEWPORT_HEIGHT_PIXELS, STAGE_WIDTH_PIXELS } from '/src/game/stageLayout.js';

export interface RoadCameraFramingTuning {
  readonly roadWidthPadding: number;
  readonly minimumForwardSightDistanceMeters: number;
  readonly maximumForwardSightDistanceMeters: number;
  readonly rearMarginMeters: number;
  readonly maximumPixelsPerMeter: number;
}

export interface BuildRoadCameraTuningOptions {
  readonly speedMetersPerSecond: number;
  readonly maximumSpeedMetersPerSecond: number;
  readonly truckDimensions: TruckFootprintDimensions;
  readonly framing?: RoadCameraFramingTuning;
}

export const DEFAULT_ROAD_CAMERA_FRAMING_TUNING: RoadCameraFramingTuning = Object.freeze({
  roadWidthPadding: 1.35,
  minimumForwardSightDistanceMeters: 20,
  maximumForwardSightDistanceMeters: 40,
  rearMarginMeters: 1.5,
  maximumPixelsPerMeter: 20,
});

export function measureRoadViewport(): RoadViewport {
  return {
    width: STAGE_WIDTH_PIXELS,
    height: ROAD_VIEWPORT_HEIGHT_PIXELS,
  };
}

export function buildRoadCameraTuning(
  road: Road,
  viewport: RoadViewport,
  options: BuildRoadCameraTuningOptions
): RoadCameraTuning {
  validateViewport(viewport);
  validateOptions(options);
  const framing = options.framing ?? DEFAULT_ROAD_CAMERA_FRAMING_TUNING;
  validateFraming(framing);

  const roadWidthMeters = road.rightShoulderEdgeMeters - road.leftShoulderEdgeMeters;
  assertPositive('road width', roadWidthMeters);
  const widthScale = viewport.width / (roadWidthMeters * framing.roadWidthPadding);
  const speedLevel = clamp(
    options.speedMetersPerSecond / options.maximumSpeedMetersPerSecond,
    0,
    1
  );
  const forwardSightDistanceMeters =
    framing.minimumForwardSightDistanceMeters +
    (framing.maximumForwardSightDistanceMeters - framing.minimumForwardSightDistanceMeters) *
      speedLevel;
  const rearViewDistanceMeters =
    calculateTruckRearExtentMeters(options.truckDimensions) + framing.rearMarginMeters;
  const heightScale = viewport.height / (forwardSightDistanceMeters + rearViewDistanceMeters);
  const pixelsPerMeter = Math.min(widthScale, heightScale, framing.maximumPixelsPerMeter);
  assertPositive('pixelsPerMeter', pixelsPerMeter);

  return {
    pixelsPerMeter,
    anchorX: viewport.width / 2,
    // Reserve the rig's world-space rear depth rather than a fixed screen
    // ratio. As speed increases and scale falls, the rig moves down while the
    // same physical trailer margin stays visible above the HUD boundary.
    anchorY: clamp(viewport.height - rearViewDistanceMeters * pixelsPerMeter, 0, viewport.height),
  };
}

/**
 * Conservative rear reach from the cab center. Half-diagonals keep both cab
 * and trailer inside the viewport when their oriented sprites rotate away
 * from the road-following camera during ordinary articulation.
 */
export function calculateTruckRearExtentMeters(dimensions: TruckFootprintDimensions): number {
  validateTruckDimensions(dimensions);
  const cabHalfDiagonalMeters = Math.hypot(
    dimensions.cabWidthMeters / 2,
    dimensions.cabLengthMeters / 2
  );
  const trailerCenterFromCabMeters =
    dimensions.cabLengthMeters / 2 +
    Math.abs(dimensions.trailerLengthMeters / 2 + dimensions.hitchGapMeters);
  const trailerHalfDiagonalMeters = Math.hypot(
    dimensions.trailerWidthMeters / 2,
    dimensions.trailerLengthMeters / 2
  );
  return Math.max(cabHalfDiagonalMeters, trailerCenterFromCabMeters + trailerHalfDiagonalMeters);
}

function validateOptions(options: BuildRoadCameraTuningOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('camera tuning options must be an object');
  }
  assertNonNegative('speedMetersPerSecond', options.speedMetersPerSecond);
  assertPositive('maximumSpeedMetersPerSecond', options.maximumSpeedMetersPerSecond);
}

function validateFraming(framing: RoadCameraFramingTuning): void {
  if (typeof framing !== 'object' || framing === null) {
    throw new TypeError('camera framing tuning must be an object');
  }
  assertPositive('roadWidthPadding', framing.roadWidthPadding);
  assertPositive('minimumForwardSightDistanceMeters', framing.minimumForwardSightDistanceMeters);
  assertPositive('maximumForwardSightDistanceMeters', framing.maximumForwardSightDistanceMeters);
  if (framing.maximumForwardSightDistanceMeters < framing.minimumForwardSightDistanceMeters) {
    throw new RangeError(
      'maximumForwardSightDistanceMeters must be at least minimumForwardSightDistanceMeters'
    );
  }
  assertNonNegative('rearMarginMeters', framing.rearMarginMeters);
  assertPositive('maximumPixelsPerMeter', framing.maximumPixelsPerMeter);
}

function validateTruckDimensions(dimensions: TruckFootprintDimensions): void {
  if (typeof dimensions !== 'object' || dimensions === null) {
    throw new TypeError('truckDimensions must be an object');
  }
  assertPositive('truckDimensions.cabWidthMeters', dimensions.cabWidthMeters);
  assertPositive('truckDimensions.cabLengthMeters', dimensions.cabLengthMeters);
  assertPositive('truckDimensions.trailerWidthMeters', dimensions.trailerWidthMeters);
  assertPositive('truckDimensions.trailerLengthMeters', dimensions.trailerLengthMeters);
  assertFinite('truckDimensions.hitchGapMeters', dimensions.hitchGapMeters);
  const trailerCenterFromCabMeters =
    dimensions.cabLengthMeters / 2 + dimensions.trailerLengthMeters / 2 + dimensions.hitchGapMeters;
  if (trailerCenterFromCabMeters <= 0) {
    throw new RangeError('truckDimensions.hitchGapMeters must keep the trailer behind the cab');
  }
}

function validateViewport(viewport: RoadViewport): void {
  if (typeof viewport !== 'object' || viewport === null) {
    throw new TypeError('viewport must be an object');
  }
  assertPositive('viewport.width', viewport.width);
  assertPositive('viewport.height', viewport.height);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
