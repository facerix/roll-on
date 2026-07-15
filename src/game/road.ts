export interface RoadTuning {
  readonly laneCount: number;
  readonly laneWidthMeters: number;
  readonly shoulderWidthMeters: number;
  readonly markerCadenceMeters: number;
  readonly markerLengthMeters: number;
}

export interface Road {
  readonly laneCount: number;
  readonly laneWidthMeters: number;
  readonly laneCenterOffsetsMeters: readonly number[];
  readonly laneBoundaryOffsetsMeters: readonly number[];
  readonly shoulderWidthMeters: number;
  readonly leftRoadEdgeMeters: number;
  readonly rightRoadEdgeMeters: number;
  readonly leftShoulderEdgeMeters: number;
  readonly rightShoulderEdgeMeters: number;
  readonly leftBarrierLateralMeters: number;
  readonly rightBarrierLateralMeters: number;
  readonly markerCadenceMeters: number;
  readonly markerLengthMeters: number;
}

export interface RoadDistanceWindow {
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
}

export interface LaneMarkerSpan {
  readonly lateralMeters: number;
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
}

export const DEFAULT_ROAD_TUNING: RoadTuning = Object.freeze({
  laneCount: 4,
  laneWidthMeters: 3.7,
  shoulderWidthMeters: 2.5,
  markerCadenceMeters: 12,
  markerLengthMeters: 5,
});

export function createRoad(tuning: RoadTuning): Road {
  validateRoadTuning(tuning);

  const roadHalfWidthMeters = roundMeters((tuning.laneCount * tuning.laneWidthMeters) / 2);
  const leftRoadEdgeMeters = roundMeters(-roadHalfWidthMeters);
  const rightRoadEdgeMeters = roadHalfWidthMeters;
  const leftShoulderEdgeMeters = roundMeters(leftRoadEdgeMeters - tuning.shoulderWidthMeters);
  const rightShoulderEdgeMeters = roundMeters(rightRoadEdgeMeters + tuning.shoulderWidthMeters);

  return Object.freeze({
    laneCount: tuning.laneCount,
    laneWidthMeters: tuning.laneWidthMeters,
    laneCenterOffsetsMeters: Object.freeze(buildLaneCenters(tuning)),
    laneBoundaryOffsetsMeters: Object.freeze(buildLaneBoundaries(tuning)),
    shoulderWidthMeters: tuning.shoulderWidthMeters,
    leftRoadEdgeMeters,
    rightRoadEdgeMeters,
    leftShoulderEdgeMeters,
    rightShoulderEdgeMeters,
    leftBarrierLateralMeters: leftShoulderEdgeMeters,
    rightBarrierLateralMeters: rightShoulderEdgeMeters,
    markerCadenceMeters: tuning.markerCadenceMeters,
    markerLengthMeters: tuning.markerLengthMeters,
  });
}

export function getVisibleLaneMarkerSpans(
  road: Road,
  window: RoadDistanceWindow
): readonly LaneMarkerSpan[] {
  validateRoad(road);
  assertFinite('startDistanceMeters', window.startDistanceMeters);
  assertFinite('endDistanceMeters', window.endDistanceMeters);
  if (window.endDistanceMeters < window.startDistanceMeters) {
    throw new RangeError(
      `endDistanceMeters must be >= startDistanceMeters, got ${window.endDistanceMeters} < ${window.startDistanceMeters}`
    );
  }

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

function buildLaneCenters(tuning: RoadTuning): number[] {
  const leftCenter = -((tuning.laneCount - 1) * tuning.laneWidthMeters) / 2;
  return Array.from({ length: tuning.laneCount }, (_, index) =>
    roundMeters(leftCenter + index * tuning.laneWidthMeters)
  );
}

function buildLaneBoundaries(tuning: RoadTuning): number[] {
  const leftRoadEdgeMeters = -(tuning.laneCount * tuning.laneWidthMeters) / 2;
  return Array.from({ length: tuning.laneCount - 1 }, (_, index) =>
    roundMeters(leftRoadEdgeMeters + (index + 1) * tuning.laneWidthMeters)
  );
}

function validateRoad(road: Road): void {
  if (typeof road !== 'object' || road === null) {
    throw new TypeError('Road must be an object');
  }
  validateRoadTuning(road);
}

function validateRoadTuning(tuning: RoadTuning): void {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('RoadTuning must be an object');
  }

  assertFinite('laneCount', tuning.laneCount);
  assertFinite('laneWidthMeters', tuning.laneWidthMeters);
  assertFinite('shoulderWidthMeters', tuning.shoulderWidthMeters);
  assertFinite('markerCadenceMeters', tuning.markerCadenceMeters);
  assertFinite('markerLengthMeters', tuning.markerLengthMeters);

  if (!Number.isInteger(tuning.laneCount) || tuning.laneCount < 1) {
    throw new RangeError(`laneCount must be a positive integer, got ${tuning.laneCount}`);
  }
  assertPositive('laneWidthMeters', tuning.laneWidthMeters);
  assertNonNegative('shoulderWidthMeters', tuning.shoulderWidthMeters);
  assertPositive('markerCadenceMeters', tuning.markerCadenceMeters);
  assertPositive('markerLengthMeters', tuning.markerLengthMeters);
  if (tuning.markerLengthMeters >= tuning.markerCadenceMeters) {
    throw new RangeError(
      `markerLengthMeters must be less than markerCadenceMeters, got ${tuning.markerLengthMeters} >= ${tuning.markerCadenceMeters}`
    );
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite, got ${value}`);
  }
}

function assertPositive(label: string, value: number): void {
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function roundMeters(value: number): number {
  const rounded = Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
