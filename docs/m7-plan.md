# Milestone 7 Plan — Stage 1 Arcade Dashboard

This plan turns the functional development HUD into the fixed-stage arcade dashboard shown in
[`docs/concepts/roll-on-concept-stage-1.png`](concepts/roll-on-concept-stage-1.png), adapted to the
truth and constraints of the current game.

## Outcome

The bottom `126 px` of the fixed `384 × 576` stage becomes a dense, legible arcade instrument
cluster inspired by the concept:

- a large segmented analog speedometer with a live needle and retained cruise target;
- vertical fuel pressure with explicit Fumes treatment;
- cargo integrity represented by an icon, bar, percentage, and damage state;
- elapsed run time, live score, and persisted best score;
- distance traveled, distance remaining, and route progress;
- a cabinet-like bezel, inset instrument wells, pixel typography, restrained scanlines, and small
  hardware details;
- deterministic status and event presentation that remains readable without covering the road.

The dashboard remains semantic DOM driven by `GameHudSnapshot`. It does not create gameplay state,
parse formatted strings back into numbers, or move the road/HUD boundary. It is authored at the
native logical resolution and receives the same final responsive stage transform as the game.

The target is the concept's composition, hierarchy, palette, and arcade character—not a literal
downsample of its `1696 × 2528` pixels. At `384 px` wide, small highlights, labels, and engraved
details must be deliberately simplified onto the native pixel grid.

## Accepted technical approach

### DOM owns live instruments

Keep the HUD in light DOM. CSS Grid owns panel geometry; semantic elements own labels and values;
CSS custom properties carry normalized levels and needle angles. This preserves accessibility,
testable data flow, and crisp text while avoiding per-frame canvas text rendering.

```text
simulation and run state
  -> validated GameHudRunStats
     -> pure GameHudSnapshot
        -> semantic HUD DOM
           -> CSS/SVG instrument presentation
              -> fixed-stage responsive transform
```

`gameHudView.ts` may update text content, data attributes, and bounded CSS custom properties. It may
not calculate gameplay truth that belongs in `gameHud.ts`, read `DataStore` directly, or infer a
number by parsing display text.

### SVG owns the analog dial geometry

Use a small inline SVG for the speedometer's segmented arc, tick marks, cruise marker, and needle.
The DOM view rotates the needle from a numeric angle supplied by the snapshot or a pure instrument
mapping. Extend the existing SVG helper only as narrowly as required to support an explicit
`viewBox`; do not introduce a general graphics framework.

The speedometer must remain useful when CSS animation is disabled. Needle movement may use a short
stepped transition, but the final angle is authoritative and reduced-motion mode updates it
immediately.

### CSS and a shallow raster skin split presentation responsibilities

CSS defines the durable geometry: wells, separators, bevels, borders, warning colors, clipping, and
fallback appearance. A transparent pixel-art dashboard skin may add highlights, screws, engraved
edges, and the irregular lower silhouette after the CSS wireframe is approved.

The skin must remain decorative and `pointer-events: none`. Removing or failing to load it must
leave every value legible and every state distinguishable. Because the stage size is fixed, a
native-resolution skin is preferable to a generalized nine-slice system.

Any new static PNG or font asset must be added to both `scripts/copy-assets.mjs` and
`sw-core.js#getStaticAssets()` so development, production, and offline presentation cannot drift.

### Fixed dashboard bay

The existing layout contract remains authoritative:

```text
stage:          384 × 576 px
road viewport:  384 × 450 px
HUD bay:        384 × 126 px
HUD origin:     y = 450 px
```

The road canvas ends exactly where the HUD begins. Normal instruments, status, decoration, focus
outlines, and warning states stay inside the HUD bay. A transient event callout may touch the road
boundary only when browser testing shows that it cannot hide nearby vehicles or controls.

Do not enlarge the HUD bay as a styling shortcut. A height change is a camera and gameplay-field
decision and requires its own failing layout tests and browser review.

### Honest instruments

The concept is visual direction, not a source of fictional game state:

- show the actual Stage 1 speed range, not the concept's `115 MPH` example;
- show `STAGE 1`, not `LEVEL 04`;
- do not display fake credits or a functional “INSERT COIN” prompt;
- preserve the retained cruise setpoint, because it is a player-controlled value;
- keep Road Rage and urgent status discoverable even though they are not prominent in the concept;
- show persisted best score only when the score store has initialized successfully.

If a visual label has no truthful backing state, omit or repurpose it rather than inserting a
placeholder that looks authoritative.

## Dashboard composition

Use the following as a starting grid, not as an excuse to skip native-resolution browser tuning:

| Region | Approximate width | Contents |
|---|---:|---|
| Speed well | `110 px` | segmented arc, needle, current MPH, cruise marker |
| Fuel column | `34 px` | E/F scale, vertical fill, percentage, Fumes state |
| Cargo well | `62 px` | crate icon, integrity bar, percentage |
| Run well | `82 px` | elapsed time, score, best-score label |
| Route well | `76 px` | remaining distance, progress bar, traveled distance |
| Shared gaps/frame | `20 px` | separators, bevels, screws, outer skin |

The sum must be reconciled in the wireframe rather than allowed to overflow. The dashboard should
use a primary instrument row around `96 px` high and a narrow status/event strip in the remaining
height. The speedometer may break the rectangular rhythm as the concept does, but its painted and
semantic bounds must remain inside the stage.

At native size:

- reserve the largest type for current speed and score;
- use no more than two compact label sizes;
- prefer short labels such as `FUEL`, `CARGO`, `TIME`, `SCORE`, `LEFT`, and `RUN`;
- align numeric glyphs with tabular figures where the font supports them;
- remove the development-only metric speed from the production face while keeping it available in
  `?debug` telemetry;
- represent cruise target as a dial marker plus a small numeric setpoint, not as a competing primary
  instrument.

## Data contract changes

Extend `GameHudSnapshot` with numeric presentation inputs rather than overloading formatted text:

```ts
interface GameHudSnapshot {
  // Existing formatted values remain where useful.
  readonly speedMphText: string;
  readonly scoreText: string;
  readonly statusText: string;
  readonly eventText: string;

  // New bounded presentation inputs.
  readonly speedLevel: number; // [0, 1]
  readonly cruiseSpeedLevel: number; // [0, 1]
  readonly cargoIntegrityLevel: number; // [0, 1]
  readonly fuelLevel: number; // existing [0, 1]
  readonly routeProgress: number; // [0, 1]

  // New formatted run values.
  readonly elapsedTimeText: string;
  readonly distanceRemainingText: string;
  readonly bestScoreText: string | null;
  readonly stageText: string;
}
```

Exact names may change during failing-test design, but these distinctions must remain:

- normalized levels are numeric and range-validated;
- display strings are formatted once in the pure snapshot builder;
- optional unavailable values are explicit `null`, never a fabricated zero;
- route distance comes from route-space progress, not Cartesian `truck.position.yMeters`;
- the view never computes remaining distance from rendered percentages.

Extend `GameHudRunStats` with elapsed run seconds, best score, and stage identity. Orchestration owns
these inputs:

- `roadGame.ts` advances elapsed run time from accepted fixed simulation steps only while the run is
  active;
- elapsed time is presentation and tally evidence, never a physics or difficulty input;
- the score/persistence layer derives the best score after `DataStore` initialization and passes it
  inward;
- `gameHud.ts` must not import `DataStore`;
- the terminal snapshot retains elapsed time if the final tally or saved score displays it.

Before implementation, reconcile the existing `distanceText` use of `truck.position.yMeters` with
the route-space contract. Curved-road distance must have one authoritative source.

## Accessibility contract

Visual density must not reduce semantic clarity:

- retain a labelled `section` for driving status;
- group instruments in a semantic description list or equivalently explicit labelled groups;
- expose current value, unit, and state for the speed, fuel, cargo, score, and route instruments;
- keep rapidly changing values out of `aria-live` regions;
- keep the single prioritized status and transient event as the only live announcements;
- never communicate Fumes, severe cargo damage, or terminal status through color alone;
- preserve visible focus treatment for any future interactive dashboard control;
- honor `prefers-reduced-motion` and keep all information present with animation disabled;
- verify forced-colors/high-contrast behavior remains understandable even if the decorative skin is
  suppressed.

Decorative SVG paths and raster skin elements are hidden from the accessibility tree. The visual
needle does not replace the numeric speed text.

## Boundaries

### In scope

- Native `384 × 126` dashboard composition based on the Stage 1 concept.
- Semantic HUD DOM reorganization using `h()`.
- Pure instrument mapping and formatting functions with failing tests.
- Segmented SVG speedometer, live needle, and cruise marker.
- Vertical fuel gauge and explicit Fumes presentation.
- Cargo icon, integrity bar, percentage, and damage states.
- Elapsed time, score, best score, route traveled/remaining, and progress presentation.
- Cabinet bezel, instrument wells, separators, screws, pixel-art highlights, and restrained
  scanlines.
- Status/event strip integrated with the cabinet composition.
- Offline asset registration and cache-version update where required.
- Accessibility, reduced-motion, narrow-stage, and fractional-scale verification.

### Out of scope

- CRT curvature, convex-screen warping, whole-frame distortion, or shader work.
- Bloom, glow post-processing, chromatic aberration, or blur-based effects.
- WebGL or a renderer backend change.
- A literal downsample or tracing of the concept image.
- Pseudo-3D road projection, desert scenery, or gameplay-view art changes.
- New gameplay mechanics, scoring rules, fuel rules, cargo rules, or difficulty inputs.
- Fake credits, coin handling, or a nonfunctional continue mechanic.
- Audio, gamepad support, pit-stop UI, and later-stage dashboard variants.
- A generalized dashboard framework, theme engine, or reusable gauge package.
- Making debug-only telemetry part of the production instrument hierarchy.

## Slice strategy

Every slice begins with failing tests around pure data or geometry and ends with a browser
checkpoint at native and scaled sizes. Do not start final skin art before the monochrome instrument
wireframe proves that all truthful data fits the bay.

### M7.1 — Lock truthful HUD inputs and instrument math

Add numeric normalized values and new formatted run fields to the snapshot contract. Introduce pure
helpers for speed-to-angle mapping, elapsed-time formatting, remaining-distance formatting, and
severity bands.

#### Tests first

- Zero, cruise, maximum, and clamped overspeed map to deterministic dial angles.
- Speed, cruise, cargo, fuel, and route normalized values remain in `[0, 1]`.
- Elapsed time formats correctly across seconds, minutes, and hour rollover.
- Remaining distance reaches zero at or beyond the finish without becoming negative.
- Best score distinguishes unavailable state from a real score of zero.
- Invalid, negative, non-finite, or internally inconsistent run inputs fail loudly.
- Curved-route progress and dashboard distance use route-space truth.

#### Exit criterion

The snapshot contains every truthful input needed by the concept-inspired dashboard, with no view
logic parsing strings or reading external stores.

### M7.2 — Build the semantic native-resolution wireframe

Replace the development grid with the five-region dashboard composition. Use flat monochrome wells,
real labels, worst-case values, and no decorative skin. Retain the current status/event priority.

#### Tests first

- The HUD remains fixed to the `126 px` bay and the road/HUD boundary remains exact.
- Every visual instrument has a semantic label and text equivalent.
- View updates mutate existing nodes rather than recreating the dashboard each frame.
- Unavailable best score has an explicit presentation rather than `0` or `NaN`.
- Long but valid score, time, and distance strings fit the accepted bounds or use a deliberate
  compact format.

#### Browser checkpoint

Inspect `384 × 576`, `374 × 516`, tall-phone, tablet, and desktop fits. Verify no road overlap,
overflow, clipped glyphs, accidental scrollbars, or touch-control collision. Repeat with maximum
score digits, `100%` cargo/fuel, Fumes, and terminal status.

#### Exit criterion

All instruments fit and remain legible at native resolution before art detail begins.

### M7.3 — Implement the analog speed and cruise instrument

Add the segmented green/yellow/orange/red speed arc, tick marks, needle, current MPH, and cruise
marker. Tune the angle range to the actual truck maximum so warning colors correspond to real speed
ratios.

#### Tests first

- SVG segment and needle geometry is deterministic for the same normalized inputs.
- The needle and cruise marker cannot rotate outside their authored arc.
- Fumes speed limiting does not change the meaning of the full dial scale.
- Reduced-motion mode reaches the same final needle angle without transition dependence.

#### Browser checkpoint

Drive from rest to cruise, brake, lose speed in a collision, and enter Fumes. The numeric value,
needle, cruise marker, and actual truck behavior must agree without lag that changes decisions.

#### Exit criterion

Speed is the dominant instrument and can be read peripherally at the smallest supported display.

### M7.4 — Implement fuel and cargo pressure instruments

Turn fuel into a vertical E/F gauge with percentage and Fumes warning. Give cargo a crate icon,
horizontal integrity bar, percentage, and severity treatment. Use stepped pixel fills rather than
soft gradients where practical.

#### Tests first

- Fuel and cargo fills map `0`, threshold boundaries, and `1` to bounded visual levels.
- Exactly `5%` fuel enters the same Fumes state in model, snapshot, semantics, and styling.
- Cargo severity bands are deterministic and do not create a second damage rule.
- Empty and full gauges remain visibly distinct in monochrome/high-contrast presentation.

#### Browser checkpoint

Observe normal drain, launch gulp, Fumes entry, commuter damage, and patrol damage. Confirm that
color, text, bar length, and status agree and that no animated warning makes the value unreadable.

#### Exit criterion

Fuel pressure and cargo damage are immediately distinguishable without relying on color alone.

### M7.5 — Implement run, score, and route instruments

Add elapsed run time, live score, best score, traveled distance, remaining distance, and vertical or
horizontal route progress. Preserve Road Rage count in the status strip or a compact secondary
badge.

#### Tests first

- Elapsed time advances only during active accepted run steps and freezes at terminal state.
- Score and best-score formatting handles the accepted storage range without layout ambiguity.
- Remaining plus traveled distance agrees with the authored route length within rounding policy.
- Completion displays zero remaining and full progress exactly once.
- Retry resets run-local time and distance while retaining persisted best score.

#### Browser checkpoint

Run from title through completion/failure, retry, and high scores. Verify live values freeze to the
same terminal evidence used by the tally and persisted record.

#### Exit criterion

The dashboard explains where the player is, how long the run has taken, and how the run compares
without introducing a second score or progress truth.

### M7.6 — Apply the cabinet skin and pixel-art detail

Add the outer metal silhouette, inset shadows, separators, screws, restrained highlights, cargo
crate art, and scanline texture. Work at native scale and inspect every change at `1×` before judging
an enlarged screenshot.

#### Asset rules

- Prefer one transparent native-resolution dashboard skin plus one small cargo icon.
- Keep live values and gauge fills outside the raster asset.
- Use a documented palette shared through CSS custom properties.
- Preserve unfiltered scaling and integer-aligned source coordinates.
- Register every asset in the copy and offline-cache lists in the same change.

#### Browser checkpoint

Disable the skin asset in development tools: the dashboard must remain complete and readable. Then
restore it and inspect native, fractional downscale, and integer upscale presentations for seams,
blur, or mismatched window geometry.

#### Exit criterion

The dashboard clearly evokes the concept's metal arcade cluster without making decoration a hidden
layout dependency.

### M7.7 — Integrate status, events, controls, and accessibility

Fit prioritized status and transient events into the lower message strip. Reconcile touch-control
clearance with the final dashboard silhouette. Finish semantic labels, reduced motion, contrast,
and state transitions.

#### Tests first

- Stage completion, crash, jackknife, Fumes, damage, and transient events retain deterministic
  priority.
- Event timeout and replacement behavior cannot erase a more urgent persistent state.
- Touch actions remain identical before and after the visual HUD replacement.
- Decorative assets are absent from the accessibility tree.
- Live regions do not announce continuous speed, time, fuel, or score updates.

#### Browser checkpoint

Exercise keyboard and touch at representative viewports. Check Fumes pulsing with and without
reduced motion, forced colors, focus visibility, screen-reader labels, orientation changes, and
service-worker update/reload behavior.

#### Exit criterion

The production dashboard communicates every gameplay-critical state without obscuring the road,
controls, or terminal flow.

### M7.8 — Visual calibration and closeout

Compare the implementation against the concept at equal composition size. Judge hierarchy,
silhouette, palette, density, and peripheral readability—not high-resolution detail count.

#### Calibration loop

1. Capture the native `384 × 576` stage in a normal driving state.
2. Capture rest, cruise, high speed, Fumes, damaged cargo, patrol event, crash, and completion.
3. Compare dashboard bounds and instrument hierarchy against the concept.
4. Remove detail that muddies labels or collapses under fractional scaling.
5. Repeat the smallest-phone check after every typography or bezel adjustment.
6. Run the full automated and browser verification matrix.

#### Exit criterion

The HUD reaches the concept's recognizable arcade-dashboard character, remains truthful and
legible during play, and introduces no road occlusion, simulation coupling, offline asset gap, or
accessibility regression.

## Verification

Run the project checklist in order:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Browser verification must include:

- native logical composition and representative fractional scales;
- phone portrait, short phone, mobile landscape, tablet, and desktop letterboxing;
- rest, cruise, maximum speed, braking, collision speed loss, and Fumes;
- full/critical/empty fuel and full/damaged/critical cargo;
- normal event, Road Rage event, patrol ram, jackknife, crash, completion, and retry;
- maximum accepted time, distance, score, and best-score strings;
- keyboard and touch input clearance;
- reduced motion, forced colors, font-load failure, and decorative-skin failure;
- offline reload with every new asset served from the expected service-worker cache;
- no console errors or unexpected network failures.

## Contributing factors and risks

- **Native resolution:** the concept contains more detail than `384 × 126` can carry. Favor
  hierarchy and silhouette over tiny decoration.
- **Formatted-string drift:** the current view has mostly formatted text. Add numeric levels rather
  than parsing strings in CSS/DOM code.
- **Route/world ambiguity:** the current `distanceText` uses Cartesian truck position. Resolve it to
  route-space progress before building remaining-distance presentation.
- **Font metrics:** pixel-font glyph widths can overflow on large scores and times. Test worst-case
  strings with the actual loaded font and with its fallback.
- **Fractional stage scaling:** browser downscaling can make one-pixel lines uneven. Use strong
  value contrast and avoid detail whose meaning depends on a single physical pixel.
- **Decorative asset coupling:** a raster frame can quietly become the real layout. CSS geometry and
  a no-skin browser check prevent that dependency.
- **Service-worker skew:** missing or stale HUD assets can mix frame and code revisions. Update copy,
  cache, and versioning paths together and verify offline reload.
- **Continuous DOM churn:** time, speed, and score update frequently. Create nodes once and update
  only text, data attributes, and bounded custom properties.
- **Warning competition:** Fumes, damage, Road Rage, patrol events, jackknife, and terminal state can
  overlap. Preserve one tested priority policy and one detail event channel.

## Completion checklist

- [ ] HUD truth comes exclusively from validated snapshot/run inputs.
- [ ] Road canvas and HUD bay retain an exact non-overlapping boundary.
- [ ] Analog speed, cruise, fuel, cargo, time, score, best score, and route instruments are live.
- [ ] Current values remain legible at the smallest accepted display.
- [ ] Status and event priority remains deterministic.
- [ ] No fictional credits, level, speed, score, or continue state appears authoritative.
- [ ] Decorative skin failure leaves a complete usable dashboard.
- [ ] New assets are copied, cached, and available offline.
- [ ] Touch and keyboard controls remain unobstructed.
- [ ] Reduced-motion and high-contrast presentations retain all gameplay information.
- [ ] Automated checks pass and the browser matrix has no console errors.
- [ ] Curvature, bloom, distortion, and WebGL remain absent from the implementation.

## Decision carried into implementation

Build the dashboard as a truthful semantic instrument cluster first and a pixel-art cabinet skin
second. Match the concept through composition, hierarchy, palette, and native-resolution craft.
Do not buy visual similarity with fake state, road occlusion, inaccessible raster text, or a renderer
rewrite.
