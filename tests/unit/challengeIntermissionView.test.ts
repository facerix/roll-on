import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChallengeIntermissionView } from '../../src/game/challengeIntermissionView.ts';

class FakeElement extends EventTarget {
  readonly children: FakeElement[] = [];
  className = '';
  id = '';
  textContent = '';
  hidden = false;
  focused = false;
  dataset: Record<string, string> = {};

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  focus(): void {
    this.focused = true;
  }

  remove(): void {}

  setAttribute(_name: string, _value: string): void {}
}

class FakeDocument {
  createElement(_tagName: string): FakeElement {
    return new FakeElement();
  }
}

function withView(
  callback: (view: ReturnType<typeof createChallengeIntermissionView>) => void
): void {
  const hadDocument = 'document' in globalThis;
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: new FakeDocument(),
  });

  const view = createChallengeIntermissionView({
    completedStageNumber: 2,
    nextStageNumber: 3,
    cumulativeScore: 15_000,
    cargoIntegrity: 0.72,
    fuelLevel: 0.34,
    onContinue: () => {},
    onExitToTitle: () => {},
  });
  try {
    callback(view);
  } finally {
    view.dispose();
    if (hadDocument) {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  }
}

test('Challenge intermission presents carryover and starts the next stage', () => {
  withView(view => {
    const root = view.root as unknown as FakeElement;
    const actions = root.children.at(-1)!;
    const continueButton = actions.children[0]!;

    assert.equal(root.hidden, true);
    view.show();
    assert.equal(root.hidden, false);
    assert.equal(continueButton.textContent, 'CONTINUE TO STAGE 3');
    assert.equal(continueButton.focused, true);

    continueButton.dispatchEvent(new Event('click'));
  });
});

test('Challenge intermission exits through the title action', () => {
  let exits = 0;
  const hadDocument = 'document' in globalThis;
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: new FakeDocument(),
  });
  const view = createChallengeIntermissionView({
    completedStageNumber: 1,
    nextStageNumber: 2,
    cumulativeScore: 1,
    cargoIntegrity: 1,
    fuelLevel: 1,
    onContinue: () => {},
    onExitToTitle: () => {
      exits += 1;
    },
  });
  try {
    const root = view.root as unknown as FakeElement;
    const actions = root.children.at(-1)!;
    view.show();
    actions.children[1]!.dispatchEvent(new Event('click'));
    assert.equal(exits, 1);
    assert.equal(root.hidden, true);
  } finally {
    view.dispose();
    if (hadDocument) {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  }
});
