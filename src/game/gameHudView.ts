import { h } from '/src/domUtils.js';
import type { GameHudSnapshot } from '/src/game/gameHud.js';

export interface GameHudView {
  readonly root: HTMLElement;
  update(snapshot: GameHudSnapshot): void;
}

export function createGameHudView(): GameHudView {
  const speedValue = value('speed', 'roll-on-hud-speed-value', '0');
  const speedUnit = value('speed-unit', 'roll-on-hud-speed-unit', 'MPH');
  const cruiseSpeed = value('cruise', 'roll-on-hud-compact-value', '0');
  const cruiseSpeedUnit = h('span', {
    className: 'roll-on-hud-compact-unit',
    dataset: { field: 'cruise-unit' },
    textContent: 'MPH',
  });
  const speedWell = instrumentWell('speed', 'SPEED', [
    h('div', { className: 'roll-on-hud-speed-primary' }, [speedValue, speedUnit]),
    h('div', { className: 'roll-on-hud-secondary-reading' }, [
      h('span', { className: 'roll-on-hud-sublabel', textContent: 'CRUISE' }),
      cruiseSpeed,
      cruiseSpeedUnit,
    ]),
  ]);

  const fuelValue = value('fuel', 'roll-on-hud-gauge-value', '100%');
  const fuelStatus = value('fuel-status', 'roll-on-hud-gauge-state', 'FUEL');
  const fuelLevel = h('progress', {
    className: 'roll-on-hud-progress roll-on-hud-progress-vertical',
    dataset: { field: 'fuel-level' },
    ariaLabel: 'Fuel level',
    max: 1,
    value: 1,
  });
  const fuelWell = instrumentWell('fuel', 'FUEL', [
    h('span', { className: 'roll-on-hud-scale-label', textContent: 'F' }),
    fuelLevel,
    h('span', { className: 'roll-on-hud-scale-label', textContent: 'E' }),
    fuelValue,
    fuelStatus,
  ]);

  const cargoValue = value('cargo', 'roll-on-hud-gauge-value', '100%');
  const cargoStatus = value('cargo-status', 'roll-on-hud-gauge-state', 'INTACT');
  const cargoLevel = h('progress', {
    className: 'roll-on-hud-progress roll-on-hud-progress-horizontal',
    dataset: { field: 'cargo-level' },
    ariaLabel: 'Cargo integrity',
    max: 1,
    value: 1,
  });
  const cargoWell = instrumentWell('cargo', 'CARGO', [
    h('span', {
      className: 'roll-on-hud-cargo-placeholder',
      ariaHidden: 'true',
      textContent: '▣',
    }),
    cargoLevel,
    cargoValue,
    cargoStatus,
  ]);

  const elapsedTime = value('time', 'roll-on-hud-run-time', '00:00');
  const score = value('score', 'roll-on-hud-score-value', '0');
  const runWell = instrumentWell('run', 'RUN', [
    labelledReading('TIME', elapsedTime),
    labelledReading('SCORE', score),
  ]);

  const distanceRemaining = value('distance-left', 'roll-on-hud-route-value', '0.0 mi');
  const routeProgress = h('progress', {
    className: 'roll-on-hud-progress roll-on-hud-progress-horizontal',
    dataset: { field: 'route-progress' },
    ariaLabel: 'Route progress',
    max: 1,
    value: 0,
  });
  const routeProgressText = value('route-progress-text', 'roll-on-hud-route-percent', '0%');
  const distanceTraveled = value('distance-traveled', 'roll-on-hud-route-value', '0.0 mi');
  const routeWell = instrumentWell('route', 'ROUTE', [
    labelledReading('LEFT', distanceRemaining),
    h('div', { className: 'roll-on-hud-route-progress' }, [routeProgress, routeProgressText]),
    labelledReading('TRAVELED', distanceTraveled),
  ]);

  const instruments = h('dl', { className: 'roll-on-hud-instruments' }, [
    speedWell,
    fuelWell,
    cargoWell,
    runWell,
    routeWell,
  ]);

  const stage = value('stage', 'roll-on-hud-stage', 'STAGE 1');
  const status = h('span', {
    className: 'roll-on-hud-status',
    dataset: { field: 'status', status: 'driving' },
    role: 'status',
    ariaLive: 'polite',
    ariaAtomic: 'true',
    textContent: 'DRIVING',
  });
  const takedowns = value('rage', 'roll-on-hud-rage-value', '0');
  const rage = h('span', { className: 'roll-on-hud-rage' }, [
    h('span', { className: 'roll-on-hud-sublabel', textContent: 'RAGE' }),
    takedowns,
  ]);
  const event = h('output', {
    className: 'roll-on-hud-event',
    dataset: { field: 'event', visible: 'false' },
    ariaLive: 'polite',
    ariaAtomic: 'true',
    textContent: '',
  });
  const messages = h('div', { className: 'roll-on-hud-messages' }, [stage, status, rage, event]);

  const root = h(
    'section',
    {
      className: 'roll-on-hud',
      ariaLabel: 'Driving status',
      dataset: { unitSystem: 'imperial', cargoSeverity: 'intact', fumes: 'false' },
    },
    [instruments, messages]
  );

  return {
    root,
    update(snapshot) {
      root.dataset.unitSystem = snapshot.unitSystem;
      root.dataset.cargoSeverity = snapshot.cargoIntegritySeverity;
      root.dataset.fumes = String(snapshot.isFuelInFumes);

      speedValue.textContent = snapshot.speedText;
      speedValue.ariaLabel = `${snapshot.speedText} ${snapshot.speedUnitText}`;
      speedUnit.textContent = snapshot.speedUnitText;
      cruiseSpeed.textContent = snapshot.cruiseSpeedText;
      cruiseSpeed.ariaLabel = `Cruise target ${snapshot.cruiseSpeedText} ${snapshot.speedUnitText}`;
      cruiseSpeedUnit.textContent = snapshot.speedUnitText;

      fuelValue.textContent = snapshot.fuelPercentText;
      fuelValue.ariaLabel = `${snapshot.fuelStatusText} ${snapshot.fuelPercentText}`;
      fuelStatus.textContent = snapshot.fuelStatusText;
      fuelLevel.value = snapshot.fuelLevel;
      fuelLevel.ariaValueText = snapshot.fuelPercentText;
      fuelWell.dataset.state = snapshot.isFuelInFumes ? 'fumes' : 'normal';

      cargoValue.textContent = snapshot.cargoIntegrityText;
      cargoValue.ariaLabel = `Cargo integrity ${snapshot.cargoIntegrityText}, ${snapshot.cargoIntegritySeverity}`;
      cargoStatus.textContent = snapshot.cargoIntegritySeverity.toUpperCase();
      cargoLevel.value = snapshot.cargoIntegrityLevel;
      cargoLevel.ariaValueText = snapshot.cargoIntegrityText;
      cargoWell.dataset.state = snapshot.cargoIntegritySeverity;

      elapsedTime.textContent = snapshot.elapsedTimeText;
      score.textContent = snapshot.scoreText;

      distanceRemaining.textContent = snapshot.distanceRemainingText;
      routeProgress.value = snapshot.routeProgress;
      routeProgress.ariaValueText = snapshot.routeProgressText;
      routeProgressText.textContent = snapshot.routeProgressText;
      distanceTraveled.textContent = snapshot.distanceTraveledText;

      stage.textContent = snapshot.stageText;
      takedowns.textContent = snapshot.takedownsText;
      status.textContent = snapshot.statusText;
      status.dataset.status = snapshot.statusText.toLowerCase().replaceAll(' ', '-');
      event.textContent = snapshot.eventText;
      event.dataset.visible = String(snapshot.eventText.length > 0);
    },
  };
}

function instrumentWell(name: string, label: string, body: HTMLElement[]): HTMLDivElement {
  return h(
    'div',
    {
      className: `roll-on-hud-instrument roll-on-hud-${name}`,
      dataset: { instrument: name },
    },
    [
      h('dt', { className: 'roll-on-hud-instrument-label', textContent: label }),
      h('dd', { className: 'roll-on-hud-instrument-body' }, body),
    ]
  );
}

function labelledReading(label: string, reading: HTMLElement): HTMLDivElement {
  return h('div', { className: 'roll-on-hud-labelled-reading' }, [
    h('span', { className: 'roll-on-hud-sublabel', textContent: label }),
    reading,
  ]);
}

function value(field: string, className: string, textContent: string): HTMLSpanElement {
  return h('span', { className, dataset: { field }, textContent });
}
