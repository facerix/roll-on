import { h } from '/src/domUtils.js';
import { installTitleScreenStartHandlers } from '/src/game/titleScreen.js';

const CSS = `
  :host {
    position: fixed;
    inset: 0;
    z-index: 0;
    display: block;
    overflow: auto;
    min-height: 100vh;
    max-height: 100vh;
  }

  :host([hidden]) {
    display: none;
  }

  * {
    box-sizing: border-box;
  }

  .title-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    min-height: 100vh;
    max-height: 100vh;
    padding: 0 0 15vh;
    background-color: #000;
    background-image:
      url('/images/title.jpg'),
      radial-gradient(ellipse at 50% 50%, #151839 0%, #0c0c2e 32%, #000 68%);
    background-position: center, center;
    background-size: contain, cover;
    background-repeat: no-repeat, no-repeat;
    image-rendering: pixelated;
    cursor: pointer;
  }

  .start-hint {
    font-family: 'BigSquareDots', 'Courier New', Courier, monospace;
    font-size: 4.5rem;
    letter-spacing: 0.25em;
    text-align: center;
    text-transform: uppercase;
    color: #e88a2a;
    text-shadow:
      -2px -2px 0 #000,
      2px -2px 0 #000,
      -2px 2px 0 #000,
      2px 2px 0 #000,
      0 0 14px rgba(0, 0, 0, 0.85),
      0 0 8px rgba(232, 138, 42, 0.6);
    margin: 0;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  /* Portrait-oriented devices: use the taller crop, less letterboxing */
  @media (orientation: portrait) {
    .title-shell {
      background-image:
        url('/images/title-portrait.jpg'),
        radial-gradient(ellipse at 50% 50%, #151839 0%, #0c0c2e 32%, #000 68%);
    }
  }

  /* Small devices (phones, 575px and under) */
  @media (max-width: 575px) {
    .title-shell {
      padding-bottom: 8vh;
    }

    .start-hint {
      font-size: 2.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .start-hint {
      animation: none;
    }
  }
`;

export class TitleScreen extends HTMLElement {
  #disposeHandlers: (() => void) | null = null;
  #titleScreen: HTMLElement | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });

    this.#titleScreen = h(
      'main',
      { className: 'title-shell', role: 'button', tabIndex: 0, ariaLabel: 'Start game' },
      [h('p', { className: 'start-hint', textContent: 'Press Start' })]
    );

    root.appendChild(h('style', { textContent: CSS }));
    root.appendChild(this.#titleScreen);
  }

  disconnectedCallback(): void {
    this.hide();
  }

  show(): void {
    if (this.#disposeHandlers) {
      return;
    }

    this.hidden = false;
    this.ariaHidden = 'false';
    this.#disposeHandlers = installTitleScreenStartHandlers({
      activationTarget: this.#titleScreen!,
      keyboardTarget: window,
      onStart: () => {
        this.dispatchEvent(
          new CustomEvent('title-select', {
            bubbles: true,
            composed: true,
          })
        );
      },
    });
  }

  hide(): void {
    this.#disposeHandlers?.();
    this.#disposeHandlers = null;
    this.hidden = true;
    this.ariaHidden = 'true';
  }
}

customElements.define('title-screen', TitleScreen);

declare global {
  interface HTMLElementTagNameMap {
    'title-screen': TitleScreen;
  }
}
