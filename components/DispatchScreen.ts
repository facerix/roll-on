import { h } from '/src/domUtils.js';
import { installDispatchScreenHandlers, type DispatchMode } from '/src/game/dispatchScreen.js';
import type { HighScoreTablePresentation } from '/src/game/runResults.js';

interface DispatchOptionPresentation {
  readonly mode: DispatchMode;
  readonly label: string;
  readonly subtitle: string;
  readonly image: string;
}

export interface DispatchSelectEventDetail {
  readonly mode: DispatchMode;
}

export interface DispatchHighScores {
  readonly campaign: HighScoreTablePresentation;
  readonly challenge: HighScoreTablePresentation;
}

const OPTIONS: readonly DispatchOptionPresentation[] = [
  {
    mode: 'campaign',
    label: 'Coast to Coast',
    subtitle: 'ARCADE / CAMPAIGN',
    image: '/images/campaign.png',
  },
  {
    mode: 'challenge',
    label: 'Endless Blacktop',
    subtitle: 'ENDLESS / ROGUELITE',
    image: '/images/challenge.png',
  },
];

const CSS = `
  :host {
    position: fixed;
    inset: 0;
    z-index: 5;
    display: block;
    overflow: auto;
    color: #fff8cf;
    background-color: #02020b;
    background-image:
      radial-gradient(circle at 18% 22%, rgba(156, 59, 125, 0.2) 0, transparent 30%),
      radial-gradient(circle at 82% 30%, rgba(38, 101, 171, 0.2) 0, transparent 32%),
      radial-gradient(ellipse at 50% 55%, #17153a 0%, #090923 42%, #010106 76%);
    image-rendering: pixelated;
  }

  :host([hidden]) {
    display: none;
  }

  * {
    box-sizing: border-box;
  }

  .dispatch-shell {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2rem, 6vh, 4.5rem);
    padding: max(2rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      max(2rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  }

  .dispatch-title {
    display: block;
    width: min(70vw, 40rem);
    height: auto;
  }

  .dispatch-options {
    width: min(72rem, 94vw);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: clamp(1.25rem, 4vw, 4rem);
    outline: none;
  }

  .dispatch-option {
    --frame-light: #fff0a8;
    --frame-mid: #ffb52d;
    --frame-dark: #943c15;
    --frame-glow: rgba(255, 164, 43, 0.72);
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: clamp(1.5rem, 4vw, 3.5rem);
    padding: clamp(1.5rem, 3vw, 3rem) clamp(1rem, 3vw, 2.5rem) clamp(1rem, 2vw, 1.75rem);
    border: clamp(4px, 0.55vw, 8px) solid transparent;
    border-radius: clamp(0.65rem, 1.5vw, 1.15rem);
    background:
      linear-gradient(180deg, rgba(7, 8, 34, 0.98), rgba(2, 2, 16, 0.98)) padding-box,
      linear-gradient(145deg, var(--frame-light) 0%, var(--frame-mid) 37%, var(--frame-dark) 100%)
        border-box;
    box-shadow:
      inset 0 0 0 2px rgba(255, 247, 203, 0.12),
      inset 0 0 1.5rem rgba(255, 161, 37, 0.08),
      0 0 0 2px rgba(0, 0, 0, 0.9),
      0 0 0.75rem rgba(255, 162, 36, 0.18);
    color: #fff2a8;
    font: inherit;
    cursor: pointer;
    appearance: none;
    transition:
      transform 120ms ease-out,
      box-shadow 120ms ease-out,
      filter 120ms ease-out;
  }

  .dispatch-option::before {
    content: '';
    position: absolute;
    inset: 0.35rem;
    border: 1px solid color-mix(in srgb, var(--frame-light) 58%, transparent);
    border-radius: calc(clamp(0.65rem, 1.5vw, 1.15rem) - 0.25rem);
    pointer-events: none;
  }

  .dispatch-option.challenge {
    --frame-light: #c7fbff;
    --frame-mid: #48cfff;
    --frame-dark: #513db4;
    --frame-glow: rgba(75, 205, 255, 0.72);
    color: #bff5ff;
    box-shadow:
      inset 0 0 0 2px rgba(216, 251, 255, 0.12),
      inset 0 0 1.5rem rgba(70, 196, 255, 0.08),
      0 0 0 2px rgba(0, 0, 0, 0.9),
      0 0 0.75rem rgba(72, 199, 255, 0.18);
  }

  .dispatch-option:hover,
  .dispatch-option:focus-visible,
  .dispatch-options:focus-visible .dispatch-option.is-highlighted {
    outline: none;
    transform: translateY(-3px);
    filter: saturate(1.12) brightness(1.08);
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.24),
      inset 0 0 2.25rem var(--frame-glow),
      0 0 0 2px rgba(0, 0, 0, 0.95),
      0 0 0.65rem var(--frame-light),
      0 0 1.8rem var(--frame-glow),
      0 0 3.5rem color-mix(in srgb, var(--frame-glow) 52%, transparent);
  }

  .dispatch-option-art {
    display: block;
    width: min(100%, 30rem);
    height: auto;
    margin: auto;
    pointer-events: none;
    image-rendering: pixelated;
  }

  .dispatch-option-subtitle {
    position: relative;
    margin: 0;
    color: currentColor;
    font-family: 'BigSquareDots', 'Courier New', Courier, monospace;
    font-size: clamp(0.8rem, 1.55vw, 1.15rem);
    letter-spacing: 0.05em;
    line-height: 1.2;
    text-align: center;
    text-transform: uppercase;
    text-shadow: 0 0 0.65rem var(--frame-glow);
  }

  .dispatch-high-scores {
    width: min(54rem, 94vw);
    color: #fff8cf;
    font-family: 'BigSquareDots', 'Courier New', Courier, monospace;
  }

  .dispatch-high-scores > h2 {
    margin: 0 0 0.75rem;
    font-size: clamp(0.9rem, 1.8vw, 1.25rem);
    letter-spacing: 0.16em;
    text-align: center;
  }

  .dispatch-score-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .dispatch-score-channel {
    padding: 0.75rem 1rem;
    border: 2px solid #ffb52d;
    background: rgba(2, 2, 16, 0.86);
  }

  .dispatch-score-channel.challenge {
    border-color: #48cfff;
  }

  .dispatch-score-channel h3,
  .dispatch-score-channel p {
    margin: 0;
    font-size: 0.72rem;
    text-align: center;
  }

  .dispatch-score-channel ol {
    margin: 0;
    padding-left: 2rem;
  }

  .dispatch-score-channel li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    margin-top: 0.35rem;
    font-size: 0.68rem;
  }

  .dispatch-score-channel small {
    color: #b6c8c6;
    font: inherit;
  }

  @media (max-width: 720px) {
    .dispatch-shell {
      justify-content: flex-start;
      gap: 1.5rem;
    }

    .dispatch-title {
      width: min(84vw, 32rem);
    }

    .dispatch-options {
      width: min(34rem, 92vw);
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    .dispatch-option {
      gap: 1rem;
      padding-block: 1.25rem 1rem;
    }

    .dispatch-option-art {
      width: min(82%, 24rem);
    }

    .dispatch-score-columns {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dispatch-option {
      transition: none;
    }
  }
`;

export class DispatchScreen extends HTMLElement {
  readonly #optionElements: readonly HTMLButtonElement[];
  readonly #optionList: HTMLDivElement;
  readonly #highScores: HTMLElement;
  #disposeHandlers: (() => void) | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });

    this.#optionElements = OPTIONS.map(option =>
      h(
        'button',
        {
          className: `dispatch-option ${option.mode}`,
          id: `dispatch-option-${option.mode}`,
          type: 'button',
          role: 'option',
          tabIndex: -1,
          ariaSelected: 'false',
          dataset: { mode: option.mode },
        },
        [
          h('img', {
            className: 'dispatch-option-art',
            src: option.image,
            alt: option.label,
          }),
          h('span', {
            className: 'dispatch-option-subtitle',
            textContent: option.subtitle,
          }),
        ]
      )
    );

    this.#optionList = h(
      'div',
      {
        className: 'dispatch-options',
        role: 'listbox',
        tabIndex: 0,
        ariaLabel: 'Select a game mode',
      },
      [...this.#optionElements]
    );
    this.#highScores = h('section', {
      className: 'dispatch-high-scores',
      ariaLabel: 'High scores by game mode',
    });

    root.appendChild(h('style', { textContent: CSS }));
    root.appendChild(
      h('main', { className: 'dispatch-shell', ariaLabel: 'Dispatch' }, [
        h('img', {
          className: 'dispatch-title',
          src: '/images/dispatch.png',
          alt: 'Dispatch',
        }),
        this.#optionList,
        this.#highScores,
      ])
    );

    this.hidden = true;
    this.ariaHidden = 'true';
  }

  disconnectedCallback(): void {
    this.hide();
  }

  show(): void {
    if (this.#disposeHandlers) {
      this.#optionList.focus();
      return;
    }

    this.hidden = false;
    this.ariaHidden = 'false';
    this.#disposeHandlers = installDispatchScreenHandlers({
      options: OPTIONS.map((option, index) => ({
        mode: option.mode,
        activationTarget: this.#optionElements[index]!,
      })),
      keyboardTarget: this.#optionList,
      onHighlight: (_mode, index) => this.#highlight(index),
      onSelect: mode => {
        this.dispatchEvent(
          new CustomEvent<DispatchSelectEventDetail>('dispatch-select', {
            bubbles: true,
            composed: true,
            detail: { mode },
          })
        );
      },
      onBack: () => {
        this.#disposeHandlers = null;
        this.dispatchEvent(
          new CustomEvent('dispatch-back', {
            bubbles: true,
            composed: true,
          })
        );
      },
    });
    this.#optionList.focus();
  }

  hide(): void {
    this.#disposeHandlers?.();
    this.#disposeHandlers = null;
    this.hidden = true;
    this.ariaHidden = 'true';
  }

  setHighScores(tables: DispatchHighScores): void {
    if (tables.campaign.channel !== 'campaign' || tables.challenge.channel !== 'challenge') {
      throw new TypeError('Dispatch high-score tables do not match their channels');
    }
    this.#highScores.replaceChildren(
      h('h2', { textContent: 'HIGH SCORES' }),
      h('div', { className: 'dispatch-score-columns' }, [
        this.#renderScoreTable(tables.campaign),
        this.#renderScoreTable(tables.challenge),
      ])
    );
  }

  #highlight(index: number): void {
    this.#optionElements.forEach((element, elementIndex) => {
      const highlighted = elementIndex === index;
      element.classList.toggle('is-highlighted', highlighted);
      element.ariaSelected = String(highlighted);
    });
    this.#optionList.setAttribute('aria-activedescendant', this.#optionElements[index]!.id);
  }

  #renderScoreTable(table: HighScoreTablePresentation): HTMLElement {
    const content = table.emptyMessage
      ? h('p', { textContent: table.emptyMessage })
      : h(
          'ol',
          {},
          table.rows.map(row =>
            h('li', {}, [
              h('span', { textContent: `#${row.rank}` }),
              h('span', { textContent: row.scoreText }),
              h('small', { textContent: row.detailText }),
            ])
          )
        );
    return h(
      'section',
      {
        className: `dispatch-score-channel ${table.channel}`,
        ariaLabel: `${table.heading} high scores`,
      },
      [h('h3', { textContent: table.heading }), content]
    );
  }
}

customElements.define('dispatch-screen', DispatchScreen);

declare global {
  interface HTMLElementTagNameMap {
    'dispatch-screen': DispatchScreen;
  }
}
