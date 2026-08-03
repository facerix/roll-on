# Milestone 5 Plan — Winding-Road Foundation

This plan inserts winding-road support before Stage 1 end-to-end completion. Its purpose is to
replace the straight-road coincidence in the current coordinate model with an explicit route
geometry contract that truck physics, traffic, collisions, cameras, and renderers can all share.

The current top-down renderer is the diagnostic view for this milestone. It should make route
samples, lane geometry, collision boundaries, and articulated vehicle poses easy to inspect before
the later three-quarter perspective pass makes those relationships visually harder to debug.

## Outcome

A developer can drive the existing truck through a deterministic shallow S-curve while traffic
follows curved lanes, barriers match the visible road, collisions retain their current gameplay
consequences, and route progress remains monotonic and useful to scoring. The same route samples
used to draw the road define lane targets and collision edges; there is no visual-only curve.

The truck and rigid-body solver operate in an explicit Cartesian world plane. Road-aware systems
use a separate route space consisting of distance along the centerline and lateral offset from it.
The straight road remains a zero-curvature route and preserves current gameplay as a regression
case.

M5 should prove the engine contract needed by both winding roads and a later pseudo-perspective
renderer. It should not implement that perspective renderer, final Stage 1 completion, or
procedural route generation.

## Roadmap note

`docs/roadmap.md` currently calls Milestone 5 "Stage 1 end-to-end." This branch uses M5 for the
winding-road foundation because route geometry is prerequisite work for the intended Stage 1 and
its later visual direction. Update the roadmap milestone numbering as an explicit documentation
decision when this plan is accepted; do not silently leave two incompatible definitions of M5.

The existing Stage 1 timeline, finish sequence, persistence migration, and high-score work remain
downstream. This plan does not discard or absorb them.

## Boundaries

### In scope

- Explicit Cartesian world-space position, vector, velocity, and heading types for truck and
  rigid-body physics.
- Explicit route-space positions: distance along the route and signed lateral offset.
- A deterministic piecewise route model supporting straight and constant-curvature arc segments.
- Tangent-continuous segment chaining and bounded curvature suitable for an 18-wheeler.
- Pure conversions from route space to world space and a bounded, hint-assisted projection from
  world space back to route space.
- Road cross-section sampling for lane centers, lane boundaries, shoulders, and barriers.
- A sampled top-down road mesh rendered from polygons or another explicit finite primitive.
- World-space barrier geometry and collision detection for both cab and trailer.
- Route-relative traffic spawning, culling, following, lane changes, patrol behavior, and progress.
- Camera behavior sufficient to keep a winding road and articulated truck readable in the current
  top-down view.
- Debug overlays and telemetry for route samples, tangent/normal frames, projected route position,
  curvature, and collision geometry.
- Failing-first deterministic tests for every pure geometry and integration seam.

### Out of scope

- Three-quarter/pseudo-3D projection, horizon convergence, depth scaling, and far-to-near sprite
  ordering.
- Final angled vehicle sprites, scenery art, CRT effects, shaders, particles, or audio.
- Elevation, banking, hills, ramps, bridges, or tunnels.
- Intersections, forks, merging roads, self-intersecting routes, or lane-count changes.
- Procedural route generation or arbitrary spline editors.
- Clothoids or simulation-grade tire dynamics. Tangent-continuous arcade geometry is enough for the
  first curve pass.
- Stage timeline, finish line, score tally, run persistence, or high-score wiring from the previous
  M5 roadmap entry.
- General-purpose spatial indexing or a general-purpose physics framework.

## Architectural contract

Curves must exist once, in route geometry. Rendering, collision, AI, and progress are consumers of
the same sampled truth:

```text
Authored route segments
  -> route sampler
     -> road cross-section / lane targets
     -> world-space barrier edges
     -> traffic world poses
     -> orthographic road mesh
     -> later perspective road mesh

Input -> Cartesian truck physics -> route projection -> road consequences + progress
Traffic route intent -> Cartesian pose/velocity -> rigid-body contacts -> route reacquisition
```

The coordinate spaces must be distinct in names and types. The current
`{ lateralMeters, distanceMeters }` pair is ambiguous: truck integration treats it as a Cartesian
plane while road and traffic code treat it as road-relative. M5 must remove that ambiguity rather
than teach new curved-road code to guess which meaning a value has.

Core seams should look approximately like this:

```ts
interface WorldPoint {
  readonly xMeters: number;
  readonly yMeters: number;
}

interface RoutePosition {
  readonly distanceAlongRouteMeters: number;
  readonly lateralOffsetMeters: number;
}

interface RouteSample {
  readonly distanceAlongRouteMeters: number;
  readonly center: WorldPoint;
  readonly tangent: WorldVector;
  readonly normal: WorldVector;
  readonly headingRadians: number;
  readonly curvaturePerMeter: number;
}

sample = sampleRoute(route, distanceAlongRouteMeters);
worldPoint = routeToWorld(route, routePosition);
projection = worldToRoute(route, worldPoint, {
  hintDistanceAlongRouteMeters,
  searchRadiusMeters,
});
roadSample = sampleRoadCrossSection(road, distanceAlongRouteMeters);
```

Names may evolve during implementation, but these ownership rules should not:

- Truck and rigid-body truth is Cartesian world space.
- Lane choice, route progress, spawn windows, and stage distance are route space.
- The route owns centerline geometry; the road owns the cross-section laid over that route.
- Cameras and renderers consume world geometry and never redefine the curve.
- Route projection failures or ambiguous inputs fail explicitly; they do not silently snap a body
  to an arbitrary distant segment.

## Proposed route model

Use a small authored segment vocabulary for the first implementation:

```ts
type RouteSegmentDefinition =
  | { readonly kind: 'straight'; readonly lengthMeters: number }
  | {
      readonly kind: 'arc';
      readonly lengthMeters: number;
      readonly curvaturePerMeter: number;
    };
```

Segments chain from a declared origin and heading. Each segment starts at the previous segment's end
position and tangent, producing tangent-continuous geometry. A positive curvature bends one
documented direction and a negative curvature bends the other. Zero curvature is represented by a
straight segment rather than an arc with a magic epsilon.

The route should define behavior before its first authored meter and after its last one. Recommended
prototype behavior is straight tangent continuation at both ends. That supports trailer geometry
behind the starting line and lets the existing open-ended prototype continue driving while the final
stage length remains downstream.

Curvature validation must account for the complete road half-width. At minimum, reject any arc where
an offset road edge would fold through the curve center:

```text
abs(curvaturePerMeter) * maximumAbsoluteRoadOffsetMeters < 1
```

Apply a stricter authored minimum bend radius for playability. The geometric validity bound prevents
corruption; the gameplay bound prevents technically valid hairpins that the truck cannot read or
navigate.

`worldToRoute` should use a nearby route-distance hint and a bounded search window. M5 routes do not
self-intersect, but the explicit hint keeps projection deterministic and establishes the contract
needed if route layouts become more complicated later.

## Slice strategy

Each slice should leave the branch typechecked and tested. Prefer temporary adapters that preserve
one explicit meaning over a broad half-migration where `lateralMeters` sometimes means world `x` and
sometimes means a route offset. Delete adapters once all callers have moved; do not retain parallel
truth indefinitely.

## M5.1 — Make Cartesian world space explicit

**Status:** Complete (2026-07-26).

Landed as `src/game/worldGeometry.ts` (world point/vector/velocity types, heading conventions, and
validated arithmetic) plus `src/game/rigidBody.ts`, which extracts the SAT contact generator and
impulse solver out of `traffic.ts` so the generic solver can be proven road-agnostic. Truck state,
trailer swipe geometry, footprint AABBs, barrier impacts, and camera projection all speak `x`/`y`
meters. `TrafficVehicle` keeps its route-relative fields; `buildVehicleRigidBody` /
`applyResolvedVehicleBody` are the explicit, temporary adapters between the two spaces and are
marked for deletion in M5.7. Straight-road behavior is byte-identical — every pre-existing
assertion passes unchanged.

Also required: a Node module-resolution hook for tests (`tests/browserSpecifierHooks.mjs`). The
project's browser-absolute `/src/…` specifiers had never been resolved at test runtime because
every cross-module import in tested code was `import type`. Recorded in `docs/kaizen.md`.

Introduce shared world geometry types and migrate the existing truck and rigid-body solver from
ambiguous lateral/distance field names to Cartesian `x`/`y` names. This is a semantic clarification,
not a behavior change: the current straight road maps lateral to world `x` and distance to world
`y`.

The migration includes truck position, rigid-body position and velocity, contact normals and points,
trailer placement, swipe geometry, traffic collision impulses, and camera projection inputs. Keep
route-specific traffic fields unchanged in this slice so world and route migrations do not become
one unreviewable change.

### Tests first

- Shared world-point/vector creation rejects non-finite values.
- Existing truck acceleration, steering, trailer following, jackknife, and impact tests produce the
  same numeric behavior after the field rename.
- SAT contact detection and rigid-body response retain their current normals, penetration, impulse,
  and separation behavior in Cartesian coordinates.
- Cab and trailer rigid bodies retain the same relative placement on the straight road.
- No migrated world type exposes `lateralMeters` or `distanceMeters` fields.
- No route-specific type leaks into `truck.ts` or the generic rigid-body solver.

### Exit criterion

Truck physics and generic collision code speak unambiguous Cartesian world space, and the playable
straight-road regression is unchanged.

## M5.2 — Piecewise route geometry

**Status:** Complete (2026-08-02).

Landed as `src/game/route.ts`: `createRoute` compiles validated `RouteSegmentDefinition`s into frozen
chained segments, and `sampleRoute` returns center, unit tangent, unit normal, heading, and curvature
at any distance. Positive `curvaturePerMeter` bends toward the driver's right; the sample normal is
the tangent turned right, so positive lateral offset keeps the sign `road.ts` lane offsets already
use. A distance exactly on a join belongs to the segment starting there, so reported curvature is the
one being entered; the final segment owns its own end. Outside `[0, totalLengthMeters]` the route
continues straight along its endpoint tangent with zero curvature.

Curvature validation is two-tier per this plan: `RouteConstraints.maximumAbsoluteRoadOffsetMeters`
rejects arcs that would fold a road edge through the curve center, and the stricter
`minimumBendRadiusMeters` rejects playable-but-unnavigable hairpins. Constraints are caller-supplied
and required — the route still knows nothing about lane count or width. `road.ts` must become the
source of that offset in M5.4 rather than leaving fixtures to guess it.

`normalizeAngle`/`angleDelta` moved out of `truck.ts` into `worldGeometry.ts` as `normalizeHeading` /
`shortestHeadingDelta` so route and truck share one heading convention instead of two private copies.

Add a pure route module that compiles validated segment definitions into deterministic sampleable
geometry. Implement straight segments, constant-curvature arcs, cumulative segment-distance lookup,
and straight continuation outside the authored range.

Keep route compilation separate from road cross-section data. A route describes a centerline; it
does not know lane count, lane width, shoulder width, sprite size, camera scale, or collision damage.

### Tests first

- A straight route sampled at several positive and negative distances returns the expected centers,
  unit tangents, unit normals, headings, and zero curvature.
- A constant-curvature arc matches analytically known endpoints and headings.
- Consecutive segments share an endpoint and tangent to a tight documented tolerance.
- A left arc followed by an equal right arc produces a deterministic shallow S-curve.
- Tangent and normal vectors remain finite, unit length, perpendicular, and consistently oriented.
- Segment lookup is deterministic exactly at segment boundaries.
- Route inputs reject empty definitions, non-positive lengths, non-finite values, impossible
  curvature, and unsafe accumulated distances.
- Sampling does not mutate the route or definitions.
- Straight continuation before and after authored geometry preserves the endpoint tangent.

### Exit criterion

Pure tests can describe a straight route and an S-curve entirely in world meters without importing
road, truck, traffic, camera, or renderer code.

## M5.3 — Route/world conversion and projection

**Status:** Complete (2026-08-02).

Landed in `src/game/route.ts`: `routeToWorld` places a `RoutePosition` (distance plus signed
lateral offset) on the world plane via the existing sample's center/normal. `worldToRoute` projects
a `WorldPoint` back with a required `{ hintDistanceAlongRouteMeters, searchRadiusMeters }` window —
it only evaluates route geometry inside that window, never the whole route, so cost stays bounded
regardless of route length.

Per-segment projection is closed-form rather than iterative: straights project by dot product onto
the tangent; arcs solve the closest point on the segment's underlying circle analytically (center
derived from the same `start + normal/curvature` relationship the arc sampler already uses), then
generate three period-apart candidate distances to resolve the angle-to-distance ambiguity before
clamping each to the window and comparing true squared distance. Continuation regions before/after
the authored route reuse the straight projection anchored at the route's endpoint pose.

`errorMeters` on `RouteProjection` is the residual tangential component left over when the true
closest point had to be clamped to a segment or window boundary — zero for an interior analytic
solution. If that residual exceeds `searchRadiusMeters`, `worldToRoute` throws rather than returning
a silently-clamped guess, per the plan's projection-failure contract.

Add explicit conversion between route-space positions and Cartesian world points. Implement bounded,
hint-assisted projection from a nearby world point back onto the route, returning distance along the
route, lateral offset, nearest world point, local frame, and projection error.

Projection should solve against the authored segment primitives rather than stepping pixels or
depending on renderer sampling density. Straight and circular segments have stable analytic or
bounded numerical projections; choose the smallest implementation that remains deterministic and
testable.

### Tests first

- `routeToWorld` places zero lateral offset on the centerline.
- Positive and negative lateral offsets follow the documented normal direction.
- `routeToWorld` then `worldToRoute` round-trips representative straight, arc, segment-boundary, and
  S-curve positions within an explicit tolerance.
- Projection uses its route-distance hint to select the nearby solution.
- Projection rejects an invalid hint, search radius, non-finite point, or point outside the allowed
  acquisition distance.
- Projection error is reported rather than hidden by silently clamping lateral offset.
- Repeated projection of the same point is deterministic and mutation-free.

### Exit criterion

Game systems can cross the world/route boundary through one tested module, including around both
directions of the S-curve.

## M5.4 — Lay the road cross-section over the route

**Status:** Complete (2026-08-03).

Landed in `src/game/road.ts`: `Road` now carries a compiled route, while the existing
`createRoad(tuning)` call remains a straight-route compatibility fixture. `sampleRoad` projects
lane centers, lane boundaries, road edges, shoulder edges, and barrier edges into world space from
one route sample. `sampleRoadWindow` uses meter-based subdivision, includes exact endpoints and
authored segment joins once, and never stores screen or pixel data. Road creation rejects a
cross-section whose outer barrier offset exceeds the route's declared curvature envelope.

Refactor `Road` so its existing lane widths, lane offsets, shoulders, marker cadence, and barriers
are a cross-section laid over a route. Preserve the current straight-road factory as a zero-curvature
convenience or explicit fixture.

Add pure road sampling that returns world-space points for the centerline, lane centers, lane
boundaries, road edges, shoulder edges, and barrier edges at a route distance. Add a distance-window
sampler that subdivides at segment boundaries and at a validated maximum step length.

Sampling density is a consumer-controlled accuracy parameter expressed in meters. It must not be
stored as pixels or quietly become simulation truth.

### Tests first

- The default straight road reproduces all current lane and edge coordinates.
- Curved-road lane centers and boundaries retain their configured signed offsets from the sampled
  centerline.
- Lane ordering and widths remain consistent through left and right arcs.
- Road and shoulder edges never cross for accepted curvature.
- Marker cadence remains based on route distance and continues cleanly across segment boundaries.
- Sampling a distance window includes exact endpoints and segment joins without duplicate or
  missing spans.
- Invalid sampling steps, windows, route definitions, and curvature/cross-section combinations fail
  loudly.
- Road samples contain world meters only and no screen, canvas, DOM, or pixel fields.

### Exit criterion

One road query can provide coherent lane, shoulder, marker, and barrier world geometry anywhere on
the straight or winding route.

## M5.5 — Render a sampled winding road top-down

**Status:** Complete (2026-08-03).

Landed in `src/engine/renderer.ts` and `src/game/roadScene.ts`: the renderer now accepts a
validated finite `polygon` drawable, preserving caller order and filling closed paths with image
smoothing disabled. Curved road scenes consume `sampleRoadWindow` and emit ordered shoulder, road,
barrier, and lane-marker quads in screen space. Adjacent quads reuse the exact projected sample
points, while the straight route retains the existing rectangle path as a raster regression
fixture. Vehicle centers in the scene are projected from route-converted world positions.

Extend the renderer with the smallest primitive needed to draw a sampled road mesh—recommended:
a solid polygon drawable with a validated list of finite screen points. Update renderer
exhaustiveness tests before using the new drawable.

Refactor the orthographic road scene builder to project sampled world-space road cross-sections.
Build road, shoulders, lane markers, and barrier strips as ordered quads/polygons. The scene builder
may choose render sampling density based on camera scale, but it must consume the same route and
road geometry APIs as collision and traffic.

Do not rotate or otherwise redesign the gameplay camera yet. First make a world-fixed diagnostic
view capable of showing whether the road, truck, and geometry agree. Camera-follow rotation can be
added as a later sub-slice after the fixed view is trustworthy.

### Tests first

- The polygon renderer preserves caller order, closes/fills the path, disables image smoothing, and
  rejects non-finite or insufficient point lists.
- A straight-road scene remains visually and geometrically equivalent within explicit rasterization
  tolerances.
- An S-curve scene emits finite road, shoulder, marker, and barrier polygons in back-to-front order.
- Adjacent mesh quads share identical edge points so cracks cannot arise from independent rounding.
- Changing camera scale affects projection only; it does not change sampled road truth.
- Scene construction is deterministic for the same route, camera, and simulation snapshot.
- Truck and traffic sprite centers are projected from Cartesian world poses, not reconstructed from
  screen-space lane offsets.

### Playable checkpoint

The truck can drive over a clearly visible S-curve in the top-down view. At this checkpoint barriers
may still use the old straight-road collision path, so label the checkpoint diagnostic-only and do
not merge it as complete winding-road gameplay.

### Exit criterion

The current renderer can expose winding-road geometry clearly enough to diagnose later collision,
traffic, and camera work.

## M5.6 — Curved barriers and truck route tracking

**Status:** Not started.

Replace constant lateral barrier checks with world-space curved barrier geometry near the truck.
Use sampled barrier segments or another explicit narrow representation derived from the road
sampler. Test cab and trailer footprints against those edges and return the side, penetration,
contact interval, and useful world-space contact data needed by existing consequence handling.

Add route tracking to driving orchestration. After Cartesian truck movement and contact resolution,
project the cab onto the nearby route using the previous route distance as the hint. Keep this
derived route position explicit in driving/run state; do not make it a second independently mutable
truck position.

Retain current barrier damage cooldown and jackknife-crash consequences. Geometry changes here;
gameplay policy does not.

### Tests first

- Truck route progress matches world `y` on the straight regression route.
- Route progress advances through the S-curve while world `x` and `y` both change.
- A cab and trailer fully inside curved barriers report no impact.
- Each body crossing a left or right curved barrier reports the correct side.
- A long trailer spanning multiple route samples is tested against the complete nearby barrier
  geometry, not only the cab's nearest cross-section.
- Barrier detection is stable at road-segment and mesh-sample boundaries.
- Barrier collision results are independent of camera and render sampling density.
- Existing damage cooldown, cargo loss, and jackknife crash tests retain their behavior.
- Losing route acquisition beyond a configured maximum distance fails explicitly and emits enough
  context to diagnose the state.

### Playable checkpoint

Driving off either side of an S-curve collides where the visible barrier is drawn. Cab and trailer
scrapes are both legible, and a jackknifed barrier impact still crashes the truck.

### Exit criterion

The route, rendered road edge, and collision boundary agree through the entire test curve.

## M5.7 — Route-aware traffic and rigid-body reconciliation

**Status:** Not started.

Separate traffic route intent from Cartesian collision state. Driving traffic should retain route
distance, lateral offset, lane and target-lane intent, and scalar cruise speed. It should expose or
carry an explicit Cartesian pose and velocity derived from the route frame for rendering and
rigid-body contact.

Lane changes interpolate lateral route offset while forward motion advances route distance. Vehicle
world heading follows the route tangent plus any intentional/collision-induced heading delta.
Patrol following, spawn gaps, culling, and lane-clearance decisions remain route-distance problems.

After rigid-body impulses move or spin a traffic vehicle in Cartesian space, reacquire its nearby
route position explicitly. Disabled wrecks may remain world-space ballistic for their short lifetime;
that decision must be named and tested rather than accidentally snapping wrecks back to a lane.

### Tests first

- A commuter on a straight route reproduces current spawn, speed, lane, and culling behavior.
- A commuter follows the correct lane center through both halves of the S-curve.
- World heading follows the route tangent and remains continuous at route segment joins.
- Lane changes preserve adjacent-lane bounds and clearance using route distance.
- Patrol following targets the truck/trailer using route-relative distance without aiming through a
  curved-road chord.
- Spawn and cull windows are measured along the route, not by world `y` or Euclidean distance.
- SAT and impulse response continue to operate only on Cartesian bodies.
- A collision-displaced driving vehicle reacquires a nearby route position without teleporting to a
  different segment.
- A disabled wreck follows the explicitly selected ballistic or route-recovery behavior.
- Takedowns, patrol damage cooldowns, disengagement, and deterministic RNG remain unchanged.

### Playable checkpoint

Commuters and patrol cruisers traverse the S-curve, change lanes, collide, and cull without cutting
across the road or snapping between route segments.

### Exit criterion

All moving actors use a coherent route/world boundary: route space for driving intent and Cartesian
space for physical contact.

## M5.8 — Camera follow, debug geometry, and feel

**Status:** Not started.

Make the orthographic camera useful for both diagnosis and play on a winding route. Add a tested
camera orientation/follow policy that can align gradually with the route tangent while preserving
the truck anchor and enough surround visibility for jackknifing and combat.

Keep a world-fixed debug mode available. A rotating camera can make the road appear straight and
hide geometry errors; the fixed view remains valuable evidence that the world itself curves.

Add optional debug drawables or telemetry for:

- Route centerline and authored segment joins.
- Tangent and normal vectors at sampled distances.
- Lane, shoulder, and barrier edges.
- Cab/trailer rigid bodies and barrier contact points.
- Truck route distance, lateral offset, projection error, and local curvature.
- Traffic route positions versus Cartesian collision poses.
- Camera world pose, orientation, anchor, and visible route-distance window.

### Tests first

- The truck projects to the configured camera anchor under translation and rotation.
- Camera orientation follows a documented smoothing rule and does not depend on frame rate.
- The camera chooses the shortest angular path across `-pi`/`pi`.
- World-fixed debug mode does not mutate gameplay state or route samples.
- Debug geometry is generated from simulation geometry rather than duplicate visual constants.
- Visible route-window selection includes enough distance behind the trailer and ahead of the truck
  at the maximum supported speed.

### Manual feedback loop

1. Drive the straight regression and confirm steering feel has not changed.
2. Drive the S-curve slowly and verify lane width and barrier placement by eye.
3. Drive it at top speed and judge whether curvature gives adequate anticipation.
4. Change lanes through each bend and confirm the truck does not appear to drift or cut corners.
5. Jackknife across the curve and verify cab/trailer articulation remains legible.
6. Scrape each barrier with the cab and trailer and compare visible contact with debug contact data.
7. Plow a commuter and receive a patrol ram in both bend directions.
8. Toggle world-fixed and route-follow cameras to expose hidden geometry disagreement.
9. Record tuning discoveries in `docs/kaizen.md`; do not silently expand into perspective or stage
   content.

### Exit criterion

The top-down renderer is both a usable winding-road presentation and a trustworthy geometry
diagnostic for the later perspective pass.

## M5.9 — Integration, compatibility, and closeout

**Status:** Not started.

Replace the default straight prototype route with an authored Stage 1 test route containing long
straights and one shallow, readable S-curve. Keep a straight-route fixture available for regression
tests and performance comparisons.

Audit all uses of `distanceMeters`, `lateralMeters`, and `headingRadians`. Every remaining field must
have an unambiguous world- or route-space meaning in its name, type, and documentation. Remove
temporary migration adapters and duplicated curve calculations.

Measure rather than guess at route sampling cost. Cache immutable compiled route geometry where it
helps, but do not cache mutable simulation truth or introduce stale render/collision disagreement.

### Automated integration tests

- A deterministic fixed-step run can traverse the complete S-curve without non-finite state.
- Straight-route behavior remains within documented regression tolerances.
- Truck route progress, provisional score distance, traffic spawn/cull, and HUD distance agree.
- The same road definition drives scene geometry, barrier geometry, traffic lane targets, and route
  progress.
- A seeded traffic simulation remains deterministic across repeated winding-route runs.
- No production game module reads `Math.random()`.
- No simulation model contains pixels, viewport dimensions, canvas references, or DOM state.
- No renderer or camera owns independent lane/curve constants.

### Exit criterion

A 60-second seeded run on the default winding route is playable and deterministic with truck,
trailer, barriers, traffic, fuel, cargo damage, takedowns, score, HUD, and camera behavior intact.

## Verification

After every slice, run the smallest relevant failing-first tests. Before marking M5 complete:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Then perform a browser test at `http://localhost:8018` in both normal and `?debug` modes:

- The title screen starts exactly one game.
- The default route visibly contains long straights and a shallow S-curve.
- The truck remains controllable at low speed and top speed through both bend directions.
- Lane markers, shoulders, and barriers remain continuous with no visible cracks.
- Cab and trailer collide at the visible barrier edge.
- Jackknifed barrier contact retains catastrophic crash behavior.
- Commuters and patrol cruisers follow lanes and perform their existing behaviors through curves.
- Traffic collisions, takedowns, patrol damage, fuel, cargo integrity, score, and HUD still work.
- Route progress remains stable through curves and backs the displayed/scored distance.
- World-fixed debug mode exposes the actual curved world geometry.
- Route-follow camera mode remains readable without hiding trailer articulation.
- No console errors or warnings appear.
- Disposal and remount behavior do not leak loops or input listeners.

## Completion checklist

- [ ] Cartesian world types are explicit across truck and rigid-body physics.
- [ ] Route-space types are explicit across progress, lanes, spawning, and AI intent.
- [ ] Straight and arc route segments are deterministic, validated, and tangent-continuous.
- [ ] Route/world conversion and bounded projection are tested in both bend directions.
- [x] Road cross-sections derive lanes, shoulders, markers, and barriers from one route sampler.
- [x] The top-down renderer draws a sampled winding-road mesh from world geometry.
- [ ] Curved barrier collisions match the visible road for both cab and trailer.
- [ ] Truck route tracking is derived from Cartesian state without creating a second mutable truth.
- [ ] Traffic follows route lanes while rigid-body contacts remain Cartesian.
- [ ] Spawn, cull, patrol following, progress, score distance, and HUD distance use route distance.
- [ ] Fixed and route-follow camera modes are deterministic and retain surround visibility.
- [ ] Debug overlays expose route frames, boundaries, footprints, contacts, and projection error.
- [ ] The straight-road regression remains supported and tested.
- [ ] Automated verification passes.
- [ ] A browser smoke/playtest passes without console errors.
- [ ] A playtester can complete a seeded 60-second winding-road run without visible geometry or
      collision disagreement.
- [ ] Deferred Stage 1 end-to-end work is preserved under an explicitly accepted roadmap number.

## Decision carried into implementation

Front-load route truth, not perspective presentation. The top-down renderer is intentionally the
proof surface because it exposes the complete truck/trailer footprint and makes disagreements among
road art, collision edges, lane AI, and world poses obvious.

The milestone is successful when curves are an engine property consumed consistently by every
system. A road that only looks curved, a vehicle that follows a different curve than the barrier, or
a renderer-specific centerline would fail the milestone even if the screenshot looked convincing.
