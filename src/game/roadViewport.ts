import type { Road } from '/src/game/road.js';
import type { RoadCameraTuning, RoadViewport } from '/src/game/roadCamera.js';
import {
  ROAD_VIEWPORT_HEIGHT_PIXELS,
  STAGE_HEIGHT_PIXELS,
  STAGE_WIDTH_PIXELS,
} from '/src/game/stageLayout.js';

const ROAD_WIDTH_PADDING = 1.35;
const VISIBLE_HEIGHT_METERS = 30;
const MIN_PIXELS_PER_METER = 8;
const MAX_PIXELS_PER_METER = 20;
const TRUCK_ANCHOR_HEIGHT_RATIO = 0.58;
const REAR_VIEW_HEIGHT_PIXELS = STAGE_HEIGHT_PIXELS * (1 - TRUCK_ANCHOR_HEIGHT_RATIO);

export function measureRoadViewport(): RoadViewport {
  return {
    width: STAGE_WIDTH_PIXELS,
    height: ROAD_VIEWPORT_HEIGHT_PIXELS,
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
    // Removing the HUD bay from the canvas must translate the camera upward,
    // not crop the rear approach. Preserve the old cab-to-bottom distance so
    // patrols behind the trailer move above the dashboard boundary.
    anchorY: clamp(viewport.height - REAR_VIEW_HEIGHT_PIXELS, 0, viewport.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
