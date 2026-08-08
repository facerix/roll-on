import { getSpeedTier, isAtOrAboveSpeedTier, type SpeedTierName } from '/src/game/speedTiers.js';

/**
 * Pure highway-patrol encounter model. It owns every enforcement decision —
 * when a pursuit starts, which side is attacked, what counts as an avoid, and
 * when the cruiser gives up — while world motion, contacts, and presentation
 * stay outside. Callers supply one observation frame per simulation step and
 * apply the returned events; the model never mutates its input.
 */
export type PatrolEncounterSource = 'speed-trap' | 'road-rage';

export type PatrolEncounterPhase =
  | 'posted'
  | 'pulling-out'
  | 'closing'
  | 'flanking'
  | 'telegraphing'
  | 'sideswiping'
  | 'recovering'
  | 'disengaging'
  | 'resolved';

export type PatrolAttackSide = 'left' | 'right';

export type PatrolResolution =
  | 'slow-pass'
  | 'suppressed'
  | 'decisive-lead'
  | 'window-exit'
  | 'avoids-met'
  | 'terminal-stage-result';

/** Disengagement reasons; a trap resolved without pursuit is not one of them. */
export type PatrolDisengageReason = Exclude<PatrolResolution, 'slow-pass' | 'suppressed'>;

export interface PatrolEncounterDefinition {
  readonly id: string;
  readonly source: PatrolEncounterSource;
  /** Route distance whose first forward crossing arms a posted trap. */
  readonly triggerDistanceMeters?: number;
  readonly windowStartDistanceMeters: number;
  readonly windowEndDistanceMeters: number;
  readonly requiredAvoids: number;
}

interface PatrolEncounterCommon {
  readonly id: string;
  readonly source: PatrolEncounterSource;
  readonly cruiserId: number;
  readonly windowStartDistanceMeters: number;
  readonly windowEndDistanceMeters: number;
  readonly requiredAvoids: number;
  readonly recordedAvoids: number;
  /** Seconds the truck has continuously held the decisive lead. */
  readonly leadDwellSeconds: number;
}

export type PatrolEncounter =
  | (PatrolEncounterCommon & { readonly phase: 'posted'; readonly triggerDistanceMeters: number })
  | (PatrolEncounterCommon & {
      readonly phase: 'pulling-out' | 'recovering';
      readonly phaseSecondsRemaining: number;
    })
  | (PatrolEncounterCommon & {
      readonly phase: 'disengaging';
      readonly phaseSecondsRemaining: number;
      /** Why the pursuit ended; carried through to the resolved record. */
      readonly reason: PatrolDisengageReason;
    })
  | (PatrolEncounterCommon & { readonly phase: 'closing' | 'flanking' })
  | (PatrolEncounterCommon & {
      readonly phase: 'telegraphing' | 'sideswiping';
      readonly chosenSide: PatrolAttackSide;
      readonly phaseSecondsRemaining: number;
    })
  | (PatrolEncounterCommon & {
      readonly phase: 'resolved';
      readonly resolution: PatrolResolution;
    });

export interface PatrolPendingResponse {
  readonly secondsRemaining: number;
}

export interface PatrolEncounterState {
  readonly encounters: readonly PatrolEncounter[];
  readonly pendingResponse: PatrolPendingResponse | null;
  readonly nextCruiserId: number;
}

export type PatrolEncounterEvent =
  | {
      readonly kind: 'trap-resolved';
      readonly encounterId: string;
      readonly reason: Extract<
        PatrolResolution,
        'slow-pass' | 'suppressed' | 'terminal-stage-result'
      >;
    }
  | {
      readonly kind: 'pursuit-started';
      readonly encounterId: string;
      readonly source: PatrolEncounterSource;
      readonly cruiserId: number;
    }
  | { readonly kind: 'response-scheduled'; readonly secondsRemaining: number }
  | {
      readonly kind: 'response-cancelled';
      readonly reason: 'terminal-stage-result' | 'active-patrol';
    }
  | {
      readonly kind: 'attack-committed';
      readonly encounterId: string;
      readonly side: PatrolAttackSide;
    }
  | { readonly kind: 'attack-aborted'; readonly encounterId: string }
  | { readonly kind: 'attack-hit'; readonly encounterId: string; readonly side: PatrolAttackSide }
  | {
      readonly kind: 'attack-avoided';
      readonly encounterId: string;
      readonly side: PatrolAttackSide;
      readonly recordedAvoids: number;
    }
  | {
      readonly kind: 'disengaged';
      readonly encounterId: string;
      readonly reason: PatrolDisengageReason;
    }
  | { readonly kind: 'resolved'; readonly encounterId: string };

export interface PatrolEncounterFrame {
  readonly dtSeconds: number;
  readonly previousRouteDistanceMeters: number;
  readonly routeDistanceMeters: number;
  /** Resolved truck speed, never a cruise setpoint or a presentation value. */
  readonly speedMetersPerSecond: number;
  readonly maximumSpeedMetersPerSecond: number;
  /** Route-distance lead of the truck over the cruiser; negative when passed. */
  readonly patrolGapMeters: number;
  readonly leftClearanceMeters: number;
  readonly rightClearanceMeters: number;
  /** True only for cruiser contact inside a committed attack window. */
  readonly hasPatrolContact: boolean;
  readonly roadRageIncidents: number;
  readonly isTerminal: boolean;
}

export interface PatrolEncounterTuning {
  readonly detectionTierName: SpeedTierName;
  readonly roadRageResponseDelaySeconds: number;
  readonly roadRageWindowLengthMeters: number;
  readonly roadRageRequiredAvoids: number;
  readonly pullOutSeconds: number;
  readonly flankGapMeters: number;
  readonly telegraphSeconds: number;
  readonly minimumTelegraphSeconds: number;
  readonly attackWindowSeconds: number;
  readonly recoverSeconds: number;
  readonly disengageSeconds: number;
  readonly decisiveLeadMeters: number;
  readonly leadDwellSeconds: number;
  readonly minimumSideClearanceMeters: number;
}

export interface CreatePatrolEncounterStateOptions {
  readonly definitions?: readonly PatrolEncounterDefinition[];
}

export interface StepPatrolEncounterOptions {
  readonly state: PatrolEncounterState;
  readonly frame: PatrolEncounterFrame;
  readonly tuning?: PatrolEncounterTuning;
}

export interface StepPatrolEncounterResult {
  readonly state: PatrolEncounterState;
  readonly events: readonly PatrolEncounterEvent[];
}

export const DEFAULT_PATROL_ENCOUNTER_TUNING: PatrolEncounterTuning = Object.freeze({
  detectionTierName: 'high' as SpeedTierName,
  roadRageResponseDelaySeconds: 10,
  roadRageWindowLengthMeters: 400,
  roadRageRequiredAvoids: 2,
  pullOutSeconds: 1.5,
  flankGapMeters: 12,
  telegraphSeconds: 0.8,
  minimumTelegraphSeconds: 0.5,
  attackWindowSeconds: 0.9,
  recoverSeconds: 1.6,
  disengageSeconds: 2.5,
  decisiveLeadMeters: 60,
  leadDwellSeconds: 1,
  minimumSideClearanceMeters: 2.6,
});

/** Timers are compared with a tolerance so fixed steps land exactly on zero. */
const TIMER_EPSILON_SECONDS = 1e-9;

const DWELL_ELIGIBLE_PHASES: readonly PatrolEncounterPhase[] = [
  'closing',
  'flanking',
  'telegraphing',
  'sideswiping',
  'recovering',
];

export function createPatrolEncounterState(
  options: CreatePatrolEncounterStateOptions = {}
): PatrolEncounterState {
  const definitions = options.definitions ?? [];
  const seenIds = new Set<string>();
  let nextCruiserId = 1;
  const encounters = definitions.map(definition => {
    validateDefinition(definition);
    if (seenIds.has(definition.id)) {
      throw new RangeError(`duplicate patrol encounter definition: ${definition.id}`);
    }
    seenIds.add(definition.id);
    const cruiserId = nextCruiserId;
    nextCruiserId += 1;
    return Object.freeze({
      id: definition.id,
      source: definition.source,
      cruiserId,
      windowStartDistanceMeters: definition.windowStartDistanceMeters,
      windowEndDistanceMeters: definition.windowEndDistanceMeters,
      requiredAvoids: definition.requiredAvoids,
      recordedAvoids: 0,
      leadDwellSeconds: 0,
      phase: 'posted' as const,
      triggerDistanceMeters: definition.triggerDistanceMeters!,
    });
  });

  return freezeState({ encounters, pendingResponse: null, nextCruiserId });
}

/** The single encounter that currently owns a cruiser on the road, if any. */
export function getActivePatrolEncounter(state: PatrolEncounterState): PatrolEncounter | null {
  const active = state.encounters.filter(isActivePhase);
  if (active.length > 1) {
    throw new RangeError(`at most one patrol encounter may be active, got ${active.length}`);
  }
  return active[0] ?? null;
}

export function stepPatrolEncounter(
  options: StepPatrolEncounterOptions
): StepPatrolEncounterResult {
  const tuning = options.tuning ?? DEFAULT_PATROL_ENCOUNTER_TUNING;
  validatePatrolEncounterTuning(tuning);
  const frame = validateFrame(options.frame);
  validateState(options.state);

  const events: PatrolEncounterEvent[] = [];
  let encounters: PatrolEncounter[] = [...options.state.encounters];
  let pendingResponse = options.state.pendingResponse;
  let nextCruiserId = options.state.nextCruiserId;

  if (frame.isTerminal) {
    if (pendingResponse) {
      events.push({ kind: 'response-cancelled', reason: 'terminal-stage-result' });
      pendingResponse = null;
    }
    encounters = encounters.map(encounter => {
      if (encounter.phase === 'resolved' || encounter.phase === 'disengaging') return encounter;
      if (encounter.phase === 'posted') {
        events.push({
          kind: 'trap-resolved',
          encounterId: encounter.id,
          reason: 'terminal-stage-result',
        });
        return toResolved(encounter, 'terminal-stage-result');
      }
      events.push({
        kind: 'disengaged',
        encounterId: encounter.id,
        reason: 'terminal-stage-result',
      });
      return toDisengaging(encounter, 'terminal-stage-result', tuning);
    });
    return {
      state: freezeState({ encounters, pendingResponse, nextCruiserId }),
      events: Object.freeze(events),
    };
  }

  let hasActive = encounters.some(isActivePhase);
  /**
   * A cruiser that appears during this step has not been observed yet, so its
   * gap, clearance, and contact inputs still describe a road without it.
   */
  const startedThisStep = new Set<string>();

  // 1. A scheduled Road Rage response matures before anything else this step.
  if (pendingResponse) {
    const secondsRemaining = pendingResponse.secondsRemaining - frame.dtSeconds;
    if (secondsRemaining > TIMER_EPSILON_SECONDS) {
      pendingResponse = Object.freeze({ secondsRemaining });
    } else if (hasActive) {
      events.push({ kind: 'response-cancelled', reason: 'active-patrol' });
      pendingResponse = null;
    } else {
      const cruiserId = nextCruiserId;
      nextCruiserId += 1;
      const encounter: PatrolEncounter = Object.freeze({
        id: `road-rage-${cruiserId}`,
        source: 'road-rage' as const,
        cruiserId,
        windowStartDistanceMeters: frame.routeDistanceMeters,
        windowEndDistanceMeters: frame.routeDistanceMeters + tuning.roadRageWindowLengthMeters,
        requiredAvoids: tuning.roadRageRequiredAvoids,
        recordedAvoids: 0,
        leadDwellSeconds: 0,
        phase: 'closing' as const,
      });
      encounters.push(encounter);
      events.push({
        kind: 'pursuit-started',
        encounterId: encounter.id,
        source: encounter.source,
        cruiserId,
      });
      pendingResponse = null;
      hasActive = true;
      startedThisStep.add(encounter.id);
    }
  }

  // 2. A posted trap decides once, on the first forward crossing of its line.
  encounters = encounters.map(encounter => {
    if (encounter.phase !== 'posted') return encounter;
    const crossed =
      frame.previousRouteDistanceMeters < encounter.triggerDistanceMeters &&
      frame.routeDistanceMeters >= encounter.triggerDistanceMeters;
    if (!crossed) return encounter;
    if (pendingResponse !== null || hasActive) {
      events.push({ kind: 'trap-resolved', encounterId: encounter.id, reason: 'suppressed' });
      return toResolved(encounter, 'suppressed');
    }
    const isSpeeding = isAtOrAboveSpeedTier(
      frame.speedMetersPerSecond,
      tuning.detectionTierName,
      frame.maximumSpeedMetersPerSecond
    );
    if (!isSpeeding) {
      events.push({ kind: 'trap-resolved', encounterId: encounter.id, reason: 'slow-pass' });
      return toResolved(encounter, 'slow-pass');
    }
    events.push({
      kind: 'pursuit-started',
      encounterId: encounter.id,
      source: encounter.source,
      cruiserId: encounter.cruiserId,
    });
    hasActive = true;
    startedThisStep.add(encounter.id);
    return Object.freeze({
      ...stripPhaseFields(encounter),
      phase: 'pulling-out' as const,
      phaseSecondsRemaining: tuning.pullOutSeconds,
    });
  });

  // 3. The active cruiser advances by at most one phase transition per step.
  encounters = encounters.map(encounter =>
    isActivePhase(encounter) && !startedThisStep.has(encounter.id)
      ? advanceActiveEncounter(encounter, frame, tuning, events)
      : encounter
  );

  // 4. Incidents schedule at most one response, and never during enforcement.
  if (frame.roadRageIncidents > 0 && pendingResponse === null && !encounters.some(isActivePhase)) {
    pendingResponse = Object.freeze({ secondsRemaining: tuning.roadRageResponseDelaySeconds });
    events.push({
      kind: 'response-scheduled',
      secondsRemaining: tuning.roadRageResponseDelaySeconds,
    });
  }

  return {
    state: freezeState({ encounters, pendingResponse, nextCruiserId }),
    events: Object.freeze(events),
  };
}

function advanceActiveEncounter(
  encounter: PatrolEncounter,
  frame: PatrolEncounterFrame,
  tuning: PatrolEncounterTuning,
  events: PatrolEncounterEvent[]
): PatrolEncounter {
  if (encounter.phase === 'disengaging') {
    const secondsRemaining = encounter.phaseSecondsRemaining - frame.dtSeconds;
    if (secondsRemaining > TIMER_EPSILON_SECONDS) {
      return Object.freeze({ ...encounter, phaseSecondsRemaining: secondsRemaining });
    }
    events.push({ kind: 'resolved', encounterId: encounter.id });
    return toResolved(encounter, encounter.reason);
  }

  const isDwellEligible = DWELL_ELIGIBLE_PHASES.includes(encounter.phase);
  const leadDwellSeconds =
    isDwellEligible && frame.patrolGapMeters >= tuning.decisiveLeadMeters
      ? encounter.leadDwellSeconds + frame.dtSeconds
      : 0;
  const current = { ...encounter, leadDwellSeconds } as PatrolEncounter;

  // Escape conditions outrank every further attack transition.
  if (frame.routeDistanceMeters >= current.windowEndDistanceMeters) {
    return disengage(current, 'window-exit', tuning, events);
  }
  if (current.recordedAvoids >= current.requiredAvoids) {
    return disengage(current, 'avoids-met', tuning, events);
  }
  if (isDwellEligible && leadDwellSeconds >= tuning.leadDwellSeconds - TIMER_EPSILON_SECONDS) {
    return disengage(current, 'decisive-lead', tuning, events);
  }

  switch (current.phase) {
    case 'pulling-out':
      return afterTimer(current, frame, () =>
        Object.freeze({ ...stripPhaseFields(current), phase: 'closing' as const })
      );
    case 'closing':
      if (frame.patrolGapMeters > tuning.flankGapMeters) return Object.freeze(current);
      return Object.freeze({ ...stripPhaseFields(current), phase: 'flanking' as const });
    case 'flanking': {
      const chosenSide = chooseAttackSide(frame, tuning);
      if (!chosenSide) return Object.freeze(current);
      return Object.freeze({
        ...stripPhaseFields(current),
        phase: 'telegraphing' as const,
        chosenSide,
        phaseSecondsRemaining: tuning.telegraphSeconds,
      });
    }
    case 'telegraphing': {
      if (clearanceOnSide(frame, current.chosenSide) < tuning.minimumSideClearanceMeters) {
        events.push({ kind: 'attack-aborted', encounterId: current.id });
        return toRecovering(current, tuning);
      }
      return afterTimer(current, frame, () => {
        events.push({
          kind: 'attack-committed',
          encounterId: current.id,
          side: current.chosenSide,
        });
        return Object.freeze({
          ...stripPhaseFields(current),
          phase: 'sideswiping' as const,
          chosenSide: current.chosenSide,
          phaseSecondsRemaining: tuning.attackWindowSeconds,
        });
      });
    }
    case 'sideswiping': {
      if (frame.hasPatrolContact) {
        events.push({ kind: 'attack-hit', encounterId: current.id, side: current.chosenSide });
        return toRecovering(current, tuning);
      }
      return afterTimer(current, frame, () => {
        const recordedAvoids = current.recordedAvoids + 1;
        events.push({
          kind: 'attack-avoided',
          encounterId: current.id,
          side: current.chosenSide,
          recordedAvoids,
        });
        const avoided = { ...current, recordedAvoids } as PatrolEncounter;
        if (recordedAvoids >= current.requiredAvoids) {
          return disengage(avoided, 'avoids-met', tuning, events);
        }
        return toRecovering(avoided, tuning);
      });
    }
    case 'recovering':
      return afterTimer(current, frame, () =>
        Object.freeze({ ...stripPhaseFields(current), phase: 'closing' as const })
      );
    default:
      throw new RangeError(`Unknown active patrol phase: ${String(current.phase)}`);
  }
}

function afterTimer(
  encounter: PatrolEncounter & { readonly phaseSecondsRemaining: number },
  frame: PatrolEncounterFrame,
  transition: () => PatrolEncounter
): PatrolEncounter {
  const secondsRemaining = encounter.phaseSecondsRemaining - frame.dtSeconds;
  if (secondsRemaining > TIMER_EPSILON_SECONDS) {
    return Object.freeze({ ...encounter, phaseSecondsRemaining: secondsRemaining });
  }
  return transition();
}

/**
 * Pick the roomier viable side, breaking exact ties toward the left so equal
 * clearance always produces the same attack.
 */
function chooseAttackSide(
  frame: PatrolEncounterFrame,
  tuning: PatrolEncounterTuning
): PatrolAttackSide | null {
  const isLeftViable = frame.leftClearanceMeters >= tuning.minimumSideClearanceMeters;
  const isRightViable = frame.rightClearanceMeters >= tuning.minimumSideClearanceMeters;
  if (!isLeftViable && !isRightViable) return null;
  if (isLeftViable && !isRightViable) return 'left';
  if (isRightViable && !isLeftViable) return 'right';
  return frame.rightClearanceMeters > frame.leftClearanceMeters ? 'right' : 'left';
}

function clearanceOnSide(frame: PatrolEncounterFrame, side: PatrolAttackSide): number {
  return side === 'left' ? frame.leftClearanceMeters : frame.rightClearanceMeters;
}

function disengage(
  encounter: PatrolEncounter,
  reason: PatrolDisengageReason,
  tuning: PatrolEncounterTuning,
  events: PatrolEncounterEvent[]
): PatrolEncounter {
  events.push({ kind: 'disengaged', encounterId: encounter.id, reason });
  return toDisengaging(encounter, reason, tuning);
}

function toDisengaging(
  encounter: PatrolEncounter,
  reason: PatrolDisengageReason,
  tuning: PatrolEncounterTuning
): PatrolEncounter {
  return Object.freeze({
    ...stripPhaseFields(encounter),
    phase: 'disengaging' as const,
    phaseSecondsRemaining: tuning.disengageSeconds,
    reason,
  });
}

function toRecovering(encounter: PatrolEncounter, tuning: PatrolEncounterTuning): PatrolEncounter {
  return Object.freeze({
    ...stripPhaseFields(encounter),
    phase: 'recovering' as const,
    phaseSecondsRemaining: tuning.recoverSeconds,
  });
}

function toResolved(encounter: PatrolEncounter, resolution: PatrolResolution): PatrolEncounter {
  return Object.freeze({
    ...stripPhaseFields(encounter),
    phase: 'resolved' as const,
    resolution,
  });
}

/** Drop every phase-specific field so a transition cannot smuggle stale data. */
function stripPhaseFields(encounter: PatrolEncounter): PatrolEncounterCommon {
  return {
    id: encounter.id,
    source: encounter.source,
    cruiserId: encounter.cruiserId,
    windowStartDistanceMeters: encounter.windowStartDistanceMeters,
    windowEndDistanceMeters: encounter.windowEndDistanceMeters,
    requiredAvoids: encounter.requiredAvoids,
    recordedAvoids: encounter.recordedAvoids,
    leadDwellSeconds: encounter.leadDwellSeconds,
  };
}

function isActivePhase(encounter: PatrolEncounter): boolean {
  return encounter.phase !== 'posted' && encounter.phase !== 'resolved';
}

function freezeState(state: {
  encounters: readonly PatrolEncounter[];
  pendingResponse: PatrolPendingResponse | null;
  nextCruiserId: number;
}): PatrolEncounterState {
  return Object.freeze({
    encounters: Object.freeze(state.encounters.map(encounter => Object.freeze(encounter))),
    pendingResponse: state.pendingResponse ? Object.freeze(state.pendingResponse) : null,
    nextCruiserId: state.nextCruiserId,
  });
}

function validateDefinition(definition: PatrolEncounterDefinition): void {
  if (typeof definition !== 'object' || definition === null) {
    throw new TypeError('patrol encounter definition must be an object');
  }
  if (typeof definition.id !== 'string' || definition.id.length === 0) {
    throw new TypeError('patrol encounter definition id must be a non-empty string');
  }
  if (definition.source !== 'speed-trap') {
    throw new RangeError(
      `only speed-trap definitions can be posted, got ${String(definition.source)}`
    );
  }
  assertFinite('windowStartDistanceMeters', definition.windowStartDistanceMeters);
  assertFinite('windowEndDistanceMeters', definition.windowEndDistanceMeters);
  if (definition.windowEndDistanceMeters <= definition.windowStartDistanceMeters) {
    throw new RangeError(
      `windowEndDistanceMeters must be greater than windowStartDistanceMeters, got ${definition.windowEndDistanceMeters} <= ${definition.windowStartDistanceMeters}`
    );
  }
  assertPositiveInteger('requiredAvoids', definition.requiredAvoids);
  if (typeof definition.triggerDistanceMeters !== 'number') {
    throw new TypeError('a speed-trap definition must supply triggerDistanceMeters');
  }
  assertFinite('triggerDistanceMeters', definition.triggerDistanceMeters);
  if (
    definition.triggerDistanceMeters < definition.windowStartDistanceMeters ||
    definition.triggerDistanceMeters >= definition.windowEndDistanceMeters
  ) {
    throw new RangeError(
      `triggerDistanceMeters must lie inside its encounter window, got ${definition.triggerDistanceMeters}`
    );
  }
}

export function validatePatrolEncounterTuning(
  tuning: PatrolEncounterTuning
): PatrolEncounterTuning {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new TypeError('PatrolEncounterTuning must be an object');
  }
  getSpeedTier(tuning.detectionTierName);
  assertNonNegative('roadRageResponseDelaySeconds', tuning.roadRageResponseDelaySeconds);
  assertPositive('roadRageWindowLengthMeters', tuning.roadRageWindowLengthMeters);
  assertPositiveInteger('roadRageRequiredAvoids', tuning.roadRageRequiredAvoids);
  assertPositive('pullOutSeconds', tuning.pullOutSeconds);
  assertPositive('flankGapMeters', tuning.flankGapMeters);
  assertPositive('minimumTelegraphSeconds', tuning.minimumTelegraphSeconds);
  if (tuning.minimumTelegraphSeconds < 0.5) {
    throw new RangeError(
      `minimumTelegraphSeconds must stay at or above 0.5 s, got ${tuning.minimumTelegraphSeconds}`
    );
  }
  assertPositive('telegraphSeconds', tuning.telegraphSeconds);
  if (tuning.telegraphSeconds < tuning.minimumTelegraphSeconds) {
    throw new RangeError(
      `telegraphSeconds must be at least minimumTelegraphSeconds, got ${tuning.telegraphSeconds} < ${tuning.minimumTelegraphSeconds}`
    );
  }
  assertPositive('attackWindowSeconds', tuning.attackWindowSeconds);
  assertPositive('recoverSeconds', tuning.recoverSeconds);
  assertPositive('disengageSeconds', tuning.disengageSeconds);
  assertPositive('decisiveLeadMeters', tuning.decisiveLeadMeters);
  assertPositive('leadDwellSeconds', tuning.leadDwellSeconds);
  assertPositive('minimumSideClearanceMeters', tuning.minimumSideClearanceMeters);
  return tuning;
}

function validateFrame(frame: PatrolEncounterFrame): PatrolEncounterFrame {
  if (typeof frame !== 'object' || frame === null) {
    throw new TypeError('PatrolEncounterFrame must be an object');
  }
  assertNonNegative('dtSeconds', frame.dtSeconds);
  assertFinite('previousRouteDistanceMeters', frame.previousRouteDistanceMeters);
  assertFinite('routeDistanceMeters', frame.routeDistanceMeters);
  assertNonNegative('speedMetersPerSecond', frame.speedMetersPerSecond);
  assertPositive('maximumSpeedMetersPerSecond', frame.maximumSpeedMetersPerSecond);
  assertFinite('patrolGapMeters', frame.patrolGapMeters);
  assertNonNegative('leftClearanceMeters', frame.leftClearanceMeters);
  assertNonNegative('rightClearanceMeters', frame.rightClearanceMeters);
  assertBoolean('hasPatrolContact', frame.hasPatrolContact);
  assertNonNegativeInteger('roadRageIncidents', frame.roadRageIncidents);
  assertBoolean('isTerminal', frame.isTerminal);
  return frame;
}

function validateState(state: PatrolEncounterState): void {
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('PatrolEncounterState must be an object');
  }
  if (!Array.isArray(state.encounters)) {
    throw new TypeError('PatrolEncounterState.encounters must be an array');
  }
  assertPositiveInteger('nextCruiserId', state.nextCruiserId);
  if (state.pendingResponse !== null) {
    assertNonNegative('pendingResponse.secondsRemaining', state.pendingResponse.secondsRemaining);
  }
  for (const encounter of state.encounters) {
    assertPositiveInteger('encounter.cruiserId', encounter.cruiserId);
    assertNonNegativeInteger('encounter.recordedAvoids', encounter.recordedAvoids);
    assertPositiveInteger('encounter.requiredAvoids', encounter.requiredAvoids);
    assertNonNegative('encounter.leadDwellSeconds', encounter.leadDwellSeconds);
    switch (encounter.phase) {
      case 'posted':
        assertFinite('encounter.triggerDistanceMeters', encounter.triggerDistanceMeters);
        break;
      case 'pulling-out':
      case 'recovering':
      case 'disengaging':
        assertNonNegative('encounter.phaseSecondsRemaining', encounter.phaseSecondsRemaining);
        break;
      case 'telegraphing':
      case 'sideswiping':
        assertNonNegative('encounter.phaseSecondsRemaining', encounter.phaseSecondsRemaining);
        if (encounter.chosenSide !== 'left' && encounter.chosenSide !== 'right') {
          throw new RangeError(
            `an attacking patrol must expose a locked side, got ${String(encounter.chosenSide)}`
          );
        }
        break;
      case 'closing':
      case 'flanking':
      case 'resolved':
        break;
      default:
        throw new RangeError(
          `Unknown patrol encounter phase: ${String((encounter as PatrolEncounter).phase)}`
        );
    }
  }
  getActivePatrolEncounter(state);
}

function assertBoolean(label: string, value: boolean): void {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean, got ${value}`);
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

function assertPositiveInteger(label: string, value: number): void {
  assertPositive(label, value);
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer, got ${value}`);
}
