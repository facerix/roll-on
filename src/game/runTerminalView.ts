import { h } from '/src/domUtils.js';
import type { RunTerminalPresentation } from '/src/game/stageRun.js';

export interface RunTerminalViewOptions {
  readonly stageNumber: number;
  readonly onRetry: () => void;
  readonly onExitToTitle: () => void;
}

export interface RunTerminalView {
  readonly root: HTMLElement;
  show(presentation: RunTerminalPresentation): void;
  dispose(): void;
}

/** Terminal game chrome; lifecycle truth remains in `stageRun.ts`. */
export function createRunTerminalView(options: RunTerminalViewOptions): RunTerminalView {
  if (!Number.isSafeInteger(options.stageNumber) || options.stageNumber <= 0) {
    throw new RangeError(`stageNumber must be a positive integer, got ${options.stageNumber}`);
  }
  const title = h('h2', { id: 'run-terminal-title', textContent: '' });
  const detail = h('p', { className: 'roll-on-run-terminal-detail', textContent: '' });
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
    show(presentation) {
      root.dataset.phase = presentation.phase;
      title.textContent = presentation.title;
      detail.textContent = presentation.detail;
      retryButton.textContent = presentation.retryLabel;
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
