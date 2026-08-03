/**
 * Node module-resolution hooks for `node --test`.
 *
 * App source imports with browser-absolute specifiers ending in `.js`
 * (`/src/game/truck.js`) because that is what the browser loads out of `dist/`.
 * Tests run the TypeScript sources directly under Node's type stripping, so a
 * bare `/src/...` would be resolved against the filesystem root.
 *
 * Until this slice every such import was `import type`, erased before runtime,
 * so nothing needed resolving. M5 introduces real cross-module value imports
 * (world geometry, the rigid-body solver, route geometry), so the mapping has
 * to exist for real.
 */

const projectRoot = new URL('../', import.meta.url);

const BROWSER_ABSOLUTE_PREFIXES = ['/src/', '/components/'];

export function resolve(specifier, context, nextResolve) {
  if (BROWSER_ABSOLUTE_PREFIXES.some(prefix => specifier.startsWith(prefix))) {
    const sourcePath = specifier.replace(/^\//, '').replace(/\.js$/, '.ts');
    return nextResolve(new URL(sourcePath, projectRoot).href, context);
  }
  return nextResolve(specifier, context);
}
