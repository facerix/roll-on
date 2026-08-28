import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPauseMenuView } from '../../src/game/pauseMenuView.ts';

class FakeElement extends EventTarget {
  readonly children: FakeElement[] = [];
  className = '';
  id = '';
  textContent = '';
  hidden = false;
  focused = false;

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  focus(): void {
    this.focused = true;
  }

  remove(): void {}
}

class FakeDocument {
  createElement(_tagName: string): FakeElement {
    return new FakeElement();
  }
}

function keyDown(key: string): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

function withPauseView(callback: (view: ReturnType<typeof createPauseMenuView>) => void): void {
  const hadDocument = 'document' in globalThis;
  const previousDocument = globalThis.document;
  const hadWindow = 'window' in globalThis;
  const previousWindow = globalThis.window;
  const fakeWindow = new EventTarget();

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: new FakeDocument(),
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  });

  const view = createPauseMenuView({
    onPause: () => {},
    onResume: () => {},
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
    if (hadWindow) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
}

test('pause menu opens and closes from the button and Escape', () => {
  withPauseView(view => {
    const root = view.root as unknown as FakeElement;
    const pauseButton = root.children[0]!;
    const panel = root.children[1]!;
    const actions = panel.children[2]!;
    const resumeButton = actions.children[0]!;

    view.show();
    assert.equal(root.hidden, false);
    assert.equal(panel.hidden, true);

    pauseButton.dispatchEvent(new Event('click'));
    assert.equal(panel.hidden, false);
    assert.equal(pauseButton.hidden, true);
    assert.equal(resumeButton.focused, true);

    resumeButton.dispatchEvent(new Event('click'));
    assert.equal(panel.hidden, true);
    assert.equal(pauseButton.hidden, false);

    pauseButton.dispatchEvent(new Event('click'));
    root.dispatchEvent(keyDown('Escape'));
    assert.equal(panel.hidden, true);
  });
});

test('Escape from gameplay opens the pause menu and quit hides it', () => {
  let pauses = 0;
  let exits = 0;
  const fakeWindow = new EventTarget();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: new FakeDocument(),
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  });

  const view = createPauseMenuView({
    onPause: () => {
      pauses += 1;
    },
    onResume: () => {},
    onExitToTitle: () => {
      exits += 1;
    },
  });
  try {
    const root = view.root as unknown as FakeElement;
    const panel = root.children[1]!;
    const actions = panel.children[2]!;
    const exitButton = actions.children[1]!;

    view.show();
    const escape = keyDown('Escape');
    fakeWindow.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(pauses, 1);
    assert.equal(panel.hidden, false);

    exitButton.dispatchEvent(new Event('click'));
    assert.equal(exits, 1);
    assert.equal(root.hidden, true);
  } finally {
    view.dispose();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});
