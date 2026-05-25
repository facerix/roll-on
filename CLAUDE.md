# Roll On

An experimental 18-wheeler driving game — arcade-style, built as a vanilla-TS Progressive Web App.

## Domain

- **Genre**: Arcade driving game. The player controls an 18-wheeler truck navigating roads/highways.
- **Art style**: Retro pixel-art aesthetic inspired by late-80s arcade cabinets.
- **Data model**: Game state is persisted to localStorage under the key `scores`. The `DataStore` singleton manages persistence and emits `change` events.
- **Key concepts**: Driving physics, road/terrain rendering, score tracking, high scores.

## Coding Standards

- TypeScript compiled with `tsc` (no bundler). Output goes to `dist/`.
- Import specifiers use `.js` extensions (referring to compiled output). Tests use `.ts` directly.
- DOM creation uses `h()` from `/src/domUtils.js` — never `createElement` directly.
- Web Components live in `/components/`, use Shadow DOM, kebab-case tags, and pair `customElements.define()` with `HTMLElementTagNameMap` augmentation.
- Absolute import paths (`/src/...`) in app source; relative paths only in tests.
- No frameworks, no heavy dependencies without approval.

## Dev Server

`pnpm start` — tsc watch + asset-copy watcher + live-server on port 8018.
