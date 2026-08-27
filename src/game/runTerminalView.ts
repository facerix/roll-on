import { h } from '/src/domUtils.js';
import type { FinalTally } from '/src/game/finalTally.js';
import type { HighScoreTablePresentation } from '/src/game/runResults.js';
import type { RunTerminalPresentation } from '/src/game/stageRun.js';

export interface RunTerminalViewOptions {
  readonly stageNumber: number;
  readonly onRetry: () => void;
  readonly onExitToTitle: () => void;
}

export interface RunTerminalView {
  readonly root: HTMLElement;
  show(presentation: RunTerminalPresentation, result?: RunTerminalResultDetails): void;
  dispose(): void;
}

export interface RunTerminalResultDetails {
  readonly score: number;
  readonly finalStageTally: FinalTally;
  readonly highScores: HighScoreTablePresentation;
}

/** Terminal game chrome; lifecycle truth remains in `stageRun.ts`. */
export function createRunTerminalView(options: RunTerminalViewOptions): RunTerminalView {
  if (!Number.isSafeInteger(options.stageNumber) || options.stageNumber <= 0) {
    throw new RangeError(`stageNumber must be a positive integer, got ${options.stageNumber}`);
  }
  const title = h('h2', { id: 'run-terminal-title', textContent: '' });
  const detail = h('p', { className: 'roll-on-run-terminal-detail', textContent: '' });
  const score = h('p', {
    className: 'roll-on-run-terminal-score',
    textContent: '',
    ariaLabel: 'Final score',
  });
  const tally = h('dl', { className: 'roll-on-run-terminal-tally' });
  const highScores = h('section', {
    className: 'roll-on-run-terminal-high-scores',
    ariaLabel: 'High scores',
  });
  const retryButton = h('button', {
    type: 'button',
    className: 'roll-on-run-terminal-action roll-on-run-terminal-primary',
    textContent: 'RETRY STAGE',
  });
  const titleButton = h('button', {
    type: 'button',
    className: 'roll-on-run-terminal-action',
    textContent: 'TITLE SCREEN',
  });
  const root = h(
    'section',
    {
      className: 'roll-on-run-terminal',
      hidden: true,
      role: 'dialog',
      ariaLive: 'assertive',
      ariaAtomic: 'true',
    },
    [
      h('p', {
        className: 'roll-on-run-terminal-kicker',
        textContent: `STAGE ${options.stageNumber}`,
      }),
      title,
      detail,
      score,
      tally,
      highScores,
      h('div', { className: 'roll-on-run-terminal-actions' }, [retryButton, titleButton]),
    ]
  );
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', title.id);

  const retry = (): void => options.onRetry();
  const exitToTitle = (): void => options.onExitToTitle();
  retryButton.addEventListener('click', retry);
  titleButton.addEventListener('click', exitToTitle);

  return {
    root,
    show(presentation, result) {
      root.dataset.phase = presentation.phase;
      root.dataset.hasResult = String(result !== undefined);
      title.textContent = presentation.title;
      detail.textContent = presentation.detail;
      retryButton.textContent = presentation.retryLabel;
      score.hidden = result === undefined;
      tally.hidden = result === undefined;
      highScores.hidden = result === undefined;
      tally.replaceChildren();
      highScores.replaceChildren();
      if (result !== undefined) {
        score.textContent = result.score.toLocaleString('en-US');
        const rows: readonly [string, number, boolean][] = [
          ['DISTANCE', result.finalStageTally.baseDeliveredCargo, false],
          ['CARGO', result.finalStageTally.cargoIntegrityPoints, false],
          ['DIESEL', result.finalStageTally.dieselResiduals, false],
          ['ROAD RAGE', result.finalStageTally.roadRagePenalties, true],
          ['BONUS', result.finalStageTally.bonuses, false],
        ];
        for (const [label, value, deduction] of rows) {
          tally.appendChild(h('dt', { textContent: label }));
          tally.appendChild(
            h('dd', {
              textContent: `${deduction && value > 0 ? '−' : '+'}${value.toLocaleString('en-US')}`,
            })
          );
        }
        highScores.appendChild(
          h('h3', { textContent: `${result.highScores.heading} HIGH SCORES` })
        );
        if (result.highScores.emptyMessage !== null) {
          highScores.appendChild(h('p', { textContent: result.highScores.emptyMessage }));
        } else {
          const list = h('ol');
          for (const row of result.highScores.rows) {
            const item = h('li', {
              dataset: { current: String(row.isCurrent) },
              ariaLabel: `Rank ${row.rank}, ${row.scoreText} points, ${row.detailText}`,
            });
            item.appendChild(h('span', { textContent: `#${row.rank}` }));
            item.appendChild(h('span', { textContent: row.scoreText }));
            item.appendChild(h('small', { textContent: row.detailText }));
            list.appendChild(item);
          }
          highScores.appendChild(list);
        }
      }
      root.hidden = false;
      retryButton.focus();
    },
    dispose() {
      retryButton.removeEventListener('click', retry);
      titleButton.removeEventListener('click', exitToTitle);
      root.remove();
    },
  };
}
