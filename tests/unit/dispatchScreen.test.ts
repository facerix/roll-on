import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDispatchScreenHandlers, type DispatchMode } from '../../src/game/dispatchScreen.ts';

function keyDown(key: string, modifiers: Partial<KeyboardEvent> = {}): Event {
  const event = new Event('keydown');
  Object.defineProperties(event, {
    key: { value: key },
    metaKey: { value: modifiers.metaKey ?? false },
    ctrlKey: { value: modifiers.ctrlKey ?? false },
    altKey: { value: modifiers.altKey ?? false },
  });
  return event;
}

interface Harness {
  readonly campaign: EventTarget;
  readonly challenge: EventTarget;
  readonly keyboard: EventTarget;
  readonly highlights: DispatchMode[];
  readonly selections: DispatchMode[];
  readonly backs: { count: number };
  readonly dispose: () => void;
}

function harness(overrides: { onSelect?: (mode: DispatchMode) => void } = {}): Harness {
  const campaign = new EventTarget();
  const challenge = new EventTarget();
  const keyboard = new EventTarget();
  const highlights: DispatchMode[] = [];
  const selections: DispatchMode[] = [];
  const backs = { count: 0 };

  const dispose = installDispatchScreenHandlers({
    options: [
      { mode: 'campaign', activationTarget: campaign },
      { mode: 'challenge', activationTarget: challenge },
    ],
    keyboardTarget: keyboard,
    onHighlight: mode => {
      highlights.push(mode);
    },
    onSelect: mode => {
      selections.push(mode);
      overrides.onSelect?.(mode);
    },
    onBack: () => {
      backs.count += 1;
    },
  });

  return { campaign, challenge, keyboard, highlights, selections, backs, dispose };
}

test('install highlights the first option so presentation matches state', () => {
  const h = harness();
  assert.deepEqual(h.highlights, ['campaign']);
  assert.deepEqual(h.selections, []);
});

test('clicking an option selects that mode regardless of the highlight', () => {
  const h = harness();
  h.challenge.dispatchEvent(new Event('click'));
  assert.deepEqual(h.selections, ['challenge']);
  assert.equal(h.highlights.at(-1), 'challenge');
});

test('arrow keys move the highlight and Enter selects the highlighted mode', () => {
  const h = harness();
  h.keyboard.dispatchEvent(keyDown('ArrowRight'));
  assert.equal(h.highlights.at(-1), 'challenge');
  assert.deepEqual(h.selections, []);

  h.keyboard.dispatchEvent(keyDown('Enter'));
  assert.deepEqual(h.selections, ['challenge']);
});

test('highlight wraps in both directions', () => {
  const h = harness();
  h.keyboard.dispatchEvent(keyDown('ArrowLeft'));
  assert.equal(h.highlights.at(-1), 'challenge');
  h.keyboard.dispatchEvent(keyDown('ArrowDown'));
  assert.equal(h.highlights.at(-1), 'campaign');
  h.keyboard.dispatchEvent(keyDown('ArrowUp'));
  assert.equal(h.highlights.at(-1), 'challenge');
});

test('re-highlighting the same option does not re-notify presentation', () => {
  const h = harness();
  h.campaign.dispatchEvent(new Event('mouseenter'));
  assert.deepEqual(h.highlights, ['campaign']);
});

test('pointer hover moves the highlight to the hovered option', () => {
  const h = harness();
  h.challenge.dispatchEvent(new Event('mouseenter'));
  assert.deepEqual(h.highlights, ['campaign', 'challenge']);

  h.keyboard.dispatchEvent(keyDown(' '));
  assert.deepEqual(h.selections, ['challenge']);
});

test('a mode that goes nowhere leaves the screen armed for another choice', () => {
  const h = harness();
  h.challenge.dispatchEvent(new Event('click'));
  h.campaign.dispatchEvent(new Event('click'));
  assert.deepEqual(h.selections, ['challenge', 'campaign']);
});

test('disposing inside onSelect prevents a second selection', () => {
  let dispose: (() => void) | null = null;
  const h = harness({
    onSelect: () => {
      dispose?.();
    },
  });
  dispose = h.dispose;

  h.campaign.dispatchEvent(new Event('click'));
  h.campaign.dispatchEvent(new Event('click'));
  h.keyboard.dispatchEvent(keyDown('Enter'));

  assert.deepEqual(h.selections, ['campaign']);
});

test('Escape leaves dispatch through onBack exactly once', () => {
  const h = harness();
  h.keyboard.dispatchEvent(keyDown('Escape'));
  h.keyboard.dispatchEvent(keyDown('Escape'));
  h.keyboard.dispatchEvent(keyDown('Enter'));

  assert.equal(h.backs.count, 1);
  assert.deepEqual(h.selections, []);
});

test('Tab and modifier chords neither select nor move the highlight', () => {
  const h = harness();
  h.keyboard.dispatchEvent(keyDown('Tab'));
  h.keyboard.dispatchEvent(keyDown('r', { metaKey: true }));
  h.keyboard.dispatchEvent(keyDown('ArrowRight', { ctrlKey: true }));
  h.keyboard.dispatchEvent(keyDown('Enter', { altKey: true }));

  assert.deepEqual(h.highlights, ['campaign']);
  assert.deepEqual(h.selections, []);
});

test('unrelated keys do not start a mode', () => {
  const h = harness();
  h.keyboard.dispatchEvent(keyDown('a'));
  h.keyboard.dispatchEvent(keyDown('Shift'));
  assert.deepEqual(h.selections, []);
});

test('cleanup disarms pointer and keyboard without selecting', () => {
  const h = harness();
  h.dispose();
  h.dispose();
  h.campaign.dispatchEvent(new Event('click'));
  h.keyboard.dispatchEvent(keyDown('Enter'));
  h.keyboard.dispatchEvent(keyDown('Escape'));

  assert.deepEqual(h.selections, []);
  assert.equal(h.backs.count, 0);
});

test('an empty option list fails loudly instead of rendering a dead screen', () => {
  assert.throws(
    () =>
      installDispatchScreenHandlers({
        options: [],
        keyboardTarget: new EventTarget(),
        onSelect: () => {},
      }),
    /at least one dispatch option/
  );
});

test('duplicate modes fail loudly', () => {
  const target = new EventTarget();
  assert.throws(
    () =>
      installDispatchScreenHandlers({
        options: [
          { mode: 'campaign', activationTarget: target },
          { mode: 'campaign', activationTarget: new EventTarget() },
        ],
        keyboardTarget: new EventTarget(),
        onSelect: () => {},
      }),
    /duplicate dispatch mode/
  );
});
