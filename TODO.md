# To do

Ideas and open work, roughly in priority order. Nothing here is being worked on yet. When an item is started, move the details into a `docs/` note and link it here.

## Bolted joint: the real-world bolt ecosystem

**Goal:** the calculator currently handles textbook bolts: graded steel, rolled threads, standard hex nuts. The goal is to feed in the bolts and nuts we actually use and get trustworthy safety factors for them.

### 1. Fatigue safety factors for in-house shoulder bolts (and any cut thread)
- **Why:** shoulder bolts made in house have cut threads and are made from our own bar stock. Shigley's endurance table (Table 8-17) only covers rolled threads on graded steel bolts, so the calculator shows **no fatigue safety factor** for these today.
- **Method:** Shigley §8-11 says to use the general fatigue method of **Chapter 6** for cut threads:
  - start from the material's endurance limit (steel: about 0.5 × S_ut);
  - correct it with the Marin factors (surface, size, axial loading, temperature, reliability);
  - apply the cut-thread K_f from Table 8-16: **2.8** (SAE 0–2) or **3.8** (SAE 4–8). The fillet under a head or shoulder is K_f ≈ 2.1–2.3.

  It's all in the Shigley PDF we already have, with no new source needed.
- **Shoulder-bolt questions to settle:**
  - Material and heat treatment are ours, so the user enters S_ut, S_y, and maybe S_e.
  - Stress concentration at the step from shoulder to thread: thread relief groove or undercut, fillet radius.
  - Bolt stiffness: the shoulder diameter is bigger than the thread, so eq. 8-17's shank and thread lengths need the real geometry.
  - Joint model: what does a shoulder bolt actually clamp? Usually the shoulder face seats against the tapped part, and the pivoting part is not clamped at all. Check before reusing the standard frustum model.
- **Also covers:** non-steel bolts (aluminum, titanium, stainless). They have the same gap, because Table 8-17 is steel grades only.
- **First step:** extract the Chapter 6 fatigue section from the Shigley PDF into `docs/fatigue-reference.md`, with test cases from its worked examples, the same way Chapter 8 was done.

### 2. Ungraded bolts
- Some sources don't give a grade: no head markings, or listed as "unspecified" or "commercial". Without a grade there's no proof, tensile or endurance strength to look up.
- Shigley §8-6 and Machinery's Handbook both note that unmarked or imported bolts have no obligation to meet any spec.
- **Decide:** add an "Ungraded / unknown" option that assumes a low grade (for example SAE 1–2 or ISO 4.6) and shows a warning, or require the supplier's strength data. Maybe both: a low default with an override.

### 3. Nuts of different thicknesses
- Thin nuts and jam nuts engage less thread, so they may strip before the bolt reaches full strength. The thread stripping check should use the **real nut thickness** as the engagement length.
- The bolt-length auto-pick currently **estimates** nut height as 0.875d (inch) or 0.8d (metric). It should use the actual nut.
- Nut grade or strength matters too, for the J factor in the stripping check.
- **Needs:** nut dimension data (Machinery's Handbook has hex and jam nut tables) and the nuts we actually stock.

### 4. PEM (self-clinching) nuts
- These fail differently from a regular nut. Besides thread stripping they can push out or spin (torque-out) in the sheet, and their thread length is short.
- **Needs:** manufacturer performance data (push-out, torque-out, pull-through) by size and by sheet material and thickness, from the PennEngineering catalog.

### 5. Parts catalog feed (ties 1–4 together)
- Let the calculator pick from our **real inventory** instead of typing values:
  - bolts: source, grade or material, rolled or cut threads, lengths, shoulder dimensions;
  - nuts: type, thickness, grade;
  - PEM nuts, thread inserts.
- **Decide:** the data format. Probably a `data/*.json` file the calculator reads, like `data/unified_thread_limits.json`, and where the data comes from (supplier pages, our own measurements).

## Bolted joint: materials, explanation and drawings

### 6. Exact alloys for each layer, with citations
- Layers can only be generic materials today (steel, aluminum, copper, gray cast iron, custom E), and only the modulus E is used.
- **Want:** a list of the exact alloys we use (for example 6061-T6, 7075-T6, 1018, 4140, 304 stainless, the gray cast iron classes), each with E, Poisson's ratio, yield and tensile strength, and **a citation for every number** (book, table and page).
- **Sources we have:** Shigley appendix tables (Table A-5 elastic constants, the A-20 to A-24 strength tables) and Machinery's Handbook's material tables. Use the newest edition and record the page numbers like the other docs do.
- Ties into item 1: in-house shoulder bolts need the same alloy data for the bolt itself.
- Store it as a data file (for example `data/materials.json`) that the calculator and future calculators can share.

### 7. Support document that explains the calculations
- A reader-friendly explanation of each step: what it means physically, the equation, and a **Shigley citation** (equation number, section, page). It's for users of the site and for the friend reviewing the code.
- **Already exists:** `docs/bolted-joint-reference.md` (working notes), `docs/bolted-joint-equations.html` (equation beside the code), and the calculator's own short docs section and Advanced details table.
- **When:** after the calculator's main architecture is finished, so the explainer documents the final design and doesn't need rewriting.
- **Plan** (aims for lots of illustrations and examples while staying fast):
  1. **Keep the calculator page lean:** results, warnings and a short "how this works" with a link to the explainer.
  2. **Give each calculator its own explainer page** (for example `docs/bolted-joint.html`). It loads only when opened, so it never slows the calculator. This is the mechanicalc.com pattern: every calculator links to its docs and validation cases.
  3. **Draw illustrations with code** (SVG or canvas), not images. They're a few KB each, sharp at any zoom, and can share code with items 8 and 9 so the same drawing appears in the calculator and the explainer.
  4. **Make worked examples live links.** The calculator's "Copy link" stores every input in the web address, so each Shigley example can be an "open in calculator" link plus the book's expected answers, at almost no page weight.
  5. **Photos only where they earn it,** compressed (WebP, about 100–200 KB each) and lazy-loaded. Photos are the one thing that makes pages slow.
- **Size reference** (compressed, as sent to a browser): the whole v7 site is 74 KB, the equations page 9 KB and the thread data 3 KB. One phone photo is 2,000–4,000 KB.
- **Avoid:** putting the explainer content into the single calculator file.

### 8. Illustration of the layers
- A to-scale drawing of the joint as entered: bolt or cap screw, washer, each layer with its material, grip length l, threaded and unthreaded lengths in the grip, and for a cap screw the effective grip into the tapped part. It updates as inputs change.
- This lets a user see at a glance whether the stack they typed matches their part.

### 9. Illustration of the frustum cones
- Draw the pressure cones over the layer drawing: the 30° cones from each bearing face meeting at mid-grip, cut at each material change, labelled with each piece's thickness, diameter and stiffness, matching the rows of the member-stiffness table.
- This is what Shigley's Figs. 8-15 and 8-21 show, and it makes the member stiffness numbers make sense.
- Could be combined with item 8 as one drawing with a "show cones" toggle.

## Projectile: max fire rate

### 10. Shots that peak after the goal
- v8's max fire rate only covers shots that peak **before** the goal (ball coming down into it). If the ball is still rising at the goal, the tiles show "—".
- **Why it's different:** the balls never reach the slowest point (the apex), so the closest approach is wherever they are slowest while two are in the air, usually at the goal. The limit is looser than v_x / D.
- **Method:** `projFireRate()` already measures the gap along the simulated path, so it should work as is. Check it against a hand-worked case and decide what the plot should show.
- **Maybe also:** a safety margin for shot-to-shot speed variation (a slower ball can be caught by the next one).

## Arm calculator

### 11. Counterbalance (gas spring)
- An older tab of the team spreadsheet had a gas-spring counterbalance: spring force, mount radius on the arm, mount distance from the pivot, compressed length and spring angle, and holding torque vs. angle with and without the spring. It was unfinished.
- **Add:** an optional gas spring (or constant-force spring) whose torque at each angle is subtracted from gravity, in both the simulation and the holding current, plus a plot of holding torque vs. angle with and without it.

### 12. Smaller arm follow-ups
- Lowering moves (end angle below start) in all three steps. Step 3’s profile already stops at the end angle; Steps 1–2 still time the lift at full voltage without stopping.
- Mechanism Startup: with the current limit set to 0 (none), "brake to a stop" assumes infinite braking and overshoots. Use the real reverse-voltage current instead.
- Rotor inertia for the motors in the motor list, with a source for each number, so users don't have to type it.
- Load radius and arm tube length as separate inputs, if arms with a long tube and a short load radius come up.

## Ideas from the team spreadsheet

### 13. Shaft stack-up / gearbox width
- Add up the parts on a shaft and get the length between plates.
  - Standard widths from the sheet:
    - 20 DP gear: ½ in
    - HTD 5 mm pulley: 9/16 in (9 mm belt) or ⅞ in (15 mm belt)
    - GT2 3 mm pulley: ⅝ in
    - #25 sprocket: ⅜ in
    - #35 sprocket: 17/32 in
    - bearing flange: 1/16 in
  - Then round up to a standard length, add the gap and the plate thicknesses (¼ in or ⅛ in).
- The sheet's combos are 2 gears, 2 pulleys, 1 gear + 1 pulley, #35 chain + gear, 3 gears and 3 pulleys. Let the user build any stack instead.
- Check the widths against current WCP / REV / AndyMark parts before using them.

### 14. Steady operating point (new mode in Motor Curves)
- Given a target output speed and torque and a ratio, for each motor:
  - motor speed and torque
  - the voltage it actually needs (not full 12 V)
  - current, electrical power, efficiency and I²R heat
- Show the motors side by side. Useful for turrets, swerve steering and anything that runs steady instead of flat out.

### 15. Compare common profiles (Cantilever)
- A table of common profiles under the same load and span:
  - 1×1 and 1×2 tube (⅛ and 1/16 wall)
  - solid bars
  - spacers
  - ⅜ and ½ hex
  - ½ rounded hex
- Rank them by deflection, weight and stiffness-to-weight.
- Add **rounded hex** (the generic name; don't use the VEX trade name) as a section shape here and in Column Buckling. Its dimensions need looking up.

## New calculators and features (from comparing with ReCalc)
ReCalc (reca.lc) is inspiration only: build our own versions, don't reuse its code or data. Order agreed: 16, 17 and 18 now; 20 after we're happy with Arm; 19 is a design to settle first.

### 16. Flywheel: first version done in v16
- **Done:** planetary model (wheel = sun, hood or second wheel = ring, ball = planet), exit speed ratio for measured slip, set point, headroom, spin-up, recovery, speed lost per shot, ball spin and energy, links both ways with Shot Trajectory.
- **Still open:** the hood’s geometry setting the launch angle (exit along the tangent where the hood ends); a separate inertia and motor for a second wheel; supply current for the power budget (#19).
- **Original notes:**
- **Want:** spin-up time from rest, recovery time between shots, speed lost per shot, ball exit speed and spin, energy given to the ball, plus the flywheel's inertia (from wheels, extra flywheel mass, rollers and shafts, like Arm's per-stage inertia).
- **Hand-off:** exit speed to Shot Trajectory, and Shot Trajectory's required speed back here, so shooter and mechanism are designed together.
- **Settle:** shooter type (single wheel + hood, two wheels, wheel over roller), the ball-exit speed model (surface speed × a measured ratio) and how the ball's compression and slip are treated.

### 17. Intake: first version done in v17
- **Done:** drivetrain speed from swerve presets (SDS MK4i L1–L3) or typed in, roller target from the 2× rule, the ratio and pulling force for every motor, time to bring a piece in, and WCP flex wheels (added to the parts tool) with an order list.
- **Still open:** more module presets (check each against the vendor), how the piece compresses and grips, and two-roller intakes.
- **Original notes:** roller surface speed from drivetrain speed (the common "rollers at about 2× drive speed" rule, with the reason shown), presets from swerve module speeds, the ratio every motor needs, and WCP wheels and rollers that fit.

### 18. Ratio Finder: first version done in v18
- **Done:** 1–3 stages of WCP gears, belts, chain and PlanetaryX (stage 1 only); motor and shaft bores; tooth ranges; allowed type per stage; a third stage only when 1–2 stages give fewer than 10 answers; reductions only (unless the target is below 1); chosen answer's parts, gear center distances, links to C-C and an order list. PlanetaryX gear sets were added to the parts tool.
- **Still open:** retire or merge the older Gearbox Options; other planetaries (MAXPlanetary) and vendors; a size or weight score the team agrees on for ranking.
- **Original notes:** 1–3 stages mixing gear, belt, chain and planetary, built from our WCP parts list, with bore filters per stage (e.g. motor pinion bore, then ½" hex), tooth ranges, allowed stage types per stage, and the order list from v15.

### 19. Power budget: battery sag with several systems at once
- **Problem:** battery sag in one calculator assumes that system has the battery to itself. On a robot the drivetrain, shooter, intake and arm draw from it together, so the real voltage is lower than any single calculator shows.
- **Idea, a power budget sheet:** each calculator gets "Add to power budget". It sends that system's **supply current** (peak, how long it lasts, and the full current-vs-time curve when there is one), motor count and current limits. The power budget page lists the systems and lets you build **scenarios** (e.g. "sprint + spin up shooter", "climb", "intake while driving") with a start time for each. It adds the supply currents and works out:
  - battery voltage over time: V = V_rest − R·ΣI (R = battery + wiring, like Drivetrain). Solve it together with the motors, because lower voltage changes their current;
  - the lowest voltage against the brownout threshold;
  - the main breaker and each branch breaker against their trip curves (they carry overloads for a while, so time matters, not just the peak);
  - energy used per match (Ah) and an estimate of the battery's state.
- **Stator vs supply current:** must be explained on the page. A motor stalled or turning slowly draws a high stator (motor) current but a low supply (battery) current, roughly I_supply ≈ I_stator × (applied voltage / battery voltage). Only supply current sags the battery.
- **Mitigations to suggest (from CTRE's guidance; check every number against the current Phoenix 6 docs before using it):**
  - a supply current limit per mechanism, and a lower supply limit after a set time;
  - stator limits for torque, heat and wheel slip;
  - staggering starts (don't spin up the shooter during a sprint);
  - giving the drivetrain priority;
  - voltage-compensated control so mechanisms behave the same as the battery sags.
- **Settle:** worst case "all peaks at once" vs time-aligned scenarios (offer both); where the data lives (in the link and in the browser); which calculators send data first (Drivetrain, Arm, Mechanism Startup, then Flywheel, Intake and Elevator); and whether the budget's voltage is sent back to each calculator to re-run its simulation.
- **Replaces** the earlier idea of adding a supply limit and battery sag separately in every calculator.

### 20. Elevator / linear mechanism (after Arm is settled)
- Reuse the Arm engine without gravity changing with angle. Add cascade and continuous rigging, a spool or sprocket drum, mounting angle, lowering as well as raising, and the same Step 3 software hand-off.

### 21. Motor data check
- **Done (v20):** Kraken X60, X44 (both with FOC) and Minion, against CTRE's Motor Testing Lab (motors.ctr-electronics.com/dyno/dynometer-testing/). Speed, stall torque and stall current already matched; free currents now come from the dyno CSVs. Minion FOC renamed Minion (Adv Hall, Pro): the Talon FXS has no FOC.
- **Next:** REV (NEO 1.1, NEO 2.0, Vortex, NEO 550). CTRE's lab also measured NEO 1.1 and Vortex, and its numbers are far from REV's spec sheet (Vortex 5.96 N·m / 391 A vs our 3.6 N·m / 211 A), so decide which to trust. Then VEX (775pro, CIM) and AndyMark; mark the rest unverified or drop them.
- Record the source in the motor table for each motor as it's checked.
- **Maybe:** weight, power density and kT in a motor spec table; FTC motors.

## Windows laptop setup (do when back at the laptop)
1. **Make Python use UTF-8:** open PowerShell and run `setx PYTHONUTF8 1`, then close and reopen terminals and Claude. Stops scripts garbling "½", "×" and "’".
2. **Install Node.js (LTS)** from nodejs.org, default options. Check it worked: `node --version` in a new terminal.
3. **Ask Claude for the Node test runner:** one command that runs every calculator's Validation table (and the bolted joint tests in `tests/`) before each commit.
4. **Optional, fewer approval prompts:** run `/fewer-permission-prompts` in a Claude terminal to allow the read-only commands Claude uses all the time.
5. **Mac:** `git pull` before working there. The new `.gitattributes` keeps line endings the same on both computers.

## Other open items
- **Friend as collaborator:** add the software-engineer friend to the GitHub repo for code review (see CLAUDE.md).
