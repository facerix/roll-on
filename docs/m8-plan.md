# Milestone 8 Plan — Route Playability

This milestone improves how players read, learn, and survive Stage 1. It adds a route-map inset,
replaces the current single S-curve route with a more varied drive, evaluates authored routes
against seeded generation, and revisits highway-patrol behavior after a dedicated design
conversation.

## Outcome

- A compact map in a top corner shows the full route, current progress, and upcoming bends without
  hiding nearby traffic or touch controls.
- Stage 1 has several readable changes of direction and rhythm across its existing `2,200 m`
  distance, rather than a shallow S-curve between two long straightaways.
- We make an evidence-backed decision between fixed stage routes, seeded generated routes, or a
  deliberate hybrid; procedural generation is not adopted merely because the route model permits
  it.
- Highway patrols create the player experience Rylee intends. Their redesign begins only after a
  design conversation, not from assumptions embedded in the current catch/pace/ram behavior.

## Working principles

- The compiled `Route` remains the single geometric truth for driving, traffic, collisions,
  progress, the finish line, and the route map.
- Playability outranks visual complexity. Every bend needs enough approach distance to read and
  enough recovery distance to regain control.
- Stage geometry and encounters remain deterministic for a given stage/seed and input stream.
- Generated routes, if pursued, accept an explicit seed, validate the same truck/road constraints
  as authored routes, use a bounded attempt count, and fail loudly instead of silently substituting
  a different route.
- Work proceeds test-first around pure geometry/state, followed by browser playtesting at the
  native stage size and representative phone scales.

## M8.1 — Route-map inset ✅

Build a presentation-only map model from samples of the active compiled route. Normalize its
world-space bounds into a small inset and render the centerline, start, finish, and clamped player
progress marker. The map must rotate or scale only by an explicit presentation policy; it must not
maintain a second hand-authored description of Stage 1.

Start with the top-right corner, then choose top-left if browser testing shows better threat and
control visibility. Give the inset an opaque-enough backing plate, a clear border, and a
non-color-only player marker. Keep it out of the accessibility tree when the existing route
distance/progress instruments communicate the same information textually.

### Tests first

- Straight, curved, translated, and negative-coordinate routes fit within bounded map coordinates.
- Aspect ratio is preserved, degenerate bounds are handled explicitly, and no point becomes
  non-finite.
- Start, finish, and player progress use route-space distance and clamp at the route endpoints.
- The same route and progress produce identical map geometry.

### Playable checkpoint

At native size and phone downscales, verify that the map makes upcoming direction changes useful
without covering the truck, finish band, patrol approach, touch targets, or urgent status. Compare
both top corners before accepting placement and dimensions.

### Exit criterion

The player can glance at the inset to understand route shape and progress, and removing the inset
does not change simulation state or outcomes.

### Implementation notes

Implemented as pure route sampling and aspect-preserving world-to-inset projection, with exact
segment joins and exact current progress included in the sampled paths. The Canvas 2D renderer now
supports a validated open polyline primitive. The production game explicitly supplies route-space
progress and layers the framed map, completed-route stroke, start/finish marks, and outlined player
diamond over the scene.

The top-right corner is accepted for the current layout. Native desktop and `374 × 516` forced-touch
checks showed no truck, HUD, or control collision; top-left would conflict with the existing debug
telemetry overlay. The current shallow S is necessarily subtle when its full `2,200 m` geometry is
shown without distorting aspect ratio, reinforcing the need for M8.2 rather than falsifying the map
scale.

## M8.2 — A richer authored Stage 1

Replace `createDefaultStageRoute()`'s four-segment route with an authored sequence containing
multiple curve groups, meaningful straights, and at least one distinct late-stage challenge.
Retain the `2,200 m` finish distance initially so route shape can be evaluated independently of
fuel, score, and run-duration tuning.

Author and name route sections by gameplay intent—for example onboarding, alternating sweepers,
recovery, and final pressure—rather than adding arbitrary segment variety. Reconcile those sections
with the existing encounter-distance bands so patrol spikes and dense traffic do not accidentally
land on unreadable transitions.

### Tests first

- Segment lengths sum exactly to the accepted finish distance.
- Every bend satisfies route/road radius constraints and all compiled samples remain finite.
- Segment joins are position- and tangent-continuous.
- The route has the accepted number and distribution of meaningful direction changes; a regression
  to one curve group fails a structural test.
- The finish band, HUD progress, traffic, barriers, and camera all consume the revised route without
  special cases.

### Playable checkpoint

Drive repeated clean and collision-heavy runs. Record where curves first become visible, where the
truck cannot recover before the next demand, and where traffic obscures the intended line. Adjust
section lengths and curvature from those observations, not from route-map appearance alone.

### Exit criterion

Stage 1 has a learnable rhythm, multiple memorable road sections, and no long final stretch that
feels mechanically empty.

## M8.3 — Fixed routes versus seeded generation

Treat route generation as a decision experiment, not a foregone implementation. Build the smallest
pure seeded generator needed to produce several valid `2,200 m` candidate routes from the same
segment vocabulary and constraints as Stage 1. Keep the accepted authored route as production
default while evaluating candidates.

Compare these options:

| Option | Strength | Risk |
|---|---|---|
| Fixed authored stages | Learnable, tunable, and easy to align with encounters | Repetition after mastery |
| Seeded generated routes | Replay variety and reproducible bug reports | Unreadable or poorly paced combinations |
| Hybrid | Authored stage identity with seeded variation in bounded sections | More rules and more states to test |

Use player comprehension, recovery windows, encounter coordination, replay value, reproducibility,
and authoring/maintenance cost as the decision criteria. Record the decision and rejected tradeoffs
in this document before changing the production route source.

### Tests first

- Equal seeds produce equal definitions; representative different seeds produce different routes.
- Every generated route terminates within a bounded number of attempts and passes length,
  curvature, continuity, and finite-coordinate validation.
- Invalid generator inputs and unsatisfiable constraints fail explicitly.
- A replay records enough route identity to reproduce its geometry exactly.

### Exit criterion

We have a written fixed/generated/hybrid decision supported by deterministic prototypes and actual
playtests. Experimental generator code that is not part of the decision is removed or kept behind
an explicit development-only seam.

## M8.4 — Highway-patrol AI discovery and redesign

**Design gate:** stop and ask Rylee about the intended patrol fantasy, encounter phases, warning and
counterplay, aggression, disengagement, and what should count as player success before writing
failing behavior tests or changing implementation.

Use that conversation to replace the current implicit behavior—catch the truck, move toward its
lane, pace behind the trailer, ram on contact, then disengage—with an explicit, observable state
model. Decide how patrols spawn and signal intent, how they choose lanes or attack positions, how
the player evades or defeats them, and how route curvature and other traffic constrain their
choices. State transitions must be explainable in debug telemetry and deterministic under replay.

### Tests and exit criterion

Write these only after the design gate. The accepted patrol state model, transition tests,
playtesting scenarios, tuning bounds, and exit criterion should be added to this section before
implementation begins.

## Verification

Run the project checklist:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Browser checks cover native and scaled layouts, keyboard and touch controls, the complete revised
route, map legibility in both candidate corners, finish/progress agreement, deterministic replay,
traffic on every curve group, terminal states, and offline reload. Patrol-specific browser checks
are added after the M8.4 design gate.

## Completion checklist

- [x] The route map derives only from the active compiled route and route-space progress.
- [x] Its corner and size are selected by playtesting, with no control or threat occlusion.
- [ ] Stage 1 contains several intentional, tested road sections totaling `2,200 m`.
- [ ] Encounter bands are reviewed against the revised geometry.
- [ ] The fixed/generated/hybrid decision and its evidence are recorded.
- [ ] Production route identity is reproducible for saved runs and bug reports.
- [ ] Rylee is consulted before patrol behavior tests or implementation are changed.
- [ ] The accepted patrol model is deterministic, observable, tested, and playable.
- [ ] Automated checks and the browser matrix pass without console or offline-cache regressions.
