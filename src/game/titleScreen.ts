export interface TitleScreenStartOptions {
  /** Click/tap target for starting the game. */
  activationTarget: EventTarget;
  /** Target that receives arcade-style "any key" input. */
  keyboardTarget: EventTarget;
  /** Called exactly once when either start gesture is accepted. */
  onStart: () => void;
}

/**
 * Wire the title screen's pointer and keyboard start gestures into one
 * single-shot activation. The first accepted gesture removes both listeners
 * before invoking `onStart`, so a later driving key cannot mount a second game.
 *
 * Returns an idempotent cleanup function for callers that tear down the title
 * screen without starting.
 */
export function installTitleScreenStartHandlers(opts: TitleScreenStartOptions): () => void {
  let active = true;

  const dispose = (): void => {
    if (!active) return;
    active = false;
    opts.activationTarget.removeEventListener('click', handleStart);
    opts.keyboardTarget.removeEventListener('keydown', handleKeyDown);
  };

  const handleStart = (): void => {
    if (!active) return;
    dispose();
    opts.onStart();
  };

  const handleKeyDown = (event: Event): void => {
    const keyEvent = event as KeyboardEvent;
    // Leave modifier chords and Tab available for browser/accessibility use.
    if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey || keyEvent.key === 'Tab') return;
    handleStart();
  };

  opts.activationTarget.addEventListener('click', handleStart);
  opts.keyboardTarget.addEventListener('keydown', handleKeyDown);

  return dispose;
}
