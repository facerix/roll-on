/**
 * Touch action tracker tests.
 *
 * This is the logic half of the on-screen touch pad. It maps pointer ids to
 * abstract actions and reports the *edges* — the caller emits one
 * `action-down` per non-null `{ held: true }` and one `action-up` per
 * `{ held: false }`.
 *
 * The interesting cases are all multi-touch or lost-pointer cases:
 *   - two fingers on one button (refcounting, not a boolean)
 *   - several buttons held at once, released in any order
 *   - the same pointer released twice (pointerup + lostpointercapture both
 *     fire; the second must be a no-op, not a second release)
 *   - a pointer that never gets its `pointerup` (blur / tab hide), which is
 *     what `releaseAll` exists to clean up
 *
 * A stuck throttle is the failure mode we're guarding against throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TouchActionTracker } from '../../src/engine/touchActions.ts';

test('a press returns a down-edge and marks the action held', () => {
  const tracker = new TouchActionTracker();
  assert.equal(tracker.isHeld('throttle'), false);

  assert.deepEqual(tracker.press(1, 'throttle'), { action: 'throttle', held: true });
  assert.equal(tracker.isHeld('throttle'), true);
  assert.equal(tracker.activePointerCount, 1);
});

test('releasing the pressing pointer returns an up-edge', () => {
  const tracker = new TouchActionTracker();
  tracker.press(1, 'throttle');

  assert.deepEqual(tracker.release(1), { action: 'throttle', held: false });
  assert.equal(tracker.isHeld('throttle'), false);
  assert.equal(tracker.activePointerCount, 0);
});

test('two pointers on the same action: only the first press and last release are edges', () => {
  // Both thumbs land on the gas pedal. Lifting one must not cut the throttle.
  const tracker = new TouchActionTracker();
  assert.deepEqual(tracker.press(1, 'throttle'), { action: 'throttle', held: true });
  assert.equal(tracker.press(2, 'throttle'), null, 'second press is not a new down-edge');

  assert.equal(tracker.release(1), null, 'still held by pointer 2');
  assert.equal(tracker.isHeld('throttle'), true);

  assert.deepEqual(tracker.release(2), { action: 'throttle', held: false });
  assert.equal(tracker.isHeld('throttle'), false);
});

test('separate actions are tracked independently and release in any order', () => {
  // Steering with one thumb while holding gas with the other is the normal
  // way to play; the two must not interfere.
  const tracker = new TouchActionTracker();
  tracker.press(1, 'throttle');
  tracker.press(2, 'steerLeft');
  assert.equal(tracker.activePointerCount, 2);

  assert.deepEqual(tracker.release(2), { action: 'steerLeft', held: false });
  assert.equal(tracker.isHeld('throttle'), true, 'releasing steer must not drop throttle');

  assert.deepEqual(tracker.release(1), { action: 'throttle', held: false });
});

test('a repeated press for the same pointer id is ignored', () => {
  // A second pointerdown for a live id means we missed an up. Counting it
  // would leave the action held after the real release arrives.
  const tracker = new TouchActionTracker();
  tracker.press(7, 'brake');
  assert.equal(tracker.press(7, 'brake'), null);
  assert.equal(tracker.activePointerCount, 1);

  assert.deepEqual(tracker.release(7), { action: 'brake', held: false });
  assert.equal(tracker.isHeld('brake'), false, 'one release must fully clear one press');
});

test('releasing an unknown pointer is a no-op', () => {
  // pointerup and lostpointercapture both fire for the same pointer. The
  // second call must not manufacture a phantom release.
  const tracker = new TouchActionTracker();
  assert.equal(tracker.release(42), null);

  tracker.press(1, 'horn');
  tracker.release(1);
  assert.equal(tracker.release(1), null, 'double release yields one up-edge, not two');
});

test('releaseAll returns one up-edge per held action and clears everything', () => {
  const tracker = new TouchActionTracker();
  tracker.press(1, 'throttle');
  tracker.press(2, 'steerRight');
  tracker.press(3, 'throttle'); // second finger on gas — still one action

  const changes = tracker.releaseAll();
  assert.equal(changes.length, 2, 'one edge per action, not per pointer');
  assert.deepEqual(
    changes.map(c => c.action).sort(),
    ['steerRight', 'throttle'],
    'every held action is released'
  );
  assert.ok(
    changes.every(c => c.held === false),
    'releaseAll only produces up-edges'
  );
  assert.equal(tracker.activePointerCount, 0);
  assert.equal(tracker.isHeld('throttle'), false);
});

test('releaseAll is idempotent and leaves the tracker reusable', () => {
  const tracker = new TouchActionTracker();
  tracker.press(1, 'brake');
  tracker.releaseAll();
  assert.deepEqual(tracker.releaseAll(), [], 'nothing held, nothing to release');

  // Stale pointers from before the reset must not resurrect anything.
  assert.equal(tracker.release(1), null);

  assert.deepEqual(tracker.press(1, 'brake'), { action: 'brake', held: true });
});
