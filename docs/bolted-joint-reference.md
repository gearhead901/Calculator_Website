# Bolted joint calculator: engineering reference

A working summary of the method for a **preloaded bolted joint in tension** (static and fatigue), so the calculator can be built without re-reading the textbook.

**Source:** Budynas & Nisbett, *Shigley's Mechanical Engineering Design*, 10th ed., Chapter 8, sections 8-3 to 8-11 (book pages 414–443). The PDF is in the Dropbox reference folder (see `REFERENCES.md`). **PDF page = book page + 23**, so Chapter 8 starts at PDF page 424 and the bolted-joint sections run from PDF page 437 to 466. Only open the PDF if something here is unclear, and only the pages you need.

This file is a paraphrase plus equations. Equation numbers like (8-20) match the book so they can be looked up.

Test cases with known answers are in [`tests/bolted_joint_cases.json`](../tests/bolted_joint_cases.json).

To see each equation next to the code that implements it, open [`bolted-joint-equations.html`](bolted-joint-equations.html) in a browser.

---

## 1. Symbols and units

The book's examples use inch units: in, lbf (or kip = 1000 lbf), psi (or kpsi, Mpsi). The equations also work in SI (mm, N, MPa) as long as the units are consistent.

| Symbol | Meaning |
|---|---|
| d | nominal (major) diameter of the bolt |
| p, n | thread pitch; threads per inch (n = 1/p) |
| A_d | major-diameter area = π d² / 4 |
| A_t | tensile-stress area (see section 2) |
| l | grip: total thickness being clamped (effective grip for cap screws) |
| L | fastener length (under the head) |
| L_T | threaded length of the fastener |
| l_d, l_t | unthreaded and threaded lengths *inside the grip* |
| E | Young's modulus |
| k_b, k_m | stiffness of bolt; stiffness of clamped members |
| C | joint stiffness constant = share of the external load the bolt carries |
| F_i | preload (clamp force from tightening) |
| P | external tensile load **per bolt** (= P_total / N) |
| N | number of bolts sharing the load |
| S_p, S_ut, S_y | proof, ultimate tensile and yield strength of the bolt |
| S_e | endurance strength of the bolt (already corrected, see section 9) |
| σ_i | preload stress = F_i / A_t |
| σ_a, σ_m | alternating and mean (midrange) bolt stress |

---

## 2. Thread geometry: tensile-stress area A_t

Compute A_t from the standard thread formulas (ASME B1.1 and ISO 724) rather than storing a big table:

- **Inch (UNC/UNF):** A_t = (π/4) · (d − 0.9743 / n)²   (d in inches, n threads per inch)
- **Metric:** A_t = (π/4) · (d − 0.9382 · p)²   (d and p in mm)

Spot checks (these match the book's thread tables):

| Thread | A_t |
|---|---|
| 1/2-13 UNC | 0.1419 in² |
| 1/2-20 UNF | 0.1599 in² |
| 5/8-11 UNC | 0.226 in² |
| 3/4-16 UNF | 0.373 in² |
| M10 × 1.5 | 58.0 mm² |
| M12 × 1.75 | 84.3 mm² |

The minor-diameter area A_r (from the book's thread tables) is needed only for the detailed torque equation in section 7.

---

## 3. Grip, lengths and fastener stiffness k_b  (sec. 8-4, Table 8-7)

### Grip l
- **Bolt and nut (through-bolt):** l = sum of every thickness between the bolt head and the nut, *including washers*.
- **Cap screw threaded into a tapped member** (top member thickness t₁ + washer t_w = h, tapped member thickness t₂):
  - l = h + t₂/2  if t₂ < d
  - l = h + d/2   if t₂ ≥ d

### Fastener length
- Bolt and nut: L > l + H (H = nut thickness). The book adds about two threads beyond the nut, then rounds up to a standard length.
- Cap screw: L > h + 1.5d
- Round up to a standard (preferred) length. Not every length is stocked.

### Threaded length L_T (eq. 8-13, 8-14)
- **Inch:** L_T = 2d + 1/4 in for L ≤ 6 in; 2d + 1/2 in for L > 6 in
- **Metric (mm):** L_T = 2d + 6 for L ≤ 125 (and d ≤ 48); 2d + 12 for 125 < L ≤ 200; 2d + 25 for L > 200

### Lengths inside the grip
- l_d = L − L_T (unthreaded length in grip, never negative)
- l_t = l − l_d (threaded length in grip)

### Bolt stiffness (eq. 8-17)
The shank and the threaded part act like two springs in series:

  k_b = (A_d · A_t · E) / (A_d · l_t + A_t · l_d)

- Short cap screw threaded the whole way (l_d = 0): k_b = A_t E / l
- Long fastener where almost all of the grip is unthreaded shank: k_b ≈ A_d E / l

---

## 4. Member stiffness k_m  (sec. 8-5)

The clamped material is modelled as two back-to-back hollow cones ("frusta") spreading out from under the bolt head and nut. Each one has half-angle α, usually **α = 30°**; 45° overestimates stiffness. The cones meet at the middle of the grip (l/2).

### Single frustum (eq. 8-19, and 8-20 for α = 30°)
For a frustum of thickness t, small-end diameter D, made of material E, with bolt hole diameter ≈ d:

  k = π E d tan α / ln[ ((2t tan α + D − d)(D + d)) / ((2t tan α + D + d)(D − d)) ]

With α = 30°: k = 0.5774 π E d / ln[ ((1.155t + D − d)(D + d)) / ((1.155t + D + d)(D − d)) ]

### Assembling members (eq. 8-18)
Frusta and layers act as springs in series:

  1/k_m = 1/k₁ + 1/k₂ + 1/k₃ + …

**How to split the joint into frusta.** This is the part that needs care in code:
1. Start a cone at each bearing face (under the head and under the nut, or at the cap screw's effective-grip end). Each cone's small diameter D = washer face diameter d_w ≈ **1.5d** for standard hex heads.
2. Each cone runs to the grip midpoint, l/2.
3. Wherever a cone crosses a boundary between materials (washer to plate, plate to plate), cut it there. The next piece starts with D = the cone's diameter at that depth: D = d_w + 2 · (depth from the cone's start) · tan α.
4. Adjacent layers with the same E can be merged into one frustum. A hardened steel washer on a steel plate is one steel frustum.
5. Compute each piece with the frustum equation and combine them in series.

If one member is a **soft gasket**, its stiffness dominates. Use only the gasket's stiffness as k_m.

### Shortcut: all members the same material (eq. 8-22, 8-23)
Two equal cones, d_w = 1.5d, α = 30°:

  k_m = 0.5774 π E d / ( 2 ln[ 5 (0.5774 l + 0.5 d) / (0.5774 l + 2.5 d) ] )   (8-22)

Finite-element curve fit (Wileman et al.), valid **only if the whole joint is one material**:

  k_m = E · d · A · exp(B · d / l)   (8-23)

| Material | E (Mpsi) | E (GPa) | Poisson | A | B |
|---|---|---|---|---|---|
| Steel | 30.0 | 207 | 0.291 | 0.78715 | 0.62873 |
| Aluminum | 10.3 | 71 | 0.334 | 0.79670 | 0.63816 |
| Copper | 17.3 | 119 | 0.326 | 0.79568 | 0.63553 |
| Gray cast iron | 14.5 | 100 | 0.211 | 0.77871 | 0.61616 |
| General | — | — | — | 0.78952 | 0.62914 |

Equations 8-22 and 8-23 usually agree within about 2%. For mixed materials, use the frustum method above.

---

## 5. Bolt strength data  (sec. 8-6)

Minimum strengths: 99% of fasteners exceed these values.

### SAE grades (inch)
| Grade | Size range (in) | S_p (kpsi) | S_ut (kpsi) | S_y (kpsi) |
|---|---|---|---|---|
| 1 | 1/4 – 1 1/2 | 33 | 60 | 36 |
| 2 | 1/4 – 3/4 | 55 | 74 | 57 |
| 2 | 7/8 – 1 1/2 | 33 | 60 | 36 |
| 4 | 1/4 – 1 1/2 | 65 | 115 | 100 |
| 5 | 1/4 – 1 | 85 | 120 | 92 |
| 5 | 1 1/8 – 1 1/2 | 74 | 105 | 81 |
| 5.2 | 1/4 – 1 | 85 | 120 | 92 |
| 7 | 1/4 – 1 1/2 | 105 | 133 | 115 |
| 8 | 1/4 – 1 1/2 | 120 | 150 | 130 |
| 8.2 | 1/4 – 1 | 120 | 150 | 130 |

### Metric property classes
| Class | Size range | S_p (MPa) | S_ut (MPa) | S_y (MPa) |
|---|---|---|---|---|
| 4.6 | M5–M36 | 225 | 400 | 240 |
| 4.8 | M1.6–M16 | 310 | 420 | 340 |
| 5.8 | M5–M24 | 380 | 520 | 420 |
| 8.8 | M16–M36 | 600 | 830 | 660 |
| 9.8 | M1.6–M16 | 650 | 900 | 720 |
| 10.9 | M5–M36 | 830 | 1040 | 940 |
| 12.9 | M1.6–M36 | 970 | 1220 | 1100 |

ASTM structural grades (A307, A325, A354, A449, A490) are in the book's Table 8-10 if needed. A325 matches SAE 5, and A490 matches SAE 8.

For a material not listed: S_p ≈ 0.85 S_y.

Proof load: **F_p = A_t · S_p**   (8-32)

---

## 6. External load sharing  (sec. 8-7)

When an external tension P (per bolt) is applied to a preloaded joint, the bolt and the members stretch together, so they share P in proportion to their stiffness:

  C = k_b / (k_b + k_m)

- Bolt picks up: P_b = C · P
- Members lose clamp by: P_m = (1 − C) · P
- Bolt load: **F_b = C P + F_i**   (8-24)
- Member load: **F_m = (1 − C) P − F_i**   (8-25); negative means the members are still in compression.

These hold only while the members are still clamped (F_m < 0). Once the joint separates, the bolt carries all of P.

C is usually small, about 0.15 to 0.35. The members take most of the external load, which is why preload protects the bolt in fatigue. A longer grip lowers C further.

---

## 7. Tightening torque  (sec. 8-8)

  **T = K · F_i · d**   (8-27)

| Bolt condition | K |
|---|---|
| Nonplated, black finish | 0.30 |
| Zinc-plated | 0.20 |
| Lubricated | 0.18 |
| Cadmium-plated | 0.16 |
| With anti-seize | 0.12 |
| With special locking (Bowman-Grip) nuts | 0.09 |

Use K = 0.20 when the condition isn't stated. For friction f = f_c = 0.15, the detailed formula below also gives K ≈ 0.20.

Detailed torque coefficient (eq. 8-26), with d_m = mean of major and minor diameters, λ = lead angle (tan λ = l_lead / (π d_m)), α = 30° thread half-angle, f = thread friction, f_c = collar friction:

  K = (d_m / 2d) · (tan λ + f sec α) / (1 − f tan λ sec α) + 0.625 f_c

Torque is a poor indicator of preload. In tests on identical bolts, preload scattered by roughly ±15% (1σ) dry and about ±9% lubricated. The calculator should state this.

---

## 8. Static checks with preload  (sec. 8-9)

### Recommended preload (eq. 8-31)
- **Reused fasteners (nonpermanent joint):** F_i = 0.75 F_p
- **Permanent joint:** F_i = 0.90 F_p

### Bolt stress
  σ_b = (C P + F_i) / A_t

### Three safety factors
- **Yield (proof) factor:** n_p = S_p A_t / (C P + F_i)   (8-28). This is often only slightly above 1, which is normal for a well-preloaded bolt.
- **Load factor:** n_L = (S_p A_t − F_i) / (C P)   (8-29). This is how many times P can grow before the bolt reaches proof stress.
- **Joint-separation factor:** n₀ = F_i / (P (1 − C))   (8-30). This is how many times P can grow before the members unclamp.

### Finding the number of bolts for a target load factor n_L
  N = C · n_L · P_total / (S_p A_t − F_i), then round up and recheck all three factors.

### Gasketed joints (sec. 8-10)
- Gasket pressure with load factor n: p = [F_i − n P (1 − C)] · N / A_g   (8-33)
- Bolt spacing on a bolt circle of diameter D_b: 3 ≤ π D_b / (N d) ≤ 6   (8-34). Wider than 6d loses gasket sealing; closer than 3d leaves no wrench room.

---

## 9. Fatigue  (sec. 8-11)

### Endurance strength (Table 8-17)
For **rolled threads**, axial loading, fully corrected. K_f is already included, so **don't** also multiply the stresses by K_f:

| Grade | Size range | S_e |
|---|---|---|
| SAE 5 | 1/4 – 1 in | 18.6 kpsi |
| SAE 5 | 1 1/8 – 1 1/2 in | 16.3 kpsi |
| SAE 7 | 1/4 – 1 1/2 in | 20.6 kpsi |
| SAE 8 | 1/4 – 1 1/2 in | 23.2 kpsi |
| ISO 8.8 | M16–M36 | 129 MPa |
| ISO 9.8 | M1.6–M16 | 140 MPa |
| ISO 10.9 | M5–M36 | 162 MPa |
| ISO 12.9 | M1.6–M36 | 190 MPa |

Cut threads are much weaker. Use the general fatigue method from Chapter 6 with these K_f values:

| SAE grade | Metric class | K_f rolled thread | K_f cut thread | K_f fillet |
|---|---|---|---|---|
| 0 – 2 | 3.6 – 5.8 | 2.2 | 2.8 | 2.1 |
| 4 – 8 | 6.6 – 10.9 | 3.0 | 3.8 | 2.3 |

Typical failure locations: about 65% at the first thread engaged in the nut, 20% at the thread runout and 15% under the head.

### Bolt stresses for a load fluctuating between P_min and P_max (per bolt)
- σ_a = C (P_max − P_min) / (2 A_t)   (8-35)
- σ_m = C (P_max + P_min) / (2 A_t) + F_i / A_t   (8-36)
- σ_i = F_i / A_t

General case: the load line starts at (σ_i, 0) and goes through (σ_m, σ_a). Intersect it with the failure line to get the strengths S_a and S_m. Then n_f = S_a / σ_a.
- Goodman, general load line: n_f = S_e (S_ut − σ_i) / ( S_ut σ_a + S_e (σ_m − σ_i) )   (8-38)

### Repeated load: 0 → P (the common case, e.g. a pressure vessel)
- σ_a = C P / (2 A_t)   (8-39)
- σ_m = σ_a + σ_i   (8-40, 8-41). The load line has slope 1.

Fatigue safety factors for that case:
- **Goodman:** n_f = S_e (S_ut − σ_i) / ( σ_a (S_ut + S_e) )   (8-45)
- **Gerber:** n_f = [ S_ut √(S_ut² + 4 S_e (S_e + σ_i)) − S_ut² − 2 σ_i S_e ] / (2 σ_a S_e)   (8-46)
- **ASME-elliptic:** n_f = S_e / ( σ_a (S_p² + S_e²) ) · [ S_p √(S_p² + S_e² − σ_i²) − σ_i S_e ]   (8-47)

Goodman is the most conservative of the three. Gerber and ASME-elliptic are less conservative alternatives if Goodman fails.

The same check written directly in loads (Goodman): n_f = 2 S_e (S_ut A_t − F_i) / ( C P (S_ut + S_e) )   (8-48)

Preload helps fatigue as long as F_i ≤ (1 − C) S_ut A_t   (8-50).

### Always also check yield (eq. 8-51)
  n_p = S_p / (σ_m + σ_a). This equals eq. 8-28.

On the fatigue diagram, the proof-strength line meets the load line at S_a = (S_p − σ_i) / 2. That gives n = S_a / σ_a, the same as n_L from eq. 8-29.

Compare n_f with the yield factors. The smaller one shows the likely failure mode, fatigue or overload. Goodman and Gerber can disagree on which governs, and the calculator should show both.

### Practical notes
- Bolts loosen over time from vibration and cycling. Higher preload resists it: preloads of 60% of proof load or more rarely loosen.
- Use hardened washers under the head (and the nut if needed) so hole burrs don't notch the head fillet.
- Don't reuse nuts on critical joints; the first threads yield during tightening.
- Best bolt length: one or two threads stick out past the nut.

---

## 10. Suggested calculator flow

1. **Inputs:** units; thread (d, pitch or TPI); bolt grade or class; joint type (bolt and nut, or cap screw); layer list (thickness and material for each, including washers); fastener length L (or auto-pick); preload method (0.75 F_p, 0.90 F_p, or user value or torque); load P_total, N bolts, P_min/P_max; fatigue criterion.
2. **Geometry:** A_t, A_d, grip l, L_T, l_d, l_t.
3. **Stiffness:** k_b; k_m from frusta (always), plus the eq. 8-23 cross-check when the joint is a single material; C.
4. **Preload:** F_p, F_i, and torque T = K F_i d.
5. **Static:** σ_b, n_p, n_L, n₀.
6. **Fatigue:** σ_a, σ_m, σ_i; n_f for Goodman, Gerber and ASME-elliptic.
7. **Verdict:** list all factors, flag any below 1 (or below the user's target), and name the governing failure mode.
8. **Warnings:** joint separation (n₀ < 1, so the bolt takes the full load); cut threads; mixed-material joint used with eq. 8-23; preload above the eq. 8-50 limit; bolt spacing outside 3d–6d (gasketed).
