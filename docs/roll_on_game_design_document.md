# Game Design Document: ROLL ON

**Concept:** An 80s arcade-style, vertical-scrolling driving game blending the momentum and scale of a long-haul 18-wheeler with the high-octane vehicular combat and survival mechanics of *RoadBlasters* and *Spy Hunter*.

---

## 1. Aesthetic & Audio Direction
* **Visual Style:** Vibrant late-1980s arcade pixel art. Features a prominent yellow Kenworth truck cab, glowing chrome lettering, neon sunsets, and rich parallax scrolling backgrounds.
* **Audio Soundtrack:** A high-energy mix of driving synthwave and high-tempo 80s "butt-rock" featuring heavy digitized guitar solos and driving basslines to maintain a relentless sense of forward momentum.
* **Sound Effects:** Crunchy chiptune explosions, heavy air-brake hissing, deep diesel engine rumbles, roaring air horns, and digitized voice warnings (e.g., *"WARNING: RUNNING ON FUMES!"*).

---

## 2. Core Semi-Truck Physics & Mechanics
Controlling an 80,000-pound rig introduces unique tactical challenges that separate *Roll On* from traditional sports-car racers:

* **The "Jackknife" Risk:** Aggressive steering or braking at extreme speeds causes the trailer to swing outward. 
    * *Defensive Use:* Players can intentionally "fishtail" to swipe trailing enemies off the asphalt.
    * *Failure State:* Overcorrecting or hitting a barrier while jackknifing triggers an immediate catastrophic crash.
* **Momentum & Ramming:** The truck has a slow initial acceleration curve but immense top-speed momentum. Smaller commuter vehicles that attempt to brake-check the player are automatically plowed over, yielding a "Road Rage" score bonus.
* **Cargo Integrity %:** Acts as the primary scoring health bar. Every collision, bullet impact, or hard environmental bump degrades the Cargo Integrity percentage. Arriving at the destination with 100% integrity yields a massive score multiplier.

---

## 3. The Turbo-Diesel Fuel System (Timer Mechanism)
Instead of a traditional clock or health bar, the fuel gauge acts as the ultimate countdown timer.

* **The Sweet Spot (Cruising):** Traveling at moderate speeds consumes fuel at a predictable, efficient baseline rate. Safe, but risks falling behind the pace of escalating stage hazards.
* **The Hammer Down (High Speed/Nitro):** Engaging the Super-Charger or flooring the pedal to smash through roadblocks drains the fuel reserve exponentially faster.
* **The Stop-and-Go Penalty:** Crashing, hitting spike strips, or being forced to a halt requires moving 80,000 lbs from a dead stop. This heavy acceleration causes an instantaneous "Fuel Gulp" penalty.
* **Refueling Systems:**
    * *The Fuel Tanker Slingshot:* Friendly green fuel tankers periodically appear in traffic. Maneuvering precisely behind them lets the player draft in their slipstream. While drafting, fuel burn drops to 0% and a refueling gauge rapidly fills. (High Risk: Ramming the tanker from behind causes a massive explosion).
    * *Fuel Pods:* Destroying specific enemy targets (like corporate delivery vans) drops glowing green diesel canisters onto the highway to be run over and collected.
    * *Weigh Stations:* Middle-of-the-stage route splits allow players to veer into a narrow, obstacle-heavy corridor that automatically tops up 25% fuel but forces a fixed, slower speed while the stage clock ticks.
* **The "Fumes" State:** Triggered when fuel hits $\le 5\%$. Neon lights flicker, the engine sputters, top speed is capped, and the cabinet warns the player. Crossing the finish line on 0% fuel awards a massive "Dry Tank Bonus."

---

## 4. Weapons & Customization (The Pit Stop Shop)
Earned haul currency can be spent at intermission truck stops on modular upgrades:

* **Smokestack Flamethrowers:** Blasts localized sheets of fire vertically and laterally from the exhaust pipes to incinerate enemies boxing the truck in from the sides.
* **Reinforced Cowcatcher:** A heavy steel front grill that drastically minimizes damage from head-on collisions and effortlessly splits police roadblocks.
* **Cargo Dropper:** Opens the rear trailer doors to drop hazards (loose logs, oil barrels, metal bearings) to neutralize aggressive chasers behind.
* **The Air Horn Blast:** A limited-use sonic weapon that instantly clears mundane commuter traffic out of the player's immediate lane, opening an emergency escape path.

---

## 5. Level Progression & Escalating Chaos

| Stage | Theme | Mundane Obstacles | Bizarre / Chaotic Elements |
| :--- | :--- | :--- | :--- |
| **Stage 1** | **Interstate 80** | Commuter cars, slow RVs, standard highway patrol cruisers. | Rogue gravel trucks fishtailing ahead, pelting the windshield with cracked-glass visual effects. |
| **Stage 2** | **Construction Zone** | Narrow single lanes, concrete barriers, orange cones. | Corrupt officials chasing in weaponized bulldozers and asphalt rollers attempting to crush the cab. |
| **Stage 3** | **Pacific Northwest** | Slick rainy asphalt, sharp winding mountain roads. | Logging trucks splitting open, sending screen-filling logs bouncing down the highway at the player. |
| **Stage 4** | **Desert Showdown** | High crosswinds, tumbleweeds, hidden speed traps. | Post-apocalyptic joyriders in spiked dune buggies trying to board and raid the trailer; requires violent swerving to shake them off. |
| **Stage 5** | **The Mega-Pileup** | Multi-lane gridlock, chaotic traffic patterns. | Full-scale real-time police chase ahead; helicopters dropping spike strips, and an oversized load (rocket fuselage) sliding across all lanes. |

---

## 6. The "Roll On" Truck Stop Intermission
Upon crossing a stage finish line, the view shifts to a dramatic, side-profile pixel art cinematic. 

* **The Visuals:** The yellow Kenworth pulls under a flashing neon sign at "The Last Chance Diesel." Brakes hiss, smoke pours from the stacks, and an animated pit crew swaps tires and hooks up high-velocity fuel lines.
* **Score Tally Flow (with rhythmic mechanical clacking sound effects):**
    $$	ext{Total Score} = 	ext{Base Delivered Cargo} + (	ext{Cargo Integrity \%} 	imes 	ext{Multiplier}) + 	ext{Diesel Residuals} + 	ext{Takedowns} + 	ext{Bonuses}$$
* **The Shop Window:** A 30-second ticking timer displays a grid of repairs and upgrades managed via joystick selection before the driver slams a coffee cup down, shifts gears, and screeches back onto the dark highway for the next stage.