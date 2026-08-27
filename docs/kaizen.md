# 改善 — Open Questions & Deferred Work

The standard we walk by is the standard we accept. This file is where we *record* things we deliberately chose not to fix yet, so they're not silently abandoned.

Add a new entry whenever we punt on something. Each entry: what, why deferred, when to revisit.

---

## Open design questions

- **Touch control ergonomics**: the pad layout (steer arrows at left/right centre, brake+gas centred
  along the bottom) is a first pass that has NOT been played on a real device yet. Open: whether
  steering wants held arrows at all versus a drag-anywhere lane slider. Revisit after the first
  phone playtest.

## Deferred technical work

- **WebGL renderer backend**: M6 uses Canvas 2D for the fixed stage and development presentation.
  Revisit during the post-M6 pseudo-3D visualization only when measured frame time, memory, or more
  than roughly 200 LOC of effect-specific compositing demonstrates a need for shader-based CRT,
  scanlines, bloom, palette cycling, or Fumes flicker. Hard requirement: the `Renderer` seam keeps
  the swap bounded.
- **Audio engine**: WebAudio for engine rumble (continuous, speed-modulated pitch). Don't build until the truck feel is locked — audio tuning depends on physics tuning. SFX placeholder via short WebAudio synth blips during Milestones 1–4.
- **Gamepad API support**: arcade game wants a gamepad. Keyboard-only is fine for prototyping; wire gamepad before any public playtest.
- **Asset pipeline**: M6 retains existing development assets through the current copy/cache paths.
  Revisit an atlas build step during post-M6 pseudo-3D art development only after measured asset
  count, request behavior, or draw overhead justifies it.
- **Replay / determinism**: fixed-step loop in Milestone 0 keeps replays *possible*. Actual replay recording and ghost-runs deferred. (RNG seeding is resolved — see below.)
- **Service worker caching of game assets**: resolve the static-art cache policy when the post-M6
  Stage 1 production asset set lands; new art must not be online-only by accident.

## Minor follow-ups

- **Dual rAF loops in the smoke build**: `FixedStepLoop` runs its own rAF for game ticks; `mountGame` runs a separate rAF for the FPS meter (because the loop doesn't currently surface real-dt to its caller). Two ~60Hz callbacks where one would do. Cheap but redundant. Fix path: add an `onTick(realDt)` hook to `FixedStepLoop`, route the FPS meter through it, and drop the mount's rAF.
- **Lint rule banning `Math.random()` in game code**: pending. Game code must pull from `Rng` (passed in by construction) for determinism. One stray `Math.random()` silently breaks replay. Add as an oxlint rule or a grep-based test when convenient.
- **Canvas context-loss recovery**: `imageSmoothingEnabled` is set once at construction. Browsers can reset context state on `webglcontextlost`/-equivalents; for Canvas 2D this is rare but possible. Revisit if we see smoothing creep back on.
- **Development service-worker module skew**: the M4 browser pass caught one startup where the
  stale-while-refresh strategy served a cached `gameHud.ts` build beside a fresh `gameHudView.ts`
  build. A reload used the refreshed cache and clean runs were stable, but dev should never execute
  a mixed module graph. Revisit by making refreshable development resources network-first (with
  cache fallback) or versioning each watch build as one atomic cache generation. **M6 closeout**:
  resolve this before the end-to-end browser matrix; stale/fresh module mixtures invalidate
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

- **Initial final-tally weights** (2026-08-27): retain the established `10` points/meter, `2,000`
  Cargo Integrity multiplier, and `250`-point Road Rage deduction. Add up to `1,000` points for
  diesel residuals and a `2,500`-point dry-tank completion bonus. The terminal exposes every
  component and the constants remain isolated in `finalTally.ts` for later playtest tuning.

- **Horn visibility for the Stage 1 PoC** (2026-08-03): defer horn mechanics beyond M6 and do not
  show a control that has no gameplay effect. The touch pad exposes steering, brake, and throttle
  only. Preserve the abstract `horn` action and Space binding as an implementation seam for the
  eventual limited-use lane-clearing weapon; neither is required to complete Stage 1.

- **Road Rage scoring direction** (2026-08-03): plowing through commuter traffic is a collision
  penalty, not a bonus. Continue tracking each qualifying collision and showing its Road Rage event,
  but deduct the provisional 250-point amount per event and floor the live score at zero. The final
  amount remains part of the M6 tally-weight playtest.

- **Stage 1 length, difficulty, and failure policy** (2026-08-03): author a `2,200 m` Stage 1 that
  targets an approximately 100-second competent clear without using time as simulation truth. Pace
  it as distance-authored waves: onboarding, normal pressure, a patrol spike, a lull, denser mixed
  pressure, a short recovery, and a final gauntlet. Ambient encounters are seeded and
  distance-triggered; named encounters activate once and patrol waves have authored end distances.
  Stage 1 is a single-credit run with no checkpoints or continues. Catastrophic crashes fail the
  run. Empty fuel permits coasting and a dry-tank finish, but stopping empty before the line fails.
  Failure offers a fresh retry rather than resuming mutated simulation state. Resolve a step's fuel
  and contacts before its terminal transition; a finish crossing wins over a crash first caused on
  that step while retaining the collision's final damage in the completion snapshot.

- **Fixed pixel stage with responsive presentation** (2026-08-03): the complete game composition
  uses one `384 × 576` (`2:3`) logical stage and backing store. A responsive outer shell subtracts
  safe-area insets, aspect-fits, centers, and letterboxes the stage without cropping or stretching.
  Browser width, height, orientation, and DPR may change display scale only; they do not change
  scene dimensions, camera field of view, spawn/cull windows, or visible world. Integer scaling is
  preferred when practical, while fractional scaling/downscaling is accepted at the final CSS
  boundary for device coverage. Wide-screen side rails may provide decorative or duplicated
  information but no exclusive gameplay advantage. A separate landscape profile requires later
  device-test evidence.

- **Stage 1 camera sequencing** (2026-08-03): retain the M5 Cartesian simulation and use the
  road-following orthographic view as M6 development/geometry-debug presentation. The M6 depth
  experiment was rejected because a tapered road conflicts visibly with freely rotatable top-down
  vehicle art. Do not polish that hybrid or produce richer orthographic art. Immediately after the
  complete Stage 1 playable PoC, develop the proper pseudo-3D projection together with track-aligned
  or heading-bucket vehicle art, shared horizon/roadside composition, and a camera-aware HUD.

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

- **Camera / view: diagnostic top-down 2D** (2026-05-24, refined 2026-08-03): World coordinates and
  the trustworthy geometry/debug presentation remain top-down. This does not constrain the final
  gameplay camera; the post-M6 pseudo-3D milestone must preserve or deliberately redesign the
  readability of surround mechanics and trailer articulation.

- **Game surface is not a web component** (2026-05-24): The canvas lives in light DOM, owned by `src/game/mount.ts` (`mountGame(rootEl)` / `disposeGame()`). Web components are reserved for self-contained, style-isolated chrome — modals, the future pit-stop shop overlay, high-score table, etc. Rule of thumb: reach for a web component when style isolation or reusable encapsulation is buying us something. Don't wrap the game surface in one just because it's UI; Shadow DOM around a `<canvas>` introduces focus/event/HUD-overlay friction with no offsetting benefit.

- **RNG determinism** (2026-05-24): Adopted seeded `Rng` class in `src/rng.ts` (mulberry32-backed, restorable via `state`/`setState`, substreams via `fork(label)`). `mulberry32` itself is module-private — all callers go through `Rng`, which validates inputs and crashes on bad seeds (no silent fallback). Covered by `tests/unit/rng.test.ts`. **Convention**: game code never reads `Math.random()` directly; everything pulls from an `Rng` passed in by construction. Worth enforcing with a lint rule when M0 lands.
