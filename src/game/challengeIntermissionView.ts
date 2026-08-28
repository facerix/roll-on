import { h } from '/src/domUtils.js';

export interface ChallengeIntermissionViewOptions {
  readonly completedStageNumber: number;
  readonly nextStageNumber: number;
  readonly cumulativeScore: number;
  readonly cargoIntegrity: number;
  readonly fuelLevel: number;
  readonly onContinue: () => void;
  readonly onExitToTitle: () => void;
}

export interface ChallengeIntermissionView {
  readonly root: HTMLElement;
  show(): void;
  hide(): void;
  dispose(): void;
}

/** Minimal between-stage screen; the future shop can occupy this seam later. */
export function createChallengeIntermissionView(
  options: ChallengeIntermissionViewOptions
): ChallengeIntermissionView {
  assertPositiveInteger('completedStageNumber', options.completedStageNumber);
  assertPositiveInteger('nextStageNumber', options.nextStageNumber);
  if (options.nextStageNumber !== options.completedStageNumber + 1) {
    throw new RangeError('nextStageNumber must immediately follow completedStageNumber');
  }
  assertNonNegativeInteger('cumulativeScore', options.cumulativeScore);
  assertNormalized('cargoIntegrity', options.cargoIntegrity);
  assertNormalized('fuelLevel', options.fuelLevel);

  const title = h('h2', {
    id: 'challenge-intermission-title',
    textContent: `STAGE ${options.completedStageNumber} CLEARED`,
  });
  const detail = h('p', {
    className: 'roll-on-challenge-intermission-detail',
    textContent: `NEXT ROUTE: STAGE ${options.nextStageNumber} // FUEL +25%`,
  });
  const summary = h('p', {
    className: 'roll-on-challenge-intermission-summary',
    textContent: `SCORE ${options.cumulativeScore.toLocaleString('en-US')} // CARGO ${Math.round(options.cargoIntegrity * 100)}% // TANK ${Math.round(options.fuelLevel * 100)}%`,
  });
  const continueButton = h('button', {
    type: 'button',
    className: 'roll-on-challenge-intermission-action roll-on-challenge-intermission-primary',
    textContent: `CONTINUE TO STAGE ${options.nextStageNumber}`,
  });
  const titleButton = h('button', {
    type: 'button',
    className: 'roll-on-challenge-intermission-action',
    textContent: 'TITLE SCREEN',
  });
  const root = h(
    'section',
    {
      className: 'roll-on-challenge-intermission',
      hidden: true,
      role: 'dialog',
      ariaLive: 'assertive',
      ariaAtomic: 'true',
    },
    [
      h('p', {
        className: 'roll-on-challenge-intermission-kicker',
        textContent: 'ENDLESS BLACKTOP // INTERMISSION',
      }),
      title,
      detail,
      summary,
      h('div', { className: 'roll-on-challenge-intermission-actions' }, [
        continueButton,
        titleButton,
      ]),
    ]
  );
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', title.id);

  let available = true;
  const continueToNextStage = (): void => {
    if (!available) return;
    available = false;
    root.hidden = true;
    options.onContinue();
  };
  const exitToTitle = (): void => {
    if (!available) return;
    available = false;
    root.hidden = true;
    options.onExitToTitle();
  };
  continueButton.addEventListener('click', continueToNextStage);
  titleButton.addEventListener('click', exitToTitle);

  return {
    root,
    show(): void {
      if (!available) return;
      root.hidden = false;
      continueButton.focus();
    },
    hide(): void {
      root.hidden = true;
    },
    dispose(): void {
      available = false;
      continueButton.removeEventListener('click', continueToNextStage);
      titleButton.removeEventListener('click', exitToTitle);
      root.remove();
    },
  };
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`);
  }
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
  }
}

function assertNormalized(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1], got ${value}`);
  }
}
