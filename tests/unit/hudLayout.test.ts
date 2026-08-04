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

test('speedometer motion is optional and keeps the authoritative final angle', () => {
  const needle = rule('.roll-on-speedometer-needle');
  assert.match(needle, /transform:\s*rotate\(var\(--roll-on-speed-angle, -135deg\)\)/);

  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.roll-on-speedometer-needle\s*\{[^}]*transition:\s*none/
  );
});

test('fuel fumes and cargo damage retain explicit non-color gauge treatments', () => {
  const fumesState = rule(".roll-on-hud-fuel[data-state='fumes'] .roll-on-hud-gauge-state");
  assert.match(fumesState, /color:\s*#ff8273/);
  assert.match(fumesState, /animation:\s*roll-on-hud-warning-pulse/);

  const damagedCargo = rule(".roll-on-hud-cargo[data-state='damaged'] .roll-on-hud-gauge-state");
  assert.match(damagedCargo, /color:\s*#e58d3c/);

  const criticalCargo = rule(".roll-on-hud-cargo[data-state='critical'] .roll-on-hud-gauge-state");
  assert.match(criticalCargo, /color:\s*#ff8273/);

  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.roll-on-hud-fuel\[data-state='fumes'\] \.roll-on-hud-gauge-state\s*\{[^}]*animation:\s*none/
  );
  assert.match(
    css,
    /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.roll-on-hud-progress\s*\{[^}]*forced-color-adjust:\s*auto/
  );
});

test('cabinet detail is a CSS-only decorative layer that forced colors can suppress', () => {
  const cabinet = rule('.roll-on-hud');
  assert.match(cabinet, /isolation:\s*isolate/);

  const scanlines = rule('.roll-on-hud::before');
  assert.match(scanlines, /pointer-events:\s*none/);
  assert.match(scanlines, /repeating-linear-gradient/);

  const hardware = rule('.roll-on-hud::after');
  assert.match(hardware, /pointer-events:\s*none/);
  assert.match(hardware, /radial-gradient/);

  const well = rule('.roll-on-hud-instrument');
  assert.match(well, /box-shadow:\s*inset/);

  assert.match(
    css,
    /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.roll-on-hud::before,[\s\S]*?\.roll-on-hud::after\s*\{[^}]*display:\s*none/
  );
});
