import { h } from '/src/domUtils.js';

const DEFAULT_STAGE_INTRO_DURATION_SECONDS = 0.9;

export interface StageIntroView {
  readonly root: HTMLElement;
  step(dtSeconds: number): void;
  hide(): void;
  dispose(): void;
}

/** Brief semantic arcade sting; it never captures focus, input, or simulation. */
export function createStageIntroView(
  stageNumber: number,
  durationSeconds: number = DEFAULT_STAGE_INTRO_DURATION_SECONDS
): StageIntroView {
  if (!Number.isSafeInteger(stageNumber) || stageNumber <= 0) {
    throw new RangeError(`stageNumber must be a positive integer, got ${stageNumber}`);
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError(`durationSeconds must be positive and finite, got ${durationSeconds}`);
  }

  const root = h(
    'section',
    {
      className: 'roll-on-stage-intro',
      role: 'status',
      ariaLive: 'polite',
      ariaAtomic: 'true',
    },
    [
      h('p', { className: 'roll-on-stage-intro-kicker', textContent: `STAGE ${stageNumber}` }),
      h('h2', { textContent: 'ROLL ON!' }),
    ]
  );
  let remainingSeconds = durationSeconds;
  let disposed = false;

  const hide = (): void => {
    if (disposed) return;
    remainingSeconds = 0;
    root.hidden = true;
  };

  return {
    root,
    step(dtSeconds): void {
      if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
        throw new RangeError(`dtSeconds must be non-negative and finite, got ${dtSeconds}`);
      }
      if (disposed || remainingSeconds === 0) return;
      remainingSeconds = Math.max(0, remainingSeconds - dtSeconds);
      if (remainingSeconds === 0) root.hidden = true;
    },
    hide,
    dispose(): void {
      if (disposed) return;
      root.remove();
      disposed = true;
      remainingSeconds = 0;
    },
  };
}
