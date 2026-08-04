import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HUD_HEIGHT_PIXELS,
  ROAD_VIEWPORT_HEIGHT_PIXELS,
  STAGE_HEIGHT_PIXELS,
} from '../../src/game/stageLayout.ts';

const css = readFileSync(new URL('../../main.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const escapedSelector = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(match, `missing ${selector} rule`);
  return match[1]!;
}

test('the road ends where the bottom HUD bay begins', () => {
  assert.equal(ROAD_VIEWPORT_HEIGHT_PIXELS + HUD_HEIGHT_PIXELS, STAGE_HEIGHT_PIXELS);

  const hud = rule('.roll-on-hud');
  assert.match(hud, /inset:\s*auto 0 0/);
  assert.match(hud, /height:\s*var\(--roll-on-hud-height\)/);
  assert.match(hud, /grid-template-rows:\s*98px 20px/);
  assert.match(hud, /overflow:\s*hidden/);
});

test('the five instrument wells reconcile exactly inside the native HUD width', () => {
  const instruments = rule('.roll-on-hud-instruments');
  assert.match(instruments, /grid-template-columns:\s*108px 36px 62px 80px 78px/);
  assert.match(instruments, /gap:\s*2px/);

  const hud = rule('.roll-on-hud');
  assert.match(hud, /padding:\s*3px 6px/);

  const columns = [108, 36, 62, 80, 78];
  const totalWidth = columns.reduce((sum, width) => sum + width, 0) + 4 * 2 + 2 * 6;
  assert.equal(totalWidth, 384);
});

test('status and transient events stay in the dedicated bottom strip', () => {
  const messages = rule('.roll-on-hud-messages');
  assert.match(messages, /grid-row:\s*2/);
  assert.match(messages, /height:\s*20px/);

  const event = rule('.roll-on-hud-event');
  assert.doesNotMatch(event, /bottom:\s*112px/);
});
