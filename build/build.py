"""Assemble a prototype page from the sources in src/.

    python build/build.py 19            # writes prototype/calc_prototype_v19.html
    python build/build.py 18 --check    # rebuilds into memory and compares with the committed v18 (no file written)

src/page.html is the page with every calculator except the ones that have moved to their own folders.
A line  /*@include NAME@*/  is replaced by the files in src/NAME/, joined in name order (1_..., 2_..., ...).
{{VERSION}} is replaced by the version number.

So far only Arm lives in its own folder (src/arm/). To work on Arm, edit src/arm/*.js and rebuild; to work on any
other calculator, edit src/page.html. Don't edit the generated files in prototype/ by hand.
"""
import argparse, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')

def build(version):
    page = open(os.path.join(SRC, 'page.html'), encoding='utf-8', newline='').read()
    def include(m):
        files = sorted(glob.glob(os.path.join(SRC, m.group(1), '*.js')))
        if not files: sys.exit(f'nothing to include for {m.group(1)}')
        text = ''.join(open(f, encoding='utf-8', newline='').read() for f in files)
        return text[:-1] if text.endswith('\n') else text      # the include line keeps its own line break
    out = re.sub(r'^/\*@include (\w+)@\*/$', include, page, flags=re.M)
    return out.replace('{{VERSION}}', str(version))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('version', type=int)
    ap.add_argument('--check', action='store_true', help='compare with the existing file instead of writing it')
    a = ap.parse_args()
    out = build(a.version)
    path = os.path.join(ROOT, 'prototype', f'calc_prototype_v{a.version}.html')
    if a.check:
        old = open(path, encoding='utf-8', newline='').read()
        if old == out: print(f'identical: src/ rebuilds {os.path.relpath(path, ROOT)} exactly ({len(out):,} characters)')
        else:
            i = next((k for k in range(min(len(old), len(out))) if old[k] != out[k]), min(len(old), len(out)))
            sys.exit(f'DIFFERENT from {os.path.relpath(path, ROOT)} at character {i}: {old[i-40:i+40]!r} vs {out[i-40:i+40]!r}')
        return
    if os.path.exists(path): sys.exit(f'{os.path.relpath(path, ROOT)} already exists; pick a new version number')
    open(path, 'w', encoding='utf-8', newline='\n').write(out)
    print(f'wrote {os.path.relpath(path, ROOT)} ({len(out):,} characters)')

if __name__ == '__main__':
    main()
