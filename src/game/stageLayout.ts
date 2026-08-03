/**
 * Fixed logical dimensions of the authored M6 stage. These are stage pixels,
 * never browser CSS pixels or world meters.
 */
export const STAGE_WIDTH_PIXELS = 384;
export const STAGE_HEIGHT_PIXELS = 576;

export interface StageViewport {
  readonly width: number;
  readonly height: number;
}

export interface SafeAreaInsets {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

export interface CalculateStageLayoutOptions {
  readonly viewport: StageViewport;
  readonly safeAreaInsets?: SafeAreaInsets;
}

/** The CSS-pixel rectangle used to present the fixed logical stage. */
export interface StageLayout {
  readonly stageWidthPixels: typeof STAGE_WIDTH_PIXELS;
  readonly stageHeightPixels: typeof STAGE_HEIGHT_PIXELS;
  readonly scale: number;
  readonly displayX: number;
  readonly displayY: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

/**
 * Fit the fixed stage into a viewport's usable rectangle without cropping or
 * stretching. This is presentation policy only: no world or simulation value
 * may be derived from its result.
 */
export function calculateStageLayout(options: CalculateStageLayoutOptions): StageLayout {
  validatePositiveFinite('viewport.width', options.viewport.width);
  validatePositiveFinite('viewport.height', options.viewport.height);

  const insets = {
    top: options.safeAreaInsets?.top ?? 0,
    right: options.safeAreaInsets?.right ?? 0,
    bottom: options.safeAreaInsets?.bottom ?? 0,
    left: options.safeAreaInsets?.left ?? 0,
  };
  for (const [name, value] of Object.entries(insets))
    validateNonNegativeFinite(`safeAreaInsets.${name}`, value);

  const availableWidth = options.viewport.width - insets.left - insets.right;
  const availableHeight = options.viewport.height - insets.top - insets.bottom;
  validatePositiveFinite('usable viewport width', availableWidth);
  validatePositiveFinite('usable viewport height', availableHeight);

  const scale = Math.min(
    availableWidth / STAGE_WIDTH_PIXELS,
    availableHeight / STAGE_HEIGHT_PIXELS
  );
  validatePositiveFinite('stage display scale', scale);
  const displayWidth = STAGE_WIDTH_PIXELS * scale;
  const displayHeight = STAGE_HEIGHT_PIXELS * scale;

  return {
    stageWidthPixels: STAGE_WIDTH_PIXELS,
    stageHeightPixels: STAGE_HEIGHT_PIXELS,
    scale,
    displayX: insets.left + (availableWidth - displayWidth) / 2,
    displayY: insets.top + (availableHeight - displayHeight) / 2,
    displayWidth,
    displayHeight,
  };
}

function validatePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite, got ${value}`);
  if (value <= 0) throw new RangeError(`${name} must be positive, got ${value}`);
}

function validateNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite, got ${value}`);
  if (value < 0) throw new RangeError(`${name} must be non-negative, got ${value}`);
}
