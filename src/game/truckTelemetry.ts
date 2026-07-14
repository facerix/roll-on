import type { TruckState, TruckStatus, TruckTuning } from '/src/game/truck.js';

/** Renderer- and DOM-independent measurements used while tuning truck feel. */
export interface TruckTelemetry {
  readonly speedMetersPerSecond: number;
  readonly normalizedTopSpeed: number;
  readonly headingRadians: number;
  readonly yawRateRadiansPerSecond: number;
  readonly articulationRadians: number;
  readonly status: TruckStatus;
  readonly jackknifeEntryAngleRadians: number;
  readonly jackknifeRecoveryAngleRadians: number;
  readonly jackknifeMinimumSpeedMetersPerSecond: number;
}

/** Observe simulation and tuning state without changing either one. */
export function buildTruckTelemetry(state: TruckState, tuning: TruckTuning): TruckTelemetry {
  assertFinite('speedMetersPerSecond', state.speedMetersPerSecond);
  assertFinite('headingRadians', state.headingRadians);
  assertFinite('yawRateRadiansPerSecond', state.yawRateRadiansPerSecond);
  assertFinite('trailerHeadingRadians', state.trailerHeadingRadians);
  assertPositive('maxForwardSpeedMetersPerSecond', tuning.maxForwardSpeedMetersPerSecond);
  assertFinite('jackknifeEntryAngleRadians', tuning.jackknifeEntryAngleRadians);
  assertFinite('jackknifeRecoveryAngleRadians', tuning.jackknifeRecoveryAngleRadians);
  assertFinite('jackknifeMinimumSpeedMetersPerSecond', tuning.jackknifeMinimumSpeedMetersPerSecond);

  return {
    speedMetersPerSecond: state.speedMetersPerSecond,
    normalizedTopSpeed: state.speedMetersPerSecond / tuning.maxForwardSpeedMetersPerSecond,
    headingRadians: state.headingRadians,
    yawRateRadiansPerSecond: state.yawRateRadiansPerSecond,
    articulationRadians: angleDelta(state.headingRadians, state.trailerHeadingRadians),
    status: state.status,
    jackknifeEntryAngleRadians: tuning.jackknifeEntryAngleRadians,
    jackknifeRecoveryAngleRadians: tuning.jackknifeRecoveryAngleRadians,
    jackknifeMinimumSpeedMetersPerSecond: tuning.jackknifeMinimumSpeedMetersPerSecond,
  };
}

/** Format compact debug-HUD lines. Presentation stays downstream of simulation. */
export function formatTruckTelemetry(telemetry: TruckTelemetry): readonly string[] {
  return [
    `speed: ${telemetry.speedMetersPerSecond.toFixed(1)} m/s (${(
      telemetry.normalizedTopSpeed * 100
    ).toFixed(0)}%)`,
    `cab: ${toDegrees(telemetry.headingRadians).toFixed(1)} deg  yaw: ${toDegrees(
      telemetry.yawRateRadiansPerSecond
    ).toFixed(1)} deg/s`,
    `articulation: ${toDegrees(telemetry.articulationRadians).toFixed(1)} deg`,
    `status: ${telemetry.status}`,
    `jackknife: ${toDegrees(telemetry.jackknifeEntryAngleRadians).toFixed(
      1
    )} deg enter / ${toDegrees(telemetry.jackknifeRecoveryAngleRadians).toFixed(
      1
    )} deg recover @ ${telemetry.jackknifeMinimumSpeedMetersPerSecond.toFixed(1)} m/s`,
  ];
}

function angleDelta(a: number, b: number): number {
  let delta = (a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite, got ${value}`);
  }
}

function assertPositive(name: string, value: number): void {
  assertFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be positive, got ${value}`);
}
