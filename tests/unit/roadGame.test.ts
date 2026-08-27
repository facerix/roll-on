import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRoute } from '../../src/game/route.ts';
import type { RoadGame, StartRoadGameOptions } from '../../src/game/roadGame.ts';

const STEP_MS = 1000 / 60;
const PATROL_SPRITE = '/images/vehicles/patrol.png';

class FakeStyle {
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
}

class FakeCanvasContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  imageSmoothingEnabled = true;
  readonly imageSources: string[] = [];

  fillRect(_x: number, _y: number, _width: number, _height: number): void {}
  beginPath(): void {}
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  closePath(): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  translate(_x: number, _y: number): void {}
  rotate(_radians: number): void {}

  drawImage(image: FakeImage, _x: number, _y: number, _width: number, _height: number): void {
    this.imageSources.push(image.src);
  }
}

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly #style = new FakeStyle();
  readonly context = new FakeCanvasContext();
  readonly attributes = new Map<string, string>();
  className = '';
  id = '';
  textContent = '';
  hidden = false;
  focused = false;
  tabIndex = 0;

  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
  }

  get style(): FakeStyle {
    return this.#style;
  }

  set style(_value: unknown) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  focus(): void {
    this.focused = true;
  }

  remove(): void {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.attributes.has(name);
    if (enabled) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return enabled;
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: 800, height: 600 };
  }

  getContext(_kind: '2d'): FakeCanvasContext {
    return this.context;
  }
}

class FakeDocument {
  readonly body = new FakeElement('body');
  visibilityState = 'visible';

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

class FakeImage extends EventTarget {
  complete = true;
  naturalWidth = 1;
  src = '';
}

class FakeCustomElements {
  define(_name: string, _constructor: CustomElementConstructor): void {}

  whenDefined(): Promise<CustomElementConstructor> {
    return Promise.resolve(FakeElement as unknown as CustomElementConstructor);
  }
}

class FakeWindow extends EventTarget {
  readonly location = { href: 'http://localhost/?debug&routeFollow=1' };

  matchMedia(): MediaQueryList {
    return { matches: false } as MediaQueryList;
  }
}

interface RafHarness {
  readonly advance: (timestampMs: number) => void;
  readonly pendingCount: () => number;
}

type StartRoadGame = (options: StartRoadGameOptions) => RoadGame;

function createRafHarness(): RafHarness {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  const requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = (id: number): void => {
    callbacks.delete(id);
  };

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: requestAnimationFrame,
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: cancelAnimationFrame,
  });

  return {
    advance(timestampMs) {
      const frameCallbacks = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of frameCallbacks) callback(timestampMs);
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(child => walk(child))];
}

function field(root: FakeElement, name: string): FakeElement {
  const result = walk(root).find(element => element.dataset.field === name);
  assert.ok(result, `expected HUD field ${name}`);
  return result;
}

function straightTestRoute(lengthMeters: number) {
  return createRoute({
    origin: { xMeters: 0, yMeters: 0 },
    headingRadians: 0,
    segments: [{ kind: 'straight', lengthMeters }],
    constraints: { maximumAbsoluteRoadOffsetMeters: 14, minimumBendRadiusMeters: 100 },
  });
}

function keyDown(code: string): Event {
  const event = new Event('keydown');
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: false },
  });
  return event;
}

async function withRoadGame<T>(
  callback: (root: FakeElement, raf: RafHarness, startRoadGame: StartRoadGame) => T
): Promise<T> {
  const names = [
    'document',
    'window',
    'HTMLElement',
    'customElements',
    'Image',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
  ] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));

  const fakeDocument = new FakeDocument();
  const fakeWindow = new FakeWindow();
  const raf = createRafHarness();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: FakeElement,
  });
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: new FakeCustomElements(),
  });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: () => ({
      paddingTop: '0px',
      paddingRight: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
    }),
  });

  try {
    const { startRoadGame } = await import('../../src/game/roadGame.ts');
    return await callback(new FakeElement('main'), raf, startRoadGame);
  } finally {
    for (const name of names) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  }
}

test('roadGame composes authored pullouts and patrol encounters into live gameplay', async () => {
  await withRoadGame(async (root, raf, startRoadGame) => {
    const game = startRoadGame({
      root: root as unknown as HTMLElement,
      viewport: { width: 800, height: 500 },
      route: straightTestRoute(500),
      pullouts: [
        {
          id: 'test-pullout',
          side: 'right',
          startDistanceMeters: 120,
          endDistanceMeters: 220,
          taperMeters: 20,
          depthMeters: 3.6,
        },
      ],
      patrolEncounters: [
        {
          id: 'test-speed-trap',
          source: 'speed-trap',
          triggerDistanceMeters: 180,
          windowStartDistanceMeters: 180,
          windowEndDistanceMeters: 400,
          requiredAvoids: 1,
        },
      ],
      stageNumber: 1,
      onRetry: () => {},
      onExitToTitle: () => {},
    });

    // The first scene proves roadGame posted the encounter-owned cruiser from
    // the supplied pullout before handing the world to the mount seam.
    raf.advance(0);
    const context = walk(root).find(element => element.tagName === 'CANVAS')?.context;
    assert.ok(context);
    assert.ok(context.imageSources.includes(PATROL_SPRITE));

    const throttle = keyDown('ArrowUp');
    (globalThis.window as unknown as FakeWindow).dispatchEvent(throttle);
    let patrolStatus = '';
    for (let frame = 1; frame <= 1_500; frame += 1) {
      raf.advance(frame * STEP_MS);
      patrolStatus = field(root, 'status').textContent;
      if (patrolStatus.startsWith('PATROL')) break;
    }

    assert.match(patrolStatus, /^PATROL(?: LEFT| RIGHT)?$/);
    assert.ok(raf.pendingCount() > 0, 'the mounted game remains live after pursuit starts');
    game.dispose();
    assert.equal(raf.pendingCount(), 0);
  });
});

test('roadGame delegates terminal ownership and suppresses its fallback terminal view', async () => {
  await withRoadGame(async (root, raf, startRoadGame) => {
    let resultCount = 0;
    const game = startRoadGame({
      root: root as unknown as HTMLElement,
      viewport: { width: 800, height: 500 },
      route: straightTestRoute(30),
      stageNumber: 2,
      initialFuelLevel: 0,
      onRetry: () => {},
      onExitToTitle: () => {},
      onStageResult: state => {
        resultCount += 1;
        assert.equal(state.phase, 'failed');
        assert.equal(state.failureReason, 'out-of-fuel');
        return true;
      },
    });

    for (let frame = 0; frame <= 240 && resultCount === 0; frame += 1) {
      raf.advance(frame * STEP_MS);
    }

    assert.equal(
      resultCount,
      1,
      `terminal callback did not run; distance=${field(root, 'distance-traveled').textContent}, pending=${raf.pendingCount()}`
    );
    const terminal = walk(root).find(element => element.className === 'roll-on-run-terminal');
    assert.ok(terminal);
    assert.equal(terminal.hidden, true);
    game.dispose();
  });
});
