import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RectDrawable } from '../../src/engine/renderer.ts';
import {
  buildPatrolGlareDrawables,
  buildPatrolGlareSnapshot,
  DEFAULT_PATROL_GLARE_TUNING,
} from '../../src/game/patrolGlare.ts';
import type { PatrolEncounter, PatrolEncounterPhase } from '../../src/game/patrolEncounter.ts';

const VIEWPORT = { width: 320, height: 480 };

function encounter(phase: PatrolEncounterPhase): PatrolEncounter {
  return {
    id: 'stage-1-speed-trap',
    source: 'speed-trap',
    cruiserId: 7,
    windowStartDistanceMeters: 700,
    windowEndDistanceMeters: 950,
    requiredAvoids: 2,
    recordedAvoids: 0,
    leadDwellSeconds: 0,
    hasEngaged: true,
    phase,
    phaseSecondsRemaining: 1,
    chosenSide: 'right',
    triggerDistanceMeters: 700,
    resolution: 'window-exit',
    reason: 'window-exit',
  } as PatrolEncounter;
}

function rects(drawables: readonly unknown[]): readonly RectDrawable[] {
  return drawables.filter((drawable): drawable is RectDrawable => {
    return (drawable as RectDrawable).kind === 'rect';
  });
}

test('no pursuit means no glare at all', () => {
  const idle = buildPatrolGlareSnapshot({ encounter: null, patrolGapMeters: 0 });
  const posted = buildPatrolGlareSnapshot({
    encounter: encounter('posted'),
    patrolGapMeters: 5,
  });

  assert.equal(idle.isVisible, false);
  assert.equal(posted.isVisible, false);
  assert.deepEqual(
    buildPatrolGlareDrawables({ snapshot: idle, viewport: VIEWPORT, elapsedSeconds: 1 }),
    []
  );
});

test('glare strength tracks how close the cruiser is', () => {
  const far = buildPatrolGlareSnapshot({
    encounter: encounter('closing'),
    patrolGapMeters: DEFAULT_PATROL_GLARE_TUNING.visibleRangeMeters + 10,
  });
  const near = buildPatrolGlareSnapshot({
    encounter: encounter('closing'),
    patrolGapMeters: 5,
  });
  const alongside = buildPatrolGlareSnapshot({
    encounter: encounter('sideswiping'),
    patrolGapMeters: -2,
  });

  assert.equal(far.isVisible, true);
  assert.equal(far.intensity, 0);
  assert.ok(near.intensity > 0 && near.intensity < 1);
  assert.equal(alongside.intensity, 1);
});

test('the glare names a side only once an attack side is locked', () => {
  assert.equal(
    buildPatrolGlareSnapshot({ encounter: encounter('closing'), patrolGapMeters: 5 }).side,
    null
  );
  assert.equal(
    buildPatrolGlareSnapshot({ encounter: encounter('flanking'), patrolGapMeters: 5 }).side,
    null
  );
  assert.equal(
    buildPatrolGlareSnapshot({ encounter: encounter('telegraphing'), patrolGapMeters: 5 }).side,
    'right'
  );
  assert.equal(
    buildPatrolGlareSnapshot({ encounter: encounter('sideswiping'), patrolGapMeters: 5 }).side,
    'right'
  );
});

test('the glare sits in a band at the bottom of the road view', () => {
  const snapshot = buildPatrolGlareSnapshot({
    encounter: encounter('closing'),
    patrolGapMeters: 4,
  });
  const drawn = rects(
    buildPatrolGlareDrawables({ snapshot, viewport: VIEWPORT, elapsedSeconds: 0.1 })
  );

  assert.equal(drawn.length, 2);
  for (const rect of drawn) {
    assert.ok(rect.y >= 0 && rect.y + rect.h <= VIEWPORT.height);
    assert.ok(rect.y + rect.h === VIEWPORT.height);
    assert.ok(rect.x >= 0 && rect.x + rect.w <= VIEWPORT.width);
    assert.match(rect.color, /^rgba\(/);
  }
  assert.equal(drawn[0]!.x, 0);
  assert.equal(drawn[1]!.x, VIEWPORT.width / 2);
});

test('the two halves alternate over time and stay derived from their inputs', () => {
  const snapshot = buildPatrolGlareSnapshot({
    encounter: encounter('closing'),
    patrolGapMeters: 2,
  });
  const at = (elapsedSeconds: number): readonly RectDrawable[] =>
    rects(buildPatrolGlareDrawables({ snapshot, viewport: VIEWPORT, elapsedSeconds }));

  const first = at(0);
  const halfPhase = at(1 / (2 * DEFAULT_PATROL_GLARE_TUNING.flashHertz));

  assert.notDeepEqual(first[0]!.color, halfPhase[0]!.color);
  assert.deepEqual(at(0), first);
});

test('reduced motion keeps a steady alternating glow instead of a hard flash', () => {
  const snapshot = buildPatrolGlareSnapshot({
    encounter: encounter('closing'),
    patrolGapMeters: 2,
  });
  const alphas: number[] = [];
  for (let step = 0; step <= 20; step++) {
    const drawn = rects(
      buildPatrolGlareDrawables({
        snapshot,
        viewport: VIEWPORT,
        elapsedSeconds: step * 0.05,
        reducedMotion: true,
      })
    );
    for (const rect of drawn) {
      alphas.push(Number(/rgba\([^)]*,\s*([\d.]+)\)$/.exec(rect.color)![1]));
    }
  }

  assert.ok(Math.min(...alphas) > 0, 'a reduced-motion glare must never blink fully off');
  assert.ok(Math.max(...alphas) <= 1);
});

test('a locked side is emphasized without becoming the only cue', () => {
  const left = buildPatrolGlareDrawables({
    snapshot: { isVisible: true, intensity: 1, side: 'left' },
    viewport: VIEWPORT,
    elapsedSeconds: 0,
  });
  const right = buildPatrolGlareDrawables({
    snapshot: { isVisible: true, intensity: 1, side: 'right' },
    viewport: VIEWPORT,
    elapsedSeconds: 0,
  });

  assert.equal(rects(left).length, 2);
  assert.equal(rects(right).length, 2);
  assert.notDeepEqual(rects(left)[0]!.w, rects(right)[0]!.w);
});

test('malformed glare inputs fail explicitly', () => {
  assert.throws(
    () =>
      buildPatrolGlareSnapshot({
        encounter: encounter('closing'),
        patrolGapMeters: Number.NaN,
      }),
    /patrolGapMeters/
  );
  assert.throws(
    () =>
      buildPatrolGlareDrawables({
        snapshot: { isVisible: true, intensity: 2, side: null },
        viewport: VIEWPORT,
        elapsedSeconds: 0,
      }),
    /intensity/
  );
  assert.throws(
    () =>
      buildPatrolGlareDrawables({
        snapshot: { isVisible: true, intensity: 1, side: null },
        viewport: VIEWPORT,
        elapsedSeconds: -1,
      }),
    /elapsedSeconds/
  );
});
