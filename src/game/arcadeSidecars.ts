import { h } from '/src/domUtils.js';
import type { SafeAreaInsets, StageLayout, StageViewport } from '/src/game/stageLayout.js';

const MINIMUM_RAIL_WIDTH_PIXELS = 240;
const MINIMUM_STAGE_DISPLAY_HEIGHT_PIXELS = 480;
const CARD_EDGE_GUTTER_PIXELS = 16;
const MAXIMUM_CARD_WIDTH_PIXELS = 288;

export type ArcadeSidecarAction = 'steer' | 'throttle' | 'brake' | 'horn' | 'cruise' | 'pause';

export interface ArcadeSidecarControl {
  readonly action: ArcadeSidecarAction;
  readonly label: string;
  readonly keys: readonly string[];
  readonly instruction: string;
  readonly notes: readonly string[];
  /** The equivalent control that remains available when desktop sidecars are absent. */
  readonly touchEquivalent: string;
}

export interface ArcadeSidecarContent {
  readonly controls: readonly ArcadeSidecarControl[];
  readonly objectives: readonly string[];
  readonly consequences: readonly string[];
}

/**
 * Static copy deliberately duplicates stage controls and HUD/run rules. It
 * contains no live instrument or simulation state that could advantage a
 * desktop player over a touch player.
 */
export const ARCADE_SIDECAR_CONTENT: ArcadeSidecarContent = Object.freeze({
  controls: Object.freeze([
    Object.freeze({
      action: 'steer',
      label: 'STEER',
      keys: Object.freeze(['◀︎', '▶︎', 'A', 'D']),
      instruction: 'HOLD TO TURN',
      notes: Object.freeze([]),
      touchEquivalent: 'Left and right steering buttons',
    }),
    Object.freeze({
      action: 'throttle',
      label: 'GAS',
      keys: Object.freeze(['▲︎', 'W']),
      instruction: 'HOLD FOR THROTTLE',
      notes: Object.freeze(['RELEASE TO COAST']),
      touchEquivalent: 'Gas button',
    }),
    Object.freeze({
      action: 'brake',
      label: 'BRAKE',
      keys: Object.freeze(['▼︎', 'S']),
      instruction: 'HOLD FOR SERVICE BRAKE',
      notes: Object.freeze(['BRAKE CANCELS CRUISE']),
      touchEquivalent: 'Brake button',
    }),
    Object.freeze({
      action: 'horn',
      label: 'HORN',
      keys: Object.freeze(['SPACE']),
      instruction: 'CLEAR THE CAR AHEAD',
      notes: Object.freeze(['3 SECOND RECHARGE']),
      touchEquivalent: 'Horn button',
    }),
    Object.freeze({
      action: 'cruise',
      label: 'CRUISE',
      keys: Object.freeze(['C']),
      instruction: 'TOGGLE AT CURRENT SPEED',
      notes: Object.freeze(['GAS OVERRIDES', 'BRAKE CANCELS']),
      touchEquivalent: 'Cruise button',
    }),
    Object.freeze({
      action: 'pause',
      label: 'PAUSE',
      keys: Object.freeze(['ESC']),
      instruction: 'OPEN PAUSE MENU',
      notes: Object.freeze([]),
      touchEquivalent: 'Pause button',
    }),
  ]),
  objectives: Object.freeze(['REACH THE ROUTE END', 'PROTECT YOUR CARGO', 'WATCH YOUR FUEL']),
  consequences: Object.freeze(['CRASH OR EMPTY TANK ENDS THE RUN', 'ROAD RAGE COSTS SCORE']),
});

export interface CalculateArcadeSidecarLayoutOptions {
  readonly viewport: StageViewport;
  readonly safeAreaInsets?: SafeAreaInsets;
  readonly stage: StageLayout;
  readonly hasFinePointer: boolean;
}

export interface ArcadeSidecarLayout {
  readonly visible: boolean;
  readonly cardWidth: number;
  readonly displayCenterY: number;
  readonly leftX: number;
  readonly rightX: number;
}

/**
 * Place independent CSS-pixel cards in the rails around an already-fitted
 * stage. The function observes stage geometry but cannot influence its scale,
 * position, or any simulation value.
 */
export function calculateArcadeSidecarLayout(
  options: CalculateArcadeSidecarLayoutOptions
): ArcadeSidecarLayout {
  validatePositiveFinite('viewport.width', options.viewport.width);
  validatePositiveFinite('viewport.height', options.viewport.height);
  if (typeof options.hasFinePointer !== 'boolean') {
    throw new TypeError(`hasFinePointer must be boolean, got ${String(options.hasFinePointer)}`);
  }

  const insets = {
    top: options.safeAreaInsets?.top ?? 0,
    right: options.safeAreaInsets?.right ?? 0,
    bottom: options.safeAreaInsets?.bottom ?? 0,
    left: options.safeAreaInsets?.left ?? 0,
  };
  for (const [name, value] of Object.entries(insets)) {
    validateNonNegativeFinite(`safeAreaInsets.${name}`, value);
  }

  const { stage } = options;
  validateFinite('stage.displayX', stage.displayX);
  validateFinite('stage.displayY', stage.displayY);
  validatePositiveFinite('stage.displayWidth', stage.displayWidth);
  validatePositiveFinite('stage.displayHeight', stage.displayHeight);

  const usableRight = options.viewport.width - insets.right;
  const usableBottom = options.viewport.height - insets.bottom;
  const stageRight = stage.displayX + stage.displayWidth;
  const stageBottom = stage.displayY + stage.displayHeight;
  if (
    stage.displayX < insets.left ||
    stage.displayY < insets.top ||
    stageRight > usableRight ||
    stageBottom > usableBottom
  ) {
    throw new RangeError('stage display rectangle must fit inside the safe viewport');
  }

  const leftRailWidth = stage.displayX - insets.left;
  const rightRailWidth = usableRight - stageRight;
  const limitingRailWidth = Math.min(leftRailWidth, rightRailWidth);
  const visible =
    options.hasFinePointer &&
    limitingRailWidth >= MINIMUM_RAIL_WIDTH_PIXELS &&
    stage.displayHeight >= MINIMUM_STAGE_DISPLAY_HEIGHT_PIXELS;
  const cardWidth = Math.max(
    0,
    Math.min(MAXIMUM_CARD_WIDTH_PIXELS, limitingRailWidth - CARD_EDGE_GUTTER_PIXELS * 2)
  );
  return {
    visible,
    cardWidth,
    displayCenterY: stage.displayY + stage.displayHeight / 2,
    leftX: insets.left + (leftRailWidth - cardWidth) / 2,
    rightX: stageRight + (rightRailWidth - cardWidth) / 2,
  };
}

export interface ArcadeSidecars {
  readonly root: HTMLDivElement;
}

/** Create the semantic desktop chrome. Visibility and placement belong to mount. */
export function createArcadeSidecars(stageNumber: number): ArcadeSidecars {
  if (!Number.isSafeInteger(stageNumber) || stageNumber <= 0) {
    throw new RangeError(`stageNumber must be a positive integer, got ${stageNumber}`);
  }

  const driverCard = h(
    'aside',
    {
      className: 'roll-on-sidecar roll-on-sidecar-driver',
      ariaLabel: 'Driving instructions',
    },
    [
      cardHeader('CONTROLS'),
      h(
        'dl',
        { className: 'roll-on-sidecar-controls' },
        ARCADE_SIDECAR_CONTENT.controls.map(control =>
          h('div', { className: 'roll-on-sidecar-control', dataset: { action: control.action } }, [
            h('dt', { textContent: control.label }),
            h('dd', {}, [
              h(
                'span',
                { className: 'roll-on-sidecar-keyset', ariaLabel: `${control.label} keys` },
                control.keys.map(key => h('kbd', { className: 'arcade-button', textContent: key }))
              ),
              h('span', {
                className: 'roll-on-sidecar-instruction',
                textContent: control.instruction,
              }),
              ...control.notes.map(note =>
                h('span', { className: 'roll-on-sidecar-note', textContent: note })
              ),
            ]),
          ])
        )
      ),
    ]
  );

  const objectiveItems = ARCADE_SIDECAR_CONTENT.objectives.map(objective =>
    h('li', { textContent: objective })
  );
  const consequenceItems = ARCADE_SIDECAR_CONTENT.consequences.map(consequence =>
    h('li', { textContent: consequence })
  );
  const dispatchCard = h(
    'aside',
    {
      className: 'roll-on-sidecar roll-on-sidecar-dispatch',
      ariaLabel: `Stage ${stageNumber} dispatch`,
    },
    [
      cardHeader('DISPATCH'),
      h('p', { className: 'roll-on-sidecar-stage', textContent: `STAGE ${stageNumber}` }),
      h('p', { className: 'roll-on-sidecar-callout', textContent: 'DELIVER THE LOAD' }),
      h('ul', { className: 'roll-on-sidecar-objectives' }, objectiveItems),
      h('div', { className: 'roll-on-sidecar-cargo', ariaHidden: 'true' }, [
        h('img', { src: '/images/hud/cargo-crate.png', alt: '' }),
        h('span', { textContent: 'HANDLE WITH CARE' }),
      ]),
      h('h3', { textContent: 'RUN ENDS' }),
      h('ul', { className: 'roll-on-sidecar-consequences' }, consequenceItems),
    ]
  );

  return {
    root: h('div', { className: 'roll-on-arcade-sidecars', hidden: true }, [
      driverCard,
      dispatchCard,
    ]),
  };
}

function cardHeader(title: string): HTMLElement {
  return h('header', { className: 'roll-on-sidecar-header' }, [h('h2', { textContent: title })]);
}

function validateFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite, got ${value}`);
}

function validatePositiveFinite(name: string, value: number): void {
  validateFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be positive, got ${value}`);
}

function validateNonNegativeFinite(name: string, value: number): void {
  validateFinite(name, value);
  if (value < 0) throw new RangeError(`${name} must be non-negative, got ${value}`);
}
