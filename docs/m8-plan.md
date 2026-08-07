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

### Implementation checkpoint

The production route is now authored as seven immutable, named sections whose endpoints match the
existing encounter bands exactly: launch/onboarding (`0–250 m`), opening alternating sweepers
(`250–700 m`), patrol sightline (`700–950 m`), technical lull (`950–1,200 m`), mixed-pressure
sweepers (`1,200–1,700 m`), recovery (`1,700–1,900 m`), and final gauntlet (`1,900–2,200 m`). Module
initialization fails loudly if a section's segment lengths drift from its accepted endpoint.

The patrol band begins with a `100 m` sightline and uses only one broad bend. The lull carries the
first compact technical pair, the dense-pressure section returns to broader separated sweepers, and
the `200 m` recovery straight precedes a faster opposing curve pair that continues to the finish.
This keeps traffic pressure and geometric demand from peaking at the same band transitions.

Structural tests lock the exact total, section distribution and direction changes, minimum bend
radius, finite samples, continuous joins, and the non-empty final challenge. The full automated
suite passes. Initial browser checks at native size and `374 × 516` forced-touch size reached the
first sweeper in a collision-heavy unsteered run: the bend was readable in both road view and inset,
controls and HUD remained clear, and the console stayed clean. Complete clean and collision-heavy
runs are still required before accepting the playable checkpoint or tuning section geometry.

## M8.3 — Fixed routes versus seeded generation

### Accepted mode direction

Use a deliberate hybrid separated by game mode rather than silently randomizing the campaign.
After the title screen, a `DISPATCH` screen selects between a fixed-route campaign and a seeded
Challenge run. The working presentation names are `COAST TO COAST` for the campaign and `ENDLESS
BLACKTOP` for Challenge; final naming remains a presentation decision.

- Campaign stages are authored, learnable, and individually tunable against their encounters.
- Challenge consists of successive seeded stages, has its own score channel, and ends when the
  player fails a stage.
- A Challenge stage completion advances to an intermission and then a harder generated stage rather
  than returning to Dispatch.
- Generated routes are never substituted into Campaign implicitly.

Challenge is planned as a roguelite rather than only an endless score attack. Cargo damage carries
between stages, fuel receives a partial refill, and cumulative score, haul currency, and temporary
run upgrades carry forward. The exact refill amount and future intermission economy remain tuning
work. A failure clears the temporary run state and records the completed Challenge result.

Reserve three distinct upgrade scopes so later progression does not become entangled with stage
simulation:

1. Permanent garage unlocks belong to the player profile.
2. An equipped loadout defines what the truck brings into a run.
3. Challenge run upgrades are temporary and reset when that run ends.

Future ranked or daily Challenges may enforce a standard starting loadout for score fairness while
ordinary Challenge runs use the player's equipped garage loadout. Upgrade effects must derive
effective tuning from immutable base tuning; they must not mutate global defaults.

### Seeded route experiment

Build the smallest pure seeded generator needed to produce several valid `2,200 m` candidate routes
from the same segment vocabulary and constraints as Stage 1. Generate from vetted route phrases
within fixed gameplay section budgets rather than choosing arbitrary unconstrained lengths and
curvatures. Keep the accepted authored route as the Campaign default while evaluating candidates in
the Challenge context.

Compare these options:

| Option | Strength | Risk |
|---|---|---|
| Fixed authored stages | Learnable, tunable, and easy to align with encounters | Repetition after mastery |
| Seeded generated routes | Replay variety and reproducible bug reports | Unreadable or poorly paced combinations |
| Hybrid | Authored stage identity with seeded variation in bounded sections | More rules and more states to test |

Use player comprehension, recovery windows, encounter coordination, replay value, reproducibility,
and authoring/maintenance cost as the decision criteria. Record the decision and rejected tradeoffs
in this document before changing the production route source.

One root Challenge identity owns the run seed and generator version. Derive named, independent
substreams for every stage and for its route, encounters, traffic, and future shop offers. Adding a
random choice to one subsystem must not perturb the others. Persist the resolved route definition in
addition to its seed and generator version so a run remains reproducible after generator changes.

The M8 implementation reserves but does not build the future truck-stop shop, currency economy, or
upgrade catalog. Its session model must be able to carry those values without making route generation
depend on them.

### Tests first

- Equal seeds produce equal definitions; representative different seeds produce different routes.
- Every generated route terminates within a bounded number of attempts and passes length,
  curvature, continuity, and finite-coordinate validation.
- Invalid generator inputs and unsatisfiable constraints fail explicitly.
- A replay records enough route identity to reproduce its geometry exactly.
- Campaign and Challenge dispatch selections produce distinct session identities and route sources.
- Challenge completion carries cargo damage, applies the accepted partial fuel refill policy, retains
  cumulative score and run upgrades, increments stage number, and derives the next stage seed.
- Challenge failure ends the run without leaking temporary state into a new run or Campaign.
- Campaign and Challenge results cannot enter one another's score channel.

### Session-model implementation checkpoint

The pure session model now distinguishes authored Campaign sessions from seeded Challenge sessions
before any navigation or route-generator UI is added. Campaign and Challenge carry explicit,
different score channels. Challenge uses immutable `driving`, `intermission`, and `failed` snapshots;
stage completion captures cargo damage, remaining fuel, cumulative score, earned haul currency, and
opaque run-upgrade levels before the future truck-stop phase begins.

Starting the next stage applies a provisional additive `25%` tank refill, clamped at full and
supplied through an explicit intermission policy so later tuning does not alter transition logic.
Cargo damage, currency, score, and run upgrades carry unchanged. Failure is exact-once, retains the
failed-stage distance for result ordering, and a separately constructed run always starts without
temporary state from the failed run.

One validated `uint32` run seed plus generator version deterministically derives each positive stage
number. Named route, encounter, traffic, and shop seeds are independent siblings, so consuming or
adding randomness in one subsystem cannot advance another. Route definitions themselves remain the
next generator slice and will be stored with this identity when generated.

### Resume checkpoint — 2026-08-05

Pause state: the pure session/seed model and its tests are implemented but not yet wired into
`index.ts`, `roadGame.ts`, persistence, or presentation. `src/game/gameSession.ts` owns Campaign and
Challenge identities, separate score-channel tags, the Challenge `driving → intermission → driving`
stage loop, exact-once failure, carryover snapshots, the provisional additive `25%` fuel refill, and
named stage subsystem seeds. `tests/unit/gameSession.test.ts` covers that contract. The project gate
passes with `336` tests plus format, lint, typecheck, and build.

### Dispatch navigation checkpoint — 2026-08-05

A `DISPATCH` screen now sits between the title screen and gameplay. `src/game/dispatchScreen.ts` owns
the DOM-free selection state machine — highlight position, wrap-around arrow navigation,
`Enter`/`Space` confirmation, per-option click and hover, and `Escape` back to the title — while
`components/DispatchScreen.ts` owns the persistent DOM, Shadow DOM presentation, focus lifecycle,
and composed `dispatch-select` / `dispatch-back` events. Its warm Campaign and cool Challenge tiles
use persistent gradient frames with focused and hovered neon glows. `index.ts` shows or hides the
single component instance and reacts to those events rather than rebuilding the screen.

`COAST TO COAST` starts the existing Stage 1 flow unchanged. `ENDLESS BLACKTOP` now starts a
generated Stage 1 route from its Challenge session identity. Successive generated stages and their
intermission flow are now wired through the minimal continue screen.

Known deferred work created by this slice:

- The web component has no automated DOM-level coverage; the pure handler contract remains covered
  by `tests/unit/dispatchScreen.test.ts`, while component lifecycle and presentation are verified in
  a real browser.

Remaining M8.3 follow-up, in dependency order:

1. Tag persisted results with their mode/score channel and generated route identity when the pending
   M6 tally and persistence work lands; do not mix Campaign and Challenge ordering. M8.3 deliberately
   does not initialize or write `DataStore` yet.
2. Run the full automated and browser matrices, including successive Challenge stages, fresh-run
   isolation, phone controls, offline reload, and exact reproduction from recorded route identity.

### Seeded route generator checkpoint — 2026-08-06

The pure generator in `src/game/challengeRouteGenerator.ts` now consumes
`ChallengeStageIdentity.routeSource.seed` and selects from named, vetted phrases inside the same
`2,200 m` section budgets used by Stage 1. Equal seeds reproduce the complete resolved definition;
different representative seeds select different phrase combinations. The generator compiles every
candidate through the shared `createRoute()` implementation, checks exact length, bend radius,
approach/recovery windows, finite endpoints/samples, and a bounded global centerline-clearance
corridor, then fails explicitly after at most eight attempts.

Route identity is durable at the session boundary: generated `routeSource` now carries the
generator ID, generator version, route seed, and deeply frozen resolved `RouteDefinition`. The
Challenge session validator rejects a definition that no longer matches the run/stage identity.
`src/game/sessionRoute.ts` resolves Campaign's authored route ID or recompiles the recorded
Challenge definition; `startRoadGame()` receives that compiled route explicitly instead of creating
Stage 1 internally.

The dispatch flow is now live for both modes. Campaign starts `stage-1-authored-v1`; Challenge starts
a fresh random run seed and reaches generated Stage 1. Native and `374 × 516` browser smoke checks
showed the map, HUD, truck, and controls remain readable, and the browser console stayed clean.
The deterministic candidate comparison and full-route playtest support the accepted hybrid decision:
Campaign remains authored and learnable, while Challenge receives bounded seeded variation through
the vetted phrase library. Sample route seeds produce distinct named combinations such as
`opening-broad-right-left` / `technical-tight-right-left` and `opening-long-read` /
`technical-left-right`; all candidates retain explicit approach, recovery, curvature, and global
clearance bounds. The generated route completed a collision-heavy browser drive and entered the
successive-stage flow without map, HUD, or console regressions.

### Hybrid decision — accepted 2026-08-06

Use the deliberate mode-separated hybrid. `COAST TO COAST` owns fixed authored routes for
comprehension, encounter tuning, and campaign identity. `ENDLESS BLACKTOP` owns reproducible seeded
generated routes for replay value, with phrase-level constraints preserving recovery windows and
authorial control. Do not randomize Campaign implicitly, and do not pretend bounded generation
removes the need for route validation.

Rejected alternatives: fully fixed Challenge routes lose the intended replay value; unconstrained
generation risks unreadable combinations and makes encounter coordination harder to diagnose. The
accepted compromise keeps one route identity per mode, one root Challenge seed, independent named
subseeds, and the resolved definition in the active session for exact reproduction. Persistence of
that identity belongs to M6 rather than this milestone.

### Challenge loop checkpoint — 2026-08-06

`src/game/roadGame.ts` now exposes terminal-result ownership without changing Campaign behavior.
Challenge completion is converted through the pure session transition, the road is disposed, and
`src/game/challengeIntermissionView.ts` presents the carried cargo, current fuel, cumulative score,
and the next-stage action. Continuing derives the next independent stage identity and recompiles its
recorded route definition. Initial cargo integrity and fuel now feed the next driving state, while
HUD and terminal presentation report the active stage number. Challenge failure still uses the exact-once
`failed` session transition and the existing terminal panel; retry starts a fresh Challenge run.

Browser verification drove a collision-heavy no-steer Challenge run through the full `2,200 m`
route: `STAGE 1 CLEARED` appeared at roughly `01:51`, the intermission showed `NEXT ROUTE: STAGE 2`,
and continuing reached `STAGE 2` with `0%` cargo retained and the provisional fuel refill visible
(`25%` carryover becoming approximately `50%` at stage start). No console errors or warnings were
reported. Result persistence remains intentionally deferred until M6 provides the score/result
storage contract.

Do not implement the truck-stop economy, upgrade catalog, or permanent garage progression during
M8.3. The session model reserves those seams; this milestone only proves deterministic generated
routes and the multi-stage mode flow.

### Exit criterion

The `DISPATCH` flow reaches the fixed Campaign route or a reproducible multi-stage Challenge run, and
the hybrid decision is recorded with deterministic and browser evidence. Persistence and the full
offline/browser matrix remain follow-up verification work; patrol-specific work remains behind the
M8.4 design gate.
Experimental generator code that is not part of the decision is removed or kept behind an explicit
development-only seam. Upgrade and shop content remains deferred while the session contract needed
by it is explicit and tested.

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
- [x] Stage 1 contains several intentional, tested road sections totaling `2,200 m`.
- [x] Encounter bands are reviewed against the revised geometry.
- [x] The fixed/generated/hybrid decision and its evidence are recorded.
- [ ] Production route identity is reproducible for saved runs and bug reports.
- [ ] Rylee is consulted before patrol behavior tests or implementation are changed.
- [ ] The accepted patrol model is deterministic, observable, tested, and playable.
- [ ] Automated checks and the browser matrix pass without console or offline-cache regressions.
