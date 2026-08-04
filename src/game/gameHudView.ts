import { h } from '/src/domUtils.js';
import type { GameHudSnapshot } from '/src/game/gameHud.js';

export interface GameHudView {
  readonly root: HTMLElement;
  update(snapshot: GameHudSnapshot): void;
}

export function createGameHudView(): GameHudView {
  const speedValue = h('span', { className: 'roll-on-hud-speed-value', textContent: '0' });
  const speedUnit = h('span', { className: 'roll-on-hud-speed-unit', textContent: 'MPH' });
  const speedMetric = h('span', { className: 'roll-on-hud-subvalue', textContent: '0.0 m/s' });
  const cruiseSpeed = h('span', { className: 'roll-on-hud-value', textContent: '0' });
  const cargo = h('span', { className: 'roll-on-hud-value', textContent: '100%' });
  const fuel = h('span', { className: 'roll-on-hud-value', textContent: '100%' });
  const fuelFill = h('span', { className: 'roll-on-hud-fuel-fill' });
  const fuelGauge = h('span', { className: 'roll-on-hud-fuel-gauge' }, [fuelFill]);
  const distance = h('span', { className: 'roll-on-hud-value', textContent: '0 m' });
  const routeProgress = h('span', { className: 'roll-on-hud-value', textContent: '0%' });
  const score = h('span', { className: 'roll-on-hud-value', textContent: '0' });
  const takedowns = h('span', { className: 'roll-on-hud-value', textContent: '0' });
  const status = h('span', {
    className: 'roll-on-hud-status',
    role: 'status',
    ariaLive: 'polite',
    textContent: 'DRIVING',
  });
  const event = h('output', {
    className: 'roll-on-hud-event',
    ariaLive: 'polite',
    textContent: '',
  });

  const root = h('section', { className: 'roll-on-hud', ariaLabel: 'Driving status' }, [
    h('div', { className: 'roll-on-hud-brand', textContent: 'ROLL ON' }),
    h('div', { className: 'roll-on-hud-speed' }, [
      speedValue,
      h('div', { className: 'roll-on-hud-speed-meta' }, [speedUnit, speedMetric]),
    ]),
    h('dl', { className: 'roll-on-hud-readouts' }, [
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Cruise' }),
        h('dd', {}, [
          cruiseSpeed,
          h('span', { className: 'roll-on-hud-unit', textContent: ' mph' }),
        ]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Cargo' }),
        h('dd', {}, [cargo]),
      ]),
      h('div', { className: 'roll-on-hud-readout roll-on-hud-fuel' }, [
        h('dt', { textContent: 'Fuel' }),
        h('dd', {}, [fuel, fuelGauge]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Run' }),
        h('dd', {}, [distance]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Route' }),
        h('dd', {}, [routeProgress]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Score' }),
        h('dd', {}, [score]),
      ]),
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Rage' }),
        h('dd', {}, [takedowns]),
      ]),
    ]),
    status,
    event,
  ]);

  return {
    root,
    update(snapshot) {
      speedValue.textContent = snapshot.speedMphText;
      speedMetric.textContent = snapshot.speedMetersPerSecondText;
      cruiseSpeed.textContent = snapshot.cruiseSpeedMphText;
      cargo.textContent = snapshot.cargoIntegrityText;
      fuel.textContent = snapshot.fuelPercentText;
      fuelFill.style.transform = `scaleX(${snapshot.fuelLevel})`;
      fuelGauge.dataset.fumes = String(snapshot.isFuelInFumes);
      distance.textContent = snapshot.distanceText;
      routeProgress.textContent = snapshot.routeProgressText;
      score.textContent = snapshot.scoreText;
      takedowns.textContent = snapshot.takedownsText;
      status.textContent = snapshot.statusText;
      status.dataset.status = snapshot.statusText.toLowerCase().replaceAll(' ', '-');
      event.textContent = snapshot.eventText;
      event.dataset.visible = String(snapshot.eventText.length > 0);
    },
  };
}
