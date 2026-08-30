import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStageIntroView } from '../../src/game/stageIntroView.ts';

class FakeElement {
  readonly children: FakeElement[] = [];
  className = '';
  textContent = '';
  hidden = false;
  removed = false;

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement();
  }
}

function withFakeDocument(callback: () => void): void {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: new FakeDocument(),
  });
  try {
    callback();
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as { document?: unknown }).document;
  }
}

test('stage intro remains visible for its fixed duration without owning input', () => {
  withFakeDocument(() => {
    const view = createStageIntroView(3, 0.9);
    const root = view.root as unknown as FakeElement;

    assert.equal(root.hidden, false);
    assert.deepEqual(
      root.children.map(child => child.textContent),
      ['STAGE 3', 'ROLL ON!']
    );
    view.step(0.4);
    assert.equal(root.hidden, false);
    view.step(0.5);
    assert.equal(root.hidden, true);
    view.dispose();
    assert.equal(root.removed, true);
  });
});

test('stage intro rejects corrupt stage, duration, and time inputs', () => {
  withFakeDocument(() => {
    assert.throws(() => createStageIntroView(0), /positive integer/);
    assert.throws(() => createStageIntroView(1, 0), /positive and finite/);
    const view = createStageIntroView(1);
    assert.throws(() => view.step(-1), /non-negative and finite/);
    view.dispose();
  });
});
