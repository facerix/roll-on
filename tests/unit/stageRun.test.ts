import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_1_FINISH_DISTANCE_METERS,
  buildRunTerminalPresentation,
  createStageRunState,
  stepStageRun,
  type StageRunFrame,
} from '../../src/game/stageRun.ts';

function frame(overrides: Partial<StageRunFrame> = {}): StageRunFrame {
  return {
    routeDistanceMeters: 100,
    speedMetersPerSecond: 20,
    fuelLevel: 0.75,
    cargoIntegrity: 0.9,
    score: 2_500,
    roadRageCount: 1,
    truckStatus: 'driving',
    ...overrides,
  };
}

test('Stage 1 finish distance is the accepted 2,200 meters', () => {
  assert.equal(STAGE_1_FINISH_DISTANCE_METERS, 2_200);
});

test('crossing the finish completes exactly once, including a large crossing step', () => {
  const running = createStageRunState();
  const completed = stepStageRun(running, {
    previousRouteDistanceMeters: 2_150,
    frame: frame({ routeDistanceMeters: 2_240 }),
  });

  assert.equal(completed.phase, 'completed');
  assert.equal(completed.failureReason, null);
  assert.deepEqual(completed.terminalSnapshot, frame({ routeDistanceMeters: 2_240 }));
  assert.ok(Object.isFrozen(completed.terminalSnapshot));

  const repeated = stepStageRun(completed, {
    previousRouteDistanceMeters: 2_240,
    frame: frame({ routeDistanceMeters: 3_000, score: 99_999 }),
  });
  assert.equal(repeated, completed, 'terminal state must ignore later gameplay consequences');
});

test('a catastrophic crash fails the run and captures the final resolved frame', () => {
  const crashedFrame = frame({ cargoIntegrity: 0.4, truckStatus: 'crashed' });
  const failed = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: 90,
    frame: crashedFrame,
  });

  assert.equal(failed.phase, 'failed');
  assert.equal(failed.failureReason, 'crashed');
  assert.deepEqual(failed.terminalSnapshot, crashedFrame);
});

test('empty fuel permits coasting but fails when the truck stops', () => {
  const coasting = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: 90,
    frame: frame({ fuelLevel: 0, speedMetersPerSecond: 4 }),
  });
  assert.equal(coasting.phase, 'running');

  const stopped = stepStageRun(coasting, {
    previousRouteDistanceMeters: 100,
    frame: frame({ routeDistanceMeters: 101, fuelLevel: 0, speedMetersPerSecond: 0 }),
  });
  assert.equal(stopped.phase, 'failed');
  assert.equal(stopped.failureReason, 'out-of-fuel');
});

test('a finish crossing wins over a crash first caused on the same step', () => {
  const finalFrame = frame({
    routeDistanceMeters: STAGE_1_FINISH_DISTANCE_METERS,
    truckStatus: 'crashed',
    cargoIntegrity: 0.2,
  });
  const result = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: STAGE_1_FINISH_DISTANCE_METERS - 1,
    frame: finalFrame,
  });

  assert.equal(result.phase, 'completed');
  assert.equal(result.failureReason, null);
  assert.equal(result.terminalSnapshot?.cargoIntegrity, 0.2);
});

test('terminal presentation distinguishes completion, crash, and empty fuel', () => {
  const completed = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: STAGE_1_FINISH_DISTANCE_METERS - 1,
    frame: frame({ routeDistanceMeters: STAGE_1_FINISH_DISTANCE_METERS }),
  });
  assert.deepEqual(buildRunTerminalPresentation(completed), {
    phase: 'completed',
    title: 'STAGE COMPLETE',
    detail: 'DELIVERY COMPLETE',
    retryLabel: 'RUN AGAIN',
  });

  const crashed = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: 10,
    frame: frame({ truckStatus: 'crashed' }),
  });
  assert.deepEqual(buildRunTerminalPresentation(crashed), {
    phase: 'failed',
    title: 'GAME OVER',
    detail: 'CRASHED',
    retryLabel: 'RETRY STAGE',
  });

  const empty = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: 10,
    frame: frame({ speedMetersPerSecond: 0, fuelLevel: 0 }),
  });
  assert.equal(buildRunTerminalPresentation(empty).detail, 'OUT OF FUEL');
});

test('a fresh retry has no terminal state from the failed run', () => {
  const failed = stepStageRun(createStageRunState(), {
    previousRouteDistanceMeters: 10,
    frame: frame({ truckStatus: 'crashed' }),
  });
  const retry = createStageRunState();

  assert.notEqual(retry, failed);
  assert.deepEqual(retry, {
    phase: 'running',
    failureReason: null,
    terminalSnapshot: null,
  });
});

test('stage lifecycle rejects corrupt running-frame values', () => {
  assert.throws(
    () =>
      stepStageRun(createStageRunState(), {
        previousRouteDistanceMeters: 0,
        frame: frame({ fuelLevel: Number.NaN }),
      }),
    TypeError
  );
  assert.throws(
    () =>
      stepStageRun(createStageRunState(), {
        previousRouteDistanceMeters: 0,
        frame: frame({ cargoIntegrity: 1.01 }),
      }),
    RangeError
  );
  assert.throws(() => buildRunTerminalPresentation(createStageRunState()), /still running/);
});
