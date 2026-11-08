# Thread stripping calculator: engineering reference

How to tell whether a threaded connection will fail by the **screw breaking**, the **external (screw) threads stripping**, or the **internal (nut or tapped hole) threads stripping**, and how much thread engagement prevents stripping.

**Source:** *Machinery's Handbook*, 31st ed. (2020), "Formulas for Stress Areas and Lengths of Engagement of Screw Threads", book pages 1668–1669 (PDF pages 1679–1680). The thread tolerance data comes from Table 3, "Standard Series and Selected Combinations: Unified Screw Threads", book pages 1951–1974 (PDF pages 1962–1985). The PDF is in the Dropbox reference folder (see `REFERENCES.md`). **PDF page = book page + 11** in this edition.

This file is a paraphrase plus equations. Formula numbers (1)–(6) match the handbook.

- Thread data, inch: [`data/unified_thread_limits.json`](../data/unified_thread_limits.json) (UNC and UNF, #4 through 1-1/2 in, classes 2A/2B and 3A/3B)
- Thread data, metric: [`data/metric_thread_limits.json`](../data/metric_thread_limits.json) (ISO M-profile, M1.6 through M100, coarse and fine pitches, internal 6H, external 6g / 6h / 4g6g)
- Test cases: [`tests/thread_stripping_cases.json`](../tests/thread_stripping_cases.json) (inch), [`tests/thread_stripping_metric_cases.json`](../tests/thread_stripping_metric_cases.json) (metric)

The handbook states the formulas in inches, but they work for metric threads too. See section 7.

---

## 1. The idea

A threaded joint pulled in tension can fail three ways:

1. **Screw breaks** across its threaded section. The area resisting this is the **tensile-stress area A_t**.
2. **External thread strips.** The screw's threads shear off along a cylinder at about the **minor diameter of the internal thread**. Shear area **A_s**.
3. **Internal thread strips.** The nut's or hole's threads shear off along a cylinder at about the **major diameter of the external thread**. Shear area **A_n**.

**Design goal:** the screw should break before either thread strips. A broken screw is obvious and easy to replace; a stripped tapped hole can ruin the part. So the length of engagement should be long enough for the threads to carry the full breaking load of the screw.

A_t is fixed by the thread size. A_s and A_n grow linearly with the length of engagement L_e. So the question is how long L_e has to be.

---

## 2. Symbols

All in inches unless noted. The A/B values come from the thread class tolerance table (see section 5 and the data file).

| Symbol | Meaning | Data file field |
|---|---|---|
| n | threads per inch | `tpi` |
| D | basic major diameter | `basic_major_d` |
| E | basic pitch diameter (= D − 0.649519/n) | — |
| L_e | length of engagement (axial length the threads overlap) | — |
| A_t | tensile-stress area of the screw, in² | — |
| A_s | shear area of the **external** thread, in² | — |
| A_n | shear area of the **internal** thread, in² | — |
| **E_s min** | minimum pitch diameter of the **external** thread | `2A.pitch_min` / `3A.pitch_min` |
| **D_s min** | minimum major diameter of the **external** thread | `2A.major_min` / `3A.major_min` |
| **K_n max** | maximum minor diameter of the **internal** thread | `2B.minor_max` / `3B.minor_max` |
| **E_n max** | maximum pitch diameter of the **internal** thread | `2B.pitch_max` / `3B.pitch_max` |

The formulas deliberately use the **worst-case (loosest-fit)** limits: the smallest screw against the largest hole. That gives the least thread overlap and so the smallest shear areas.

---

## 3. Formulas

### Tensile-stress area of the screw
- **(2a)** Steels up to 180,000 psi ultimate: A_t = 0.7854 · (D − 0.9743/n)²
  (Equivalent form: A_t = π (E/2 − 3H/16)², with H = 0.866025/n.)
- **(2b)** Steels over 180,000 psi ultimate: A_t = π · (E_s min / 2 − 0.16238/n)²
  This uses the minimum pitch diameter, so it gives a slightly smaller, more conservative area.

### (1) Length of engagement to prevent external-thread stripping
For internal and external materials of **equal tensile strength**:

  L_e = 2 · A_t / [ π · K_n max · ( 1/2 + 0.57735 · n · (E_s min − K_n max) ) ]

The factor **2** means the external thread's shear area is made twice the screw's tensile-stress area. That roughly assumes shear strength ≈ half of tensile strength, which builds in a small safety margin against stripping.

### (5) Shear area of the external thread
  A_s = π · n · L_e · K_n max · [ 1/(2n) + 0.57735 · (E_s min − K_n max) ]

### (6) Shear area of the internal thread
  A_n = π · n · L_e · D_s min · [ 1/(2n) + 0.57735 · (D_s min − E_n max) ]

Both are proportional to L_e. A calculator can compute "shear area per inch of engagement" once, then multiply by L_e.

Formula (1) is formula (5) solved for the L_e that makes A_s = 2 A_t.

### (3) Relative strength factor J: will the internal thread strip first?
When the nut or tapped part is a **weaker material** than the screw (for example a steel screw in aluminum or cast iron):

  J = (A_s × tensile strength of external-thread material) / (A_n × tensile strength of internal-thread material)

with A_s and A_n both evaluated at the L_e from formula (1).

- **J ≤ 1:** the L_e from formula (1) is enough, and the internal thread won't strip first.
- **J > 1:** the internal thread is the weak link. Lengthen the engagement:

### (4) Required engagement for a weaker internal thread
  Q = J · L_e

### Load to break the screw
  P = S_ut · A_t   (S_ut = ultimate tensile strength of the screw material)

---

## 4. Turning this into calculator outputs

The handbook's method answers "how much engagement do I need?" A calculator can also answer "for this engagement, which part fails first, and at what load?":

1. Look up the thread (size, TPI, class) in the data file to get E_s min, D_s min, K_n max and E_n max.
2. Compute A_t (2a or 2b, by screw strength), then the per-inch shear areas a_s = A_s/L_e and a_n = A_n/L_e.
3. **Required engagement:** L_e from (1). If the materials differ, J and Q from (3) and (4). The design minimum is max(L_e, Q).
4. **For a user-entered engagement L:** estimate each failure load:
   - Screw break: P_break = S_ut,ext · A_t
   - External strip: P_ext ≈ τ_ext · a_s · L
   - Internal strip: P_int ≈ τ_int · a_n · L
   - The smallest load is the predicted failure mode.

   Here τ is the material's ultimate shear strength. The handbook's factor of 2 corresponds to τ ≈ 0.5 S_ut, the conservative default. Real steels are nearer 0.6 S_ut. Let the user override the ratio, but default to 0.5 so the results agree with formulas (1)–(4).

   With τ = 0.5 S_ut and L equal to the formula (1) length, P_ext equals P_break exactly, which is a handy self-check.
5. Show the user both the required engagement and the margin. Expressing it as a multiple of diameter, L/D, is intuitive.

### Warnings to show
- Internal material weaker than the screw and J > 1: the hole needs more engagement than a standard nut gives. Suggest a longer engagement, a coarser thread (UNC has more internal shear area per inch than UNF), or a thread insert.
- Engagement shorter than the formula requires.
- Screw over 180 ksi ultimate: switch A_t to formula (2b).
- The method assumes full-form threads over the whole engagement. Don't count chamfered or countersunk lead-in threads, or the incomplete threads at the bottom of a tapped hole.
- Loads are static tension. Fatigue and preload belong to the bolted joint calculator (`docs/bolted-joint-reference.md`).

---

## 5. Thread data notes

- **Classes:** 2A/2B is the normal commercial fit; 3A/3B is a tighter precision fit. The class sets the four tolerance diameters, so the same nominal size gives slightly different shear areas in each class. 3A has no allowance (its maximum pitch diameter equals basic), so its threads overlap more and need slightly less engagement.
- Mixed classes (for example a 2A screw in a 3B hole) are allowed: take the A values from the screw's class and the B values from the hole's class.
- The data file stores every limit from the handbook table for each size. That includes extra fields the formulas don't use (allowance, maximum major diameter, minimum pitch diameter of the hole, UNR minor diameter) for future features.
- Number sizes (#4–#12) are labelled with a `#` prefix. Fractional sizes use a slash (for example `1-1/4-7 UNC`).
- A cross-check on the transcription: an independent EngineersEdge example for 1/2-13 UNC-2A uses E_s min = 0.4435 in, which matches the data file.

---

## 6. Typical results (2A/2B, equal strengths)

These are computed from the formulas and the data file, and they are in the test file.

| Thread | A_t (in²) | L_e by formula (1) (in) | L_e / D |
|---|---|---|---|
| 1/4-20 UNC | 0.0318 | 0.173 | 0.69 |
| 3/8-24 UNF | 0.0878 | 0.304 | 0.81 |
| 1/2-13 UNC | 0.1419 | 0.364 | 0.73 |
| 5/8-11 UNC | 0.2260 | 0.453 | 0.73 |

So with matched materials, about 0.7–0.8 D of full thread engagement is enough. That explains why a standard nut, about 0.875 D thick, develops the full bolt strength. In weaker hole materials J pushes this up: a 120 ksi steel screw in 45 ksi aluminum needs about 1.85× as much.

---

## 7. Metric (ISO M-profile) threads

**Why the same formulas work:** formulas (1), (3), (4), (5) and (6) are pure geometry of a 60° thread (0.57735 = tan 30°). ISO metric and Unified inch threads share the same 60° basic profile. So the formulas work in any consistent units if **n = threads per unit length**:
- inch: n = threads per inch, lengths in inches, strengths in psi, loads in lbf;
- metric: **n = 1/P** per mm (P = pitch in mm), lengths in mm, strengths in MPa, loads in N (MPa × mm² = N).

**Tensile-stress area:** metric threads use the ISO 898-1 area, which differs slightly from the Unified formula (2a) because ISO defines the root differently:

  A_t = (π/4) · (d − 0.9382 · P)²

It gives the standard values: M6 20.1 mm², M10 58.0 mm², M12 84.3 mm². Formula (2b), for screws over 180 ksi (1241 MPa), is also plain 60° geometry and applies to both. No standard ISO property class reaches that strength; class 12.9 is 1220 MPa.

**Thread limits:** from *Machinery's Handbook* 31st ed., Table 12 "Internal Metric Thread – M Profile Limiting Dimensions" and Table 13 "External Metric Thread – M Profile Limiting Dimensions", ANSI/ASME B1.13M-2005, which matches ISO 965. These are on book pages 2027–2032 (PDF pages 2038–2043).

| Formula symbol | Metric data field |
|---|---|
| E_s min (external pitch dia., min) | `6g.pitch_min` (or `6h`, `4g6g`) |
| D_s min (external major dia., min) | `6g.major_min` |
| K_n max (internal minor dia., max) | `6H.minor_max` |
| E_n max (internal pitch dia., max) | `6H.pitch_max` |

**Classes:** 6g/6H is the normal commercial fit, like 2A/2B. 6h has no allowance, so it overlaps the hole slightly more and needs a little less engagement. 4g6g has a tighter pitch-diameter tolerance. The handbook lists internal threads in class 6H only.

**Spot check:** for M10 × 1.5, the 6g pitch diameter is 8.994/8.862 mm and the 6H minor diameter max is 8.676 mm. Both match ISO 965-2.

**Typical results (6g/6H, equal strengths):**

| Thread | A_t (mm²) | L_e by formula (1) (mm) | L_e / d |
|---|---|---|---|
| M6 × 1 | 20.1 | 4.66 | 0.78 |
| M10 × 1.5 | 58.0 | 7.44 | 0.74 |
| M10 × 1.25 | 61.2 | 7.81 | 0.78 |
| M12 × 1.75 | 84.3 | 8.88 | 0.74 |

These are in line with the inch results (about 0.7–0.8 d). For example, M12 needs 8.9 mm (0.35 in) and the similar-size 1/2-13 UNC needs 0.364 in.
