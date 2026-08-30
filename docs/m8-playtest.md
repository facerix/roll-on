# M8 Playtest Follow-Up — Readability and Control Honesty

Family playtesting exposed three related problems in the current Stage 1 presentation:

1. Traffic enters the visible road too late for players to make an informed avoidance decision.
2. Fine-pointer desktop layouts provide no persistent explanation of controls or objectives despite
   having substantial unused horizontal space.
3. Gas and brake labels are not honest about the always-on cruise-setpoint behavior they currently
   drive.

This follow-up addresses those findings without turning the diagnostic top-down view into a larger
orthographic-art milestone or replacing the existing renderer seam.

## Outcome

- The road view provides a measurable reaction window for upcoming traffic at ordinary and maximum
  driving speeds.
- Keyboard, touch, HUD, and instructional labels describe the same control behavior.
- Wide desktop layouts use their side rails for accessible arcade-cabinet instructions and dispatch
  flavor while preserving the fixed playable stage and mobile layout.
- A repeat family playtest determines whether the changes solve the reported problems before
  additional traffic difficulty or presentation polish is accepted.

## Working principles

- Target player reaction time and visible world distance, not a visually chosen camera-anchor
  ratio.
- Keep the entire rig readable. Derive rear framing from the trailer's actual extent and an explicit
  margin instead of reserving arbitrary empty space behind it.
- Preserve or deliberately replace the highway patrol's approach and attack telegraphs when rear
  framing changes.
- Controls must be behaviorally honest. A pedal label means direct pedal input; a retained speed
  target must be an explicit cruise-control state.
- Wide-screen side rails may duplicate instructions and objectives but must not provide exclusive
  gameplay information or an advantage unavailable on mobile.
- Semantic DOM owns instructional text and desktop chrome. The canvas `Scene` remains serializable
  gameplay presentation, and the `Renderer` does not gain text or layout responsibilities for this
  work.
- Work proceeds test-first around camera and control policy, followed by browser checks and outside
  playtesting.

## Deliverable 1 — Reaction-time camera framing ✅

Replace the fixed truck-anchor policy with framing derived from the full rig and a desired forward
sight distance. Move the rig toward the HUD until only the accepted rear margin remains, and
progressively zoom out as speed increases so higher closing speeds receive more visible road.

Treat a top-edge traffic telegraph as a fallback if the accepted orthographic scale cannot provide
the reaction window without making the road and vehicles illegible. Revisit commuter speed and
density only after the camera change has been evaluated, so traffic tuning does not conceal a
presentation failure.

### Tests first

- The full trailer remains inside the road viewport with the accepted rear margin at every camera
  scale.
- Forward sight distance is finite, bounded, and does not decrease as truck speed rises.
- The accepted traffic-speed envelope provides the minimum reaction-time target before contact.
- Identical truck, road, speed, and viewport inputs produce identical camera tuning.
- Patrol approach, flanking, glare, route preview, and HUD boundaries retain their established
  coordinate-space contracts.

### Playable checkpoint

Drive clean and collision-heavy runs at initial cruise, caution, and maximum speed. Verify traffic
readability on straights and bends, and verify that the patrol sequence remains legible from its
first warning through flanking and attack.

### Exit criterion

Players can identify a traffic hazard, choose a lane or braking response, and begin that response
before collision becomes unavoidable at the accepted Stage 1 speeds.

### Implementation checkpoint

The camera now derives its vertical framing from two explicit world-space requirements. Forward
sight distance interpolates from `20 m` at rest through `30 m` at the established `20 m/s` cruise
to `40 m` at the truck's `40 m/s` maximum. Rear depth uses the conservative rotated extent of the
cab and trailer plus a `1.5 m` margin. Road width and a `20 px/m` presentation ceiling may add
visibility but cannot take either required distance away. `roadGame` rebuilds this pure tuning from
the truck's current speed for every rendered camera.

Tests cover deterministic framing, invalid inputs, full-rig clearance, monotonic sight distance,
the `1.4 s` worst-case closing window against the slowest commuter, live speed-to-camera wiring,
and the existing patrol integration. The rear margin was increased from the first `0.75 m` trial
because the top-speed patrol scenario otherwise exceeded its three-second off-screen/re-entry bound
by about `0.08 s`.

Desktop at `1280 × 720` and forced-touch `374 × 516` browser checks at the current cruise speed
kept the complete rig, route preview, HUD, pause control, and touch controls usable with a clean
console. Maximum-speed feel and outside-player comprehension remain part of the playable checkpoint
rather than being inferred from the geometry tests.

## Deliverable 2 — Direct, explicit driving controls ✅

Make throttle and service brake direct inputs by default:

- `ArrowUp` / `W` applies throttle while held.
- `ArrowDown` / `S` applies service brake while held.
- Releasing throttle returns to the truck's ordinary coasting behavior.

Retained-speed cruise control becomes an explicit, initially disabled feature rather than the
hidden default. Engaging it captures the current speed, throttle may override it, and braking
cancels it. Cruise must have equivalent keyboard and touch access before it is player-facing, and
the HUD must distinguish clearly between inactive and active cruise states.

### Tests first

- Held throttle and brake map directly to the corresponding physical truck controls.
- Releasing both pedals produces coasting rather than continued pursuit of a hidden setpoint.
- Cruise engagement captures current speed and exposes an explicit active state.
- Brake input cancels cruise; throttle override and release follow the accepted resume policy.
- Keyboard and virtual touch sources retain identical action semantics and cannot leave an action
  stuck after blur, detach, pause, or terminal state.
- HUD and instructional snapshots never present a cruise target as active when cruise is inactive.

### Playable checkpoint

Repeat runs with keyboard and touch. Check low-speed maneuvering, acceleration to cruise, emergency
braking, collision recovery, and sustained driving for fatigue as well as comprehension.

### Exit criterion

A first-time player can predict truck acceleration, braking, coasting, and cruise behavior from the
visible labels without being told about an invisible setpoint.

### Implementation checkpoint

The run now begins with cruise inactive and no hidden speed target. Held keyboard or touch Gas and
Brake inputs pass directly to the truck, and releasing both produces the established long coast.
`C` and a dedicated touch Cruise button toggle retained-speed control. Engagement captures the
truck's current speed; Gas temporarily overrides that target and resumes it on release; Brake
cancels cruise and remains an immediate service-brake input. A second Cruise command also
disengages without applying a hidden pedal.

The accepted stage opening preserves that control honesty without presenting a dead road. A pure
opening policy places the truck in the right-center lane with `10 m/s` of initial momentum and
cruise still inactive. One far-lane commuter begins alongside the trailer and another begins in the
forward sightline; both pull away and hold their lanes through a six-second grace period before
ordinary seeded traffic spawning resumes. A non-blocking `STAGE N — ROLL ON!` DOM sting clears
after `0.9 s` while controls and simulation remain live. An empty carried fuel tank receives no
free momentum.

The HUD now renders `CRUISE OFF` and hides the dial marker and unit while cruise is inactive. An
active cruise state shows its captured target and marker. The input adapter keeps cruise as the
same edge-triggered action for keyboard and touch, so key repeat, a held finger, blur, detach,
pause, and terminal input shutdown cannot manufacture repeated toggles or strand a held action.

Tests cover direct throttle, direct braking, coasting, explicit capture, toggle-off, throttle
override and resume, brake cancellation, keyboard/touch action parity, inactive and active HUD
snapshots, deterministic route-relative opening poses, initial traffic visibility and non-overlap,
carried resources, and live `roadGame` wiring. Browser checks at `1280 × 720`, forced-touch
`374 × 516`, and forced-touch landscape `720 × 374` kept the opening sting, HUD, traffic, and all
five touch controls usable with a clean console. The first portrait placement put Cruise over the
trailer; the accepted layout moves it above Gas to preserve the central sightline. Sustained-driving
fatigue and first-time player comprehension remain part of the outside playable checkpoint.

## Deliverable 3 — Wide-screen arcade sidecars ✅

Use the unused horizontal space around the fixed stage on sufficiently wide fine-pointer layouts:

- A left instruction card shows the accepted steering, throttle, brake, pause, and explicit cruise
  controls with readable keycaps.
- A right dispatch card summarizes the stage objective and consequences using concise, truthful
  game state and restrained flavor.
- Supporting pixel art follows the existing Roll On title, dispatch, and dashboard identity without
  competing with traffic or duplicating live HUD instruments.

Implement the sidecars as semantic DOM outside the scaled `384 × 576` stage. Hide them when space is
insufficient or the primary pointer is coarse. Their absence must not change stage scale policy,
camera simulation, inputs, objectives, or outcomes.

### Tests first

- Sidecar visibility follows explicit space and pointer-capability policy.
- The fixed stage remains aspect-fitted, centered, uncropped, and simulation-independent.
- Sidecar content contains no control or objective unavailable through the playable stage and touch
  experience.
- Repeated mount, resize, pause, terminal flow, and disposal do not duplicate sidecars or listeners.

### Browser checkpoint

Verify representative desktop widths, a narrow fine-pointer window, portrait and landscape coarse-
pointer layouts, reduced motion, forced colors, keyboard focus, and non-integer stage scaling. The
road, HUD, pause control, route preview, and touch targets must remain unobstructed.

### Exit criterion

Desktop players immediately see how to drive and what success requires, while mobile players retain
complete parity and the central game remains the strongest visual focus.

### Implementation checkpoint

The live road mount now owns one semantic sidecar pair alongside the fixed stage. A pure layout
policy requires a fine primary pointer, at least `240 CSS px` in each centered side rail, and at
least `480 CSS px` of displayed stage height. Eligible cards use up to `288 CSS px` of each rail;
the stage fit remains the unchanged output of `calculateStageLayout()`, and neither card contributes
to simulation or canvas presentation. Resize and primary-pointer changes update the existing nodes.
Disposal removes the pointer and resize listeners with the shell.

The left driver's card documents steering, held Gas, held service Brake, coasting, explicit Cruise,
and Pause with keycaps. Every listed action has the existing touch or in-stage equivalent. The right
Dispatch card repeats the HUD/run contract: reach the route end, protect cargo, watch fuel, avoid a
crash or empty tank, and avoid Road Rage score loss. Neither card owns a live instrument. Cabinet
screws, the existing truck sprites, and the cargo-crate sprite provide restrained pixel detail;
forced-colors presentation removes decorative layers and uses system colors. The cards introduce no
motion of their own.

Tests cover fine/coarse pointer policy, the exact space threshold, safe areas, deterministic
non-mutating placement, fixed-stage independence, content parity, semantic structure, repeated
resize, terminal flow, and listener cleanup. Browser checks kept both cards readable and clear of
the stage at `1280 × 720`, the exact `960 × 720` threshold, and a non-integer `1100 × 700` stage
scale. At `959 × 720` they leave the accessibility tree and the stage remains centered. Forced-touch
portrait `374 × 516` and landscape `720 × 374` layouts kept sidecars absent and all five controls,
HUD, route preview, and Pause usable. Pause/Resume focus remained correct and the checked layouts had
clean consoles. Repeat family playtesting remains the outside exit check for the overall follow-up.

## Delivery order

1. Establish the camera reaction-time contract and validate patrol readability.
2. Make pedals direct and cruise explicit, then reconcile the HUD.
3. Build truthful desktop sidecars against the accepted controls.
4. Run the browser matrix and repeat the family playtest before accepting further polish or traffic
   difficulty changes.

## Overall exit criterion

The original playtest group can avoid ordinary traffic with informed reactions, explain the driving
controls accurately after playing, and understand the Stage 1 objective on desktop without verbal
instruction. Automated checks and the existing format, lint, typecheck, and test suites pass.
