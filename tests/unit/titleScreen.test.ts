import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installTitleScreenStartHandlers } from '../../src/game/titleScreen.ts';

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

test('mouse start disarms the keyboard start handler', () => {
  const activationTarget = new EventTarget();
  const keyboardTarget = new EventTarget();
  let starts = 0;

  installTitleScreenStartHandlers({
    activationTarget,
    keyboardTarget,
    onStart: () => {
      starts += 1;
    },
  });

  activationTarget.dispatchEvent(new Event('click'));
  keyboardTarget.dispatchEvent(keyDown('ArrowRight'));

  assert.equal(starts, 1);
});

test('keyboard start disarms the mouse start handler', () => {
  const activationTarget = new EventTarget();
  const keyboardTarget = new EventTarget();
  let starts = 0;

  installTitleScreenStartHandlers({
    activationTarget,
    keyboardTarget,
    onStart: () => {
      starts += 1;
    },
  });

  keyboardTarget.dispatchEvent(keyDown('Enter'));
  activationTarget.dispatchEvent(new Event('click'));

  assert.equal(starts, 1);
});

test('Tab and modifier chords do not start the game', () => {
  const activationTarget = new EventTarget();
  const keyboardTarget = new EventTarget();
  let starts = 0;

  installTitleScreenStartHandlers({
    activationTarget,
    keyboardTarget,
    onStart: () => {
      starts += 1;
    },
  });

  keyboardTarget.dispatchEvent(keyDown('Tab'));
  keyboardTarget.dispatchEvent(keyDown('r', { metaKey: true }));
  keyboardTarget.dispatchEvent(keyDown('r', { ctrlKey: true }));
  keyboardTarget.dispatchEvent(keyDown('ArrowRight', { altKey: true }));

  assert.equal(starts, 0);
});

test('cleanup disarms both start handlers without starting', () => {
  const activationTarget = new EventTarget();
  const keyboardTarget = new EventTarget();
  let starts = 0;
  const dispose = installTitleScreenStartHandlers({
    activationTarget,
    keyboardTarget,
    onStart: () => {
      starts += 1;
    },
  });

  dispose();
  dispose();
  activationTarget.dispatchEvent(new Event('click'));
  keyboardTarget.dispatchEvent(keyDown('Enter'));

  assert.equal(starts, 0);
});
