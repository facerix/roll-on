/**
 * DISPATCH screen input wiring.
 *
 * Sits between the title screen and gameplay: the player picks a game mode
 * before a route/session exists. This module owns only the *selection state
 * machine* — highlight position, pointer and keyboard gestures — so it stays
 * DOM-free and testable. Presentation (images, layout, focus) is the caller's.
 *
 * Unlike the title screen, selection is NOT single-shot: a mode may decline to
 * navigate (e.g. an unimplemented mode), and the screen must remain usable.
 * Callers that do navigate are expected to call `dispose()` before mounting the
 * next screen; doing so inside `onSelect` disarms the remaining gestures.
 */

export type DispatchMode = 'campaign' | 'challenge';

export interface DispatchOption {
  readonly mode: DispatchMode;
  /** Click/hover target representing this option. */
  readonly activationTarget: EventTarget;
}

export interface DispatchScreenOptions {
  /** Selectable modes, in presentation order. Must be non-empty and unique. */
  readonly options: readonly DispatchOption[];
  /** Target that receives arcade-style navigation keys. */
  readonly keyboardTarget: EventTarget;
  /** Called on install and whenever the highlight actually changes. */
  readonly onHighlight?: (mode: DispatchMode, index: number) => void;
  /** Called for every accepted selection gesture. */
  readonly onSelect: (mode: DispatchMode) => void;
  /** Called once when the player backs out (Escape). Disarms the screen. */
  readonly onBack?: () => void;
  /** Index highlighted at install. Default: 0. */
  readonly initialIndex?: number;
}

const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const CONFIRM_KEYS = new Set(['Enter', ' ', 'Spacebar']);

export function installDispatchScreenHandlers(opts: DispatchScreenOptions): () => void {
  const options = opts.options;
  if (options.length === 0) {
    throw new RangeError('dispatch screen requires at least one dispatch option');
  }
  const seen = new Set<DispatchMode>();
  for (const option of options) {
    if (seen.has(option.mode)) {
      throw new RangeError(`dispatch screen has a duplicate dispatch mode: ${option.mode}`);
    }
    seen.add(option.mode);
  }

  const initialIndex = opts.initialIndex ?? 0;
  if (!Number.isInteger(initialIndex) || initialIndex < 0 || initialIndex >= options.length) {
    throw new RangeError(`initialIndex must index the option list, got ${initialIndex}`);
  }

  let active = true;
  let highlighted = initialIndex;

  const highlight = (index: number): void => {
    if (!active || index === highlighted) return;
    highlighted = index;
    opts.onHighlight?.(options[index]!.mode, index);
  };

  const select = (index: number): void => {
    if (!active) return;
    highlight(index);
    // Re-check: a re-entrant highlight callback may have torn the screen down.
    if (!active) return;
    opts.onSelect(options[index]!.mode);
  };

  const handleKeyDown = (event: Event): void => {
    if (!active) return;
    const keyEvent = event as KeyboardEvent;
    // Leave modifier chords and Tab available for browser/accessibility use.
    if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey || keyEvent.key === 'Tab') return;

    const key = keyEvent.key;
    if (PREVIOUS_KEYS.has(key)) {
      highlight((highlighted - 1 + options.length) % options.length);
      return;
    }
    if (NEXT_KEYS.has(key)) {
      highlight((highlighted + 1) % options.length);
      return;
    }
    if (CONFIRM_KEYS.has(key)) {
      select(highlighted);
      return;
    }
    if (key === 'Escape') {
      const onBack = opts.onBack;
      if (!onBack) return;
      dispose();
      onBack();
    }
  };

  const pointerBindings = options.map((option, index) => {
    const onClick = (): void => select(index);
    const onEnter = (): void => highlight(index);
    option.activationTarget.addEventListener('click', onClick);
    option.activationTarget.addEventListener('mouseenter', onEnter);
    return { target: option.activationTarget, onClick, onEnter };
  });
  opts.keyboardTarget.addEventListener('keydown', handleKeyDown);

  function dispose(): void {
    if (!active) return;
    active = false;
    for (const binding of pointerBindings) {
      binding.target.removeEventListener('click', binding.onClick);
      binding.target.removeEventListener('mouseenter', binding.onEnter);
    }
    opts.keyboardTarget.removeEventListener('keydown', handleKeyDown);
  }

  opts.onHighlight?.(options[highlighted]!.mode, highlighted);

  return dispose;
}
