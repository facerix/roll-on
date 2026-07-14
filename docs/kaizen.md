# 改善 — Open Questions & Deferred Work

The standard we walk by is the standard we accept. This file is where we *record* things we deliberately chose not to fix yet, so they're not silently abandoned.

Add a new entry whenever we punt on something. Each entry: what, why deferred, when to revisit.

---

## Open design questions

- **Difficulty curve shape**: linear ramp vs. wave pattern (lulls between intensity spikes)? Decide once Milestone 4 is playable enough to feel.
- **Run length target**: how long is a "good" Stage 1 run? 60s? 3 min? Affects fuel drain tuning and enemy density. Revisit during Milestone 3.
- **Permadeath vs. continues**: arcade tradition is continues with score reset penalty. Design doc is silent. Decide before Milestone 5.
- **Score formula precise weights**: §6 of the design doc gives the formula but no coefficients. Tune after Milestone 4.
- **Mobile / touch input model**: PWA implies mobile. A vertical-scrolling driver could work with tilt or with on-screen lane buttons, but neither is obviously right. Decide before public testing.

## Deferred technical work

- **WebGL renderer backend**: Canvas 2D chosen for the slice. Revisit when we want shader-based post-processing (CRT, scanlines, bloom, palette cycling, Fumes-state flicker as a uniform rather than per-frame compositing). Hard requirement: the `Renderer` seam in Milestone 0 must keep this swap cheap.
- **Audio engine**: WebAudio for engine rumble (continuous, speed-modulated pitch). Don't build until the truck feel is locked — audio tuning depends on physics tuning. SFX placeholder via short WebAudio synth blips during Milestones 1–4.
- **Gamepad API support**: arcade game wants a gamepad. Keyboard-only is fine for prototyping; wire gamepad before any public playtest.
- **Asset pipeline**: no bundler today. When we adopt real pixel art, decide whether we need a sprite-atlas build step or whether individual PNGs are fine for our sprite count.
- **Replay / determinism**: fixed-step loop in Milestone 0 keeps replays *possible*. Actual replay recording and ghost-runs deferred. (RNG seeding is resolved — see below.)
- **Service worker caching of game assets**: existing `sw-core.js` caches the shell; once we have art/audio, decide cache strategy (precache vs. runtime, versioning).

## Minor follow-ups

- **Dual rAF loops in the smoke build**: `FixedStepLoop` runs its own rAF for game ticks; `mountGame` runs a separate rAF for the FPS meter (because the loop doesn't currently surface real-dt to its caller). Two ~60Hz callbacks where one would do. Cheap but redundant. Fix path: add an `onTick(realDt)` hook to `FixedStepLoop`, route the FPS meter through it, and drop the mount's rAF.
- **Lint rule banning `Math.random()` in game code**: pending. Game code must pull from `Rng` (passed in by construction) for determinism. One stray `Math.random()` silently breaks replay. Add as an oxlint rule or a grep-based test when convenient.
- **devicePixelRatio handling**: `Canvas2DRenderer` assumes its context is already sized correctly for DPR. The mount module (M0 item 4) owns canvas sizing. When we wire it up, decide between "internal resolution = CSS px × DPR" (crisp on retina, more pixels to fill) and "internal resolution = fixed virtual pixels with CSS upscale" (true retro vibe, possibly mandatory once we want the CRT look).
- **Canvas context-loss recovery**: `imageSmoothingEnabled` is set once at construction. Browsers can reset context state on `webglcontextlost`/-equivalents; for Canvas 2D this is rare but possible. Revisit if we see smoothing creep back on.

## Risks to monitor

- **Vertical-slice trap**: the slice might feel fun-enough to start adding content too early. Discipline: don't start Stage 2 until Stage 1 ships *and* one outside person plays it.
- **Aesthetic ambition vs. Canvas 2D ceiling**: the design doc's neon/CRT look may push Canvas 2D past comfortable. If we find ourselves writing more than ~200 LOC of compositing tricks for one effect, that's the signal to do the WebGL swap.
- **`DataStore` schema churn**: deferred — during prototyping we accept tearing down localStorage and starting fresh whenever the shape changes. Revisit once gameplay stabilizes and real player data is at stake; at that point we want explicit version tags and crash-on-unknown-version (per directive: crashing > corruption).

## Resolved (move entries here when decided, with the decision)

- **Renderer exhaustiveness check** (2026-07-14): M1.3 added the `oriented-rect` drawable for cab
  and trailer placeholders. `Canvas2DRenderer.draw` now has multiple discriminated-union arms and a
  `never` default assertion, so future drawable variants fail typechecking until handled.

- **Camera / view: top-down 2D** (2026-05-24): World coords are `(lane offset, distance)`. World scrolls down, truck anchored vertically. Chase-cam pseudo-3D rejected — not on cost alone but because the design doc's headline mechanics (jackknife arc, fishtail swipe, side flamethrowers, rear cargo dropper, tanker drafting) all *require* surround visibility and a legible trailer angle, both of which chase-cam hides. The RoadBlasters tie in the design doc is about combat density + fuel-timer dread, not about camera. **Deferred to the art pass**: whether sprites are drawn flat-top-down or tilted 3/4. That's a pure art decision; the engine is unaffected.

- **Game surface is not a web component** (2026-05-24): The canvas lives in light DOM, owned by `src/game/mount.ts` (`mountGame(rootEl)` / `disposeGame()`). Web components are reserved for self-contained, style-isolated chrome — modals, the future pit-stop shop overlay, high-score table, etc. Rule of thumb: reach for a web component when style isolation or reusable encapsulation is buying us something. Don't wrap the game surface in one just because it's UI; Shadow DOM around a `<canvas>` introduces focus/event/HUD-overlay friction with no offsetting benefit.

- **RNG determinism** (2026-05-24): Adopted seeded `Rng` class in `src/rng.ts` (mulberry32-backed, restorable via `state`/`setState`, substreams via `fork(label)`). `mulberry32` itself is module-private — all callers go through `Rng`, which validates inputs and crashes on bad seeds (no silent fallback). Covered by `tests/unit/rng.test.ts`. **Convention**: game code never reads `Math.random()` directly; everything pulls from an `Rng` passed in by construction. Worth enforcing with a lint rule when M0 lands.
