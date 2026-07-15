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
import {
  buildTruckFootprint,
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
  const barrierImpact = detectRoadBarrierImpact(options.road, footprint);
  const barrierResult = resolveRoadBarrierContact({
    truck: steppedTruck,
    impact: barrierImpact,
    contactState: options.state.barrierContactState,
    dtSeconds: options.dtSeconds,
    tuning: roadCollisionTuning,
    resolveImpact: resolveTruckImpact,
  });

  return {
    state: {
      truck: barrierResult.truck,
      fuel: fuelResult.fuel,
      barrierContactState: barrierResult.contactState,
      lastFuelBurn: fuelResult.burn,
    },
    barrierImpact,
    didDamageCargo: barrierResult.didDamageCargo,
  };
}
