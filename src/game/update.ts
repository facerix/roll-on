interface FrameInput {
  beginFrame(): void;
}

/**
 * Run one gameplay update, then retire the input edge latches it consumed.
 * Keeping this ordering in a small testable seam prevents one-shot actions
 * from being cleared before gameplay can observe them.
 */
export function runGameUpdate<TInput extends FrameInput>(
  dt: number,
  input: TInput,
  update: (dt: number, input: TInput) => void
): void {
  update(dt, input);
  input.beginFrame();
}
