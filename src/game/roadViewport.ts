import type { Road } from '/src/game/road.js';
import type { RoadCameraTuning, RoadViewport } from '/src/game/roadCamera.js';

const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 480;
const ROAD_WIDTH_PADDING = 1.35;
const VISIBLE_HEIGHT_METERS = 30;
const MIN_PIXELS_PER_METER = 8;
const MAX_PIXELS_PER_METER = 20;
const TRUCK_ANCHOR_HEIGHT_RATIO = 0.58;

export function measureRoadViewport(): RoadViewport {
  return {
    width: Math.max(MIN_VIEWPORT_WIDTH, Math.round(window.innerWidth)),
    height: Math.max(MIN_VIEWPORT_HEIGHT, Math.round(window.innerHeight)),
  };
}

export function buildRoadCameraTuning(road: Road, viewport: RoadViewport): RoadCameraTuning {
  const roadWidthMeters = road.rightShoulderEdgeMeters - road.leftShoulderEdgeMeters;
  const widthScale = viewport.width / (roadWidthMeters * ROAD_WIDTH_PADDING);
  const heightScale = viewport.height / VISIBLE_HEIGHT_METERS;

  return {
    pixelsPerMeter: clamp(
      Math.min(widthScale, heightScale),
      MIN_PIXELS_PER_METER,
      MAX_PIXELS_PER_METER
    ),
    anchorX: viewport.width / 2,
    anchorY: viewport.height * TRUCK_ANCHOR_HEIGHT_RATIO,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
