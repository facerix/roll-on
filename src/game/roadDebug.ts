import type { Drawable } from '/src/engine/renderer.js';
import { sampleRoadWindow, type Road, type RoadDistanceWindow } from '/src/game/road.js';
import { projectWorldPoint, type RoadCamera } from '/src/game/roadCamera.js';
import type { TruckState } from '/src/game/truck.js';
import type { TrafficVehicle } from '/src/game/traffic.js';
import type { WorldPoint } from '/src/game/worldGeometry.js';

export interface RoadDebugOptions {
  readonly road: Road;
  readonly camera: RoadCamera;
  readonly window: RoadDistanceWindow;
  readonly maximumStepMeters?: number;
  readonly truck?: TruckState;
  readonly traffic?: readonly TrafficVehicle[];
}

/** Build diagnostic geometry directly from route, road, and actor simulation state. */
export function buildRoadDebugDrawables(options: RoadDebugOptions): readonly Drawable[] {
  const step = options.maximumStepMeters ?? 5;
  const samples = sampleRoadWindow(options.road, options.window, step);
  const drawables: Drawable[] = [];

  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    drawables.push(
      worldLine(options.camera, previous.center, current.center, '#ff4fd8', 0.14),
      worldLine(options.camera, previous.barrierEdges[0], current.barrierEdges[0], '#ff8a3d', 0.12),
      worldLine(options.camera, previous.barrierEdges[1], current.barrierEdges[1], '#ff8a3d', 0.12),
      worldLine(options.camera, previous.laneCenters[0]!, current.laneCenters[0]!, '#68e0ff', 0.08),
      worldLine(
        options.camera,
        previous.laneCenters[previous.laneCenters.length - 1]!,
        current.laneCenters[current.laneCenters.length - 1]!,
        '#68e0ff',
        0.08
      )
    );
  }

  for (const sample of samples) {
    const tangentEnd = {
      xMeters: sample.center.xMeters + sample.routeSample.tangent.xMeters * 4,
      yMeters: sample.center.yMeters + sample.routeSample.tangent.yMeters * 4,
    };
    const normalEnd = {
      xMeters: sample.center.xMeters + sample.routeSample.normal.xMeters * 4,
      yMeters: sample.center.yMeters + sample.routeSample.normal.yMeters * 4,
    };
    drawables.push(
      worldLine(options.camera, sample.center, tangentEnd, '#ffff66', 0.1),
      worldLine(options.camera, sample.center, normalEnd, '#66ff88', 0.1)
    );
  }

  if (options.truck) {
    drawables.push(worldPoint(options.camera, options.truck.position, '#ffffff', 0.8));
  }
  for (const vehicle of options.traffic ?? []) {
    drawables.push(worldPoint(options.camera, vehicle.worldPosition, '#ff5f1f', 0.6));
  }
  return Object.freeze(drawables);
}

function worldLine(
  camera: RoadCamera,
  start: WorldPoint,
  end: WorldPoint,
  color: string,
  widthMeters: number
): Drawable {
  const a = projectWorldPoint(camera, start);
  const b = projectWorldPoint(camera, end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return worldPoint(camera, start, color, widthMeters);
  const acrossX = ((-dy / length) * (widthMeters * camera.pixelsPerMeter)) / 2;
  const acrossY = ((dx / length) * (widthMeters * camera.pixelsPerMeter)) / 2;
  return {
    kind: 'polygon',
    points: [
      { x: a.x + acrossX, y: a.y + acrossY },
      { x: b.x + acrossX, y: b.y + acrossY },
      { x: b.x - acrossX, y: b.y - acrossY },
      { x: a.x - acrossX, y: a.y - acrossY },
    ],
    color,
  };
}

function worldPoint(
  camera: RoadCamera,
  point: WorldPoint,
  color: string,
  sizeMeters: number
): Drawable {
  const projected = projectWorldPoint(camera, point);
  const size = Math.max(2, sizeMeters * camera.pixelsPerMeter);
  return {
    kind: 'polygon',
    points: [
      { x: projected.x - size / 2, y: projected.y - size / 2 },
      { x: projected.x + size / 2, y: projected.y - size / 2 },
      { x: projected.x + size / 2, y: projected.y + size / 2 },
      { x: projected.x - size / 2, y: projected.y + size / 2 },
    ],
    color,
  };
}
