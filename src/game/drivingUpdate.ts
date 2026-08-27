import {
  buildEffectiveTruckTuning,
  buildFuelLimitedControls,
  DEFAULT_FUEL_TUNING,
  limitTruckSpeedForFuel,
  stepFuel,
  type FuelBurnBreakdown,
  type FuelState,
  type FuelTuning,
} from '/src/game/fuel.js';
import type { Road } from '/src/game/road.js';
import { worldToRoute, type RoutePosition } from '/src/game/route.js';
import {
  buildTruckFootprint,
  constrainTruckToRoad,
  DEFAULT_ROAD_COLLISION_TUNING,
  detectRoadBarrierImpact,
  resolveRoadBarrierContact,
  type BarrierContactState,
  type RoadBarrierImpact,
  type RoadCollisionTuning,
  type TruckFootprintDimensions,
} from '/src/game/roadCollision.js';
import {
  DEFAULT_TRUCK_TUNING,
  resolveTruckImpact,
  stepTruck,
  type TruckControls,
  type TruckState,
  type TruckTuning,
} from '/src/game/truck.js';

export interface DrivingState {
  readonly truck: TruckState;
  /** Derived route-space tracking for the Cartesian truck pose. */
  readonly routePosition: RoutePosition;
  readonly fuel: FuelState;
  readonly barrierContactState: BarrierContactState;
  readonly lastFuelBurn: FuelBurnBreakdown;
}

export interface StepDrivingOptions {
  readonly state: DrivingState;
  readonly controls: TruckControls;
  readonly dtSeconds: number;
  readonly road: Road;
  readonly truckDimensions: TruckFootprintDimensions;
  readonly truckTuning?: TruckTuning;
  readonly fuelTuning?: FuelTuning;
  readonly roadCollisionTuning?: RoadCollisionTuning;
  /** Maximum route-distance window used to reacquire the truck after each step. */
  readonly routeProjectionSearchRadiusMeters?: number;
}

export interface StepDrivingResult {
  readonly state: DrivingState;
  readonly barrierImpact: RoadBarrierImpact | null;
  readonly didDamageCargo: boolean;
}

export const ZERO_FUEL_BURN: FuelBurnBreakdown = Object.freeze({
  baselineDrain: 0,
  highSpeedDrain: 0,
  launchGulpDrain: 0,
  totalDrain: 0,
  drainRatePerSecond: 0,
});

export function stepDriving(options: StepDrivingOptions): StepDrivingResult {
  const truckTuning = options.truckTuning ?? DEFAULT_TRUCK_TUNING;
  const fuelTuning = options.fuelTuning ?? DEFAULT_FUEL_TUNING;
  const roadCollisionTuning = options.roadCollisionTuning ?? DEFAULT_ROAD_COLLISION_TUNING;
  const routeProjectionSearchRadiusMeters = options.routeProjectionSearchRadiusMeters ?? 100;
  if (
    !Number.isFinite(routeProjectionSearchRadiusMeters) ||
    routeProjectionSearchRadiusMeters <= 0
  ) {
    throw new RangeError(
      `routeProjectionSearchRadiusMeters must be positive and finite, got ${routeProjectionSearchRadiusMeters}`
    );
  }
  const fuelLimitedTruck = limitTruckSpeedForFuel(
    options.state.truck,
    truckTuning,
    options.state.fuel,
    fuelTuning
  );
  const effectiveTruckTuning = buildEffectiveTruckTuning(
    truckTuning,
    options.state.fuel,
    fuelTuning
  );
  const controls = buildFuelLimitedControls(options.state.fuel, options.controls);
  const fuelResult = stepFuel(
    options.state.fuel,
    {
      speedMetersPerSecond: fuelLimitedTruck.speedMetersPerSecond,
      maxForwardSpeedMetersPerSecond: truckTuning.maxForwardSpeedMetersPerSecond,
      throttle: options.controls.throttle,
      isTruckCrashed: fuelLimitedTruck.status === 'crashed',
    },
    options.dtSeconds,
    fuelTuning
  );

  const steppedTruck = stepTruck(
    fuelLimitedTruck,
    controls,
    options.dtSeconds,
    effectiveTruckTuning
  );
  const footprint = buildTruckFootprint(steppedTruck, options.truckDimensions);
  const barrierImpact = detectRoadBarrierImpact(
    options.road,
    footprint,
    options.state.routePosition.distanceAlongRouteMeters
  );
  const constrainedTruck = constrainTruckToRoad({
    road: options.road,
    truck: steppedTruck,
    truckDimensions: options.truckDimensions,
    impact: barrierImpact,
    routeDistanceHintMeters: options.state.routePosition.distanceAlongRouteMeters,
  });
  const barrierResult = resolveRoadBarrierContact({
    truck: constrainedTruck,
    impact: barrierImpact,
    contactState: options.state.barrierContactState,
    dtSeconds: options.dtSeconds,
    tuning: roadCollisionTuning,
    resolveImpact: resolveTruckImpact,
  });
  const routeProjection = worldToRoute(options.road.route, barrierResult.truck.position, {
    hintDistanceAlongRouteMeters: options.state.routePosition.distanceAlongRouteMeters,
    searchRadiusMeters: routeProjectionSearchRadiusMeters,
  });

  return {
    state: {
      truck: barrierResult.truck,
      routePosition: {
        distanceAlongRouteMeters: routeProjection.distanceAlongRouteMeters,
        lateralOffsetMeters: routeProjection.lateralOffsetMeters,
      },
      fuel: fuelResult.fuel,
      barrierContactState: barrierResult.contactState,
      lastFuelBurn: fuelResult.burn,
    },
    barrierImpact,
    didDamageCargo: barrierResult.didDamageCargo,
  };
}
