import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GameHudSnapshot } from '../../src/game/gameHud.ts';
import { createGameHudView } from '../../src/game/gameHudView.ts';

class FakeStyle {
  readonly properties = new Map<string, string>();
  transform = '';

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
}

class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  className = '';
  textContent = '';
  ariaLabel = '';
  ariaLive = '';
  ariaAtomic = '';
  ariaHidden = '';
  role = '';
  max = 0;
  value = 0;
  innerHTML = '';
  readonly attributes = new Map<string, string>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  createCount = 0;

  createElement(tagName: string): FakeElement {
    this.createCount += 1;
    return new FakeElement(tagName);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return this.createElement(tagName);
  }
}

const fakeDocument = new FakeDocument();
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: fakeDocument,
});

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(child => walk(child))];
}

function withClass(root: FakeElement, className: string): FakeElement[] {
  return walk(root).filter(element => element.className.split(' ').includes(className));
}

function field(root: FakeElement, name: string): FakeElement {
  const matches = walk(root).filter(element => element.dataset.field === name);
  assert.equal(matches.length, 1, `expected one ${name} field`);
  return matches[0]!;
}

function snapshot(overrides: Partial<GameHudSnapshot> = {}): GameHudSnapshot {
  return {
    unitSystem: 'imperial',
    speedText: '89',
    speedUnitText: 'MPH',
    speedMetersPerSecondText: '40.0 m/s',
    cruiseSpeedText: '56',
    speedLevel: 1,
    cruiseSpeedLevel: 0.625,
    cargoIntegrityText: '25%',
    cargoIntegrityLevel: 0.25,
    cargoIntegritySeverity: 'critical',
    fuelPercentText: '5%',
    fuelLevel: 0.05,
    isFuelInFumes: true,
    fuelStatusText: 'FUMES',
    distanceTraveledText: '1.4 mi',
    distanceRemainingText: '0.0 mi',
    routeProgress: 1,
    routeProgressText: '100%',
    elapsedTimeText: '100:00',
    stageText: 'STAGE 1',
    statusText: 'STAGE COMPLETE',
    scoreText: '9,999,999,999',
    takedownsText: '999',
    eventText: 'ROAD RAGE -250',
    ...overrides,
  };
}

test('HUD wireframe is one labelled section with five semantic instrument wells', () => {
  const root = createGameHudView().root as unknown as FakeElement;
  assert.equal(root.tagName, 'SECTION');
  assert.equal(root.ariaLabel, 'Driving status');

  const instruments = withClass(root, 'roll-on-hud-instruments');
  assert.equal(instruments.length, 1);
  assert.equal(instruments[0]!.tagName, 'DL');

  const wells = withClass(root, 'roll-on-hud-instrument');
  assert.equal(wells.length, 5);
  assert.deepEqual(
    wells.map(well => well.dataset.instrument),
    ['speed', 'fuel', 'cargo', 'run', 'route']
  );
  assert.deepEqual(
    wells.map(well => well.children[0]?.textContent),
    ['SPEED', 'FUEL', 'CARGO', 'RUN', 'ROUTE']
  );

  const progress = walk(root).filter(element => element.tagName === 'PROGRESS');
  assert.deepEqual(
    progress.map(element => element.ariaLabel),
    ['Fuel level', 'Cargo integrity', 'Route progress']
  );

  const speedometer = field(root, 'speedometer');
  assert.equal(speedometer.tagName, 'SVG');
  assert.equal(speedometer.attributes.get('viewBox'), '0 0 104 68');
  assert.equal(speedometer.ariaHidden, 'true');

  const liveRegions = walk(root).filter(element => element.ariaLive.length > 0);
  assert.equal(liveRegions.length, 2);
  assert.deepEqual(
    liveRegions.map(element => element.dataset.field),
    ['status', 'event']
  );
});

test('HUD update mutates stable nodes and exposes every visual value as text', () => {
  const view = createGameHudView();
  const root = view.root as unknown as FakeElement;
  const nodesBefore = walk(root);
  const createdBefore = fakeDocument.createCount;

  view.update(snapshot());

  assert.equal(
    fakeDocument.createCount,
    createdBefore,
    'updates must not create replacement nodes'
  );
  assert.deepEqual(walk(root), nodesBefore);
  assert.equal(field(root, 'speed').textContent, '89');
  assert.equal(field(root, 'speed-unit').textContent, 'MPH');
  assert.equal(field(root, 'cruise').textContent, '56');
  assert.equal(field(root, 'fuel').textContent, '5%');
  assert.equal(field(root, 'fuel-status').textContent, 'FUMES');
  assert.equal(field(root, 'cargo').textContent, '25%');
  assert.equal(field(root, 'cargo-status').textContent, 'CRITICAL');
  assert.equal(field(root, 'time').textContent, '100:00');
  assert.equal(field(root, 'score').textContent, '9,999,999,999');
  assert.equal(field(root, 'distance-left').textContent, '0.0 mi');
  assert.equal(field(root, 'distance-traveled').textContent, '1.4 mi');
  assert.equal(field(root, 'route-progress-text').textContent, '100%');
  assert.equal(field(root, 'stage').textContent, 'STAGE 1');
  assert.equal(field(root, 'rage').textContent, '999');
  assert.equal(field(root, 'status').textContent, 'STAGE COMPLETE');
  assert.equal(field(root, 'event').textContent, 'ROAD RAGE -250');

  assert.equal(field(root, 'fuel-level').value, 0.05);
  assert.equal(field(root, 'cargo-level').value, 0.25);
  assert.equal(field(root, 'route-progress').value, 1);
  assert.equal(field(root, 'speedometer').style.properties.get('--roll-on-speed-angle'), '135deg');
  assert.equal(
    field(root, 'speedometer').style.properties.get('--roll-on-cruise-angle'),
    '33.75deg'
  );
  assert.equal(root.dataset.unitSystem, 'imperial');
  assert.equal(root.dataset.cargoSeverity, 'critical');
  assert.equal(root.dataset.fumes, 'true');
});

test('instrument values are not live regions during rapid updates', () => {
  const view = createGameHudView();
  const root = view.root as unknown as FakeElement;
  view.update(snapshot({ speedText: '70', elapsedTimeText: '02:05', scoreText: '12,345' }));

  for (const name of ['speed', 'cruise', 'fuel', 'cargo', 'time', 'score', 'distance-left']) {
    assert.equal(field(root, name).ariaLive, '', `${name} must not announce every update`);
  }
});
