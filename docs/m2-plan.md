# Milestone 2 Plan — Scrolling Road + Camera

This plan expands Milestone 2 from `roadmap.md`. Its purpose is to replace the M1 blank-canvas
truck test with a deterministic top-down Interstate 80 slice: lanes, shoulders, camera anchoring,
the first real 2D game presentation layer, and barrier consequences.

## Outcome

A developer can drive the M1 truck on a recognizable road. The truck remains anchored near a fixed
screen-y while world distance advances underneath it, lane position is readable, and barrier hits
connect to the existing cargo-integrity and jackknife-crash rules.

The implementation should stay arcade and legible. M2 is not a procedural-content milestone, a final
art pass, or a collision-engine rewrite. It is, however, the right time to graduate from the
intentionally spartan M1 renderer checkpoint: yellow boxes on a small gray/blank canvas were useful
for physics isolation, but the road slice should establish the real 2D game renderer shape that later
milestones build on. We want just enough road, camera, and presentation structure that fuel, traffic,
scoring, and stage timelines can reason in world units instead of pixels.

## Boundaries

### In scope

- A renderer-independent road model with lanes, lane markers, shoulders, and barriers expressed in
  world coordinates.
- A camera/projection seam that maps world meters to CSS pixels while vertically anchoring the
  truck.
- A production-intended 2D game rendering path for road, truck, and background composition. It may
  still use provisional art, but it should no longer be treated as disposable yellow-box smoke-test
  rendering.
- The first asset path for game visuals: either user-provided assets or generated bitmap assets,
  chosen when M2 implementation begins.
- One or two parallax background layers to make motion perceptible, using provisional assets or
  flat-color bands as appropriate.
- World bounds and barrier collision checks against the truck footprint.
- Collision consequences that call the existing truck impact path and degrade cargo integrity.
- Debug telemetry useful for road/camera tuning.
- Deterministic, failing-first tests for pure road, camera, and collision logic.

### Out of scope

- Traffic, enemies, plow-over behavior, and takedowns (Milestone 4).
- Fuel pressure, Fumes state, and fuel HUD (Milestone 3).
- Stage length, finish line, and score persistence (Milestone 5).
- Procedural route variety beyond a straight Interstate 80 placeholder.
- Curves, elevation, ramps, intersections, construction zones, or multi-stage biomes.
- Final pixel art, neon sunset polish, CRT effects, particles, audio, or shader work. M2 should
  create the renderer structure those can plug into, not finish the art pass.
- A general-purpose physics/collision framework.

## Architectural contract

Simulation continues to own world truth. Presentation projects that truth into scene data:

```text
Input -> Truck + road simulation -> Camera/projection -> Render scene -> Graphics backend
```

Road and collision code should speak in the same ground-plane coordinates as `TruckState`:

```ts
type WorldPosition = { lateralMeters: number; distanceMeters: number };
```

The camera may know viewport size and pixels-per-meter. The road model, truck model, and collision
queries must not contain screen coordinates, canvas references, DOM state, or sprite dimensions.
If a value is tuned in pixels, it belongs in projection/rendering code; if it affects gameplay, it
belongs in meters.

Core pure seams should look roughly like this:

```ts
road = createRoad(DEFAULT_ROAD_TUNING);
camera = buildRoadCamera(truck.position, viewport, DEFAULT_CAMERA_TUNING);
visibleRoad = projectRoad(road, camera);
impact = detectRoadBarrierImpact(road, truckFootprint, truck.position.distanceMeters);
```

Names can change during implementation, but those responsibilities should not blur together.

## Proposed model

The first road model can be static and straight:

- Lane center offsets in meters.
- Lane width in meters.
- Shoulder width in meters.
- Left/right barrier lateral offsets.
- Repeating dashed center-line marker cadence in world distance.
- A valid-world lateral range derived from shoulders/barriers.

The first camera model should include:

- Viewport dimensions in CSS pixels.
- Pixels-per-meter scale.
- Truck anchor point, likely centered laterally and below vertical midpoint.
- Camera origin in world coordinates.
- Projection helpers for world points, rectangles, and marker spans.

The first real 2D renderer pass should include:

- A clear game-visual composition layer that owns road, background, and truck scene construction.
- Asset-backed sprites where available, with generated or programmer-art placeholders acceptable
  only when they sit behind the same future-facing asset path.
- Initial candidate sprite sheets in `images/`:
  - `images/2D_TOPDOWN_PIXELART_CARS.png` (208x368 RGBA): top-down cars, truck cabs, and a simple
    trailer/rig silhouette.
  - `images/bk_cars1.a.png` (538x560 RGBA): broader top-down vehicle set, including large and
    emergency/service vehicles.
- A stable virtual resolution or viewport policy larger and more intentional than the M1 smoke
  canvas, while preserving crisp pixel-art scaling.
- Explicit z-order for parallax, road surface, shoulders/barriers, lane markers, and truck parts.
- A deliberate static-asset path: `scripts/copy-assets.mjs` already copies `images/` into `dist/`,
  and any sprite sheet used by runtime should be added to `sw-core.js` static assets when offline
  support matters.

The first collision model should favor explicit narrow shapes:

- Truck footprint represented as a renderer-independent world AABB or small set of AABBs derived
  from cab/trailer dimensions.
- Barrier segments represented as lateral bounds over a world-distance interval.
- A collision result that is separate from consequence application.

The truck already has `resolveTruckImpact(state, { kind: 'barrier' })` for jackknife-specific crash
semantics. M2 should add the missing detection and non-catastrophic cargo damage path without moving
barrier geometry into `truck.ts`.

## M2.1 — Road coordinate model

**Status:** Complete.

Create a pure road module for the straight Stage 1 prototype. Keep it renderer-independent and
small enough that tests can reason about every lane and boundary.

### Tests first

- A default road exposes lane count, lane width, center offsets, shoulders, and barrier offsets in
  meters.
- Lane centers are symmetric around lateral offset `0`.
- Road and tuning creation reject non-finite, negative, or internally inconsistent values.
- Shoulder and barrier bounds derive from lane geometry rather than duplicated magic numbers.
- Marker cadence can answer which dashed lane markers are visible over a world-distance interval.
- The model contains no screen-, canvas-, DOM-, or renderer-specific values.

### Exit criterion

Pure code can describe a straight multi-lane road and enumerate visible lane-marker spans for a
given world-distance window.

## M2.2 — Camera anchoring and projection

**Status:** Complete.

Introduce the camera/projection seam that turns world positions into CSS-pixel scene coordinates.
The truck should no longer move indefinitely off the top of the canvas; instead, the camera follows
distance while the truck remains anchored vertically.

### Tests first

- The truck's current world position projects to the configured screen anchor.
- Positive lateral world movement projects rightward on screen.
- Positive world distance ahead of the truck projects upward on screen.
- Projection is deterministic and does not mutate camera or world inputs.
- Invalid viewport dimensions, scale, or anchor values fail loudly.
- A visible world-distance range can be derived from viewport height and scale.

### Playable checkpoint

Replace the M1 smoke projection in `index.ts` with the camera projection. The cab and trailer should
remain visible near the anchor while speed advances the world underneath them.

## M2.3 — Real 2D renderer foundation

**Status:** Complete.

Replace the M1 smoke-test presentation with the first production-intended 2D game renderer path.
Road rendering is the proving case, but the goal is broader: establish how the game composes
background, road, barriers, lane markers, and an articulated truck from camera-projected world data.

The asset decision is intentionally deferred until implementation. Rylee may provide assets, or we
may generate provisional bitmap assets with image-generation tools. Either way, M2 should route them
through the same asset-backed rendering path we expect to keep, rather than hard-coding another
throwaway yellow-box checkpoint. Existing `rect` and `oriented-rect` drawables remain useful for
debug overlays and temporary gaps, but they should not be the conceptual end state of M2 rendering.
If a new drawable kind is needed, update renderer exhaustiveness tests with the implementation.

### Visual targets

- Asphalt body distinct from the background.
- Shoulders readable on both sides.
- Lane markers scroll smoothly beneath the anchored truck.
- Barriers or road edges are visibly separate from shoulders.
- Cab and trailer draw over the road, preserving the M1 articulation readability while moving toward
  real truck presentation rather than debug rectangles.
- The canvas size, scale, and composition feel like the actual game surface rather than a tiny
  physics-lab viewport.

### Tests first

- Road scene building emits drawables in back-to-front order: background/parallax, road, shoulders,
  markers/barriers, truck.
- Lane marker drawables repeat from world cadence and shift when camera distance changes.
- Drawables remain finite for normal viewport sizes and truck positions.
- Asset-backed drawables, if introduced, validate required dimensions and image identifiers rather
  than silently dropping missing art.
- Renderer tests cover any new drawable variant before it is used by road rendering.

### Playable checkpoint

Driving at speed should feel like moving along Interstate 80 rather than across a void or a physics
debug canvas. The player should be able to tell which lane they occupy without debug telemetry.

### Implementation note

M2.3 establishes the production scene-composition path with renderer primitives: `buildRoadScene`
composes background, shoulders, asphalt, barriers, lane markers, trailer, and cab from road/camera
world data. The broader M2 asset-path checklist item remains open until sprite-backed visuals are
introduced instead of silently pretending the primitive truck is final art.

## M2.4 — Parallax background

**Status:** Complete.

Add one or two parallax layers outside the road body. These are first-pass motion cues, not the
neon-sunset art pass, but they should use the same rendering/asset approach selected for M2.3 when
practical.

### Tests first

- Parallax offsets are pure functions of camera/world distance and configured layer speed.
- Layer speeds are validated and bounded so they cannot reverse or outrun the foreground by mistake.
- Background scene data is deterministic for the same camera snapshot.
- Parallax generation does not affect road collision or simulation state.

### Exit criterion

At highway speed, peripheral motion makes travel perceptible without distracting from lane control
or truck articulation.

### Implementation note

M2.4 adds deterministic peripheral parallax bands to `buildRoadScene` using the same renderer
primitive path as M2.3. Layer speeds are validated in `[0, 1)` so background cues cannot reverse or
outrun the foreground road, and pure tests cover offset math, scene determinism, and the boundary
that parallax does not mutate road/simulation state.

## M2.5 — World bounds, barriers, and cargo damage

**Status:** Complete.

Implement road-edge collision detection and wire consequences into the playable loop. A barrier hit
while jackknifed should use the existing catastrophic crash rule; an ordinary side hit should degrade
cargo integrity and keep the truck controllable unless integrity reaches a later failure rule.

### Tests first

- A truck footprint fully inside road bounds reports no barrier collision.
- A footprint crossing the left or right barrier reports the correct barrier side.
- Collision checks use world meters and are independent of camera scale or viewport size.
- Barrier collision detection works for both cab and trailer footprint inputs.
- A jackknifed barrier impact transitions the truck to `crashed` through the existing truck impact
  path.
- A non-jackknifed barrier impact reduces cargo integrity by an explicit tuned amount.
- Cargo integrity clamps at `0` and never silently exceeds `1`.
- Repeated sustained contact has an explicit cadence or cooldown so damage does not depend on frame
  rate.

### Playable checkpoint

Steering beyond the road edge gives immediate visual and debug feedback. Safe barrier scrapes hurt
cargo integrity; a jackknifed barrier hit produces the catastrophic M1 crash state.

### Implementation note

M2.5 adds `src/game/roadCollision.ts` for renderer-independent cab/trailer footprint AABBs,
left/right barrier detection, and explicit barrier-contact cooldown state. The playable loop now
builds world-space truck footprints after each truck step, applies barrier consequences through
`resolveTruckImpact`, reduces cargo integrity by a tuned 8% per cooldown for non-jackknifed scrapes,
and flashes the barriers while debug telemetry reports cargo, last barrier side, penetration, and
cooldown.

## M2.6 — Feel, telemetry, and closeout

**Status:** Complete.

Tune the road scale, anchor position, lane width, barrier forgiveness, marker cadence, and parallax
speed together. Add temporary debug telemetry only where it helps tune the road/camera system.

Useful `?debug` lines:

- Lateral lane offset and current lane index/nearest lane.
- World distance and visible distance window.
- Camera anchor and pixels-per-meter scale.
- Cargo integrity after barrier scrapes.
- Last barrier collision side or cooldown state when relevant.

### Manual feedback loop

1. Drive straight at low and high speed and judge whether marker cadence communicates speed.
2. Change lanes gently and judge whether lane width matches the truck footprint.
3. Scrape each road edge while aligned and confirm cargo damage is legible but not instant death.
4. Enter a high-speed jackknife and hit a barrier to confirm catastrophic crash behavior.
5. Verify the truck remains readable at the camera anchor during acceleration, braking, and steering.
6. Record deferred discoveries in `docs/kaizen.md` instead of silently widening M2.

### Closeout note

M2.6 is accepted from Rylee's playtest pass. The road scale, camera anchor, lane readability,
parallax cues, scrape damage, jackknifed barrier crash behavior, and `?debug` telemetry are good
enough to close M2. Sprite-backed visual assets remain deliberately deferred to a later art pass;
M2 closes on the production scene-composition path plus readable primitive visuals.

## Verification

Before marking M2 complete:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Then perform a browser smoke test at `http://localhost:8018`:

- The title screen starts exactly one game.
- The truck remains camera-anchored vertically while the road scrolls.
- Lane markers, shoulders, and barriers are visible and coherent.
- The game uses the M2 renderer path, not the M1 yellow-box smoke renderer.
- Arrow-key and WASD throttle, brake, and steering still work.
- Barrier scrapes reduce cargo integrity in a readable, frame-rate-independent way.
- Jackknifed barrier hits crash the truck.
- Debug telemetry is readable with `?debug`.
- No console errors or warnings appear.
- Disposal and remount behavior do not leak loops or input listeners.

## Completion checklist

- [x] Road geometry is world-space, validated, and independent of rendering.
- [x] Camera projection keeps the truck anchored and tested in isolation.
- [x] The M1 smoke renderer has been replaced by the first real 2D game renderer path.
- [x] Lane markers, shoulders, and barriers render from road/camera data.
- [x] Visual asset production is deferred intentionally; M2 uses the intended scene-composition path
      with readable primitive visuals.
- [x] Parallax background layers provide placeholder motion cues.
- [x] Barrier collision detection uses world-space truck footprints.
- [x] Barrier consequences preserve the M1 jackknife-crash rule.
- [x] Cargo-integrity damage from safe scrapes is explicit and tested.
- [x] Debug telemetry supports road/camera tuning without contaminating simulation.
- [x] Automated verification passes.
- [x] A browser smoke test passes without console errors.
- [x] A playtester can describe the scene as a road, not a blank playfield.

## Decision carried into implementation

Keep Stage 1's first road straight and top-down. Curves and biome variety are tempting, but M2's job
is to establish the world-coordinate, camera, rendering, and barrier contracts that later milestones
can reuse without pixel-space shortcuts.
