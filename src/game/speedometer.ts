import { DIAL_MAX_ANGLE_DEGREES, DIAL_MIN_ANGLE_DEGREES } from '/src/game/gameHud.js';

export type SpeedometerBandName = 'cruise' | 'caution' | 'high' | 'limit';

export interface SpeedometerBand {
  readonly name: SpeedometerBandName;
  readonly minimumLevel: number;
  readonly maximumLevel: number;
  readonly startAngleDegrees: number;
  readonly endAngleDegrees: number;
  readonly path: string;
}

export const SPEEDOMETER_VIEW_BOX = '0 0 104 68';

const CENTER_X = 52;
const CENTER_Y = 42;
const ARC_RADIUS = 35;
const TICK_OUTER_RADIUS = 40;
const TICK_INNER_RADIUS = 36;
const BAND_GAP_DEGREES = 2;

const BAND_LEVELS: readonly Readonly<{
  name: SpeedometerBandName;
  minimumLevel: number;
  maximumLevel: number;
}>[] = [
  { name: 'cruise', minimumLevel: 0, maximumLevel: 0.55 },
  { name: 'caution', minimumLevel: 0.55, maximumLevel: 0.75 },
  { name: 'high', minimumLevel: 0.75, maximumLevel: 0.9 },
  { name: 'limit', minimumLevel: 0.9, maximumLevel: 1 },
];

export const SPEEDOMETER_BANDS: readonly SpeedometerBand[] = BAND_LEVELS.map(
  ({ name, minimumLevel, maximumLevel }, index) => {
    const startAngleDegrees = mapSpeedLevelToDialAngleDegrees(minimumLevel);
    const endAngleDegrees = mapSpeedLevelToDialAngleDegrees(maximumLevel);
    const visibleStartAngle = startAngleDegrees + (index === 0 ? 0 : BAND_GAP_DEGREES / 2);
    const visibleEndAngle =
      endAngleDegrees - (index === BAND_LEVELS.length - 1 ? 0 : BAND_GAP_DEGREES / 2);
    return {
      name,
      minimumLevel,
      maximumLevel,
      startAngleDegrees,
      endAngleDegrees,
      path: describeArc(visibleStartAngle, visibleEndAngle, ARC_RADIUS),
    };
  }
);

/** Convert a validated normalized speed level to the dashboard's fixed dial arc. */
export function mapSpeedLevelToDialAngleDegrees(speedLevel: number): number {
  assertNormalizedLevel('speedLevel', speedLevel);
  return DIAL_MIN_ANGLE_DEGREES + speedLevel * (DIAL_MAX_ANGLE_DEGREES - DIAL_MIN_ANGLE_DEGREES);
}

/** Static SVG body; live speed and cruise values are applied as bounded CSS rotations. */
export function buildSpeedometerSvgBody(): string {
  const bands = SPEEDOMETER_BANDS.map(
    band =>
      `<path class="roll-on-speedometer-band roll-on-speedometer-band-${band.name}" data-band="${band.name}" d="${band.path}" />`
  ).join('');
  const ticks = Array.from({ length: 11 }, (_, index) => {
    const level = index / 10;
    const angle = mapSpeedLevelToDialAngleDegrees(level);
    const inner = pointOnDial(angle, TICK_INNER_RADIUS);
    const outer = pointOnDial(angle, TICK_OUTER_RADIUS);
    return `<line class="roll-on-speedometer-tick" data-tick="${level.toFixed(1)}" x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" />`;
  }).join('');

  return [
    `<g class="roll-on-speedometer-bands">${bands}</g>`,
    `<g class="roll-on-speedometer-ticks">${ticks}</g>`,
    '<g class="roll-on-speedometer-cruise-marker" data-part="cruise-marker"><path d="M 52 0 L 48.5 6 L 55.5 6 Z" /></g>',
    '<g class="roll-on-speedometer-needle" data-part="needle"><line x1="52" y1="46" x2="52" y2="12" /><circle cx="52" cy="42" r="3" /></g>',
  ].join('');
}

function describeArc(startAngleDegrees: number, endAngleDegrees: number, radius: number): string {
  const start = pointOnDial(startAngleDegrees, radius);
  const end = pointOnDial(endAngleDegrees, radius);
  const largeArcFlag = endAngleDegrees - startAngleDegrees > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function pointOnDial(angleDegrees: number, radius: number): Readonly<{ x: number; y: number }> {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: roundCoordinate(CENTER_X + Math.sin(radians) * radius),
    y: roundCoordinate(CENTER_Y - Math.cos(radians) * radius),
  };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function assertNormalizedLevel(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite, got ${value}`);
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be in [0, 1], got ${value}`);
  }
}
