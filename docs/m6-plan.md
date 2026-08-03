# Milestone 6 Plan — Stage 1 Vertical Slice and Presentation

This plan turns the mechanically complete winding-road prototype into the first shippable Roll On
stage. It establishes the fixed pixel-art presentation, moves the diagnostic orthographic road
toward the Stage 1 concept art without changing simulation truth, and preserves the existing
Stage 1 timeline, finish, persistence, and high-score commitments.

M6 is not a cosmetic pass followed by a separate MVP pass. Each slice should leave a playable,
testable vertical slice closer to the final Stage 1 experience.

## Outcome

A player can open Roll On on a phone or desktop, see the same `384 × 576` game composition scaled
to fit without cropping or stretching, drive a deterministic Interstate 80 stage through its finish
line, receive a score tally, and find the persisted run in the high-score table.

The presentation approaches `docs/concepts/roll-on-concept-stage-1.png` through a fixed pixel grid,
desert palette, layered scenery, road texture, shadows, restrained depth compression, and an arcade
dashboard. It does not adopt a chase camera that hides the trailer or changes the simulation to
pseudo-3D.

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
- Unused desktop space may contain decorative cabinet rails, instructions, high scores, or mirrored
  status. It must not contain gameplay information or controls unavailable to mobile players.
- A separate landscape gameplay profile is out of scope. Add one only after device testing provides
  evidence that the fixed portrait stage is unusable in an important context.

The initial layout calculation is:

```ts
rawScale = Math.min(availableWidth / 384, availableHeight / 576);
```

Safe-area insets are removed from the available dimensions before calculating the scale. Layout
code must validate finite positive dimensions and fail loudly on invalid input.

### Hybrid visual depth, top-down simulation

- Truck physics, traffic, collisions, lane intent, route progress, and spawning remain in the M5
  Cartesian world/route spaces.
- The gameplay camera retains enough nearby surround visibility to read cab/trailer articulation,
  fishtails, drafting, side weapons, and rear-deployed cargo.
- A presentation-only depth function may compress the far road, taper road cross-sections, and scale
  distant scenery and vehicles. It consumes world/route truth and never defines collision or AI
  geometry.
- The player truck remains near the lower-middle of the playable view rather than sitting at the
  bottom edge of a chase-camera frustum.
- A world-fixed orthographic debug mode remains available. It is the evidence surface for geometry
  disagreement that the depth presentation could otherwise hide.
- The first art assets keep freely rotatable top-down silhouettes with richer three-quarter shading.
  Heading-bucket sprite sets and literal rear-view vehicles are deferred until their gameplay and
  asset costs are justified.

### HUD and accessibility

- The visible HUD adopts a small top score strip and a substantial bottom arcade dashboard inside
  the fixed stage.
- HUD data continues to come from `GameHudSnapshot`; styling must not create a second gameplay state.
- Semantic labels and live status remain available to assistive technology even when the visual HUD
  is scaled with the pixel-art stage.
- Touch controls share the same abstract input actions as keyboard controls and fit within the same
  responsive shell. Safe-area handling must not move them outside the usable viewport.

## Boundaries

### In scope

- A pure, tested fixed-stage layout calculation and responsive stage shell.
- Replacement of DPR-sized rendering with a fixed logical backing store.
- Aspect-preserving centering, letterboxing, safe-area handling, resize/orientation response, and
  correct input focus across presentation scales.
- A bounded hybrid depth projection for road samples, traffic, and world-attached scenery.
- Far-to-near drawable ordering where depth makes order observable.
- Stage 1 palette, layered desert scenery, road texture/decals, vehicle shadows, dust, and exhaust
  sufficient to establish the concept's visual language.
- The cabinet HUD composition using existing HUD state.
- A deterministic Stage 1 timeline, difficulty progression, and finish trigger.
- Stage-complete tally, final score calculation, run persistence, schema migration, and high scores.
- Browser verification on representative portrait phones, mobile landscape, tablet, and desktop
  aspect ratios.

### Out of scope

- A full chase camera, horizon-based 3D simulation, road elevation, hills, banking, bridges, or
  occluding track geometry.
- Cropping, stretching, or showing more gameplay world on wider displays.
- Multiple mutable simulation truths for orthographic and depth views.
- WebGL as a prerequisite. M6 uses Canvas 2D unless measured evidence crosses the existing renderer
  complexity/performance threshold.
- Final CRT shaders, heavy bloom, palette cycling, or other effects that require a backend swap.
- A large heading-bucket vehicle atlas or fully rear-view vehicle art.
- Audio, gamepad support, weapons, the pit stop, Stage 2, or later biomes.
- A general responsive-dashboard framework or general-purpose scene graph.

## Architectural contract

The responsive shell changes presentation size only. The depth projection changes screen placement
only. Neither may affect deterministic gameplay:

```text
fixed simulation + route truth
  -> world/route samples
     -> M6 visual projection
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
browser checkpoint. Do not begin final scenery production until the fixed stage and projection
contracts are stable; otherwise every asset will be tuned against moving coordinates.

Before M6.1 visual work, resolve the development service-worker module-skew issue recorded in
`docs/kaizen.md`. A visual feedback loop that can combine stale and fresh modules cannot provide
trustworthy evidence.

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

## M6.2 — Hybrid depth projection

Add a pure visual projection that starts from the route-follow camera's local across/forward values
and returns fixed-stage position plus a bounded depth scale. Preserve a readable near field around
the truck; progressively compress only the far field.

Use the existing sampled road cross-sections as input. Taper road/shoulder/marker quads through the
visual projection and scale traffic/world props by the same documented depth contract. Build the
scene far-to-near where overlap is possible. Do not use projected geometry for collision, route
projection, lane choice, spawning, or culling.

### Tests first

- The player focus projects to its configured fixed-stage anchor.
- Screen-forward position is monotonic over the accepted visible route range.
- Depth scale is finite, positive, bounded, and monotonic in the far field.
- Near-field articulation remains legible and does not collapse under the depth curve.
- Road cross-sections retain left/right ordering and never invert at accepted curvature.
- Adjacent mesh segments share exact projected edge points.
- The straight route remains centered and symmetric.
- Traffic and scenery use the same depth value as the road sample at their route position.
- Overlapping depth-aware drawables are emitted far-to-near with a deterministic tie-break.
- Orthographic debug mode remains available and does not mutate simulation or route state.
- A seeded run produces byte-identical gameplay state with orthographic and hybrid presentation.

### Browser checkpoint

Drive the complete default S-curve in normal and world-fixed debug modes. Confirm that the far road
narrows without becoming a chase-camera tunnel, the truck/trailer angle remains readable, and road
art, barriers, traffic, and debug geometry do not visibly disagree.

### Exit criterion

The road gains convincing distance and composition while every gameplay outcome remains identical
to the diagnostic orthographic presentation.

## M6.3 — Stage 1 visual language

Establish a small documented Stage 1 palette and replace generic background bands with deterministic
scene layers:

1. Static sunset gradient, stars, and distant mesa silhouettes.
2. Slow parallax midground mesas and canyon walls.
3. Route-attached cacti, rocks, scrub, signs, and roadside debris.
4. Road-surface decals, cracks, tire marks, shoulder variation, and barrier detail.
5. Vehicle shadows, exhaust, dust, and restrained impact feedback.

World-attached prop placement uses a seeded stream or an authored route-distance table. It must be
stable across frame rate, resize, display scale, and presentation mode. Start with individual PNGs;
add an atlas build step only after measured asset count or loading behavior justifies it. Every new
static asset must be copied by `scripts/copy-assets.mjs` and included in `sw-core.js` caching policy.

### Tests first

- The same Stage 1 seed and route window produce the same prop definitions and draw order.
- Props stay outside configured road/shoulder clearance and never become collision truth unless a
  later gameplay feature explicitly adds that contract.
- Culling depends on route/world visibility, not CSS display scale.
- Parallax layers use documented speed ratios and do not mutate road or camera state.
- Every referenced asset is present in both the copy and service-worker asset lists.
- Sprite load failure remains explicit rather than substituting silent fallback art.

### Exit criterion

A still frame is recognizably the Stage 1 concept's desert-sunset world before CRT effects or final
vehicle art, and the visual result is deterministic during play.

## M6.4 — Arcade dashboard and responsive controls

Recompose `GameHudSnapshot` into a compact top strip and bottom dashboard inside the fixed stage.
Prioritize speed, fuel, cargo integrity, route progress, score, and immediate status. Keep event
callouts over the world view without blocking the truck.

Integrate touch controls with the fixed shell and safe areas. Controls may adapt their hit-target
size and placement at the display boundary, but they continue to emit the same abstract actions and
must not move or resize the gameplay viewport.

### Tests first

- Every existing HUD snapshot field maps to one intended visual readout or is deliberately omitted
  with a recorded reason.
- HUD updates remain a pure reflection of snapshot data.
- Status priority remains deterministic when fuel, damage, jackknife, finish, and event conditions
  overlap.
- Touch controls emit the same action transitions before and after resize/orientation change.
- Visual HUD enhancements do not remove semantic labels or live status.

### Exit criterion

The stage reads as one arcade composition on phone and desktop, while keyboard, touch, and assistive
technology retain equivalent access to gameplay state.

## M6.5 — Deterministic Stage 1 timeline and finish

Define an authored Stage 1 length and deterministic encounter schedule. Make difficulty progression
explicit rather than deriving it from wall-clock time or frame rate. Add the finish trigger and a
stage-complete lifecycle that stops gameplay consequences before presenting the tally.

Resolve the M6 design questions recorded in `docs/kaizen.md`: final run length, difficulty curve,
continues/permadeath policy for Stage 1, horn behavior if it is required for completion, and final
score weights.

### Tests first

- Encounter and difficulty values at documented route distances are deterministic.
- Crossing the finish triggers completion exactly once, including a large fixed-step crossing.
- Completion freezes or transitions truck, traffic, fuel, damage, and scoring according to one
  explicit lifecycle contract.
- Crash, fumes, and finish events on the same step resolve in a documented priority order.
- Replaying the same seed and control stream produces the same finish state and score inputs.

### Exit criterion

A player can start Stage 1, experience its intended escalation, and reach one unambiguous completion
state without an endless prototype loop.

## M6.6 — Final tally, persistence, and high scores

Build the final score from delivered progress/cargo, retained integrity, fuel remaining, takedowns,
and accepted bonuses. Extend `DataStore` with a versioned run record and explicit migration from the
current `scores` shape. Unknown or corrupt versions fail loudly rather than being guessed.

Show the tally after completion, persist it once, and surface the ordered result in the high-score
table. Define deterministic tie-breaking.

### Tests first

- Final score arithmetic matches documented examples and boundary values.
- Migration is idempotent and preserves every valid existing score.
- Unknown versions, invalid records, and non-finite score inputs fail explicitly.
- Completing one run persists exactly one record even if completion/tally rendering repeats.
- High-score ordering and tie-breaking are deterministic.
- Empty, partially migrated, and full tables render valid semantic states.

### Exit criterion

A completed Stage 1 run produces one explainable score, persists once, and is visible in the
high-score table after reload.

## M6.7 — Integration and closeout

Run the complete automated suite and a seeded end-to-end browser matrix. Verify title → play →
finish → tally → high scores on representative phone and desktop viewports, keyboard and touch,
normal and debug presentation, reload, offline shell, and update flow.

Profile Canvas 2D before considering WebGL. The backend swap remains deferred unless measured frame
time, memory, or effect complexity demonstrates that Canvas 2D cannot meet the fixed-stage target.

### Completion checklist

- [ ] The logical stage is always `384 × 576` and independent of DPR and browser aspect ratio.
- [ ] Responsive layout fits, centers, and letterboxes without crop or stretch.
- [ ] Phone and desktop players receive identical gameplay geometry and field of view.
- [ ] Hybrid depth presentation is deterministic and presentation-only.
- [ ] Orthographic world-fixed debug mode remains available.
- [ ] Stage 1 has its accepted palette, scenery layers, road treatment, shadows, and basic effects.
- [ ] HUD and touch controls fit the fixed stage and retain semantic/keyboard parity.
- [ ] Stage timeline, difficulty, and finish lifecycle are deterministic.
- [ ] Final scoring, migration, persistence, and high-score ordering are tested.
- [ ] New static assets are copied and cached offline.
- [ ] Automated format, lint, typecheck, and test commands pass.
- [ ] Browser matrix passes without console errors, update overlays obscuring play, geometry drift,
      duplicated listeners, or stale-module skew.
- [ ] At least one outside player completes Stage 1 on a phone-sized viewport and one desktop-sized
      viewport before Stage 2 begins.

## Decision carried into implementation

Fix the composition, not the player's monitor. Roll On has one authored pixel stage and one gameplay
field of view; responsive layout determines how that stage is presented, not how much world a player
is allowed to see.

Add visual depth without adding a second game. The route, physics, collisions, AI, and progress stay
in the tested M5 spaces. The M6 projection can make the road feel deep, but it cannot become a hidden
source of gameplay truth.
