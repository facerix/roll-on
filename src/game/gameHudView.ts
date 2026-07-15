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
  const topSpeed = h('span', { className: 'roll-on-hud-value', textContent: '0%' });
  const cargo = h('span', { className: 'roll-on-hud-value', textContent: '100%' });
  const fuel = h('span', { className: 'roll-on-hud-value', textContent: '100%' });
  const fuelFill = h('span', { className: 'roll-on-hud-fuel-fill' });
  const fuelGauge = h('span', { className: 'roll-on-hud-fuel-gauge' }, [fuelFill]);
  const distance = h('span', { className: 'roll-on-hud-value', textContent: '0 m' });
  const status = h('span', { className: 'roll-on-hud-status', textContent: 'DRIVING' });

  const root = h('section', { className: 'roll-on-hud', ariaLabel: 'Driving status' }, [
    h('div', { className: 'roll-on-hud-brand', textContent: 'ROLL ON' }),
    h('div', { className: 'roll-on-hud-speed' }, [
      speedValue,
      h('div', { className: 'roll-on-hud-speed-meta' }, [speedUnit, speedMetric]),
    ]),
    h('dl', { className: 'roll-on-hud-readouts' }, [
      h('div', { className: 'roll-on-hud-readout' }, [
        h('dt', { textContent: 'Top' }),
        h('dd', {}, [topSpeed]),
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
    ]),
    status,
  ]);

  return {
    root,
    update(snapshot) {
      speedValue.textContent = snapshot.speedMphText;
      speedMetric.textContent = snapshot.speedMetersPerSecondText;
      topSpeed.textContent = snapshot.topSpeedPercentText;
      cargo.textContent = snapshot.cargoIntegrityText;
      fuel.textContent = snapshot.fuelPercentText;
      fuelFill.style.transform = `scaleX(${snapshot.fuelLevel})`;
      fuelGauge.dataset.fumes = String(snapshot.isFuelInFumes);
      distance.textContent = snapshot.distanceText;
      status.textContent = snapshot.isFuelInFumes ? snapshot.fuelStatusText : snapshot.statusText;
      status.dataset.status = snapshot.isFuelInFumes ? 'fumes' : snapshot.statusText.toLowerCase();
    },
  };
}
