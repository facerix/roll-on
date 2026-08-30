import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const stylesheet = readFileSync(new URL('../../main.css', import.meta.url), 'utf8');

test('sidecar arcade button colors are customizable with action-specific defaults', () => {
  assert.match(
    stylesheet,
    /--arcade-button-base-color:\s*var\(--arcade-button-color,\s*hsl\(10 90% 40%\)\)/
  );
  assert.match(stylesheet, /\[data-action='steer'\][^}]+--arcade-button-color:/);
  assert.match(
    stylesheet,
    /\[data-action='throttle'\][^}]+\[data-action='brake'\][^}]+--arcade-button-color:/
  );
  assert.match(stylesheet, /\[data-action='cruise'\][^}]+--arcade-button-color:/);
  assert.match(stylesheet, /\[data-action='pause'\][^}]+--arcade-button-color:/);
});

test('sidecar cards keep their natural height around the stage vertical center', () => {
  assert.match(stylesheet, /--sidecar-display-center-y:\s*0px/);
  assert.doesNotMatch(stylesheet, /--sidecar-display-(?:top|height):/);
  assert.match(
    stylesheet,
    /\.roll-on-sidecar\s*{[^}]+top:\s*var\(--sidecar-display-center-y\)[^}]+height:\s*fit-content[^}]+translate:\s*0 -50%/
  );
});
