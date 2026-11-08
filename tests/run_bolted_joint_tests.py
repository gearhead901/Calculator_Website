#!/usr/bin/env python3
"""Run the bolted joint and thread stripping test cases against the calculator code in the newest prototype page.

    python3 tests/run_bolted_joint_tests.py               # newest prototype/calc_prototype_vN.html
    python3 tests/run_bolted_joint_tests.py path/to.html  # a specific page

How it works: the math lives in one block of the page, between the lines
"BOLTED JOINT CORE START" and "BOLTED JOINT CORE END". This script cuts that block out (so it tests exactly
what the website runs), adds the cases from bolted_joint_cases.json and thread_stripping_cases.json and the checks
in bolted_joint_harness.js, and runs the result with a JavaScript engine:
  - Node.js, if it is installed (Windows or Mac), otherwise
  - macOS's built-in JavaScript (osascript), so nothing needs installing on the Mac.
It also checks that the thread data embedded in the page still matches data/unified_thread_limits.json and
data/metric_thread_limits.json.
Exit code 0 = every check passed, 1 = something failed.
"""
import json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
START, END = "/* === BOLTED JOINT CORE START ===", "/* === BOLTED JOINT CORE END === */"
CASE_FILES = ["bolted_joint_cases.json", "thread_stripping_cases.json", "thread_stripping_metric_cases.json"]
# Thread data the page embeds, and the data file each copy must match
EMBEDS = [("const UNIFIED_THREAD_LIMITS = ", ROOT / "data" / "unified_thread_limits.json"),
          ("const METRIC_THREAD_LIMITS = ", ROOT / "data" / "metric_thread_limits.json")]


def newest_page():
    pages = sorted(ROOT.glob("prototype/calc_prototype_v*.html"),
                   key=lambda p: int(re.search(r"v(\d+)", p.stem).group(1)))
    return pages[-1]


def run_js(source):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(source)
        path = f.name
    if shutil.which("node"):
        cmd = ["node", path]
    elif shutil.which("osascript"):
        cmd = ["osascript", "-l", "JavaScript", path]
    else:
        sys.exit("No JavaScript engine found. Install Node.js (https://nodejs.org) or run this on the Mac.")
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    Path(path).unlink(missing_ok=True)
    if res.returncode != 0:
        sys.exit(f"JavaScript error:\n{res.stderr or res.stdout}")
    return json.loads(res.stdout.strip().splitlines()[-1])


def main():
    page = Path(sys.argv[1]) if len(sys.argv) > 1 else newest_page()
    html = page.read_text(encoding="utf-8")
    if START not in html or END not in html:
        sys.exit(f"{page.name} has no BOLTED JOINT CORE block.")
    core = html[html.index(START): html.index(END) + len(END)]
    suites = ",".join(f'{{"file":"{f}","data":{(HERE / f).read_text(encoding="utf-8")}}}' for f in CASE_FILES)
    harness = (HERE / "bolted_joint_harness.js").read_text(encoding="utf-8")
    results = run_js(f"{core}\nconst SUITES = [{suites}];\n{harness}")

    # The page embeds the thread data; make sure each copy is still the same as its data file.
    for embed, data_file in EMBEDS:
        if embed not in core:
            continue
        start = core.index(embed) + len(embed)
        embedded, _ = json.JSONDecoder().raw_decode(core[start:])
        same = embedded == json.loads(data_file.read_text(encoding="utf-8"))
        name = data_file.relative_to(ROOT).as_posix()
        results.append({"file": name, "id": "embedded_thread_data",
                        "title": f"Thread data embedded in the page matches {name}",
                        "checks": [{"path": "identical", "expected": True, "actual": same, "ok": same}]})

    shown = page.resolve().relative_to(ROOT) if page.resolve().is_relative_to(ROOT) else page
    print(f"Bolted joint tests against {shown}\n")
    total = failed = 0
    last_file = None
    for case in results:
        if case.get("file") != last_file:
            last_file = case.get("file")
            print(f"=== {last_file} ===")
        print(f"{case['id']} — {case['title']}")
        if case.get("error"):
            failed += 1
            print(f"  ERROR: {case['error']}")
        for c in case["checks"]:
            total += 1
            failed += not c["ok"]
            exp, a = c["expected"], c["actual"]
            numeric = isinstance(exp, (int, float)) and not isinstance(exp, bool)
            act = "missing" if a is None else f"{a:.5g}" if numeric else str(a)
            off = f"  ({(a - exp) / abs(exp) * 100:+.2f}%)" if numeric and a is not None and exp != 0 else ""
            shown = f"{exp:<10g}" if numeric else f"{str(exp):<10}"
            print(f"  {'PASS' if c['ok'] else 'FAIL'}  {c['path']:<44} expected {shown} got {act}{off}")
        print()
    print(f"{total - failed} of {total} checks passed." if not failed else f"{failed} FAILED (of {total} checks).")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
