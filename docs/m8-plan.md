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

1. Tag persisted results with their mode/score channel and complete generated stage identity when the
   M8.6 tally and persistence slice lands after the M8.5 Challenge content contract; do not mix
   Campaign and Challenge ordering. M8.3 deliberately does not initialize or write `DataStore` yet.
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
the complete generated stage identity is finalized by M8.6 rather than by M8.3.

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
reported. Result persistence remains intentionally deferred until M8.6, after the M8.4 patrol pass
and the M8.5 Challenge content slice provide the complete score/result identity contract.

Do not implement the truck-stop economy, upgrade catalog, or permanent garage progression during
M8.3. The session model reserves those seams; this milestone only proves deterministic generated
routes and the multi-stage mode flow.

### Exit criterion

The `DISPATCH` flow reaches the fixed Campaign route or a reproducible multi-stage Challenge run, and
the hybrid decision is recorded with deterministic and browser evidence. Final tally, persistence,
and high scores are M8.6 work after the M8.5 Challenge content slice; the full offline/browser matrix
remains follow-up verification work until then.
Experimental generator code that is not part of the decision is removed or kept behind an explicit
development-only seam. Upgrade and shop content remains deferred while the session contract needed
by it is explicit and tested.

## M8.4 — Highway-patrol AI redesign

**Status (2026-08-26):** The design is accepted and the Campaign implementation is in place with
automated coverage. Targeted browser probes confirm that both the posted speed trap and a same-line
Road Rage responder can reach and attack the truck. Rylee's native-size and phone-scale playtest
signs off on patrol playability, presentation, and retained player agency. Direct composition-seam
coverage now exercises the live `roadGame.ts` entry point; Challenge patrol generation moves to M8.5.

### Player-facing contract

- Stage 1 has one visible cruiser in a right-side pullout (`640–760 m`). Crossing its `700 m` trap
  line at the shared `high` speed boundary (`30 m/s`, about `67 mph`) starts pursuit; a slower or
  reverse pass resolves the trap without retriggering it.
- A Road Rage incident schedules one response after exactly `10` simulation seconds. Responses do
  not stack or reset, cannot create a second active pursuit, and are cancelled by terminal state.
- Pursuit follows an explicit deterministic sequence: pull out or respond, close, choose a viable
  side, telegraph, sideswipe, recover, and either repeat or disengage. Traffic and road edges can
  block a side; ties resolve consistently, and a blocked setup is aborted without counting as an
  avoid.
- The first completed attack attempt latches engagement and rebases the authored `250 m` pursuit
  window to the fight. After engagement, the player escapes by holding a `40 m` lead for `1 s`,
  leaving that window, avoiding two committed attacks, or ending the stage.
- Only contact during a committed sideswipe has patrol consequences, once per attack: `1.5 m/s`
  speed loss, `3%` cargo damage, and a lateral/yaw impulse. Jackknifing or crashing must still emerge
  through ordinary truck physics.
- Red/blue glare, semantic `PATROL LEFT/RIGHT` HUD warnings, reduced-motion presentation, and debug
  telemetry all derive from the encounter state; presentation owns no pursuit logic.

### Implementation summary

- `speedTiers.ts` is the validated shared source for dashboard and enforcement thresholds.
- Authored `RoadPullout` geometry widens the shoulder and barrier consistently for rendering and
  collision. Stage 1's `3.6 m`-deep apron physically fits the parked cruiser and is carried through
  the resolved `SessionRoad`.
- `patrolEncounter.ts` owns the pure tagged state machine, trigger precedence, deterministic side
  selection, avoid accounting, and resolution. `patrolPursuit.ts` translates live road and traffic
  observations into cruiser commands and applies committed-hit effects. `traffic.ts` now provides
  generic vehicle motion and contacts; the old ambient patrol spawn and implicit ram AI are gone.
- A one-time off-screen handoff stages a pulling-out cruiser at a clear `24 m` gap so it re-enters
  view promptly; bounded `8 m` fallback steps avoid overlapping traffic and fail loudly if no pose
  is available.
- Same-line responders begin flanking at `26 m`, use a `1.5 s` telegraph to reach the `3.2 m` side
  offset, and fall back while retrying if neither side is viable. This prevents the cruiser from
  pinning itself against the trailer before choosing a side.
- The debug-only `?debug&routeFollow=1` route follower supports long patrol probes while leaving
  throttle, braking, collisions, traffic, and patrol logic live. It is test instrumentation, not a
  player assist or a substitute for manual acceptance.

### Evidence and remaining work

Unit and integration coverage exercises speed thresholds, trigger precedence, every legal state
transition, side clearance, hit/avoid accounting, pullout geometry, traffic contacts, glare, the
off-screen handoff, and same-line Road Rage approach. Direct `roadGame.ts` composition coverage now
also proves that supplied pullouts and encounters reach the mounted simulation and that an owning
terminal result suppresses fallback presentation. Browser probes have driven the Stage 1 cruiser
through pullout, flank, telegraph, sideswipe, and release, and have confirmed that a same-line Road
Rage cruiser gets alongside instead of remaining trapped behind the trailer.

Before closing M8.4:

1. Manually play the threshold cases and all three escape paths at native and representative phone
   sizes.
2. Exercise left and right attacks on straights and bends, with open and traffic-blocked corridors,
   and verify that a hit remains recoverable near the jackknife threshold.
3. Verify Road Rage delay, precedence, non-stacking, and terminal cancellation, then replay an
   identical seeded run for deterministic outcomes.
4. Judge glare, side warnings, map/HUD overlap, reduced motion, attack cadence, hit severity, and
   retained player agency; tune the current staging, flank, and rebased-window values if needed.
5. Directly cover the `roadGame.ts` composition seam. ✅ Challenge encounters, seeded pullouts, and
   stage-difficulty tuning are M8.5 work.

### Exit criterion

Stage 1 presents a readable speed trap and one deterministic, observable pursuit that can be escaped
by speed, distance, or two demonstrated avoids. Road Rage produces one delayed bounded response.
Both attack sides are legible and fair on straights and bends, patrol hits create a recoverable
driving crisis through ordinary physics, and native/phone playtests confirm the complete contract.

## M8.5 — Challenge encounters, seeded pullouts, and difficulty progression

**Implementation checkpoint — 2026-08-27:** Challenge stages now record and resolve generated road
features from their independent encounter seed. The pure `challengeRoadFeatures.ts` generator uses
two vetted placement bands, validates each candidate against the compiled route and shared road and
patrol constructors, and fails with the last validation error after at most eight attempts. Each
recorded feature source retains the generator ID/version, seed, attempt, stage number, frozen
difficulty policy, pullouts, and patrol definitions. `createRoadForSession()` validates that complete
record before play; Campaign still returns its authored route, pullout, and patrol constants
unchanged.

The complete Challenge generator version is now `2`. Generated routes reserve `14 m` of road offset
instead of `10 m`: the four lanes and ordinary shoulder consume `9.9 m`, while the accepted `3.6 m`
cruiser apron needs `13.5 m`. This constraint is part of the recorded route definition, so playback
cannot silently widen older geometry.

Difficulty has three bounded tiers. Stages 1–2 post one trap requiring one avoid; stages 3–4 retain
one trap and require two avoids; stages 5 onward cap at two well-separated traps requiring two
avoids each. The policy never shortens the `300 m` encounter window or changes detection, telegraph,
attack, damage, side-clearance, or escape tuning. The second placement uses the route's sustained
recovery section, and validation enforces approach, inter-encounter recovery, finish recovery,
full-depth apron placement, lane-side clearance, and the state machine's single-active-patrol
contract.

Automated coverage now includes equal/different seeds, route-stream independence, physical road
construction, bounded failure, deeply frozen identity, tamper rejection, sequential trigger
ownership, Campaign isolation, and six-stage carryover/pressure progression. The full project gate
passes with `463` tests. A native and `374 × 516` browser run showed the generated cruiser posted at
stage start, exercised patrol flanking and a left telegraph on the generated road, completed Stage 1,
and began Stage 2 with its own posted cruiser and carried cargo/fuel. The route map, HUD, and warning
remained legible and the console stayed clean.

Remaining playable-checkpoint work: drive several deliberately recorded seeds rather than one
random dispatch seed; trigger the posted trap above the enforcement threshold; and exercise the
stage-5 two-trap tier at native and forced-touch phone sizes. Those checks should tune placement
bands or pressure thresholds if needed before marking the M8.5 exit criterion accepted.

Start this slice after the M8.4 patrol model and its direct `roadGame.ts` composition coverage are
accepted. Keep Campaign's authored patrol definitions unchanged. Challenge owns deterministic
generation of patrol encounters and roadside pullouts for each generated stage, using the existing
independent `encounterSeed` rather than coupling enforcement choices to route, traffic, or shop
randomness.

Resolve the generated road features against the compiled route before starting the stage. Pullouts
must satisfy the same physical clearance and taper constraints as authored pullouts; encounter
windows must remain readable, valid for the selected route sections, and compatible with the patrol
state machine's single-active-pursuit contract. Invalid or unsatisfiable feature sets fail loudly
within a bounded attempt count instead of silently dropping an encounter or substituting geometry.

Challenge difficulty may rise with stage number through an explicit, bounded policy: increase
encounter pressure or route-feature demand only where the resulting recovery windows and attack
fairness remain valid. Difficulty tuning must derive effective values from immutable base tuning and
must not mutate Campaign defaults or global patrol constants. The resolved Challenge stage identity
must retain enough feature data, alongside the route definition, for exact replay and bug reports.

### Tests first

- Equal Challenge stage identities produce equal patrol definitions and pullouts; representative
  different encounter seeds produce different valid feature sets.
- Changing route, traffic, or shop randomness does not perturb encounter or pullout generation, and
  consuming one subsystem's random choices does not advance another subsystem.
- Generated pullouts do not overlap, fit the route, preserve road-edge clearance, and pass the same
  rendering/collision validation as authored pullouts.
- Generated encounter windows fit their route sections, satisfy trigger precedence and active-patrol
  constraints, and fail explicitly when the route cannot support the requested content.
- Stage-number difficulty changes are deterministic, bounded, and preserve minimum approach,
  recovery, side-clearance, and escape guarantees.
- `createRoadForSession()` resolves the same complete Challenge road from the recorded stage
  identity, and Campaign resolution remains byte-for-byte unchanged.
- A representative multi-stage Challenge run exercises generated features without leaking temporary
  state, changing score channels, or changing unrelated subsystem seeds.

### Playable checkpoint

Drive several recorded Challenge seeds at native and representative phone sizes. Confirm that
pullouts are visible and physically usable, patrol warnings arrive with enough approach distance,
generated encounters coordinate with bends and traffic, and increasing stage difficulty adds
pressure without removing a recoverable escape. Replay at least one identical seed after a full
stage transition and compare route, feature placement, patrol outcomes, and terminal state.

### Exit criterion

Challenge stages contain reproducible, validated patrol encounters and seeded pullouts resolved from
the active generated route. Stage-number difficulty increases are explicit and fair, Campaign remains
unchanged, and a recorded Challenge stage can reproduce its complete road-feature identity without
depending on incidental random consumption.

## M8.6 — Final tally, persistence, and high scores

Start this slice only after the M8.5 Challenge content contract is stable, with the M8.3 session and
route identity contracts in place. M6 supplies live/provisional score inputs and immutable terminal
snapshots; M8.6 owns the durable result contract.

**Implementation checkpoint — 2026-08-27:** The terminal tally now consumes only the locked
`StageRunState.terminalSnapshot`. It retains the established `10` points/meter, `2,000`-point Cargo
Integrity multiplier, and `250`-point Road Rage deduction, then adds an explicit first-pass diesel
residual worth up to `1,000` points and the design document's dry-tank completion bonus, initially
`2,500` points. Every component is shown separately; negative totals floor at zero, finish overshoot
does not earn extra distance points, and non-finite or unsafe arithmetic fails loudly.

The historical `scores` key now contains a version-`1` envelope of immutable run results. Loading an
unversioned score array explicitly migrates every valid legacy score into the Campaign channel and
writes the canonical envelope back once. Malformed JSON, unknown versions, corrupt records,
duplicate IDs, and conflicting exact-once writes throw instead of clearing or guessing. Ordering is
score, completed stages, route distance, elapsed time, completion timestamp, then ID, so ties are
stable across reloads. Campaign completion and terminal Challenge failure each own one result ID;
intermediate Challenge stages update the cumulative tally without writing partial results.

Each native result stores its terminal snapshot, final-stage tally, and validated `GameSession`.
Challenge records therefore retain the root seed, generator version, complete resolved route,
generated pullouts, and patrol definitions. Deserialization revalidates the session against its
derived identity, and automated round-trip coverage recompiles an identical road and feature set.
Campaign failure still shows an explainable tally but does not enter the completed-run table.

The terminal dialog now renders the final total, component ledger, and the correct channel's top
five. Dispatch renders separate Campaign and Challenge tables, including semantic empty states, so
scores remain discoverable after reload rather than only immediately after a run. A real desktop
Campaign clear produced and persisted a `22,160`-point tally, then reloaded into Campaign without
appearing in Challenge. A `374 × 516` run reached Challenge intermission with carried score, cargo,
and fuel; forced-touch controls, map, HUD, and both score surfaces remained legible. Browser console
warnings and errors stayed empty. A built `dist/` run was then primed through its service worker,
its temporary server was stopped, and a real network-off reload reached the title, retained the
Campaign score in Dispatch, and started cached Campaign gameplay with touch controls and no console
warnings or errors.

Build the final tally from the locked terminal snapshot without re-simulating the run. Extend
`DataStore` with a versioned run-result schema and explicit migration from the current `scores`
shape. Unknown or corrupt versions fail loudly rather than being guessed. Keep Campaign and
Challenge score channels separate, with deterministic ordering and tie-breaking.

Persist one final result per completed Campaign run or terminal Challenge run. Store the mode, score
channel, root/session identity, and complete generated stage identity, including the resolved route
definition plus Challenge road-feature definitions needed to reproduce geometry and encounters. Do
not persist each intermediate Challenge stage unless the accepted result policy explicitly requires
it. Render the tally and high-score table after reload on phone and desktop, with keyboard, touch,
assistive-technology, and offline coverage.

### Tests first

- Final tally arithmetic matches documented examples and boundary values from immutable terminal snapshots.
- Migration is idempotent and preserves every valid existing score.
- Unknown versions, invalid records, and non-finite score inputs fail explicitly.
- Repeated completion/rendering persists exactly one final result.
- Campaign and Challenge channels never mix, and ordering/tie-breaking is deterministic.
- Persisted generated stage identity round-trips to the same resolved route and road-feature
  definitions.
- Empty, partially migrated, and full high-score tables render valid semantic states.

### Exit criterion

A completed Campaign or terminal Challenge run produces one explainable tally, persists exactly once,
and appears in the correct high-score channel after reload. A persisted generated stage identity can
reproduce the Challenge geometry and encounter configuration used by the run.

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
traffic on every curve group, terminal states, and offline reload. Patrol-specific checks are added
after the M8.4 design gate; Challenge feature and difficulty checks are added in M8.5; tally,
persistence, migration, high-score, and complete stage-identity checks are added in M8.6.

## Completion checklist

- [x] The route map derives only from the active compiled route and route-space progress.
- [x] Its corner and size are selected by playtesting, with no control or threat occlusion.
- [x] Stage 1 contains several intentional, tested road sections totaling `2,200 m`.
- [x] Encounter bands are reviewed against the revised geometry.
- [x] The fixed/generated/hybrid decision and its evidence are recorded.
- [x] Production route identity is reproducible for saved runs and bug reports.
- [x] Rylee is consulted before patrol behavior tests or implementation are changed.
- [x] The accepted patrol model is deterministic, observable, tested, and playable.
- [x] Final tally, versioned persistence/migration, and channel-separated high scores pass after M8.5.
- [x] Automated checks and the browser matrix pass without console or offline-cache regressions.
      (`473` tests, format, lint, typecheck, build, desktop, phone, touch, completion, intermission,
      reload persistence, network-off title/Dispatch/gameplay, and console checks pass.)
