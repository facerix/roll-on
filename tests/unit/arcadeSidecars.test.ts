import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARCADE_SIDECAR_CONTENT,
  calculateArcadeSidecarLayout,
  createArcadeSidecars,
} from '../../src/game/arcadeSidecars.ts';
import { calculateStageLayout } from '../../src/game/stageLayout.ts';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly tagName: string;
  className = '';
  hidden = false;
  textContent = '';
  ariaLabel = '';

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
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

function flatten(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(flatten)];
}

test('sidecars appear only when both fine pointer and minimum side-rail space are present', () => {
  for (const [viewport, hasFinePointer, expectedVisible] of [
    [{ width: 1280, height: 720 }, true, true],
    [{ width: 960, height: 720 }, true, true],
    [{ width: 959, height: 720 }, true, false],
    [{ width: 1280, height: 720 }, false, false],
    [{ width: 1280, height: 400 }, true, false],
    [{ width: 600, height: 600 }, true, false],
    [{ width: 390, height: 844 }, false, false],
  ] as const) {
    const stage = calculateStageLayout({ viewport });
    const layout = calculateArcadeSidecarLayout({ viewport, stage, hasFinePointer });
    assert.equal(
      layout.visible,
      expectedVisible,
      `${viewport.width}x${viewport.height}, fine=${hasFinePointer}`
    );
  }
});

test('visible sidecars stay centered within the rails and never alter the stage fit', () => {
  const viewport = { width: 1280, height: 720 };
  const stage = calculateStageLayout({ viewport });
  const originalStage = structuredClone(stage);
  const layout = calculateArcadeSidecarLayout({ viewport, stage, hasFinePointer: true });

  assert.deepEqual(stage, originalStage);
  assert.deepEqual(layout, {
    visible: true,
    cardWidth: 288,
    displayCenterY: 360,
    leftX: 56,
    rightX: 936,
  });
  assert.ok(layout.leftX + layout.cardWidth < stage.displayX);
  assert.ok(layout.rightX > stage.displayX + stage.displayWidth);
  assert.equal(layout.displayCenterY, stage.displayY + stage.displayHeight / 2);
});

test('sidecar layout respects safe areas and rejects corrupt geometry loudly', () => {
  const viewport = { width: 1320, height: 760 };
  const safeAreaInsets = { top: 10, right: 20, bottom: 30, left: 40 };
  const stage = calculateStageLayout({ viewport, safeAreaInsets });
  const layout = calculateArcadeSidecarLayout({
    viewport,
    safeAreaInsets,
    stage,
    hasFinePointer: true,
  });

  assert.equal(layout.visible, true);
  assert.ok(layout.leftX >= safeAreaInsets.left);
  assert.ok(layout.rightX + layout.cardWidth <= viewport.width - safeAreaInsets.right);
  assert.equal(layout.displayCenterY, stage.displayY + stage.displayHeight / 2);
  assert.ok(layout.displayCenterY >= safeAreaInsets.top);
  assert.ok(layout.displayCenterY <= viewport.height - safeAreaInsets.bottom);

  assert.throws(
    () =>
      calculateArcadeSidecarLayout({
        viewport,
        stage: { ...stage, displayX: Number.NaN },
        hasFinePointer: true,
      }),
    /stage\.displayX must be finite/
  );
});

test('sidecar copy maps every keyboard action to an in-stage or touch equivalent', () => {
  assert.deepEqual(
    ARCADE_SIDECAR_CONTENT.controls.map(control => control.action),
    ['steer', 'throttle', 'brake', 'horn', 'cruise', 'pause']
  );
  assert.ok(ARCADE_SIDECAR_CONTENT.controls.every(control => control.touchEquivalent.length > 0));
  assert.deepEqual(ARCADE_SIDECAR_CONTENT.objectives, [
    'REACH THE ROUTE END',
    'PROTECT YOUR CARGO',
    'WATCH YOUR FUEL',
  ]);
  assert.deepEqual(ARCADE_SIDECAR_CONTENT.consequences, [
    'CRASH OR EMPTY TANK ENDS THE RUN',
    'ROAD RAGE COSTS SCORE',
  ]);
});

test('sidecar keycaps use the static arcade button treatment without losing kbd semantics', () => {
  withFakeDocument(() => {
    const elements = flatten(createArcadeSidecars(1).root as unknown as FakeElement);
    const keycaps = elements.filter(element => element.tagName === 'kbd');

    assert.equal(keycaps.length, 11);
    assert.ok(keycaps.every(element => element.className.split(' ').includes('arcade-button')));
  });
});

test('sidecars are semantic sibling cards with truthful stage and control copy', () => {
  withFakeDocument(() => {
    const view = createArcadeSidecars(3);
    const root = view.root as unknown as FakeElement;
    const elements = flatten(root);

    assert.equal(root.children.length, 2);
    assert.deepEqual(
      root.children.map(child => [child.tagName, child.ariaLabel]),
      [
        ['aside', 'Driving instructions'],
        ['aside', 'Stage 3 dispatch'],
      ]
    );
    assert.deepEqual(
      elements.filter(element => element.tagName === 'h2').map(element => element.textContent),
      ['CONTROLS', 'DISPATCH']
    );
    assert.deepEqual(
      elements.filter(element => element.tagName === 'kbd').map(element => element.textContent),
      ['◀︎', '▶︎', 'A', 'D', '▲︎', 'W', '▼︎', 'S', 'SPACE', 'C', 'ESC']
    );
    assert.ok(elements.some(element => element.textContent === 'HOLD FOR THROTTLE'));
    assert.ok(elements.some(element => element.textContent === 'BRAKE CANCELS CRUISE'));
    assert.ok(elements.some(element => element.textContent === '3 SECOND RECHARGE'));
    assert.ok(elements.some(element => element.textContent === 'STAGE 3'));
  });
});

test('sidecars reject invalid stage numbers', () => {
  withFakeDocument(() => {
    assert.throws(() => createArcadeSidecars(0), /positive integer/);
  });
});
