# AGENTS.md

Agent-specific guidance. See [README.md](README.md) for project overview, architecture, and coding standards.

## TypeScript

The project is TypeScript, compiled with `tsc` (no bundler) to `dist/`. `live-server` serves `dist/` as the web root in dev. Key conventions:

- `moduleResolution: "bundler"`, `strict: true`, `verbatimModuleSyntax: true`
- **Import specifiers use `.js`**, not `.ts` — they refer to the compiled output the browser loads (e.g. `import { h } from '/src/domUtils.js'`). The TS compiler resolves the `.ts` source. The one exception: files under `tests/` import `.ts` directly so `node --test` can run them without a build step.
- Cross-cutting ambient types (the window-scoped `serviceWorkerManager`, custom `WindowEventMap` entries) live in `src/globals.d.ts`. Per-component `HTMLElementTagNameMap` augmentations live in each component's own `.ts` file, right next to the `customElements.define()` call, so the registration and its type entry can't drift apart.

## Critical Patterns

### DataStore
```typescript
import DataStore from '/src/DataStore.js';

DataStore.addEventListener('change', evt => {
  const { changeType, items } = (evt as CustomEvent).detail;
  // changeType: "init" | "add" | "update" | "delete"
});

const items = DataStore.items;
DataStore.updateItem(item);
```

### DOM Creation
```typescript
import { h } from '/src/domUtils.js';

// Always use h() — never createElement directly.
// h() is generic over the tag name, so the return type is HTMLDivElement here.
const el = h('div', { className: 'foo', id: '123' }, [child1, child2]);

// h() doesn't allow inline dataset manipulation, do it using the JS APIs
el.dataset.id = '456';
```

### Web Components
- `/components/` directory
- Shadow DOM, `<style>` tag, kebab-case tags
- At the bottom of the component file, do **both** in sequence:
  ```typescript
  customElements.define('foo-bar', FooBar);

  declare global {
    interface HTMLElementTagNameMap {
      'foo-bar': FooBar;
    }
  }
  ```
  The augmentation block is what makes `document.querySelector('foo-bar')` return `FooBar | null` instead of generic `Element | null`. Keeping it adjacent to the `define()` call prevents drift.

## Important Files

| File | Purpose |
|------|---------|
| `src/DataStore.ts` | Central data store (localStorage) |
| `src/domUtils.ts` | `h()` helper, `isDevelopmentMode()` |
| `src/ServiceWorkerManager.ts` | Service worker lifecycle |
| `src/uuid.ts` | Thin wrapper over `crypto.randomUUID()` |
| `src/globals.d.ts` | Cross-cutting ambient types (`Window.serviceWorkerManager`, `WindowEventMap` for SW events). Per-component tag-name-map entries live in each component file. |
| `sw-core.js` | Shared service worker logic (hand-authored JS, not compiled) |
| `sw.js` | Production service worker (hand-authored JS) |
| `sw-dev.js` | Development service worker (hand-authored JS) |
| `tsconfig.json` | Build config |
| `tsconfig.tests.json` | Type-check-only config for `tests/` |
| `scripts/copy-assets.mjs` | Copies static files into `dist/` |

## Event Reference

```
DataStore ('change' event)
  └── detail: { changeType, items, affectedRecords }
      └── changeType: 'init' | 'add' | 'update' | 'delete'

Window (dispatched by ServiceWorkerManager — typed in src/globals.d.ts)
  ├── 'sw-update-available'  → detail: { registration, pendingWorker }
  └── 'sw-update-progress'   → detail: { status }

UpdateNotification (dispatched by component)
  ├── 'update-notification-shown'
  ├── 'update-notification-hidden'
  ├── 'update-accepted'
  └── 'update-dismissed'
```

## Naming Conventions

| Type | Convention | Examples |
|------|------------|---------|
| HTML files | lowercase | `index.html` |
| TS modules | camelCase | `domUtils.ts`, `uuid.ts` |
| Classes | PascalCase | `DataStore`, `ServiceWorkerManager` |
| Components | PascalCase | `UpdateNotification.ts` |
| Web Component tags | kebab-case | `<update-notification>` |
| CSS utility classes | `u-` prefix | `.u-flex`, `.u-hidden` |
| Private fields | `#` prefix | `#items`, `#isRegistered` |
| Constants | UPPER_SNAKE | `CACHE_VERSION`, `LOG_PREFIX` |

## Common Tasks

**Adding an item:** Create object → `DataStore.addItem()` → listen for "change" to re-render.

**Adding a new static asset (image, font, etc.):** drop it in the repo, then add its path to **two** places: `scripts/copy-assets.mjs` (so dev/build copies it into `dist/`) and `sw-core.js` `getStaticAssets()` (so it's cached offline). The chokidar glob in `package.json` `dev:assets` already covers common extensions in the repo root.

**Adding a new Web Component:** create `components/Foo.ts`, call `customElements.define('foo-bar', Foo)` at the bottom, and immediately follow it with a `declare global { interface HTMLElementTagNameMap { 'foo-bar': Foo } }` block in the same file. See the Web Components pattern above.

**Service Worker:** Automatically detects dev mode via `isDevelopmentMode()` in `domUtils.ts`. SW files are not compiled — edit them directly.

## Things to Avoid

1. ❌ Frameworks (React, Vue, etc.)
2. ❌ Using `createElement` (use `h()`)
3. ❌ Bypassing DataStore for data operations
4. ❌ Adding heavy dependencies without approval
5. ❌ Relative import paths in app source — always use absolute paths starting with `/`
   ```typescript
   import { h } from '/src/domUtils.js'; // ✓
   import { h } from 'src/domUtils.js';  // ✗ — breaks as a module
   ```
   (Tests are the exception — they use relative paths and `.ts` extension.)
6. ❌ Editing files in `dist/` — it's regenerated on every build.

## Testing

Run `pnpm test` (typecheck + `node --test`). Tests live in `tests/`, import source with relative paths and the `.ts` extension, and run directly under Node 24's built-in type stripping (no compile step).

For manual UI testing: use @Browser at `http://localhost:8080` (assume `pnpm dev` is already running). Verify UI, interactions, console, service worker.

## Checklist

**Before:** Offline support? DataStore? Using `h()`? New component has its `HTMLElementTagNameMap` augmentation next to its `customElements.define()` call?

**After:** `pnpm format` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → fix issues → manual browser check
