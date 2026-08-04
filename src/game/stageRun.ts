import type { TruckStatus } from '/src/game/truck.js';

export const STAGE_1_FINISH_DISTANCE_METERS = 2_200;

export type StageRunPhase = 'running' | 'completed' | 'failed';
export type StageRunFailureReason = 'crashed' | 'out-of-fuel';

/** Immutable score/lifecycle inputs captured on the final resolved simulation step. */
export interface StageRunFrame {
  readonly routeDistanceMeters: number;
  readonly speedMetersPerSecond: number;
  readonly fuelLevel: number;
  readonly cargoIntegrity: number;
  readonly score: number;
  readonly roadRageCount: number;
  readonly truckStatus: TruckStatus;
}

export interface StageRunState {
  readonly phase: StageRunPhase;
  readonly failureReason: StageRunFailureReason | null;
  readonly terminalSnapshot: Readonly<StageRunFrame> | null;
}

export interface StepStageRunOptions {
  readonly previousRouteDistanceMeters: number;
  readonly frame: StageRunFrame;
  readonly finishDistanceMeters?: number;
}

export interface RunTerminalPresentation {
  readonly phase: Exclude<StageRunPhase, 'running'>;
  readonly title: 'STAGE COMPLETE' | 'GAME OVER';
  readonly detail: 'DELIVERY COMPLETE' | 'CRASHED' | 'OUT OF FUEL';
  readonly retryLabel: 'RUN AGAIN' | 'RETRY STAGE';
}

export function createStageRunState(): StageRunState {
  return Object.freeze({
    phase: 'running',
    failureReason: null,
    terminalSnapshot: null,
  });
}

/**
 * Select one terminal transition after a complete simulation step.
 *
 * A finish crossing deliberately wins over a crash caused on that same step,
 * while the captured frame retains the collision's damage and score inputs.
 */
export function stepStageRun(state: StageRunState, options: StepStageRunOptions): StageRunState {
  validateState(state);
  if (state.phase !== 'running') return state;

  const finishDistanceMeters = options.finishDistanceMeters ?? STAGE_1_FINISH_DISTANCE_METERS;
  assertNonNegative('previousRouteDistanceMeters', options.previousRouteDistanceMeters);
  assertPositive('finishDistanceMeters', finishDistanceMeters);
  validateFrame(options.frame);

  const crossedFinish =
    options.previousRouteDistanceMeters < finishDistanceMeters &&
    options.frame.routeDistanceMeters >= finishDistanceMeters;
  if (crossedFinish) return terminalState('completed', null, options.frame);
  if (options.frame.truckStatus === 'crashed') {
    return terminalState('failed', 'crashed', options.frame);
  }
  if (options.frame.fuelLevel === 0 && options.frame.speedMetersPerSecond === 0) {
    return terminalState('failed', 'out-of-fuel', options.frame);
  }
  return state;
}

export function buildRunTerminalPresentation(state: StageRunState): RunTerminalPresentation {
  validateState(state);
  if (state.phase === 'running') {
    throw new RangeError('cannot build terminal presentation while the stage is still running');
  }
  if (state.phase === 'completed') {
    return Object.freeze({
      phase: 'completed',
      title: 'STAGE COMPLETE',
      detail: 'DELIVERY COMPLETE',
      retryLabel: 'RUN AGAIN',
    });
  }
  return Object.freeze({
    phase: 'failed',
    title: 'GAME OVER',
    detail: state.failureReason === 'crashed' ? 'CRASHED' : 'OUT OF FUEL',
    retryLabel: 'RETRY STAGE',
  });
}

function terminalState(
  phase: Exclude<StageRunPhase, 'running'>,
  failureReason: StageRunFailureReason | null,
  frame: StageRunFrame
): StageRunState {
  const terminalSnapshot = Object.freeze({ ...frame });
  return Object.freeze({ phase, failureReason, terminalSnapshot });
}

function validateState(state: StageRunState): void {
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('StageRunState must be an object');
  }
  if (state.phase !== 'running' && state.phase !== 'completed' && state.phase !== 'failed') {
    throw new TypeError(`unknown stage run phase: ${String(state.phase)}`);
  }
  if (state.phase === 'running') {
    if (state.failureReason !== null || state.terminalSnapshot !== null) {
      throw new TypeError('running stage state cannot contain terminal data');
    }
    return;
  }
  if (state.terminalSnapshot === null) {
    throw new TypeError('terminal stage state requires a snapshot');
  }
  validateFrame(state.terminalSnapshot);
  if (state.phase === 'completed' && state.failureReason !== null) {
    throw new TypeError('completed stage state cannot contain a failure reason');
  }
  if (
    state.phase === 'failed' &&
    state.failureReason !== 'crashed' &&
    state.failureReason !== 'out-of-fuel'
  ) {
    throw new TypeError('failed stage state requires a known failure reason');
  }
}

function validateFrame(frame: StageRunFrame): void {
  if (typeof frame !== 'object' || frame === null) {
    throw new TypeError('StageRunFrame must be an object');
  }
  assertNonNegative('routeDistanceMeters', frame.routeDistanceMeters);
  assertNonNegative('speedMetersPerSecond', frame.speedMetersPerSecond);
  assertRange('fuelLevel', frame.fuelLevel, 0, 1);
  assertRange('cargoIntegrity', frame.cargoIntegrity, 0, 1);
  assertNonNegativeInteger('score', frame.score);
  assertNonNegativeInteger('roadRageCount', frame.roadRageCount);
  if (
    frame.truckStatus !== 'driving' &&
    frame.truckStatus !== 'jackknifed' &&
    frame.truckStatus !== 'crashed'
  ) {
    throw new TypeError(`unknown truck status: ${String(frame.truckStatus)}`);
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
}

function assertNonNegative(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
}

function assertPositive(label: string, value: number): void {
  assertFinite(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive, got ${value}`);
}

function assertNonNegativeInteger(label: string, value: number): void {
  assertNonNegative(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
}

function assertRange(label: string, value: number, min: number, max: number): void {
  assertFinite(label, value);
  if (value < min || value > max) {
    throw new RangeError(`${label} must be in [${min}, ${max}], got ${value}`);
  }
}
