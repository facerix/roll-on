import {
  ROAD_VIEWPORT_HEIGHT_PIXELS,
  type SafeAreaInsets,
  type StageLayout,
  type StageViewport,
} from '/src/game/stageLayout.js';

export interface CalculateTouchPadLayoutOptions {
  readonly viewport: StageViewport;
  readonly stage: StageLayout;
  readonly safeAreaInsets?: SafeAreaInsets;
}

/**
 * Screen-space anchors for the touch overlay.
 *
 * The game stage is authored at a fixed size and scaled to fit the viewport,
 * while touch targets must stay physical-screen sized. Keeping this geometry
 * in one pure function prevents the overlay from accidentally mixing those
 * two coordinate spaces.
 */
export interface TouchPadLayout {
  readonly stageLeft: number;
  readonly stageRight: number;
  readonly stageCenterX: number;
  readonly roadTop: number;
  readonly roadBottom: number;
  readonly portraitSteerY: number;
  readonly landscapeControlY: number;
  readonly leftClusterX: number;
  readonly rightClusterX: number;
}

export function calculateTouchPadLayout(options: CalculateTouchPadLayoutOptions): TouchPadLayout {
  const { viewport, stage } = options;
  const safeLeft = options.safeAreaInsets?.left ?? 0;
  const safeRight = options.safeAreaInsets?.right ?? 0;
  const stageLeft = stage.displayX;
  const stageRight = stage.displayX + stage.displayWidth;
  const roadTop = stage.displayY;
  const roadHeight = ROAD_VIEWPORT_HEIGHT_PIXELS * stage.scale;

  return {
    stageLeft,
    stageRight,
    stageCenterX: stageLeft + stage.displayWidth / 2,
    roadTop,
    roadBottom: roadTop + roadHeight,
    // The steering targets stay around resting thumb height in portrait.
    portraitSteerY: roadTop + roadHeight * 0.64,
    // Landscape clusters sit slightly lower, where both thumbs naturally land.
    landscapeControlY: roadTop + roadHeight * 0.68,
    leftClusterX: (safeLeft + stageLeft) / 2,
    rightClusterX: (stageRight + viewport.width - safeRight) / 2,
  };
}
