# Milestone 6 Plan — Complete Stage 1 Playable PoC

This plan turns the mechanically complete winding-road prototype into a complete, end-to-end
Stage 1 proof of concept. It keeps the fixed responsive stage, uses the trustworthy orthographic
view and existing assets as development presentation, and completes the Stage 1 timeline, finish,
live-scoring, and device-playability commitments. Final tally, persistence, and high scores move to
M8.6 after the M8.5 Challenge content pass, when Campaign and Challenge result identity is stable.

M6 deliberately does not spend production-art effort on the temporary top-down presentation. The
proper pseudo-3D visualization and the Stage 1 art language belong together in the next dedicated
milestone. Each M6 slice should make the game more complete without creating art or layout work that
must be discarded when that visualization lands.

## Outcome

A player can open Roll On on a phone or desktop, see the same `384 × 576` game composition scaled
to fit without cropping or stretching, drive a deterministic Interstate 40 stage through its finish
line, and receive an explainable live score plus an immutable terminal result snapshot. Final tally,
persistence, and high-score presentation are post-M6 work in M8.

The result is a fully playable PoC, not the final visual Stage 1. It retains legible development art
and the road-following orthographic view so gameplay can be completed and tested. Work intended to
approach `docs/concepts/roll-on-concept-stage-1.png` begins with the proper pseudo-3D visualization,
where road projection, vehicle art, scenery, and HUD composition can be developed as one system.

## Accepted presentation decisions

### Fixed stage, responsive display

- The complete game stage has one logical size: `384 × 576` pixels with a `2:3` aspect ratio.
- The canvas backing store remains `384 × 576`; `devicePixelRatio` does not change simulation or
  scene dimensions.
- A responsive outer shell chooses the largest aspect-preserving display scale that fits inside the
  available viewport and safe-area insets.
- The stage is centered and letterboxed when the browser aspect ratio differs from `2:3`.
- The stage is never cropped or stretched. Wide screens do not reveal additional world geometry.
- Integer display scales are preferred when they fit the viewport well. Fractional scaling and
  downscaling are allowed at the final CSS boundary so small phones and intermediate desktop sizes
  remain usable; the source pixel grid remains fixed and image smoothing remains disabled.
- Unused desktop space may contain decorative cabinet rails, instructions, future high scores, or mirrored
  status. It must not contain gameplay information or controls unavailable to mobile players.
- A separate landscape gameplay profile is out of scope. Add one only after device testing provides
  evidence that the fixed portrait stage is unusable in an important context.

The initial layout calculation is:

```ts
rawScale = Math.min(availableWidth / 384, availableHeight / 576);
```

Safe-area insets are removed from the available dimensions before calculating the scale. Layout
code must validate finite positive dimensions and fail loudly on invalid input.

### Temporary orthographic development presentation

- Truck physics, traffic, collisions, lane intent, route progress, and spawning remain in the M5
  Cartesian world/route spaces.
- The gameplay camera retains enough nearby surround visibility to read cab/trailer articulation,
  fishtails, drafting, side weapons, and rear-deployed cargo while M6 gameplay is completed.
- The road-following view and world-fixed orthographic debug mode share the same simulation and
  world-space projection contract.
- Existing top-down sprites, flat road treatment, and other programmer art remain acceptable when
  they communicate gameplay state clearly.
- Do not commission richer top-down vehicle sets, compose final scenery against this camera, or tune
  cosmetic effects that depend on orthographic screen geometry.
- Orthographic presentation remains the long-term geometry/debug evidence surface; it is not the
  accepted final gameplay visualization.

### Functional HUD, controls, and accessibility

- The existing HUD remains development UI. Add or change only what is needed to understand and
  complete the Stage 1 loop: essential driving state, finish status, live score, and terminal flow.
- The development HUD sits in a reserved bay along the bottom of the fixed stage. The road viewport
  ends at the bay's top edge, and touch gas and brake controls remain above it, so gameplay and
  controls are never rendered behind the dashboard.
- HUD data continues to come from `GameHudSnapshot`; styling must not create a second gameplay state.
- Semantic labels and live status remain available to assistive technology even when the visual HUD
  is scaled with the pixel-art stage.
- Touch controls share the same abstract input actions as keyboard controls and fit within the same
  responsive shell. Safe-area handling must not move them outside the usable viewport.
- Final cabinet composition, decorative instruments, and camera-specific HUD layout are deferred to
  the pseudo-3D art milestone.

### Always-on cruise control

- Stage 1 currently uses cruise control by default with no player-facing toggle. A later change may
  make that mode controllable.
- A fresh run begins with a `20 m/s` target (about `45 mph`). GAS and BRAKE adjust the retained
  target at `10 m/s` per second while held instead of directly operating the drivetrain.
- Releasing both pedals retains the target. The controller automatically applies throttle or brake
  to pursue it, and the HUD displays the current target so the state is never hidden.
- Steering remains direct. Fuel limits, collision speed loss, crash state, and empty-fuel behavior
  remain authoritative downstream of cruise control.

## Boundaries

### In scope

- A pure, tested fixed-stage layout calculation and responsive stage shell.
- Replacement of DPR-sized rendering with a fixed logical backing store.
- Aspect-preserving centering, letterboxing, safe-area handling, resize/orientation response, and
  correct input focus across presentation scales.
- The existing road-following orthographic projection and development art needed to read gameplay.
- Functional HUD and touch-control changes required to play from title through Stage 1 completion or failure.
- A deterministic Stage 1 timeline, difficulty progression, and finish trigger.
- Live/provisional score calculation and the immutable terminal-result seam consumed by M8.
- Browser verification on representative portrait phones, mobile landscape, tablet, and desktop
  aspect ratios.

### Out of scope

- The proper pseudo-3D highway projection and its renderer contract.
- Production vehicle art, heading buckets, final road treatment, layered desert scenery, shadows,
  dust, exhaust, or other work intended to establish the final Stage 1 visual language.
- Final arcade-cabinet HUD composition or decorative controls.
- Road elevation, hills, banking, bridges, or occluding track geometry unless the later
  visualization milestone explicitly accepts them.
- Cropping, stretching, or showing more gameplay world on wider displays.
- Multiple mutable simulation truths for orthographic and depth views.
- WebGL as a prerequisite. M6 uses Canvas 2D unless measured evidence crosses the existing renderer
  complexity/performance threshold.
- Final CRT shaders, heavy bloom, palette cycling, or other effects that require a backend swap.
- Audio, gamepad support, weapons, the pit stop, Stage 2, or later biomes.
- A general responsive-dashboard framework or general-purpose scene graph.

## Architectural contract

The responsive shell changes presentation size only. The temporary road-following projection
changes screen placement only. Neither may affect deterministic gameplay:

```text
fixed simulation + route truth
  -> world/route samples
     -> orthographic scene projection
        -> 384 × 576 scene
           -> responsive stage scale
              -> browser viewport

GameHudSnapshot -> semantic HUD view -> fixed stage scale
InputAdapter <- keyboard/touch actions <- responsive shell
```

Keep these dimensions distinct in names and types:

- **World meters**: truck, traffic, collision, and route geometry.
- **Stage pixels**: the fixed `384 × 576` logical composition.
- **Display pixels/CSS pixels**: the responsive outer shell only.

No simulation model may read display scale, `devicePixelRatio`, safe-area insets, or browser
dimensions. No layout code may change camera field of view, traffic culling, or spawn windows.

## Slice strategy

Each slice starts with failing tests around its pure policy or state transition and ends with a
browser checkpoint. Prefer gameplay lifecycle and terminal-result work over presentation polish. Final
tally, persistence, and high scores belong to M8.6 after M8.5. Do not
begin final scenery, vehicle, road, effect, or cabinet-HUD production during M6.

Resolve the development service-worker module-skew issue recorded in `docs/kaizen.md` before M6.7.
An end-to-end browser pass that can combine stale and fresh modules is not trustworthy evidence.

## M6.1 — Fixed virtual stage and responsive shell ✅

Introduce named stage constants and a pure layout function that maps available viewport dimensions
and safe-area insets to a centered display rectangle and scale. Mount a `384 × 576` backing store and
place the canvas, semantic HUD, debug overlay, and touch controls inside one fixed-size stage wrapper.

Remove DPR multiplication from the canvas backing store. CSS owns the final display transform;
renderer and scene coordinates remain logical stage pixels. Resize and orientation changes update
only the outer layout.

### Tests first

- The layout returns `384 × 576` stage dimensions for every accepted viewport.
- Portrait, square, and landscape viewports produce a centered, aspect-preserving fit.
- Wide viewports add letterbox space without changing scene dimensions or visible world distance.
- Safe-area insets reduce available space before scaling and never place the stage outside the usable
  rectangle.
- Invalid, zero, negative, or non-finite dimensions and insets fail loudly.
- Repeated resize calculations are deterministic and mutation-free.
- Canvas backing dimensions remain `384 × 576` at representative DPR values.
- Mount, resize, dispose, and remount do not duplicate listeners, loops, controls, or HUD nodes.
- Keyboard focus and abstract touch actions remain functional after a scale/orientation change.

### Browser checkpoint

Verify representative `2:3`, tall-phone, mobile-landscape, `4:3`, and `16:9` viewports. The stage is
fully visible, centered, undistorted, and free of scrollbars. Pixel sampling should show smoothing
disabled; fractional fits may contain nonuniform physical pixel widths but must not blur through
linear filtering.

### Exit criterion

Phone and desktop players see the same complete composition and gameplay field of view at different
display scales, with no crop, stretch, or DPR-dependent simulation change.

## Deferred M6.2–M6.3 — Proper visualization and Stage 1 visual language

The initial depth experiment exposed a visual-model mismatch: tapered road geometry cannot coexist
convincingly with freely rotatable top-down truck and traffic sprites. Do not iterate on that hybrid
or compensate by polishing the orthographic view.

The first post-M6 milestone will develop the proper pseudo-3D visualization and production art as a
single system. Its scope includes:

1. A tested route-space chase projection with a shared horizon, continuous depth scaling, clipping,
   and deterministic far-to-near ordering.
2. Compatible track-aligned or heading-bucket truck and traffic art.
3. Road, shoulder, marking, barrier, and curve treatment generated through the same projection.
4. Static horizon, parallax mesas and canyon walls, and route-attached desert props governed by the
   projection's placement and occlusion rules.
5. Vehicle shadows, exhaust, dust, restrained impact feedback, and the final camera-aware HUD
   composition.

The M5 Cartesian simulation, route geometry, collisions, AI, spawning, progress, and scoring remain
the only gameplay truth. Orthographic mode remains available for geometry diagnostics. Production
art does not begin until the projection contract and representative straight/curve compositions pass
their browser checkpoint.

## M6.4 — Playable HUD and responsive controls ✅

Keep the current HUD and touch controls functional within the fixed stage. Add only the information
and states required to play the complete Stage 1 loop: speed, fuel, cargo integrity, route progress,
live score, immediate status, finish state, and navigation through terminal state.

Controls continue to emit the same abstract actions and must remain usable after resize or
orientation changes. Do not recompose the HUD into the final arcade dashboard or tune overlays
against temporary orthographic screen geometry.

### Tests first

- Every gameplay-critical HUD snapshot field has a legible development readout.
- HUD updates remain a pure reflection of snapshot data.
- Status priority remains deterministic when fuel, damage, jackknife, finish, and event conditions
  overlap.
- Touch controls emit the same action transitions before and after resize/orientation change.
- Terminal transitions remain keyboard-, touch-, and assistive-technology accessible.

### Exit criterion

A player can understand and operate every state from title through Stage 1 completion or failure on phone and desktop;
no production HUD-art criterion blocks the PoC.

## M6.5 — Deterministic Stage 1 timeline and finish

**Status:** Finish/failure lifecycle and terminal presentation complete (2026-08-03); authored
distance-based encounter scheduling remains.

Define an authored Stage 1 length and deterministic encounter schedule. Make difficulty progression
explicit rather than deriving it from wall-clock time or frame rate. Add the finish trigger and a
stage-complete lifecycle that stops gameplay consequences before presenting the terminal state.

The accepted Stage 1 target is a `2,200 m` route that a competent player clears in approximately
100 seconds. This is a play target, not a countdown: driving decisions, collisions, and fuel use may
shorten or lengthen an individual run. Tune against the current fuel model without making elapsed
wall-clock time a simulation input.

Stage 1 uses a wave-shaped difficulty curve with authored route-distance bands:

| Route distance | Intent |
|---:|---|
| `0–250 m` | Launch and basic commuter traffic |
| `250–700 m` | Establish normal traffic pressure |
| `700–950 m` | First patrol spike |
| `950–1,200 m` | Deliberate lull |
| `1,200–1,700 m` | Denser mixed pressure |
| `1,700–1,900 m` | Short recovery |
| `1,900–2,200 m` | Final gauntlet |

Ambient encounter generation is seeded and advances from route-distance thresholds rather than
elapsed-time intervals. Authored patrol waves also end at explicit route distances so a lingering
cruiser cannot accidentally suppress a later encounter. Store activated encounter identities in
stage state; reversing across a threshold must not retrigger one.

Stage 1 is a single-credit run with no checkpoint or continue. A catastrophic crash fails the run.
An empty tank does not fail immediately: the truck may coast across the finish, but stopping with an
empty tank fails the run. Either failure offers an immediate fresh retry rather than resuming the
failed simulation.

The horn mechanic is deferred beyond M6 and is not required for completion. Hide its touch control
until it has a gameplay effect; preserve the abstract input action for later implementation. Road
Rage commuter collisions are penalties rather than bonuses: track each qualifying collision, show
the event, deduct the provisional 250-point amount, and floor the live score at zero.

Carry the remaining score-weight question recorded in `docs/kaizen.md` into M8.6. M6 only needs
deterministic live/provisional scoring and a complete terminal snapshot.

The lifecycle contract is:

```text
running
  |-- finish crossed ----------------> completed (immutable result snapshot)
  |-- catastrophic crash ------------> failed
  `-- empty tank and truck stopped ---> failed
```

Resolve one running step completely before choosing its terminal transition: apply that step's fuel,
collisions, cargo damage, and takedowns, then test the truck's final resolved route position. A
finish crossing wins over a crash first caused on that same step, while the collision's damage still
appears in the completion snapshot. Fumes and an empty tank are score/status inputs rather than
failures while the truck is still moving. Once completed or failed, later updates cannot change
truck, traffic, fuel, damage, takedowns, or score inputs.

The terminal states must be unmistakable in the development presentation. Render a checkered
finish band from route geometry ending at the exact `2,200 m` trigger. On completion, place a
prominent semantic `STAGE COMPLETE` dialog over the frozen stage. On failure, show `GAME OVER` with
the cause `CRASHED` or `OUT OF FUEL`. Suspend keyboard/touch driving input, hide the touch pad, and
offer keyboard- and touch-accessible actions to retry from fresh state or return to the title
screen. The post-M6 tally may extend the completion dialog into the tally; it must consume the locked terminal
snapshot rather than resuming simulation.

### Tests first

- Encounter and difficulty values at documented route distances are deterministic.
- Every encounter activates at most once even if the truck reverses across its threshold.
- Crossing the finish triggers completion exactly once, including a large fixed-step crossing.
- The visible finish band spans the road in route space and ends at the simulation finish distance.
- Completion freezes or transitions truck, traffic, fuel, damage, and scoring according to one
  explicit lifecycle contract.
- A catastrophic crash fails once and retry constructs a fresh deterministic run rather than
  resuming mutated state.
- Empty fuel permits a coasting finish but fails once the truck stops before the line.
- Crash, fumes, empty fuel, and finish events on the same step resolve in the documented priority
  order and retain the final step's consequences in the terminal snapshot.
- Completion and failure show distinct semantic terminal dialogs; driving input and touch controls
  remain disabled behind them.
- Retry creates fresh run state, while the title action tears down the game and restores one working
  title-screen start path.
- Replaying the same seed and control stream produces the same finish state and score inputs.

### Exit criterion

A player can start Stage 1, experience its intended escalation, and reach one unambiguous completion
or failure state without an endless prototype loop; a failed run can restart cleanly.

## Deferred M6.6 — Final tally, persistence, and high scores

This slice is intentionally moved to M8.6 after the M8.5 Challenge content pass. M6 supplies
live/provisional score inputs and an immutable terminal snapshot; M8.6 settles the final tally, mode-separated result
identity, versioned `DataStore` migration, persistence, high-score ordering, and final presentation.

Do not initialize or write `DataStore`, or add high-score ordering, in M6. The M8.6 plan owns the
tests and exit criterion for those behaviors.

## M6.7 — Gameplay integration and closeout

Run the complete automated suite and a seeded end-to-end browser matrix. Verify title → play →
finish or failure → terminal state on representative phone and desktop viewports, keyboard and
touch, normal and debug presentation, and retry. M6 does not verify final tally, persistence, or
high scores; M8.6 owns that work after M8.5. Offline/update lifecycle expansion belongs outside
this PoC unless existing behavior regresses.

### Completion checklist

- [ ] The logical stage is always `384 × 576` and independent of DPR and browser aspect ratio.
- [ ] Responsive layout fits, centers, and letterboxes without crop or stretch.
- [ ] Phone and desktop players receive identical gameplay geometry and field of view.
- [x] Road-following orthographic presentation and world-fixed debug mode remain available.
- [ ] Development art and HUD communicate every gameplay-critical state without silent ambiguity.
- [ ] Touch controls fit the fixed stage and retain semantic/keyboard parity.
- [ ] Stage timeline, difficulty, and finish lifecycle are deterministic.
- [ ] Final scoring, migration, persistence, and high-score ordering are tested. (Deferred to M8.6
      after M8.5.)
- [ ] Automated format, lint, typecheck, and test commands pass.
- [ ] Browser matrix passes without console errors, geometry drift, duplicated listeners, or
      stale-module skew.
- [ ] At least one outside player completes Stage 1 on a phone-sized viewport and one desktop-sized
      viewport before Stage 2 begins.

## Decision carried into implementation

Complete the game loop before paying for a view twice. M6's orthographic scene is development and
debug presentation, not the final art direction. Its job is to expose the route, physics,
collisions, AI, progress, finish, and scoring clearly enough to make the Stage 1 PoC trustworthy.

The proper pseudo-3D visualization is the first milestone after M6 and precedes production Stage 1
art. It consumes the tested M5/M6 gameplay truth; it cannot become a second source of collision, AI,
spawn, cull, progress, or scoring behavior.
