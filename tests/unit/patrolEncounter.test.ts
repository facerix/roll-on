import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PATROL_ENCOUNTER_TUNING,
  createPatrolEncounterState,
  getActivePatrolEncounter,
  stepPatrolEncounter,
  validatePatrolEncounterTuning,
  type PatrolEncounterDefinition,
  type PatrolEncounterEvent,
  type PatrolEncounterFrame,
  type PatrolEncounterState,
  type PatrolEncounterTuning,
} from '../../src/game/patrolEncounter.ts';

const MAX_SPEED = 40;
const HIGH_TIER_SPEED = 30;

const STAGE_1_TRAP: PatrolEncounterDefinition = Object.freeze({
  id: 'stage-1-speed-trap',
  source: 'speed-trap',
  triggerDistanceMeters: 700,
  windowStartDistanceMeters: 700,
  windowEndDistanceMeters: 950,
  requiredAvoids: 2,
});

interface FrameOverrides {
  readonly dtSeconds?: number;
  readonly previousRouteDistanceMeters?: number;
  readonly routeDistanceMeters?: number;
  readonly speedMetersPerSecond?: number;
  readonly patrolGapMeters?: number;
  readonly leftClearanceMeters?: number;
  readonly rightClearanceMeters?: number;
  readonly hasPatrolContact?: boolean;
  readonly roadRageIncidents?: number;
  readonly isTerminal?: boolean;
}

function frame(overrides: FrameOverrides = {}): PatrolEncounterFrame {
  const routeDistanceMeters = overrides.routeDistanceMeters ?? 800;
  return {
    dtSeconds: overrides.dtSeconds ?? 0.1,
    previousRouteDistanceMeters: overrides.previousRouteDistanceMeters ?? routeDistanceMeters,
    routeDistanceMeters,
    speedMetersPerSecond: overrides.speedMetersPerSecond ?? HIGH_TIER_SPEED,
    maximumSpeedMetersPerSecond: MAX_SPEED,
    patrolGapMeters: overrides.patrolGapMeters ?? 0,
    leftClearanceMeters: overrides.leftClearanceMeters ?? 6,
    rightClearanceMeters: overrides.rightClearanceMeters ?? 6,
    hasPatrolContact: overrides.hasPatrolContact ?? false,
    roadRageIncidents: overrides.roadRageIncidents ?? 0,
    isTerminal: overrides.isTerminal ?? false,
  };
}

interface StepOutcome {
  readonly state: PatrolEncounterState;
  readonly events: readonly PatrolEncounterEvent[];
}

function step(
  state: PatrolEncounterState,
  overrides: FrameOverrides = {},
  tuning: PatrolEncounterTuning = DEFAULT_PATROL_ENCOUNTER_TUNING
): StepOutcome {
  return stepPatrolEncounter({ state, frame: frame(overrides), tuning });
}

/** Advance simulation time in place without moving the truck along the route. */
function hold(
  state: PatrolEncounterState,
  seconds: number,
  overrides: FrameOverrides = {},
  tuning: PatrolEncounterTuning = DEFAULT_PATROL_ENCOUNTER_TUNING
): StepOutcome {
  const dtSeconds = overrides.dtSeconds ?? 0.1;
  let current = state;
  const events: PatrolEncounterEvent[] = [];
  const steps = Math.round(seconds / dtSeconds);
  for (let index = 0; index < steps; index++) {
    const outcome = step(current, { ...overrides, dtSeconds }, tuning);
    current = outcome.state;
    events.push(...outcome.events);
  }
  return { state: current, events };
}

function trapState(): PatrolEncounterState {
  return createPatrolEncounterState({ definitions: [STAGE_1_TRAP] });
}

function crossTrap(speedMetersPerSecond: number): StepOutcome {
  return step(trapState(), {
    previousRouteDistanceMeters: 695,
    routeDistanceMeters: 705,
    speedMetersPerSecond,
  });
}

/** Drive a triggered trap encounter to the point where an attack side is chosen. */
function pursuitInFlanking(overrides: FrameOverrides = {}): PatrolEncounterState {
  const triggered = crossTrap(HIGH_TIER_SPEED).state;
  const closing = hold(triggered, DEFAULT_PATROL_ENCOUNTER_TUNING.pullOutSeconds, {
    routeDistanceMeters: 720,
    patrolGapMeters: 40,
  }).state;
  assert.equal(getActivePatrolEncounter(closing)?.phase, 'closing');
  return step(closing, { routeDistanceMeters: 730, patrolGapMeters: 6, ...overrides }).state;
}

test('a posted speed trap ignores a pass below the high tier and cannot be retriggered', () => {
  const slow = crossTrap(HIGH_TIER_SPEED - 0.001);
  assert.equal(getActivePatrolEncounter(slow.state), null);
  assert.deepEqual(
    slow.events.map(event => event.kind),
    ['trap-resolved']
  );
  assert.equal(slow.state.encounters[0]!.phase, 'resolved');

  const reversedThenFast = step(slow.state, {
    previousRouteDistanceMeters: 705,
    routeDistanceMeters: 695,
    speedMetersPerSecond: MAX_SPEED,
  }).state;
  const reCrossed = step(reversedThenFast, {
    previousRouteDistanceMeters: 695,
    routeDistanceMeters: 705,
    speedMetersPerSecond: MAX_SPEED,
  });
  assert.equal(getActivePatrolEncounter(reCrossed.state), null);
  assert.deepEqual(reCrossed.events, []);
});

test('crossing the trap line at exactly the high tier starts one pursuit', () => {
  const triggered = crossTrap(HIGH_TIER_SPEED);
  const active = getActivePatrolEncounter(triggered.state);
  assert.equal(active?.phase, 'pulling-out');
  assert.equal(active?.source, 'speed-trap');
  assert.equal(active?.windowEndDistanceMeters, 950);
  assert.equal(active?.requiredAvoids, 2);
  assert.equal(typeof active?.cruiserId, 'number');
  assert.deepEqual(
    triggered.events.map(event => event.kind),
    ['pursuit-started']
  );

  const later = step(triggered.state, {
    previousRouteDistanceMeters: 705,
    routeDistanceMeters: 715,
    speedMetersPerSecond: MAX_SPEED,
  });
  assert.equal(
    later.state.encounters.filter(encounter => encounter.phase !== 'resolved').length,
    1
  );
});

test('one large fixed step across the trap line makes the same single decision', () => {
  const jumped = step(trapState(), {
    dtSeconds: 0.5,
    previousRouteDistanceMeters: 690,
    routeDistanceMeters: 740,
    speedMetersPerSecond: HIGH_TIER_SPEED,
  });
  assert.equal(getActivePatrolEncounter(jumped.state)?.phase, 'pulling-out');
  assert.equal(jumped.events.filter(event => event.kind === 'pursuit-started').length, 1);
});

test('trap detection reads the shared high tier rather than a private constant', () => {
  const scaled = stepPatrolEncounter({
    state: trapState(),
    frame: {
      ...frame({
        previousRouteDistanceMeters: 695,
        routeDistanceMeters: 705,
        speedMetersPerSecond: 15,
      }),
      maximumSpeedMetersPerSecond: 20,
    },
    tuning: DEFAULT_PATROL_ENCOUNTER_TUNING,
  });
  assert.equal(getActivePatrolEncounter(scaled.state)?.phase, 'pulling-out');
});

test('road rage schedules exactly one response ten simulation seconds later', () => {
  const scheduled = step(createPatrolEncounterState(), { roadRageIncidents: 1 });
  assert.equal(scheduled.state.pendingResponse?.secondsRemaining, 10);
  assert.deepEqual(
    scheduled.events.map(event => event.kind),
    ['response-scheduled']
  );

  const nearlyDue = hold(scheduled.state, 9.9, { roadRageIncidents: 1 });
  assert.ok((nearlyDue.state.pendingResponse?.secondsRemaining ?? 0) > 0);
  assert.equal(getActivePatrolEncounter(nearlyDue.state), null);
  assert.equal(nearlyDue.events.filter(event => event.kind === 'response-scheduled').length, 0);

  const due = step(nearlyDue.state, { routeDistanceMeters: 1_000 });
  const active = getActivePatrolEncounter(due.state);
  assert.equal(active?.phase, 'closing');
  assert.equal(active?.source, 'road-rage');
  assert.equal(due.state.pendingResponse, null);
  assert.equal(
    active?.windowEndDistanceMeters,
    1_000 + DEFAULT_PATROL_ENCOUNTER_TUNING.roadRageWindowLengthMeters
  );
});

test('an incident during an active patrol schedules nothing', () => {
  const pursuing = pursuitInFlanking();
  const during = step(pursuing, { roadRageIncidents: 3, routeDistanceMeters: 730 });
  assert.equal(during.state.pendingResponse, null);
  assert.equal(during.events.filter(event => event.kind === 'response-scheduled').length, 0);
});

test('a terminal stage result cancels pending and active enforcement', () => {
  const scheduled = step(createPatrolEncounterState(), { roadRageIncidents: 1 }).state;
  const cancelled = step(scheduled, { isTerminal: true });
  assert.equal(cancelled.state.pendingResponse, null);
  assert.deepEqual(
    cancelled.events.map(event => event.kind),
    ['response-cancelled']
  );

  const pursuing = pursuitInFlanking();
  const stopped = step(pursuing, { isTerminal: true, routeDistanceMeters: 730 });
  const active = getActivePatrolEncounter(stopped.state);
  assert.equal(active?.phase, 'disengaging');
  assert.equal(
    stopped.events.some(
      event => event.kind === 'disengaged' && event.reason === 'terminal-stage-result'
    ),
    true
  );
});

test('a pending or active response suppresses the authored trap instead of stacking', () => {
  const scheduled = step(createPatrolEncounterState({ definitions: [STAGE_1_TRAP] }), {
    routeDistanceMeters: 600,
    roadRageIncidents: 1,
  }).state;
  const crossed = step(scheduled, {
    previousRouteDistanceMeters: 695,
    routeDistanceMeters: 705,
    speedMetersPerSecond: MAX_SPEED,
  });
  assert.equal(getActivePatrolEncounter(crossed.state), null);
  assert.deepEqual(crossed.events, [
    { kind: 'trap-resolved', encounterId: STAGE_1_TRAP.id, reason: 'suppressed' },
  ]);
  assert.ok((crossed.state.pendingResponse?.secondsRemaining ?? 0) > 0);
});

test('side selection needs viable clearance, prefers room, and breaks ties deterministically', () => {
  const blocked = pursuitInFlanking({ leftClearanceMeters: 1, rightClearanceMeters: 1 });
  assert.equal(getActivePatrolEncounter(blocked)?.phase, 'flanking');

  const retried = step(blocked, {
    routeDistanceMeters: 735,
    patrolGapMeters: 6,
    leftClearanceMeters: 1,
    rightClearanceMeters: 8,
  }).state;
  const telegraphing = getActivePatrolEncounter(retried);
  assert.equal(telegraphing?.phase, 'telegraphing');
  assert.equal(telegraphing?.phase === 'telegraphing' ? telegraphing.chosenSide : null, 'right');

  const leftPreferred = step(pursuitInFlanking(), {
    routeDistanceMeters: 735,
    patrolGapMeters: 6,
    leftClearanceMeters: 9,
    rightClearanceMeters: 4,
  }).state;
  const chosenLeft = getActivePatrolEncounter(leftPreferred);
  assert.equal(chosenLeft?.phase === 'telegraphing' ? chosenLeft.chosenSide : null, 'left');

  const tied = step(pursuitInFlanking(), {
    routeDistanceMeters: 735,
    patrolGapMeters: 6,
    leftClearanceMeters: 5,
    rightClearanceMeters: 5,
  }).state;
  const tieBreak = getActivePatrolEncounter(tied);
  assert.equal(tieBreak?.phase === 'telegraphing' ? tieBreak.chosenSide : null, 'left');
});

test('the locked side survives telegraphing and aborts without recording an avoid', () => {
  const telegraphing = step(pursuitInFlanking(), {
    routeDistanceMeters: 735,
    patrolGapMeters: 6,
    leftClearanceMeters: 9,
    rightClearanceMeters: 4,
  }).state;

  const stillLocked = step(telegraphing, {
    routeDistanceMeters: 736,
    patrolGapMeters: 6,
    leftClearanceMeters: 9,
    rightClearanceMeters: 20,
  }).state;
  const locked = getActivePatrolEncounter(stillLocked);
  assert.equal(locked?.phase === 'telegraphing' ? locked.chosenSide : null, 'left');

  const aborted = step(stillLocked, {
    routeDistanceMeters: 737,
    patrolGapMeters: 6,
    leftClearanceMeters: 0.5,
    rightClearanceMeters: 20,
  });
  const abortedEncounter = getActivePatrolEncounter(aborted.state);
  assert.equal(abortedEncounter?.phase, 'recovering');
  assert.equal(abortedEncounter?.recordedAvoids, 0);
  assert.deepEqual(
    aborted.events.map(event => event.kind),
    ['attack-aborted']
  );
});

test('a committed attack records one avoid on a miss and no avoid on a hit', () => {
  const committed = commitAttack(pursuitInFlanking());
  assert.equal(getActivePatrolEncounter(committed.state)?.phase, 'sideswiping');
  assert.equal(
    committed.events.some(event => event.kind === 'attack-committed'),
    true
  );

  const missed = hold(committed.state, DEFAULT_PATROL_ENCOUNTER_TUNING.attackWindowSeconds, {
    routeDistanceMeters: 760,
    patrolGapMeters: 2,
  });
  const afterMiss = getActivePatrolEncounter(missed.state);
  assert.equal(afterMiss?.phase, 'recovering');
  assert.equal(afterMiss?.recordedAvoids, 1);
  assert.equal(missed.events.filter(event => event.kind === 'attack-avoided').length, 1);

  const hit = step(committed.state, {
    routeDistanceMeters: 760,
    patrolGapMeters: 2,
    hasPatrolContact: true,
  });
  const afterHit = getActivePatrolEncounter(hit.state);
  assert.equal(afterHit?.phase, 'recovering');
  assert.equal(afterHit?.recordedAvoids, 0);
  assert.equal(hit.events.filter(event => event.kind === 'attack-hit').length, 1);

  const settled = hold(hit.state, DEFAULT_PATROL_ENCOUNTER_TUNING.attackWindowSeconds, {
    routeDistanceMeters: 765,
    patrolGapMeters: 2,
    hasPatrolContact: true,
  });
  assert.equal(settled.events.filter(event => event.kind === 'attack-hit').length, 0);
});

test('a hit does not erase earlier avoids and the second miss ends stage 1 pursuit', () => {
  let current = commitAttack(pursuitInFlanking()).state;
  current = missCommittedAttack(current);
  assert.equal(getActivePatrolEncounter(current)?.recordedAvoids, 1);

  current = hold(current, DEFAULT_PATROL_ENCOUNTER_TUNING.recoverSeconds, {
    routeDistanceMeters: 800,
    patrolGapMeters: 2,
  }).state;
  assert.equal(getActivePatrolEncounter(current)?.phase, 'closing');

  const secondCommit = commitAttack(current, 810);
  const hitOnce = step(secondCommit.state, {
    routeDistanceMeters: 815,
    patrolGapMeters: 2,
    hasPatrolContact: true,
  }).state;
  assert.equal(getActivePatrolEncounter(hitOnce)?.recordedAvoids, 1);

  let secondPass = hold(hitOnce, DEFAULT_PATROL_ENCOUNTER_TUNING.recoverSeconds, {
    routeDistanceMeters: 820,
    patrolGapMeters: 2,
  }).state;
  secondPass = commitAttack(secondPass, 825).state;
  const missedAgain = hold(secondPass, DEFAULT_PATROL_ENCOUNTER_TUNING.attackWindowSeconds, {
    routeDistanceMeters: 830,
    patrolGapMeters: 2,
  });
  const disengaging = getActivePatrolEncounter(missedAgain.state);
  assert.equal(disengaging?.phase, 'disengaging');
  assert.equal(disengaging?.recordedAvoids, 2);
  assert.equal(
    missedAgain.events.some(event => event.kind === 'disengaged' && event.reason === 'avoids-met'),
    true
  );
});

test('a decisive lead held for the dwell time ends the pursuit', () => {
  const closing = pursuitInFlanking({ patrolGapMeters: 40 });
  const brief = hold(closing, DEFAULT_PATROL_ENCOUNTER_TUNING.leadDwellSeconds - 0.2, {
    routeDistanceMeters: 800,
    patrolGapMeters: DEFAULT_PATROL_ENCOUNTER_TUNING.decisiveLeadMeters,
  });
  assert.notEqual(getActivePatrolEncounter(brief.state)?.phase, 'disengaging');

  const bumped = step(brief.state, {
    routeDistanceMeters: 800,
    patrolGapMeters: DEFAULT_PATROL_ENCOUNTER_TUNING.decisiveLeadMeters - 1,
  }).state;
  const sustained = hold(bumped, DEFAULT_PATROL_ENCOUNTER_TUNING.leadDwellSeconds, {
    routeDistanceMeters: 820,
    patrolGapMeters: DEFAULT_PATROL_ENCOUNTER_TUNING.decisiveLeadMeters,
  });
  assert.equal(getActivePatrolEncounter(sustained.state)?.phase, 'disengaging');
  assert.equal(
    sustained.events.some(event => event.kind === 'disengaged' && event.reason === 'decisive-lead'),
    true
  );
});

test('leaving the encounter window ends the pursuit even mid-attack', () => {
  const committed = commitAttack(pursuitInFlanking()).state;
  const exited = step(committed, { routeDistanceMeters: 950, patrolGapMeters: 2 });
  const encounter = getActivePatrolEncounter(exited.state);
  assert.equal(encounter?.phase, 'disengaging');
  assert.equal(encounter?.recordedAvoids, 0);
  assert.equal(
    exited.events.some(event => event.kind === 'disengaged' && event.reason === 'window-exit'),
    true
  );

  const stillDisengaging = step(exited.state, {
    routeDistanceMeters: 955,
    patrolGapMeters: 0,
    hasPatrolContact: true,
  });
  assert.equal(stillDisengaging.events.filter(event => event.kind === 'attack-hit').length, 0);
});

test('a disengaged encounter resolves once and can never act again', () => {
  const exited = step(commitAttack(pursuitInFlanking()).state, {
    routeDistanceMeters: 950,
    patrolGapMeters: 2,
  }).state;
  const resolved = hold(exited, DEFAULT_PATROL_ENCOUNTER_TUNING.disengageSeconds, {
    routeDistanceMeters: 960,
    patrolGapMeters: 2,
  });
  assert.equal(getActivePatrolEncounter(resolved.state), null);
  assert.equal(resolved.state.encounters.at(-1)!.phase, 'resolved');
  assert.equal(resolved.events.filter(event => event.kind === 'resolved').length, 1);

  const afterwards = step(resolved.state, {
    routeDistanceMeters: 970,
    patrolGapMeters: 0,
    hasPatrolContact: true,
  });
  assert.deepEqual(afterwards.events, []);
  assert.deepEqual(afterwards.state.encounters, resolved.state.encounters);
});

test('equal frame streams reproduce states, timers, sides, and outcomes exactly', () => {
  const script: FrameOverrides[] = [
    { previousRouteDistanceMeters: 695, routeDistanceMeters: 705, speedMetersPerSecond: 32 },
    { routeDistanceMeters: 715, patrolGapMeters: 30 },
    { routeDistanceMeters: 725, patrolGapMeters: 20 },
    { routeDistanceMeters: 735, patrolGapMeters: 6, leftClearanceMeters: 7 },
    { routeDistanceMeters: 745, patrolGapMeters: 5, hasPatrolContact: true },
    { routeDistanceMeters: 755, patrolGapMeters: 5, roadRageIncidents: 1 },
  ];
  const run = (): StepOutcome => {
    let current = trapState();
    const events: PatrolEncounterEvent[] = [];
    for (const overrides of script) {
      const outcome = step(current, overrides);
      current = outcome.state;
      events.push(...outcome.events);
    }
    return { state: current, events };
  };
  const first = run();
  const second = run();
  assert.deepEqual(second.state, first.state);
  assert.deepEqual(second.events, first.events);
});

test('malformed encounter definitions, tuning, and frames fail explicitly', () => {
  assert.throws(
    () =>
      createPatrolEncounterState({
        definitions: [{ ...STAGE_1_TRAP, requiredAvoids: 0 }],
      }),
    /requiredAvoids/
  );
  assert.throws(
    () =>
      createPatrolEncounterState({
        definitions: [{ ...STAGE_1_TRAP, windowEndDistanceMeters: 700 }],
      }),
    /windowEndDistanceMeters/
  );
  assert.throws(
    () =>
      createPatrolEncounterState({
        definitions: [{ ...STAGE_1_TRAP, triggerDistanceMeters: 960 }],
      }),
    /triggerDistanceMeters/
  );
  assert.throws(
    () => createPatrolEncounterState({ definitions: [STAGE_1_TRAP, STAGE_1_TRAP] }),
    /duplicate/
  );
  assert.throws(
    () =>
      createPatrolEncounterState({
        definitions: [{ ...STAGE_1_TRAP, source: 'road-rage', triggerDistanceMeters: undefined }],
      }),
    /speed-trap/
  );

  assert.throws(
    () =>
      validatePatrolEncounterTuning({
        ...DEFAULT_PATROL_ENCOUNTER_TUNING,
        telegraphSeconds: 0.4,
      }),
    /telegraphSeconds/
  );
  assert.throws(
    () =>
      validatePatrolEncounterTuning({
        ...DEFAULT_PATROL_ENCOUNTER_TUNING,
        roadRageResponseDelaySeconds: -1,
      }),
    /roadRageResponseDelaySeconds/
  );
  assert.throws(() => step(trapState(), { dtSeconds: Number.NaN }), /dtSeconds/);
  assert.throws(
    () => step(trapState(), { patrolGapMeters: Number.POSITIVE_INFINITY }),
    /patrolGapMeters/
  );
  assert.throws(() => step(trapState(), { roadRageIncidents: 1.5 }), /roadRageIncidents/);
  assert.throws(() => step(trapState(), { leftClearanceMeters: -1 }), /leftClearanceMeters/);
});

test('default tuning keeps the stage 1 window fair for two committed attempts', () => {
  const tuning = DEFAULT_PATROL_ENCOUNTER_TUNING;
  assert.equal(tuning.roadRageResponseDelaySeconds, 10);
  assert.equal(tuning.decisiveLeadMeters, 60);
  assert.equal(tuning.leadDwellSeconds, 1);
  assert.ok(tuning.telegraphSeconds >= tuning.minimumTelegraphSeconds);
  assert.ok(tuning.minimumTelegraphSeconds >= 0.5);

  const attemptSeconds =
    tuning.pullOutSeconds +
    2 * (tuning.telegraphSeconds + tuning.attackWindowSeconds) +
    tuning.recoverSeconds;
  const windowSeconds =
    (STAGE_1_TRAP.windowEndDistanceMeters - STAGE_1_TRAP.windowStartDistanceMeters) /
    HIGH_TIER_SPEED;
  assert.ok(
    attemptSeconds <= windowSeconds,
    `two attempts need ${attemptSeconds} s but the window allows ${windowSeconds} s`
  );
});

/** Advance a closing or flanking encounter through its telegraph into a committed attack. */
function commitAttack(state: PatrolEncounterState, routeDistanceMeters = 740): StepOutcome {
  const setup: FrameOverrides = {
    routeDistanceMeters,
    patrolGapMeters: 6,
    leftClearanceMeters: 9,
    rightClearanceMeters: 4,
  };
  let telegraphing = state;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (getActivePatrolEncounter(telegraphing)?.phase === 'telegraphing') break;
    telegraphing = step(telegraphing, setup).state;
  }
  assert.equal(getActivePatrolEncounter(telegraphing)?.phase, 'telegraphing');
  return hold(telegraphing, DEFAULT_PATROL_ENCOUNTER_TUNING.telegraphSeconds, {
    routeDistanceMeters,
    patrolGapMeters: 6,
    leftClearanceMeters: 9,
    rightClearanceMeters: 4,
  });
}

/** Let a committed attack expire without patrol contact. */
function missCommittedAttack(state: PatrolEncounterState): PatrolEncounterState {
  return hold(state, DEFAULT_PATROL_ENCOUNTER_TUNING.attackWindowSeconds, {
    routeDistanceMeters: 780,
    patrolGapMeters: 2,
  }).state;
}
