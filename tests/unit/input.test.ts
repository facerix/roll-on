/**
 * Input adapter tests.
 *
 * The adapter exposes abstract *actions* (`throttle`, `brake`, `steerLeft`,
 * `steerRight`, `horn`), not raw keys. Gameplay code asks "is `throttle`
 * active right now?" — and never reads `KeyboardEvent`. That lets gamepad
 * and touch slot in later without touching gameplay.
 *
 * Frame semantics:
 *   - `isActive(action)`  — true while a bound key is held.
 *   - `wasPressed(action)`  — latches true on any down-edge since the last
 *     `beginFrame()`. Survives fast taps that go down-and-up between two
 *     consecutive frames (important for one-shot triggers like the horn).
 *   - `wasReleased(action)` — symmetric for up-edges.
 *
 * Edge cases we explicitly cover:
 *   - Browser key-repeat (`event.repeat === true`) does NOT re-trigger
 *     `wasPressed`. One physical press = one logical press.
 *   - Window blur clears held state — otherwise alt-tab leaves the throttle
 *     stuck on. Released keys land in `wasReleased` so gameplay can react.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InputAdapter, DEFAULT_BINDINGS } from '../../src/engine/input.ts';
import type { Action } from '../../src/engine/input.ts';

/** Minimal EventTarget-shaped stub with a synchronous `emit` for tests. */
class FakeTarget {
  #listeners = new Map<string, Set<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.#listeners.get(type)?.delete(fn);
  }
  emit(type: string, event: unknown): void {
    for (const fn of this.#listeners.get(type) ?? []) fn(event);
  }
}

/** Build a KeyboardEvent-shaped object that satisfies the adapter's reads. */
function keyEvent(code: string, opts: { repeat?: boolean } = {}) {
  let prevented = false;
  return {
    code,
    repeat: opts.repeat ?? false,
    preventDefault: () => {
      prevented = true;
    },
    get _prevented() {
      return prevented;
    },
  };
}

function build() {
  const target = new FakeTarget();
  const input = new InputAdapter({
    // Cast: the adapter only uses addEventListener/removeEventListener, which
    // FakeTarget supplies. Production passes a real `window`.
    target: target as unknown as EventTarget,
    bindings: DEFAULT_BINDINGS,
  });
  input.attach();
  return { target, input };
}

test('isActive reflects whether a bound key is currently held', () => {
  const { target, input } = build();
  assert.equal(input.isActive('throttle'), false);

  target.emit('keydown', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), true);

  target.emit('keyup', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), false);
});

test('unbound keys are ignored entirely', () => {
  const { target, input } = build();
  target.emit('keydown', keyEvent('KeyQ'));
  // KeyQ isn't bound to any action.
  const actions: Action[] = ['throttle', 'brake', 'steerLeft', 'steerRight', 'horn', 'cruise'];
  for (const a of actions) assert.equal(input.isActive(a), false);
});

test('multiple keys bound to the same action both work (e.g. arrows + WASD)', () => {
  const { target, input } = build();
  target.emit('keydown', keyEvent('KeyW'));
  assert.equal(input.isActive('throttle'), true);
  target.emit('keyup', keyEvent('KeyW'));
  assert.equal(input.isActive('throttle'), false);

  target.emit('keydown', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), true);
});

test('C exposes cruise as a one-shot action', () => {
  const { target, input } = build();
  target.emit('keydown', keyEvent('KeyC'));

  assert.equal(input.isActive('cruise'), true);
  assert.equal(input.wasPressed('cruise'), true);

  input.beginFrame();
  target.emit('keydown', keyEvent('KeyC', { repeat: true }));
  assert.equal(input.wasPressed('cruise'), false);
});

test('wasPressed latches once per physical press and clears on beginFrame', () => {
  const { target, input } = build();
  assert.equal(input.wasPressed('horn'), false);

  target.emit('keydown', keyEvent('Space'));
  assert.equal(input.wasPressed('horn'), true);

  // Another beginFrame consumes the latch.
  input.beginFrame();
  assert.equal(input.wasPressed('horn'), false);
  // But the key is still held, so isActive remains true.
  assert.equal(input.isActive('horn'), true);
});

test('browser key-repeat does NOT re-fire wasPressed', () => {
  const { target, input } = build();
  target.emit('keydown', keyEvent('Space'));
  input.beginFrame(); // consume the initial press

  // OS fires repeated keydowns while held; the adapter must ignore them.
  target.emit('keydown', keyEvent('Space', { repeat: true }));
  target.emit('keydown', keyEvent('Space', { repeat: true }));
  assert.equal(input.wasPressed('horn'), false);
});

test('fast tap between frames is not missed', () => {
  // Game loop ticks at 60Hz but a key can go down+up faster than a frame.
  // wasPressed must latch true even if the key is no longer held by the
  // time gameplay observes it.
  const { target, input } = build();
  target.emit('keydown', keyEvent('Space'));
  target.emit('keyup', keyEvent('Space'));
  assert.equal(input.isActive('horn'), false);
  assert.equal(input.wasPressed('horn'), true);
  assert.equal(input.wasReleased('horn'), true);
});

test('window blur releases all held actions', () => {
  const { target, input } = build();
  target.emit('keydown', keyEvent('ArrowUp'));
  target.emit('keydown', keyEvent('ArrowLeft'));
  assert.equal(input.isActive('throttle'), true);
  assert.equal(input.isActive('steerLeft'), true);

  target.emit('blur', {});

  assert.equal(input.isActive('throttle'), false);
  assert.equal(input.isActive('steerLeft'), false);
  // Released keys land in wasReleased so gameplay can react (e.g. cut the engine sound).
  assert.equal(input.wasReleased('throttle'), true);
  assert.equal(input.wasReleased('steerLeft'), true);
});

test('detach removes listeners and prevents further state changes', () => {
  const { target, input } = build();
  target.emit('keydown', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), true);

  input.detach();
  // Held state clears on detach — otherwise a stale `true` lingers.
  assert.equal(input.isActive('throttle'), false);

  // After detach, further events have no effect.
  target.emit('keydown', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), false);
});

test('preventDefault is called on bound key events', () => {
  // Arrow keys scroll the page by default. Bound keys must preventDefault
  // to keep the game's keystrokes from also acting as page interaction.
  const { target } = build();
  const ev = keyEvent('ArrowUp');
  target.emit('keydown', ev);
  assert.equal(ev._prevented, true);
});

test('preventDefault is NOT called on unbound key events', () => {
  // Don't be greedy with the keyboard. Unbound keys belong to the page
  // (e.g. devtools shortcuts, F-keys).
  const { target } = build();
  const ev = keyEvent('KeyQ');
  target.emit('keydown', ev);
  assert.equal(ev._prevented, false);
});

/**
 * Virtual source (the on-screen touch pad).
 *
 * `setVirtual` is a second input source feeding the same actions. Gameplay
 * must not be able to tell the two apart, and holding an action on both at
 * once must still read as ONE logical press.
 */

test('setVirtual drives isActive and latches press/release edges', () => {
  const { input } = build();
  assert.equal(input.isActive('throttle'), false);

  input.setVirtual('throttle', true);
  assert.equal(input.isActive('throttle'), true);
  assert.equal(input.wasPressed('throttle'), true);

  input.beginFrame();
  input.setVirtual('throttle', false);
  assert.equal(input.isActive('throttle'), false);
  assert.equal(input.wasReleased('throttle'), true);
});

test('touch cruise produces the same one-shot edge as keyboard cruise', () => {
  const { input } = build();
  input.setVirtual('cruise', true);
  assert.equal(input.wasPressed('cruise'), true);

  input.beginFrame();
  assert.equal(input.wasPressed('cruise'), false, 'a held touch is not a second toggle');

  input.setVirtual('cruise', false);
  input.setVirtual('cruise', true);
  assert.equal(input.wasPressed('cruise'), true, 'a fresh tap toggles again');
});

test('a redundant setVirtual does not re-latch a press', () => {
  const { input } = build();
  input.setVirtual('brake', true);
  input.beginFrame();

  input.setVirtual('brake', true);
  assert.equal(input.wasPressed('brake'), false, 'still one physical press');
  assert.equal(input.isActive('brake'), true);
});

test('keyboard and touch holding the same action is one logical press', () => {
  // Finger on the gas pedal, then also ArrowUp. Gameplay should see a single
  // press — a horn-style one-shot must not fire twice.
  const { target, input } = build();
  input.setVirtual('throttle', true);
  input.beginFrame();

  target.emit('keydown', keyEvent('ArrowUp'));
  assert.equal(input.wasPressed('throttle'), false, 'already active via touch');
  assert.equal(input.isActive('throttle'), true);
});

test('releasing one source while the other still holds does not release the action', () => {
  // Lifting the finger while ArrowUp is still down must NOT cut the throttle.
  const { target, input } = build();
  input.setVirtual('throttle', true);
  target.emit('keydown', keyEvent('ArrowUp'));
  input.beginFrame();

  input.setVirtual('throttle', false);
  assert.equal(input.isActive('throttle'), true, 'keyboard still holds it');
  assert.equal(input.wasReleased('throttle'), false);

  target.emit('keyup', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), false);
  assert.equal(input.wasReleased('throttle'), true, 'last source releasing is the up-edge');
});

test('a key release does not cancel a virtual hold', () => {
  // Symmetric to the above: the finger is still on the pedal.
  const { target, input } = build();
  target.emit('keydown', keyEvent('ArrowUp'));
  input.setVirtual('throttle', true);
  input.beginFrame();

  target.emit('keyup', keyEvent('ArrowUp'));
  assert.equal(input.isActive('throttle'), true);
  assert.equal(input.wasReleased('throttle'), false);
});

test('clearVirtual drops all virtual holds and emits their releases', () => {
  const { input } = build();
  input.setVirtual('throttle', true);
  input.setVirtual('steerLeft', true);
  input.beginFrame();

  input.clearVirtual();
  assert.equal(input.isActive('throttle'), false);
  assert.equal(input.isActive('steerLeft'), false);
  assert.equal(input.wasReleased('throttle'), true);
  assert.equal(input.wasReleased('steerLeft'), true);

  input.beginFrame();
  input.clearVirtual();
  assert.equal(input.wasReleased('throttle'), false, 'clearVirtual is idempotent');
});

test('blur releases virtual holds too', () => {
  // The touch pad clears itself on blur as well, but a pointer event can go
  // missing. Backgrounding the tab must never leave the throttle stuck on.
  const { target, input } = build();
  input.setVirtual('throttle', true);
  target.emit('keydown', keyEvent('ArrowLeft'));

  target.emit('blur', {});

  assert.equal(input.isActive('throttle'), false);
  assert.equal(input.isActive('steerLeft'), false);
  assert.equal(input.wasReleased('throttle'), true);
  assert.equal(input.wasReleased('steerLeft'), true);
});

test('blur reports one release for an action held by both sources', () => {
  const { target, input } = build();
  input.setVirtual('throttle', true);
  target.emit('keydown', keyEvent('ArrowUp'));

  target.emit('blur', {});
  assert.equal(input.wasReleased('throttle'), true);
  assert.equal(input.isActive('throttle'), false);
});

test('detach clears virtual holds', () => {
  const { input } = build();
  input.setVirtual('brake', true);
  input.detach();
  assert.equal(input.isActive('brake'), false);
});
