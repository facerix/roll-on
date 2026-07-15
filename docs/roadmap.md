# Roll On — Roadmap

Living implementation plan. Pairs with `roll_on_game_design_document.md` (the *what*) and `kaizen.md` (deferred/open items).

**Guiding choices** (decided 2026-05-24):
- **Sequencing**: vertical slice first — prove driving feel before layering content.
- **Renderer**: Canvas 2D now, behind a thin `Renderer` interface so a WebGL backend can slot in during the polish pass.
- **Art**: programmer-art placeholders (solid rects, simple pixel shapes) until mechanics feel right.
- **MVP scope**: Stage 1 (Interstate 80) playable end-to-end. No shop, no weapons, no other stages.
- **Discipline**: TDD. Every system lands with failing-first tests that exercise its pure logic.

---

## Milestone 0 — Engine scaffolding

Goal: the page mounts a canvas, a fixed-timestep loop ticks, and we can render a moving rect.

- [x] **Fixed-step game loop** (`src/engine/loop.ts`). ✓ Fixed-timestep accumulator pattern. `step(realDt)` is the synchronous testable seam; `start()`/`stop()` wires rAF for production. Spiral-of-death cap with discard-on-overflow. Crashes on non-finite/negative dt. Covered by `tests/unit/loop.test.ts`.
- [x] **Renderer seam** (`src/engine/renderer.ts`). ✓ `Renderer` interface + `Canvas2DRenderer` impl. `Scene` is plain data (clear color, viewport, ordered drawables). One drawable variant today (`RectDrawable`); sprites/lines/text added as needed. Pixel-art crispness: `imageSmoothingEnabled = false`. Crashes on bad viewport dims. Covered by `tests/unit/renderer.test.ts` against a hand-rolled fake 2D context.
- [x] **Input adapter** (`src/engine/input.ts`). ✓ Abstract actions (`throttle`, `brake`, `steerLeft`, `steerRight`, `horn`). `isActive` / `wasPressed` / `wasReleased` with per-frame latches; key-repeat ignored; window blur releases held actions; bound keys get `preventDefault`. Covered by `tests/unit/input.test.ts`.
- [x] **Game mount module** (`src/game/mount.ts`). ✓ `mountGame({root, width, height, update, buildScene})` → `{canvas, input, dispose()}`. Owns the canvas (light DOM), DPR sizing with media-query reactivity, wires loop + renderer + input. Canvas is `tabindex=0` and focused on mount.
- [x] **FPS / debug HUD** (`src/engine/fpsMeter.ts`). ✓ EMA-smoothed FPS, light-DOM overlay positioned over the canvas, enabled by `?debug` in the URL (or `debug: true` option). Covered by `tests/unit/fpsMeter.test.ts`.

**Exit criterion met**: `index.ts` runs a smoke-test game — a yellow rect driven by arrow keys / WASD against a navy clear color. Visual confirmation that loop + renderer + input + mount communicate. Torn out and replaced with the real truck in M1.

---

## Milestone 1 — Truck physics in isolation

Goal: the truck *feels* like 80,000 lbs before we draw a road.

- [x] **Truck state model** (`src/game/truck.ts`). ✓ Renderer-independent world position, forward
  speed, cab/trailer headings, yaw rate, mass, cargo integrity, and lifecycle status. Pure
  deterministic `stepTruck(state, controls, dt, tuning)` seam with strict runtime validation and
  immutable output. Covered by `tests/unit/truck.test.ts`. See `docs/m1-plan.md` M1.1.
- [x] **Acceleration curve**. ✓ Manual throttle with a speed-tapered acceleration curve reaches 50%
  of the 40 m/s top speed in approximately 4.5 seconds. Separate coasting and service-brake
  deceleration preserve momentum without allowing reverse motion. World position integrates from
  speed and cab heading. Covered by `tests/unit/truck.test.ts`; playable on the blank-canvas
  checkpoint through `index.ts`. See `docs/m1-plan.md` M1.2.
- [x] **Steering + trailer articulation**. ✓ Speed-scaled steering authority with smoothed cab yaw;
  kinematic trailer heading follows with visible lag and continuous reversal. Separate oriented cab
  and trailer placeholders expose articulation in the playable build. Covered by
  `tests/unit/truck.test.ts` and `tests/unit/renderer.test.ts`. See `docs/m1-plan.md` M1.3.
- [x] **Jackknife model**. ✓ Hard steering above 20 m/s enters jackknife at 12° articulation; recovery
  requires dropping below 7°. Hysteresis prevents boundary flicker, and a barrier impact while
  jackknifed produces an inert catastrophic-crash state. Covered by `tests/unit/truck.test.ts`. See
  `docs/m1-plan.md` M1.4.
- [x] **Defensive fishtail geometry**. ✓ A jackknifed trailer exposes a renderer-independent
  world-space capsule from hitch to axle, sized by physical trailer width, for future enemy collision
  queries. Covered by `tests/unit/truck.test.ts`.
- [x] **Feel/debug telemetry**. ✓ `?debug` reports speed, normalized top speed, cab heading and yaw,
  trailer articulation, lifecycle status, and jackknife thresholds through a renderer-independent
  telemetry snapshot. Covered by `tests/unit/truckTelemetry.test.ts`. See `docs/m1-plan.md` M1.5.

Exit criterion: a developer can play the truck on a blank canvas and a teammate can describe it as "heavy" without prompting.

---

## Milestone 2 — Scrolling road + camera

View is top-down 2D (decision recorded in `kaizen.md`). World coords are `(x = lane offset, y = distance)`. World scrolls in +y; the truck is anchored at a fixed screen-y. Sprites do not scale with distance.

See `docs/m2-plan.md` for the sub-milestone implementation plan.

- [ ] **Road model**: lanes as world coordinates, lane markers, shoulder. World scrolls; truck is camera-anchored vertically.
- [ ] **Parallax background layers** (one or two flat-color layers for now — neon sunset later).
- [ ] **World bounds + barriers**: hitting a barrier hurts integrity (and triggers crash if jackknifed).
  - *Test*: collision detection between truck AABB and barrier segments.

Exit criterion: driving Interstate 80 feels like a road, not a void.

---

## Milestone 3 — Fuel system (the timer)

See `docs/m3-plan.md` for the sub-milestone implementation plan.

- [ ] **Fuel model** (`src/game/fuel.ts`): pure function of `(speed, accelerating, dt) → fuelDelta`.
  - Baseline drain at cruise; exponential at high speed; "fuel gulp" penalty on hard acceleration from low speed.
  - *Test*: cruising for T seconds drains by expected baseline; flooring it drains faster than cruise; stop→go inflicts gulp.
- [ ] **Fumes state** at ≤5%: caps top speed, triggers HUD flicker hook + (later) audio warning.
  - *Test*: state transitions at exactly 5.0% and reverts on refuel above threshold.
- [ ] **Fuel HUD** (placeholder bar; styled later).

Exit criterion: fuel pressure is the dominant tension during a run.

---

## Milestone 4 — Traffic + collisions + scoring

- [ ] **Commuter car** entity: slow, lane-locked, occasional lane changes.
- [ ] **Plow-over** for smaller vehicles → "Road Rage" bonus; integrity nick.
- [ ] **Highway patrol cruiser**: faster, tries to pace the truck, mild ramming. No weapons yet.
- [ ] **Cargo Integrity %**: degrades on hits; surfaces on HUD.
- [ ] **Score model**: base + integrity×multiplier + takedowns. Mirrors §6 formula (minus diesel-residuals/bonuses for now).
  - *Test*: score formula evaluates correctly for given inputs.

Exit criterion: a 60-second run produces a meaningful, comparable score.

---

## Milestone 5 — Stage 1 end-to-end

- [ ] **Stage timeline**: enemy spawn schedule, difficulty ramp, finish-line trigger after N world-units.
- [ ] **Finish-line sequence**: simple "stage complete" overlay, score tally (no fancy cinematic yet).
- [ ] **Persistence**: extend `DataStore` schema for runs (date, score, integrity, fuel-remaining, takedowns). Migration from current `scores` shape.
  - *Test*: migration is idempotent; old shape upgrades cleanly.
- [ ] **High-score table** wired to the existing screen.

Exit criterion: someone can hit "Play" → drive Stage 1 → see a score → see it on the high-score list. MVP done.

---

## After MVP (rough order, not committed)

- Fuel tanker slipstream draft mechanic.
- Weapons: Cowcatcher → Air Horn → Cargo Dropper → Smokestack Flamethrowers (in that order — defensive before offensive).
- Pit Stop intermission shop + currency.
- Stages 2–5 (Construction → PNW → Desert → Mega-Pileup).
- Audio (WebAudio engine rumble synced to speed, music tracks, voice warnings).
- Visual polish pass — possibly the WebGL backend swap for CRT/scanline/bloom shaders.
- Gamepad + touch input.
- Aesthetic art pass replacing programmer art.
