import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InputAdapter } from '../../src/engine/input.ts';
import { runGameUpdate } from '../../src/game/update.ts';

function keyEvent(type: 'keydown' | 'keyup', code: string): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: false },
  });
  return event;
}

test('gameplay observes input edges before the update retires them', () => {
  const target = new EventTarget();
  const input = new InputAdapter({ target });
  input.attach();
  target.dispatchEvent(keyEvent('keydown', 'Space'));

  let observedPress = false;
  runGameUpdate(1 / 60, input, (_dt, frameInput) => {
    observedPress = frameInput.wasPressed('horn');
  });

  assert.equal(observedPress, true);
  assert.equal(input.wasPressed('horn'), false, 'edge should be retired after the update');
});
