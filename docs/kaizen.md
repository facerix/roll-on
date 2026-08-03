# 改善 — Open Questions & Deferred Work

The standard we walk by is the standard we accept. This file is where we *record* things we deliberately chose not to fix yet, so they're not silently abandoned.

Add a new entry whenever we punt on something. Each entry: what, why deferred, when to revisit.

---

## Open design questions

- **Difficulty curve shape**: linear ramp vs. wave pattern (lulls between intensity spikes)? Resolve
  from the M6.5 Stage 1 timeline playtest.
- **Run length target**: M3 uses a prototype target of about 135 seconds at efficient cruise before
  an empty tank. The final "good" Stage 1 run length is still open because enemy density, finish
  distance, and scoring pressure arrive in later milestones. Revisit during Milestone 6.
- **Permadeath vs. continues**: arcade tradition is continues with score reset penalty. Design doc
  is silent. Resolve before the M6.5 completion lifecycle lands.
- **Score formula precise weights**: §6 of the design doc gives the formula but no coefficients. M4
  uses prototype weights (10 points/meter, 2,000 integrity multiplier, 250/takedown); tune during
  the M6 finish-tally playtest.
- **Touch control ergonomics**: the pad layout (steer arrows at left/right centre, brake+gas centred
  along the bottom, horn in the bottom-left corner) is a first pass that has NOT been played on a
  real device yet. Open: whether steering wants held arrows at all versus a drag-anywhere lane
  slider, and whether the horn's corner placement survives contact with actual thumbs. Revisit after
  the first phone playtest.
- **Horn mechanics**: the `horn` action is bound (Space, plus a touch button) but does nothing.
  Stubbed deliberately so the input surface is complete; decide what it does — scatter traffic?
  bait patrol? — during M6.5, or explicitly defer it beyond the Stage 1 MVP.

## Deferred technical work

- **WebGL renderer backend**: M6 uses Canvas 2D for the fixed stage, depth presentation, Stage 1 art,
  and basic effects. Revisit only when measured frame time, memory, or more than roughly 200 LOC of
  effect-specific compositing demonstrates a need for shader-based CRT, scanlines, bloom, palette
  cycling, or Fumes flicker. Hard requirement: the `Renderer` seam keeps the swap bounded.
- **Audio engine**: WebAudio for engine rumble (continuous, speed-modulated pitch). Don't build until the truck feel is locked — audio tuning depends on physics tuning. SFX placeholder via short WebAudio synth blips during Milestones 1–4.
- **Gamepad API support**: arcade game wants a gamepad. Keyboard-only is fine for prototyping; wire gamepad before any public playtest.
- **Asset pipeline**: M6 starts with individual PNGs through the existing copy/cache paths. Revisit
  an atlas build step only after measured asset count, request behavior, or draw overhead justifies
  it during M6.3.
- **Replay / determinism**: fixed-step loop in Milestone 0 keeps replays *possible*. Actual replay recording and ghost-runs deferred. (RNG seeding is resolved — see below.)
- **Service worker caching of game assets**: resolve the static-art cache policy during M6.3 as the
  Stage 1 asset set lands; new art must not be online-only by accident.

## Minor follow-ups

- **Dual rAF loops in the smoke build**: `FixedStepLoop` runs its own rAF for game ticks; `mountGame` runs a separate rAF for the FPS meter (because the loop doesn't currently surface real-dt to its caller). Two ~60Hz callbacks where one would do. Cheap but redundant. Fix path: add an `onTick(realDt)` hook to `FixedStepLoop`, route the FPS meter through it, and drop the mount's rAF.
- **Lint rule banning `Math.random()` in game code**: pending. Game code must pull from `Rng` (passed in by construction) for determinism. One stray `Math.random()` silently breaks replay. Add as an oxlint rule or a grep-based test when convenient.
- **Canvas context-loss recovery**: `imageSmoothingEnabled` is set once at construction. Browsers can reset context state on `webglcontextlost`/-equivalents; for Canvas 2D this is rare but possible. Revisit if we see smoothing creep back on.
- **Development service-worker module skew**: the M4 browser pass caught one startup where the
  stale-while-refresh strategy served a cached `gameHud.ts` build beside a fresh `gameHudView.ts`
  build. A reload used the refreshed cache and clean runs were stable, but dev should never execute
  a mixed module graph. Revisit by making refreshable development resources network-first (with
  cache fallback) or versioning each watch build as one atomic cache generation. **M6 preflight**:
  resolve this before visual iteration; stale/fresh module mixtures invalidate screenshot and
  playtest evidence.

## Risks to monitor

- **Vertical-slice trap**: the slice might feel fun-enough to start adding content too early. Discipline: don't start Stage 2 until Stage 1 ships *and* one outside person plays it.
- **Aesthetic ambition vs. Canvas 2D ceiling**: the design doc's neon/CRT look may push Canvas 2D past comfortable. If we find ourselves writing more than ~200 LOC of compositing tricks for one effect, that's the signal to do the WebGL swap.
- **Fractional display scaling**: the `384 × 576` source grid is fixed, but responsive fit sometimes
  requires fractional CSS scaling or downscaling. `image-rendering: pixelated` avoids linear blur,
  but some devices may show uneven physical pixel widths. Verify representative DPR/viewport pairs
  during M6.1 before considering a second fixed resolution profile.
- **`DataStore` schema churn**: deferred — during prototyping we accept tearing down localStorage and starting fresh whenever the shape changes. Revisit once gameplay stabilizes and real player data is at stake; at that point we want explicit version tags and crash-on-unknown-version (per directive: crashing > corruption).

## Resolved (move entries here when decided, with the decision)

- **Fixed pixel stage with responsive presentation** (2026-08-03): the complete game composition
  uses one `384 × 576` (`2:3`) logical stage and backing store. A responsive outer shell subtracts
  safe-area insets, aspect-fits, centers, and letterboxes the stage without cropping or stretching.
  Browser width, height, orientation, and DPR may change display scale only; they do not change
  scene dimensions, camera field of view, spawn/cull windows, or visible world. Integer scaling is
  preferred when practical, while fractional scaling/downscaling is accepted at the final CSS
  boundary for device coverage. Wide-screen side rails may provide decorative or duplicated
  information but no exclusive gameplay advantage. A separate landscape profile requires later
  device-test evidence.

- **Camera/view presentation revision** (2026-08-03): retain the M5 Cartesian top-down simulation,
  route truth, nearby surround visibility, and world-fixed orthographic debug mode. M6 may add a
  bounded presentation-only depth function that compresses/tapers the far road and scales distant
  scenery/traffic. This is not the rejected chase camera: the truck/trailer articulation, fishtail
  arc, drafting space, side weapons, and rear cargo area remain readable. Projected geometry never
  becomes collision, AI, spawn, cull, or progress truth. Initial production sprites remain freely
  rotatable top-down silhouettes with richer shading; literal rear-view/heading-bucket art remains
  deferred.

- **Milestone 5 numbering** (2026-07-26): the winding-road foundation took the M5 slot and the
  original "Stage 1 end-to-end" entry moved to M6. Route geometry is prerequisite work for Stage 1
  and for the later pseudo-perspective renderer. Nothing from the Stage 1 entry was discarded;
  `docs/roadmap.md` records the move at both milestones, and deferred items in this file that meant
  "the Stage 1 finish milestone" now say M6.

- **Absolute import specifiers under `node --test`** (2026-07-26): app source imports with
  browser-absolute specifiers (`/src/game/truck.js`) that Node would resolve against the filesystem
  root. This never surfaced because every cross-module import in tested code was `import type`, and
  therefore erased before runtime. M5.1 introduced the first real value imports between game
  modules. Resolved with a Node module-resolution hook (`tests/browserSpecifierHooks.mjs`, wired in
  via `tests/register.mjs`) that rewrites `/src/…` and `/components/…` to project-relative `.ts`
  sources. Rejected alternatives: relative imports in app source (violates the project rule and
  breaks in the browser), and testing against `dist/` (would require a build step before every test
  run and stop exercising the real sources).

- **Renderer exhaustiveness check** (2026-07-14): M1.3 added the `oriented-rect` drawable for cab
  and trailer placeholders. `Canvas2DRenderer.draw` now has multiple discriminated-union arms and a
  `never` default assertion, so future drawable variants fail typechecking until handled.

- **Camera / view: diagnostic top-down 2D** (2026-05-24, refined 2026-08-03): World coordinates
  and the trustworthy geometry/debug presentation remain top-down. Chase-cam pseudo-3D remains
  rejected because it hides surround mechanics and trailer articulation. The later M6 decision
  above permits bounded depth in the presentation layer without reversing those constraints.

- **Game surface is not a web component** (2026-05-24): The canvas lives in light DOM, owned by `src/game/mount.ts` (`mountGame(rootEl)` / `disposeGame()`). Web components are reserved for self-contained, style-isolated chrome — modals, the future pit-stop shop overlay, high-score table, etc. Rule of thumb: reach for a web component when style isolation or reusable encapsulation is buying us something. Don't wrap the game surface in one just because it's UI; Shadow DOM around a `<canvas>` introduces focus/event/HUD-overlay friction with no offsetting benefit.

- **RNG determinism** (2026-05-24): Adopted seeded `Rng` class in `src/rng.ts` (mulberry32-backed, restorable via `state`/`setState`, substreams via `fork(label)`). `mulberry32` itself is module-private — all callers go through `Rng`, which validates inputs and crashes on bad seeds (no silent fallback). Covered by `tests/unit/rng.test.ts`. **Convention**: game code never reads `Math.random()` directly; everything pulls from an `Rng` passed in by construction. Worth enforcing with a lint rule when M0 lands.
