import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SPEED_TIERS,
  getSpeedTier,
  getSpeedTierMinimumLevel,
  isAtOrAboveSpeedTier,
  resolveSpeedTierName,
  resolveSpeedTierThresholdMetersPerSecond,
  validateSpeedTiers,
  type SpeedTier,
} from '../../src/game/speedTiers.ts';

test('shared speed tiers cover the full normalized range without gaps or overlaps', () => {
  assert.deepEqual(
    SPEED_TIERS.map(tier => ({ ...tier })),
    [
      { name: 'cruise', minimumLevel: 0, maximumLevel: 0.55 },
      { name: 'caution', minimumLevel: 0.55, maximumLevel: 0.75 },
      { name: 'high', minimumLevel: 0.75, maximumLevel: 0.9 },
      { name: 'limit', minimumLevel: 0.9, maximumLevel: 1 },
    ]
  );
  assert.equal(SPEED_TIERS[0]!.minimumLevel, 0);
  assert.equal(SPEED_TIERS.at(-1)!.maximumLevel, 1);
  assert.ok(Object.isFrozen(SPEED_TIERS));
  assert.ok(SPEED_TIERS.every(tier => Object.isFrozen(tier)));
});

test('a named tier is looked up by name and unknown names fail explicitly', () => {
  assert.deepEqual(getSpeedTier('high'), { name: 'high', minimumLevel: 0.75, maximumLevel: 0.9 });
  assert.equal(getSpeedTierMinimumLevel('high'), 0.75);
  assert.equal(getSpeedTierMinimumLevel('cruise'), 0);
  assert.throws(
    () => getSpeedTier('pursuit' as unknown as SpeedTier['name']),
    /Unknown speed tier: pursuit/
  );
  assert.throws(
    () => getSpeedTierMinimumLevel('' as unknown as SpeedTier['name']),
    /Unknown speed tier/
  );
});

test('a normalized level resolves to one tier, with each boundary owned by the faster tier', () => {
  assert.equal(resolveSpeedTierName(0), 'cruise');
  assert.equal(resolveSpeedTierName(0.549_9), 'cruise');
  assert.equal(resolveSpeedTierName(0.55), 'caution');
  assert.equal(resolveSpeedTierName(0.75), 'high');
  assert.equal(resolveSpeedTierName(0.899_9), 'high');
  assert.equal(resolveSpeedTierName(0.9), 'limit');
  assert.equal(resolveSpeedTierName(1), 'limit');
  assert.throws(() => resolveSpeedTierName(-0.001), /speedLevel/);
  assert.throws(() => resolveSpeedTierName(1.001), /speedLevel/);
  assert.throws(() => resolveSpeedTierName(Number.NaN), /speedLevel/);
});

test('tier thresholds convert to absolute speed against a validated maximum', () => {
  assert.equal(resolveSpeedTierThresholdMetersPerSecond('high', 40), 30);
  assert.equal(resolveSpeedTierThresholdMetersPerSecond('caution', 40), 22);
  assert.equal(resolveSpeedTierThresholdMetersPerSecond('cruise', 40), 0);
  assert.throws(
    () => resolveSpeedTierThresholdMetersPerSecond('high', 0),
    /maximumSpeedMetersPerSecond/
  );
  assert.throws(
    () => resolveSpeedTierThresholdMetersPerSecond('high', Number.POSITIVE_INFINITY),
    /maximumSpeedMetersPerSecond/
  );
});

test('reaching a tier boundary exactly counts as being at that tier', () => {
  assert.equal(isAtOrAboveSpeedTier(29.999, 'high', 40), false);
  assert.equal(isAtOrAboveSpeedTier(30, 'high', 40), true);
  assert.equal(isAtOrAboveSpeedTier(40, 'high', 40), true);
  assert.equal(isAtOrAboveSpeedTier(0, 'cruise', 40), true);
  assert.throws(() => isAtOrAboveSpeedTier(Number.NaN, 'high', 40), /speedMetersPerSecond/);
  assert.throws(() => isAtOrAboveSpeedTier(-1, 'high', 40), /speedMetersPerSecond/);
});

test('drifting or malformed tier definitions fail loudly instead of being repaired', () => {
  const valid: readonly SpeedTier[] = [
    { name: 'cruise', minimumLevel: 0, maximumLevel: 0.5 },
    { name: 'high', minimumLevel: 0.5, maximumLevel: 1 },
  ];
  assert.deepEqual(
    validateSpeedTiers(valid).map(tier => ({ ...tier })),
    valid.map(tier => ({ ...tier }))
  );

  assert.throws(() => validateSpeedTiers([]), /at least one tier/);
  assert.throws(
    () =>
      validateSpeedTiers([
        { name: 'cruise', minimumLevel: 0.1, maximumLevel: 1 },
      ] as readonly SpeedTier[]),
    /must start at 0/
  );
  assert.throws(
    () =>
      validateSpeedTiers([
        { name: 'cruise', minimumLevel: 0, maximumLevel: 0.9 },
      ] as readonly SpeedTier[]),
    /must end at 1/
  );
  assert.throws(
    () =>
      validateSpeedTiers([
        { name: 'cruise', minimumLevel: 0, maximumLevel: 0.5 },
        { name: 'high', minimumLevel: 0.6, maximumLevel: 1 },
      ] as readonly SpeedTier[]),
    /must start where tier cruise ends/
  );
  assert.throws(
    () =>
      validateSpeedTiers([
        { name: 'cruise', minimumLevel: 0, maximumLevel: 0.5 },
        { name: 'cruise', minimumLevel: 0.5, maximumLevel: 1 },
      ] as readonly SpeedTier[]),
    /duplicate speed tier: cruise/
  );
  assert.throws(
    () =>
      validateSpeedTiers([
        { name: 'cruise', minimumLevel: 0, maximumLevel: 0 },
        { name: 'high', minimumLevel: 0, maximumLevel: 1 },
      ] as readonly SpeedTier[]),
    /maximumLevel/
  );
  assert.throws(
    () =>
      validateSpeedTiers([
        { name: 'cruise', minimumLevel: 0, maximumLevel: Number.NaN },
        { name: 'high', minimumLevel: 0.5, maximumLevel: 1 },
      ] as readonly SpeedTier[]),
    /must be finite/
  );
});
