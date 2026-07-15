# Milestone 3 Plan — Fuel System

This plan expands Milestone 3 from `roadmap.md`. Its purpose is to make fuel the first real run
timer: a deterministic pressure system that rewards efficient cruising, punishes wasteful speed and
launches, and exposes the low-fuel Fumes state clearly enough that the player changes behavior.

## Outcome

A developer can drive the M2 road slice with a visible fuel gauge that drains according to truck
behavior. Moderate cruising feels sustainable, hard acceleration and sustained high speed feel
expensive, and hitting Fumes at 5% immediately changes both the truck's capability and the HUD.

M3 should not solve refueling, traffic, scoring, or stage completion. It should establish the fuel
model, update integration, HUD contract, and tuning hooks those later systems will reuse.

## Boundaries

### In scope

- A pure `src/game/fuel.ts` model with validated state, tuning, and deterministic stepping.
- Fuel burn driven by speed, throttle/acceleration intent, and fixed-step `dt`.
- A gulp penalty for hard launches from low speed.
- Fumes state at `<= 5%`, including exact threshold behavior and reversion after refuel.
- A Fumes top-speed cap wired into truck simulation without mutating global truck tuning.
- Fuel depletion behavior for the prototype run.
- Fuel fields in the game HUD snapshot and visible placeholder HUD.
- Debug telemetry useful for fuel tuning.
- Failing-first unit tests for fuel math, threshold transitions, integration, and HUD formatting.

### Out of scope

- Fuel tankers, drafting, weigh stations, route splits, and any refueling entity behavior.
- Dry Tank Bonus scoring or finish-line fuel bonus accounting.
- Audio warnings, engine sputter sounds, or final cabinet-style effects.
- Traffic/enemy pressure and Road Rage scoring.
- Stage length, finish line, persistence, and high-score schema changes.
- Final art for the gauge or a broader HUD redesign.

## Architectural contract

Fuel is simulation state, not presentation state. The fuel module should be renderer-independent and
should not reach into truck, road, DOM, canvas, storage, or audio code.

The update path should stay explicit:

```text
Input -> Truck controls -> Truck step + Fuel step -> HUD/debug snapshot -> Render scene/chrome
```

Fuel may influence the truck through an explicit derived tuning value, such as an effective maximum
forward speed while Fumes is active. The fuel module should not directly call `stepTruck`, and truck
code should not learn about fuel percentages unless the coupling proves unavoidable.

Core pure seams should look roughly like this:

```ts
fuel = createFuelState({ level: 1, capacity: 1 });
fuel = stepFuel(fuel, fuelInput, dt, DEFAULT_FUEL_TUNING);
truck = stepTruck(truck, controls, dt, buildEffectiveTruckTuning(truckTuning, fuel));
```

Names can change during implementation, but fuel burn, fuel thresholds, and truck speed limiting
should remain independently testable.

## Proposed model

The first fuel model should use normalized fuel in `[0, 1]`:

- `1` means full tank.
- `0` means empty tank.
- Fumes is active when normalized fuel is `<= 0.05`.
- Refueling above `0.05` exits Fumes.

Fuel burn should combine three readable terms:

- Baseline cruise drain: a predictable cost for moving at normal highway speed.
- High-speed drain: a nonlinear multiplier near top speed so hammering down has a visible cost.
- Launch gulp: an additional one-shot or short-window penalty when throttle is high from low speed.

The model should prefer explicit validated tuning constants over hidden literals:

- Baseline tank duration at efficient cruise.
- Efficient cruise speed or speed ratio.
- High-speed exponent and multiplier.
- Low-speed launch threshold.
- Hard-throttle threshold.
- Gulp amount or gulp-per-second rate.
- Fumes threshold.
- Fumes top-speed multiplier.

The open `kaizen.md` run-length question should be answered during M3 tuning. M3 does not need the
final Stage 1 duration, but it should choose a prototype target so fuel pressure can be playtested
instead of tuned in a vacuum.

## M3.1 — Fuel state and drain model

**Status:** Not started.

Create a pure fuel module. Keep units and normalization explicit, and make invalid state crash rather
than silently clamp except at the intentional fuel-level boundary after applying drain/refill.

### Tests first

- A valid full, partial, and empty fuel state can be created without mutation.
- Invalid levels, thresholds, rates, exponents, and non-finite `dt` fail loudly.
- Cruising for `T` seconds drains by the expected baseline amount.
- Flooring it at high speed drains more than efficient cruise over the same `dt`.
- Hard throttle from low speed applies a gulp penalty above ordinary movement drain.
- Zero `dt` is a no-op and returns an equivalent immutable state.
- Fuel level clamps at `0` only as an explicit depletion result.

### Exit criterion

Pure tests can explain why a given frame consumed fuel, and no rendering or truck code is required to
exercise the fuel model.

## M3.2 — Gameplay integration and depletion behavior

**Status:** Not started.

Wire fuel stepping into the playable update loop after controls are sampled and alongside truck
simulation. Decide the prototype empty-tank behavior explicitly.

Recommended prototype behavior: empty fuel does not crash the truck immediately; it leaves the truck
in Fumes-limited motion with no further positive engine acceleration. This preserves the design-doc
possibility of limping or crossing a finish line dry later, without implementing the finish-line bonus
in M3.

### Tests first

- Gameplay update decreases fuel when the truck is driving.
- Braking/coasting at low speed drains less than sustained throttle at high speed.
- Empty fuel prevents further throttle acceleration while preserving braking and steering behavior.
- Fuel state remains deterministic across fixed-step updates.
- Crashed truck behavior is explicit: either fuel stops draining or continues at a defined idle rate,
  with a test locking the decision.

### Playable checkpoint

A normal run visibly loses fuel over time. Holding throttle and staying near top speed drains the
gauge faster than efficient cruising.

## M3.3 — Fumes threshold and truck cap

**Status:** Not started.

Implement the low-fuel state at exactly `<= 5%`. Fumes should be a fuel-derived status that other
systems can query, not a visual-only flag.

### Tests first

- Fuel at `5.0%` is in Fumes.
- Fuel just above `5.0%` is not in Fumes.
- Refueling or test-only fuel adjustment above the threshold exits Fumes.
- Fumes applies a lower effective truck top speed without mutating `DEFAULT_TRUCK_TUNING`.
- A truck already above the Fumes cap decelerates or clamps through an explicit tested rule.
- Fumes threshold logic has no floating-point flicker around the boundary.

### Playable checkpoint

Dropping into Fumes immediately reduces achievable speed. If fuel is restored in a test harness or
future refuel seam, normal top speed returns.

## M3.4 — Fuel HUD and Fumes presentation hook

**Status:** Not started.

Extend the existing HUD snapshot with fuel fields and render a placeholder gauge. The first gauge can
be simple, but it should be part of the real HUD contract rather than debug text.

### Tests first

- HUD snapshot formats fuel percent from normalized fuel.
- Fuel display clamps for presentation without mutating simulation state.
- Fumes state is represented in the HUD snapshot.
- The visible HUD can render fuel, cargo integrity, speed, distance, and status together without
  dropping existing fields.
- The Fumes flicker hook is deterministic and testable from fuel/HUD state, even if the first visual
  implementation is modest.

### Visual targets

- Fuel is readable at a glance while driving.
- Fumes is unmistakable without requiring `?debug`.
- Cargo integrity remains visible; fuel should not replace the existing survival/scoring surface.
- The HUD stays placeholder-simple and does not become a full art pass.

## M3.5 — Tuning, telemetry, and closeout

**Status:** Not started.

Tune fuel around a prototype Stage 1 run length. The exact duration can still move later, but the
burn model needs a target so the player can feel pressure rather than arbitrary drain.

Useful `?debug` lines:

- Fuel percent and Fumes state.
- Current fuel burn rate.
- Burn contribution labels or values for baseline, high-speed, and gulp terms.
- Effective truck top speed under normal and Fumes conditions.
- Prototype target run duration used for tuning.

### Manual feedback loop

1. Drive at efficient cruise and confirm fuel drain feels predictable.
2. Hold full throttle near top speed and confirm fuel pressure becomes obvious.
3. Perform repeated stop-to-go launches and confirm gulp cost is visible but not absurd.
4. Cross the 5% threshold and confirm speed cap plus HUD warning are immediate.
5. Continue driving on empty fuel and confirm the chosen depletion behavior is understandable.
6. Record deferred discoveries in `docs/kaizen.md` instead of silently widening M3.

## Verification

Before marking M3 complete:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Then perform a browser smoke test at `http://localhost:8018`:

- The title screen starts exactly one game.
- The M2 road, camera, steering, barrier, and cargo behavior still work.
- Fuel drains during normal driving.
- High-speed throttle drains fuel faster than efficient cruising.
- Fumes begins at 5% and visibly changes the HUD.
- Fumes reduces achievable speed.
- Empty-fuel behavior matches the documented M3.2 decision.
- Debug telemetry is readable with `?debug`.
- No console errors or warnings appear.
- Disposal and remount behavior do not leak loops or input listeners.

## Completion checklist

- [ ] Fuel state is normalized, validated, immutable, and renderer-independent.
- [ ] Fuel burn has tested baseline, high-speed, and launch-gulp components.
- [ ] Gameplay update owns fuel progression explicitly.
- [ ] Empty-fuel behavior is chosen, tested, and visible in play.
- [ ] Fumes enters at exactly `<= 5%` and exits above the threshold.
- [ ] Fumes caps top speed through an explicit effective-tuning seam.
- [ ] The HUD shows fuel and Fumes status without relying on debug text.
- [ ] Debug telemetry supports fuel tuning without contaminating simulation.
- [ ] The M3 prototype run-length target is recorded or the unresolved decision is updated in
      `docs/kaizen.md`.
- [ ] Automated verification passes.
- [ ] A browser smoke test passes without console errors.
- [ ] A playtester can describe fuel as the dominant run pressure.

## Decision carried into implementation

Keep M3 focused on fuel as pressure, not fuel as content. Tankers, drafting, weigh stations, dry-tank
bonuses, and finish-line scoring are all downstream consumers. The valuable M3 contract is that fuel
is deterministic, visible, tuneable, and able to constrain the truck without tangling simulation with
HUD or future refuel entities.
