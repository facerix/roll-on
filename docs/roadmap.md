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

- [x] **Fuel model** (`src/game/fuel.ts`): pure function of `(speed, accelerating, dt) → fuelDelta`.
  - Baseline drain at cruise; exponential at high speed; "fuel gulp" penalty on hard acceleration from low speed.
  - *Test*: cruising for T seconds drains by expected baseline; flooring it drains faster than cruise; stop→go inflicts gulp.
- [x] **Fumes state** at ≤5%: caps top speed, triggers HUD flicker hook + (later) audio warning.
  - *Test*: state transitions at exactly 5.0% and reverts on refuel above threshold.
- [x] **Fuel HUD** (placeholder bar; styled later).

Exit criterion: fuel pressure is the dominant tension during a run.

---

## Milestone 4 — Traffic + collisions + scoring

- [x] **Commuter car** entity. ✓ Deterministic world-space traffic state with slow lane-locked
  cars, timed adjacent-lane changes, seeded spawning, and offscreen culling in
  `src/game/traffic.ts`.
- [x] **Plow-over** for smaller vehicles. ✓ Overlapping commuters are removed, award a Road Rage
  takedown and HUD callout, and nick Cargo Integrity.
- [x] **Highway patrol cruiser**. ✓ Faster cruisers converge on the player's nearest lane, adjust
  speed to pace the trailer, and deliver cooldown-limited ramming damage. No weapons yet.
- [x] **Cargo Integrity %**. ✓ Commuter and patrol hits degrade the existing truck integrity model;
  the HUD keeps the percentage visible alongside live traffic feedback.
- [x] **Score model**. ✓ `src/game/score.ts` evaluates base + integrity×multiplier + takedowns.
  During play, distance supplies provisional base points; diesel residuals, bonuses, and the final
  delivered-cargo tally remain Milestone 5 work.
  - *Test*: score formula evaluates correctly for given inputs.

**Exit criterion met**: a 60-second run produces a live, comparable score from distance, retained
cargo integrity, and Road Rage takedowns. Traffic simulation, collisions, rendering, HUD state, and
score arithmetic are covered by deterministic unit tests.

### Milestone 4.1 — Limited rigid-body response

- [x] **Oriented collision geometry**. ✓ Cab, trailer, commuters, and patrol cruisers resolve
  contacts through SAT-generated normals, penetration depths, and approximate contact points.
- [x] **Arcade impulse solver**. ✓ Low-restitution, friction-limited impulses and mass-weighted
  positional correction keep bodies separated while preserving the truck's weight advantage.
- [x] **Physical takedowns**. ✓ A sufficiently fast commuter impact pushes and spins a short-lived
  disabled wreck before awarding Road Rage; low-speed contact separates without a false takedown.
- [x] **Patrol standoff**. ✓ Cruiser AI paces behind the trailer's rear bumper instead of targeting
  a point inside it; ramming damage uses per-cruiser cooldowns.
- [x] **Bounded patrol encounters**. ✓ Only one cruiser encounter may exist at a time. Patrol AI
  uses stronger emergency braking when the truck slows, and a cruiser that lands a ram disengages
  behind the player before leaving the simulation instead of rejoining or stacking with another.
- [x] **Traffic spacing**. ✓ Cars reject unsafe lane changes, occupied spawn windows are skipped,
  and traffic-to-traffic contacts are resolved by the same solver.

The solver is deliberately bounded: five sequential contact iterations per fixed tick, simple
rectangular inertia, damped collision velocities, and no general-purpose physics dependency.

---

## Milestone 5 — Winding-road foundation

Goal: curves become an engine property, owned once by route geometry and consumed identically by
rendering, collision, traffic AI, and progress.

Renumbering decision (2026-07-26): this milestone was inserted ahead of the original "Stage 1
end-to-end" entry, which moved to Milestone 6. Route geometry is prerequisite work for Stage 1 and
for the later pseudo-perspective renderer, so it has to land first. Nothing from the Stage 1 entry
was discarded or absorbed.

See `docs/m5-plan.md` for the slice-by-slice implementation plan.

- [x] **Explicit Cartesian world space** (`src/game/worldGeometry.ts`, `src/game/rigidBody.ts`). ✓
  World points, vectors, and velocities are `x`/`y` meters with a documented axis convention
  (`+x` right, `+y` forward, heading from `+y` toward `+x`). The truck model and the SAT/impulse
  solver were migrated off the ambiguous `{ lateralMeters, distanceMeters }` pair and the solver
  moved out of `traffic.ts` into a road-agnostic module. Guarded by
  `tests/unit/coordinateSpaces.test.ts`; behavior is unchanged on the straight road. See
  `docs/m5-plan.md` M5.1.
- [ ] **Piecewise route geometry**: validated straight/arc segments, tangent-continuous chaining,
  deterministic sampling. See M5.2.
- [ ] **Route/world conversion and bounded projection**. See M5.3.
- [ ] **Road cross-section laid over the route**: lanes, shoulders, markers, barriers. See M5.4.
- [ ] **Sampled winding-road mesh in the top-down renderer**. See M5.5.
- [ ] **Curved barrier collision + truck route tracking**. See M5.6.
- [ ] **Route-aware traffic with Cartesian rigid-body reconciliation**. See M5.7.
- [ ] **Camera follow, debug geometry, and feel**. See M5.8.
- [ ] **Integration, compatibility, and closeout**. See M5.9.

Exit criterion: a 60-second seeded run on a default winding route is playable and deterministic,
with route, rendered road edge, and collision boundary in agreement through both bend directions.

---

## Milestone 6 — Stage 1 end-to-end

*Was Milestone 5 before the winding-road foundation was inserted ahead of it (2026-07-26).*

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
