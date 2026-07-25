import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRoad, DEFAULT_ROAD_TUNING } from '../../src/game/road.ts';
import {
  buildTruckFootprint,
  detectRoadBarrierImpact,
  resolveRoadBarrierContact,
  type BarrierContactState,
  type RoadBarrierImpact,
  type RoadCollisionTuning,
  type TruckFootprintDimensions,
} from '../../src/game/roadCollision.ts';
import {
  createTruckState,
  resolveTruckImpact,
  type TruckImpact,
  type TruckState,
} from '../../src/game/truck.ts';

const ROAD = createRoad(DEFAULT_ROAD_TUNING);
const DIMENSIONS: TruckFootprintDimensions = {
  cabWidthMeters: 2.6,
  cabLengthMeters: 4,
  trailerWidthMeters: 2.6,
  trailerLengthMeters: 12,
  hitchGapMeters: 0.7,
};
const COLLISION_TUNING: RoadCollisionTuning = {
  cargoDamagePerBarrierHit: 0.08,
  barrierDamageCooldownSeconds: 0.5,
};

function truck(overrides: Partial<TruckState> = {}): TruckState {
  return createTruckState({
    position: { lateralMeters: 0, distanceMeters: 100 },
    headingRadians: 0,
    speedMetersPerSecond: 20,
    yawRateRadiansPerSecond: 0,
    trailerHeadingRadians: 0,
    massKilograms: 36_287,
    cargoIntegrity: 1,
    status: 'driving',
    ...overrides,
  });
}

function contactState(overrides: Partial<BarrierContactState> = {}): BarrierContactState {
  return { cooldownRemainingSeconds: 0, ...overrides };
}

function impact(side: RoadBarrierImpact['side'] = 'right'): RoadBarrierImpact {
  return {
    kind: 'barrier',
    side,
    penetrationMeters: 0.5,
    minDistanceMeters: 90,
    maxDistanceMeters: 110,
  };
}

test('truck footprint fully inside road bounds reports no barrier collision', () => {
  const footprint = buildTruckFootprint(truck(), DIMENSIONS);

  assert.equal(detectRoadBarrierImpact(ROAD, footprint), null);
});

test('truck footprint accepts a signed hitch offset and keeps collision geometry overlapped', () => {
  const hitchOverlapMeters = 1.1;
  const dimensions = { ...DIMENSIONS, hitchGapMeters: -hitchOverlapMeters };
  const [cab, trailer] = buildTruckFootprint(truck(), dimensions);

  assert.ok(
    Math.abs(cab.minDistanceMeters - trailer.maxDistanceMeters + hitchOverlapMeters) <
      Number.EPSILON * 100
  );
});

test('truck footprint rejects a hitch offset that moves the trailer center past the cab center', () => {
  assert.throws(
    () =>
      buildTruckFootprint(truck(), {
        ...DIMENSIONS,
        hitchGapMeters: -(DIMENSIONS.cabLengthMeters + DIMENSIONS.trailerLengthMeters) / 2,
      }),
    RangeError
  );
});

test('footprint crossing the left or right barrier reports the correct side', () => {
  const left = buildTruckFootprint(
    truck({ position: { lateralMeters: -10.4, distanceMeters: 100 } }),
    DIMENSIONS
  );
  const right = buildTruckFootprint(
    truck({ position: { lateralMeters: 10.4, distanceMeters: 100 } }),
    DIMENSIONS
  );

  assert.equal(detectRoadBarrierImpact(ROAD, left)?.side, 'left');
  assert.equal(detectRoadBarrierImpact(ROAD, right)?.side, 'right');
});

test('barrier collision checks use world meters, not camera fields', () => {
  const footprint = buildTruckFootprint(
    truck({ position: { lateralMeters: 10.4, distanceMeters: 100 } }),
    DIMENSIONS
  );
  const fieldNames = Object.keys(footprint[0]!).join(' ');

  assert.doesNotMatch(fieldNames, /screen|canvas|pixel|viewport|dom/i);
  assert.equal(detectRoadBarrierImpact(ROAD, footprint)?.side, 'right');
});

test('barrier collision detection works for cab and trailer footprint inputs', () => {
  const cabCrossing = buildTruckFootprint(
    truck({ position: { lateralMeters: ROAD.rightBarrierLateralMeters, distanceMeters: 100 } }),
    DIMENSIONS
  );
  const trailerCrossing = buildTruckFootprint(
    truck({
      position: { lateralMeters: ROAD.rightBarrierLateralMeters - 5.5, distanceMeters: 100 },
      trailerHeadingRadians: Math.PI / 2,
    }),
    DIMENSIONS
  );

  assert.equal(detectRoadBarrierImpact(ROAD, [cabCrossing[0]!])?.side, 'right');
  assert.equal(detectRoadBarrierImpact(ROAD, [trailerCrossing[1]!])?.side, 'left');
});

test('jackknifed barrier contact transitions through the injected truck impact path', () => {
  const jackknifed = truck({ status: 'jackknifed', cargoIntegrity: 0.75 });
  const seenImpacts: TruckImpact[] = [];

  const result = resolveRoadBarrierContact({
    truck: jackknifed,
    impact: impact(),
    contactState: contactState(),
    dtSeconds: 1 / 60,
    tuning: COLLISION_TUNING,
    resolveImpact(state, truckImpact) {
      seenImpacts.push(truckImpact);
      return resolveTruckImpact(state, truckImpact);
    },
  });

  assert.deepEqual(seenImpacts, [{ kind: 'barrier' }]);
  assert.equal(result.truck.status, 'crashed');
  assert.equal(result.truck.cargoIntegrity, 0.75);
});

test('non-jackknifed barrier contact reduces cargo integrity by an explicit tuned amount', () => {
  const result = resolveRoadBarrierContact({
    truck: truck({ cargoIntegrity: 0.5 }),
    impact: impact(),
    contactState: contactState(),
    dtSeconds: 1 / 60,
    tuning: COLLISION_TUNING,
    resolveImpact: resolveTruckImpact,
  });

  assert.equal(result.truck.status, 'driving');
  assert.equal(result.truck.cargoIntegrity, 0.42);
  assert.equal(result.contactState.cooldownRemainingSeconds, 0.5);
});

test('cargo integrity clamps at zero and never silently exceeds one', () => {
  const damaged = resolveRoadBarrierContact({
    truck: truck({ cargoIntegrity: 0.03 }),
    impact: impact(),
    contactState: contactState(),
    dtSeconds: 1 / 60,
    tuning: COLLISION_TUNING,
    resolveImpact: resolveTruckImpact,
  });
  const coolingDown = resolveRoadBarrierContact({
    truck: truck({ cargoIntegrity: 1 }),
    impact: impact(),
    contactState: contactState({ cooldownRemainingSeconds: 0.25 }),
    dtSeconds: 1 / 60,
    tuning: COLLISION_TUNING,
    resolveImpact: resolveTruckImpact,
  });

  assert.equal(damaged.truck.cargoIntegrity, 0);
  assert.equal(coolingDown.truck.cargoIntegrity, 1);
});

test('sustained barrier contact uses a cooldown so damage is frame-rate independent', () => {
  const runContact = (dtSeconds: number, durationSeconds: number): TruckState => {
    let state = truck({ cargoIntegrity: 1 });
    let barrierState = contactState();
    const steps = Math.round(durationSeconds / dtSeconds);
    for (let i = 0; i < steps; i++) {
      const result = resolveRoadBarrierContact({
        truck: state,
        impact: impact(),
        contactState: barrierState,
        dtSeconds,
        tuning: COLLISION_TUNING,
        resolveImpact: resolveTruckImpact,
      });
      state = result.truck;
      barrierState = result.contactState;
    }
    return state;
  };

  assert.equal(runContact(1 / 60, 1).cargoIntegrity, runContact(1 / 30, 1).cargoIntegrity);
});
