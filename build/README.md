# Build scripts

## From v19 on: `build.py` and `src/`

The page is assembled from `src/`:

    python build/build.py 19            # writes prototype/calc_prototype_v19.html
    python build/build.py 18 --check    # proves src/ still rebuilds v18 exactly

- `src/page.html`: the whole page, except calculators that have their own folder. Fill-ins: `{{VERSION}}`, and a line
  `/*@include NAME@*/` that is replaced by `src/NAME/*.js` joined in name order.
- `src/arm/`: the Arm calculator (`1_model.js`, `2_step3.js`, `3_calculator.js`, `4_plots.js`). The pilot; other
  calculators can move to their own folders the same way when we work on them.

Edit the sources, rebuild, test (every calculator's Validation table must pass), and commit the sources with the new
page. Don't edit generated files in `prototype/` by hand. `build.py` won't overwrite an existing version.

## Up to v18: patch scripts (a record)

Each prototype version was the previous version's HTML file plus a set of changes. The changes are applied by a
Python script here, `make_vNN.py`, which reads `prototype/calc_prototype_v(NN-1).html` and the new code in this
folder (`*.js`, `*.css`), patches it in, and writes `prototype/calc_prototype_vNN.html`.

Run a script from anywhere; paths are relative to the repo:

    python build/make_v18.py

Every patch checks that the text it replaces appears exactly once, so a script stops with an error instead of
building a broken page if the previous version has changed.

### How the next version was made (before build.py)

1. Copy the newest script to `make_vNN.py` (and new code to files named like `thing_vNN.js`).
2. Point it at the previous version, change the version labels, add the patches.
3. Run it, test the page (every calculator's Validation table must pass), then commit the script, its sources and
   the new HTML together.
4. **Make fixes in the sources here and re-run the script.** Don't edit the generated HTML by hand, or the script
   no longer rebuilds it.

## What's here

| Version | Script | New code | Rebuilds exactly? |
|---|---|---|---|
| v5 | `make_v5.py` (args: v5 file, block file) | `beams_block.js` | record only |
| v6 | `make_v6.py` (arg: v6 file) | | record only |
| v9 | `make_v9.py` (args: v8 file, v9 file) | | record only |
| v10 | (built by hand) | `arm_calc.js` (the Arm calculator as first written) | record only |
| v11 | `make_v11.py` | `arm_v11_new.js`, `arm_v11_plots.js` | no: a few fixes were made in the HTML afterwards |
| v12 | `make_v12.py` | `arm_step3.js` | no: same |
| v13 | `make_v13.py` | `shotmap.js`, `shotmap_ui.js` | no: same |
| v14 | (built in another session) | | |
| v15 | `make_v15.py` | `parts_v15.js`, `gear_v15.js` | no: it embeds `data/wcp_parts.json`, which has grown since (wheels, PlanetaryX) |
| v16 | `make_v16.py` | `fly_v16.js` | yes |
| v17 | `make_v17.py` | `intake_v17.js` | no: embeds the parts list, as for v15 |
| v18 | `make_v18.py` | `rfind_v18.js` | yes |
| Style Lab | `make_lab.py` (from v14) | `lab_themes.css`, `lab_layout.css`, `lab_layout.js` | yes (`design/style_lab.html`) |

"Record only" scripts show how a version was made; the committed HTML in `prototype/` is the real version.
Scripts that embed the WCP parts list use whatever `data/wcp_parts.json` holds when they run (refresh it with
`python tools/wcp_parts.py`).
