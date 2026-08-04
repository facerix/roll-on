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
  assert.match(hud, /align-content:\s*end/);
});
