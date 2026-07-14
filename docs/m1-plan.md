# Milestone 1 Plan — Truck Physics in Isolation

This plan expands Milestone 1 from `roadmap.md`. Its purpose is to make the truck feel like an
80,000-pound articulated vehicle on a blank playfield before road generation, traffic, fuel, or
content complicate the feedback loop.

## Outcome

A developer can drive a cab-and-trailer placeholder on a blank canvas and another person can
describe it as "heavy" without prompting.

The implementation should model a deterministic arcade truck, not attempt to reproduce a general
rigid-body vehicle simulation. We want the fewest understandable variables that produce the desired
weight, momentum, trailer lag, jackknife risk, and defensive fishtail.

## Boundaries

### In scope

- World-space truck state independent of pixels, camera, and rendering backend.
- Throttle, braking, coasting, and a speed-dependent acceleration curve.
- Cab steering and trailer articulation.
- Explicit jackknife, recovery, and catastrophic-crash rules.
- A trailer swipe hit zone for the future defensive fishtail interaction.
- Programmer-art cab and trailer placeholders.
- Temporary debug telemetry needed to tune the model.
- Deterministic, failing-first tests for pure gameplay logic.

### Out of scope

- Road generation, lanes, shoulders, and real barriers (Milestone 2).
- Traffic and enemy behavior (Milestone 4).
- Fuel consumption and the Fumes state (Milestone 3).
- Cargo damage beyond the state field and stubbed impact consequences.
- Reverse gear.
- Realistic drivetrain, suspension, tire, or rigid-body simulation.
- Final sprites, audio, particles, camera polish, or shader effects.

## Architectural contract

Simulation describes the world. Presentation projects that world into a render scene:

```text
Input -> World simulation -> Camera/projection -> Render scene -> Graphics backend
```

Truck state must not contain screen coordinates, sprite dimensions, canvas references, or camera
state. Simulation decisions must not depend on whether an entity is visible. The initial smoke game
uses pixels directly, but that code is disposable scaffolding and is not the precedent for M1.

The core update seam should be pure and deterministic:

```ts
nextTruckState = stepTruck(state, controls, dt, tuning);
```

All feel constants should live in an explicit `TruckTuning` object. Tests can use a controlled
tuning fixture, while the playable build uses a named default configuration.

## Proposed model

The initial truck state should include only values required by current behavior:

- World position on the ground plane.
- Cab heading.
- Forward speed.
- Cab yaw rate, if the selected steering model requires it as state.
- Trailer heading or articulation angle.
- Cargo integrity.
- Status: `driving`, `jackknifed`, or `crashed`.

Controls should be normalized and independent of input devices:

- `throttle`: `[0, 1]`
- `brake`: `[0, 1]`
- `steering`: `[-1, 1]`

The keyboard adapter can currently map actions to binary extremes. Analog gamepad or touch inputs can
later supply intermediate values without changing truck physics.

## M1.1 — World-state foundation

**Status:** Complete (2026-07-14).

Create `src/game/truck.ts` with the state, controls, tuning configuration, initialization, and pure
update seam.

Implemented with explicit meter/second/kilogram/radian units, validated immutable state copies,
normalized device-independent controls, a named default tuning bound, and deterministic stepping.
Covered by `tests/unit/truck.test.ts`.

### Tests first

- A valid initial truck state can be created from explicit world-space values.
- Identical state, controls, tuning, and `dt` produce identical output.
- Stepping does not mutate the input state.
- Zero control input at rest does not move the truck.
- Non-finite or invalid state, tuning, controls, and `dt` fail loudly.
- The model exposes no screen-, canvas-, or renderer-specific values.

### Exit criterion

The game can construct and step a truck state, but rendering may still use a simple placeholder.

## M1.2 — Longitudinal weight

**Status:** Complete (2026-07-14).

Implement throttle acceleration, braking, drag, and coasting before introducing steering.

Implemented as a linearly tapering engine-acceleration curve with a 40 m/s top-speed bound,
6.2 m/s² low-speed acceleration, 0.5 m/s² coasting deceleration, and 8 m/s² service-brake
deceleration. World position advances from average speed and cab heading using trapezoidal
integration. The playable checkpoint now maps keyboard actions into `TruckControls` and projects the
world-space truck onto the blank canvas in `index.ts`. Covered by `tests/unit/truck.test.ts`.

### Provisional feel targets

- Manual throttle; the truck does not move forward automatically.
- No reverse during the vertical slice.
- Full throttle reaches 50% of top speed in approximately 4–5 seconds.
- Acceleration diminishes as speed approaches the configured top speed.
- Releasing the throttle produces a long coast rather than an immediate stop.
- Braking is substantially stronger than coasting but does not erase momentum instantly.
- Speed never silently exceeds configured physical bounds.

These values are starting hypotheses, not permanent balance commitments. When tuning changes, update
the named configuration and its intentional acceptance tests together.

### Tests first

- Full throttle from rest meets the provisional 50%-speed timing target.
- Acceleration near top speed is lower than acceleration near rest.
- Sustained throttle approaches but does not exceed top speed.
- Coasting loses speed more slowly than braking.
- Braking cannot produce unintended reverse motion.
- Equivalent total fixed-step time produces deterministic results.

### Playable checkpoint

Replace the smoke test's direct vertical movement with truck speed driven by throttle and brake.
Keep the playfield blank so longitudinal feel is easy to judge.

## M1.3 — Cab steering and trailer articulation

**Status:** Complete (2026-07-14).

Add a lightweight articulated-vehicle model rather than full rigid-body physics.

Implemented with speed-scaled steering authority, first-order cab yaw response, midpoint heading
integration, and a single-track trailer follower driven by speed, articulation, and a 12 m
hitch-to-axle wheelbase. The renderer now supports backend-neutral oriented rectangles, and the
playable checkpoint projects separate rotated cab and trailer placeholders. Jackknife thresholds
remain M1.4 work. Covered by `tests/unit/truck.test.ts` and `tests/unit/renderer.test.ts`.

- Steering changes cab heading according to speed and steering input.
- The trailer follows cab heading with a deliberate lag.
- Steering reversal visibly demonstrates delayed trailer response.
- Low-speed steering remains controllable and stable.
- Abrupt high-speed steering can produce a large articulation angle.

### Tests first

- Zero steering preserves heading.
- Gentle steering produces a bounded heading change.
- Trailer heading follows rather than instantly matching cab heading.
- Steering reversal does not teleport or snap the trailer through the cab.
- Gentle high-speed steering remains below the jackknife threshold.
- The model behaves consistently across fixed simulation steps.

### Playable checkpoint

Render separate cab and trailer placeholders from projected world state. Their relative angle should
make articulation and steering lag immediately legible.

## M1.4 — Jackknife, recovery, and fishtail

**Status:** Complete (2026-07-14).

Treat jackknifing as an explicit game mechanic layered on top of articulation.

Implemented with an initial 12° entry threshold, 7° recovery threshold, and 20 m/s minimum speed.
State hysteresis keeps the boundary stable; jackknifed trailers expose a world-space capsule from
hitch to axle for future collision queries. Generic barrier-impact resolution produces an inert
`crashed` state only when jackknifed. The playable checkpoint uses explicit orange/red status colors
to make the risk state legible. Covered by `tests/unit/truck.test.ts`.

- Crossing the configured articulation threshold enters `jackknifed`.
- Recovery requires dropping below a lower recovery threshold. This hysteresis prevents state
  flicker at the boundary.
- While jackknifed, the trailer exposes a world-space swipe segment or hit zone that future enemy
  collision code can query.
- A barrier impact while jackknifed transitions immediately to `crashed`.
- A barrier impact can be represented by a generic impact-resolution function or event in M1; road
  geometry and collision detection remain M2 work.

### Tests first

- A hard high-speed steer can cross the threshold and enter `jackknifed`.
- Gentle steering does not jackknife.
- State does not flicker when articulation hovers around the entry threshold.
- Dropping below the recovery threshold returns to `driving`.
- The trailer swipe geometry follows trailer position and orientation.
- A barrier impact while jackknifed produces `crashed`.
- The same stubbed impact while safely aligned does not trigger the jackknife-specific catastrophic
  rule.

### Exit criterion

The blank-canvas truck supports intentional high-risk fishtailing, understandable recovery, and a
clear catastrophic failure condition.

## M1.5 — Feel and tuning pass

Add temporary debug telemetry when `?debug` is active:

- Speed and normalized top-speed percentage.
- Cab heading or yaw rate.
- Trailer articulation angle.
- Current truck status.
- Relevant thresholds when useful during tuning.

Begin with readable telemetry and source-controlled tuning constants rather than a large live tuning
UI. If changing and comparing values becomes the slow part of the feedback loop, that is evidence to
add focused live controls.

### Manual feedback loop

1. Drive from rest under full throttle and judge acceleration weight.
2. Release throttle at speed and judge the coast.
3. Brake from speed and judge stopping momentum.
4. Make gentle and abrupt steering inputs at low, medium, and high speed.
5. Attempt an intentional fishtail and recovery.
6. Ask a second person to describe the handling without priming them with "heavy."
7. Record deferred discoveries in `docs/kaizen.md` instead of silently widening M1.

## Verification

Before marking M1 complete:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Then perform a browser smoke test at `http://localhost:8018`:

- The title screen starts exactly one game.
- Throttle, brake, and steering work through both arrow-key and WASD bindings.
- Cab and trailer motion reflect the same underlying world state.
- Debug telemetry is readable with `?debug`.
- No console errors or warnings appear.
- Disposal and remount behavior do not leak loops or input listeners.

## Completion checklist

- [x] Truck state and controls are world-space, renderer-independent data.
- [x] Longitudinal motion meets the agreed provisional tuning targets.
- [x] Cab steering and trailer lag are deterministic and tested.
- [x] Jackknife entry, recovery, and crash rules are explicit and tested.
- [x] The fishtail swipe geometry is available for future collision queries.
- [x] The playable placeholder visibly separates cab and trailer.
- [ ] Debug telemetry supports tuning without contaminating simulation.
- [ ] Automated verification passes.
- [ ] A browser smoke test passes without console errors.
- [ ] An unprompted playtester describes the truck as heavy.

## Decision carried into implementation

Use manual throttle with coasting and braking, and omit reverse for the vertical slice. This keeps
"hammer down" an intentional choice and aligns the control model with the later fuel system.
