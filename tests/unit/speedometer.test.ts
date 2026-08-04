import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SPEEDOMETER_BANDS,
  buildSpeedometerSvgBody,
  mapSpeedLevelToDialAngleDegrees,
} from '../../src/game/speedometer.ts';
import { DIAL_MAX_ANGLE_DEGREES, DIAL_MIN_ANGLE_DEGREES } from '../../src/game/gameHud.ts';

test('speedometer bands deterministically cover the full authored speed range', () => {
  assert.deepEqual(
    SPEEDOMETER_BANDS.map(({ name, minimumLevel, maximumLevel }) => ({
      name,
      minimumLevel,
      maximumLevel,
    })),
    [
      { name: 'cruise', minimumLevel: 0, maximumLevel: 0.55 },
      { name: 'caution', minimumLevel: 0.55, maximumLevel: 0.75 },
      { name: 'high', minimumLevel: 0.75, maximumLevel: 0.9 },
      { name: 'limit', minimumLevel: 0.9, maximumLevel: 1 },
    ]
  );
  assert.equal(SPEEDOMETER_BANDS[0]!.startAngleDegrees, DIAL_MIN_ANGLE_DEGREES);
  assert.equal(SPEEDOMETER_BANDS.at(-1)!.endAngleDegrees, DIAL_MAX_ANGLE_DEGREES);
  assert.ok(SPEEDOMETER_BANDS.every(band => band.path.startsWith('M ')));
});

test('normalized speed and cruise levels map only onto the authored dial arc', () => {
  assert.equal(mapSpeedLevelToDialAngleDegrees(0), DIAL_MIN_ANGLE_DEGREES);
  assert.equal(mapSpeedLevelToDialAngleDegrees(0.5), 0);
  assert.equal(mapSpeedLevelToDialAngleDegrees(1), DIAL_MAX_ANGLE_DEGREES);
  assert.throws(() => mapSpeedLevelToDialAngleDegrees(-0.001), /speedLevel/);
  assert.throws(() => mapSpeedLevelToDialAngleDegrees(1.001), /speedLevel/);
  assert.throws(() => mapSpeedLevelToDialAngleDegrees(Number.NaN), /speedLevel/);
});

test('speedometer SVG geometry is stable and includes one visual for each authored band', () => {
  const first = buildSpeedometerSvgBody();
  const second = buildSpeedometerSvgBody();

  assert.equal(first, second);
  for (const band of SPEEDOMETER_BANDS) {
    assert.match(first, new RegExp(`data-band="${band.name}"`));
  }
  assert.equal(first.match(/data-tick=/g)?.length, 11);
  assert.equal(first.match(/data-part="needle"/g)?.length, 1);
  assert.equal(first.match(/data-part="cruise-marker"/g)?.length, 1);
});
