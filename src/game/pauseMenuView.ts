import { h } from '/src/domUtils.js';

export interface PauseMenuViewOptions {
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onExitToTitle: () => void;
}

export interface PauseMenuView {
  readonly root: HTMLDivElement;
  show(): void;
  hide(): void;
  dispose(): void;
}

/** Persistent gameplay chrome for pausing or leaving the current run. */
export function createPauseMenuView(options: PauseMenuViewOptions): PauseMenuView {
  const pauseButton = h('button', {
    type: 'button',
    className: 'roll-on-pause-toggle',
    ariaLabel: 'Pause game',
    textContent: 'PAUSE',
  });
  const title = h('h2', { id: 'roll-on-pause-title', textContent: 'GAME PAUSED' });
  const detail = h('p', {
    className: 'roll-on-pause-detail',
    textContent: 'The road is waiting.',
  });
  const resumeButton = h('button', {
    type: 'button',
    className: 'roll-on-pause-action roll-on-pause-primary',
    textContent: 'RESUME',
  });
  const exitButton = h('button', {
    type: 'button',
    className: 'roll-on-pause-action',
    textContent: 'QUIT TO TITLE',
  });
  const panel = h(
    'section',
    {
      className: 'roll-on-pause-panel',
      hidden: true,
      role: 'dialog',
      ariaModal: 'true',
      ariaLabelledby: title.id,
    },
    [title, detail, h('div', { className: 'roll-on-pause-actions' }, [resumeButton, exitButton])]
  );
  const root = h('div', { className: 'roll-on-pause-ui', hidden: true }, [pauseButton, panel]);

  let available = false;
  let paused = false;
  let disposed = false;

  const open = (): void => {
    if (disposed || !available || paused) return;
    paused = true;
    pauseButton.hidden = true;
    panel.hidden = false;
    options.onPause();
    resumeButton.focus();
  };

  const close = (): void => {
    if (disposed || !paused) return;
    paused = false;
    panel.hidden = true;
    pauseButton.hidden = false;
    options.onResume();
    pauseButton.focus();
  };

  const exitToTitle = (): void => {
    if (disposed || !available) return;
    available = false;
    paused = false;
    root.hidden = true;
    panel.hidden = true;
    options.onExitToTitle();
  };

  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (!available || paused || event.key !== 'Escape') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    open();
  };

  const onRootKeyDown = (event: KeyboardEvent): void => {
    if (!paused || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  pauseButton.addEventListener('click', open);
  resumeButton.addEventListener('click', close);
  exitButton.addEventListener('click', exitToTitle);
  root.addEventListener('keydown', onRootKeyDown);
  window.addEventListener('keydown', onWindowKeyDown);

  return {
    root,
    show(): void {
      if (disposed) return;
      available = true;
      paused = false;
      root.hidden = false;
      pauseButton.hidden = false;
      panel.hidden = true;
    },
    hide(): void {
      available = false;
      paused = false;
      root.hidden = true;
      pauseButton.hidden = false;
      panel.hidden = true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      available = false;
      paused = false;
      pauseButton.removeEventListener('click', open);
      resumeButton.removeEventListener('click', close);
      exitButton.removeEventListener('click', exitToTitle);
      root.removeEventListener('keydown', onRootKeyDown);
      window.removeEventListener('keydown', onWindowKeyDown);
      root.remove();
    },
  };
}
