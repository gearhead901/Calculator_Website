# Calculator_Website

Prototype calculator website. The prototypes are single, self-contained HTML files in `prototype/` (`calc_prototype_v1.html` … `v18.html`). The newest version is the current one.

## How versions are built

From v19 on, versions are assembled from `src/` by `python build/build.py NN` (writes `prototype/calc_prototype_vNN.html`; `--check` compares a rebuild with an existing file). `src/page.html` is the page; calculators that have moved to their own folder (so far only **Arm**, in `src/arm/`) are pulled in where `/*@include arm@*/` appears, and `{{VERSION}}` becomes the version number. To change Arm, edit `src/arm/*.js`; to change anything else, edit `src/page.html`. Add a line to the version history comment at the top of `src/page.html` for each new version. Never edit the generated files in `prototype/` by hand. The Style Lab (`design/style_lab.html`) is separate and still built by `build/make_lab.py`.

Versions up to v18 were made by patch scripts (`build/make_vNN.py`), kept as a record. See `build/README.md`.

Files use LF line endings on every computer (`.gitattributes`). On Windows, write scripts as files rather than inline shell commands, because Git Bash can mangle backslashes and non-ASCII characters.

## Working across computers

The owner works on this repo from two computers: a Mac and a Windows laptop. GitHub (`gearhead901/Calculator_Website`, **public**) keeps them in sync.

- Commits use the GitHub no-reply email `304733394+gearhead901@users.noreply.github.com` so the owner's real email isn't exposed. Don't commit with a personal email address.

- Mac repo: `~/Developer/Calculator_Website`
- Windows repo: `C:\dev\Calculator_Website`

- **At the start of a session:** run `git pull` before making changes. If there are uncommitted local changes, say so instead of pulling over them.
- **When the owner says "commit and push":** stage the changes, write a short, clear commit message (use any description the owner gives), and push to `origin main`.
- Don't force-push or rewrite history unless the owner explicitly asks.
- The owner isn't a professional developer. Explain git steps in plain language.

## Reference files (not in git)

Inspiration and reference material is kept in Dropbox, not in this repo. Some files are large, and some belong to other teams. `Inspiration/` is gitignored.

- Mac: `~/Library/CloudStorage/Dropbox/Claude/Calculator_Website/Inspiration/`
- Windows: `%USERPROFILE%\Dropbox\Claude\Calculator_Website\Inspiration\`

Paths use `~` and `%USERPROFILE%` (the user's home folder) so usernames don't appear in this public repo. Expand them to the real home folder when a tool needs an absolute path.

`Dropbox/Claude/<project>/` is the owner's dedicated folder for Claude reference files. Claude may have access only to that subfolder, not the whole Dropbox, so use the full path instead of listing the Dropbox root. If access is denied, ask the owner to grant it in the OS privacy settings rather than retrying. See `REFERENCES.md` for what's there.

## To do list

`TODO.md` holds open work and ideas, in rough priority order. Check it when the owner asks "what's next", and add to it when the owner mentions something to do later. When an item is finished, remove it.

## Calculator design notes

Engineering method summaries for each calculator live in `docs/`, known-answer test cases live in `tests/`, and shared engineering data (thread tables etc.) lives in `data/`. Read these instead of the big reference PDFs; open a PDF only for a specific page the notes don't cover. Write new notes in your own words with equations and data (the repo is public, so don't copy book text).

- Bolted joint: `docs/bolted-joint-reference.md`, `tests/bolted_joint_cases.json`. `docs/bolted-joint-equations.html` shows each book equation beside the code that implements it (with code line numbers); update it when the calculator's math changes.
- Thread stripping (screw break vs. external or internal thread strip, length of engagement): `docs/thread-stripping-reference.md`, `tests/thread_stripping_cases.json` (inch) and `tests/thread_stripping_metric_cases.json` (metric), thread data in `data/unified_thread_limits.json` and `data/metric_thread_limits.json`

## Public repo: keep personal info out

The repo is public, so everything in it, including the full commit history, is visible to anyone. Never commit the owner's real name, personal email, computer usernames, or absolute paths that contain a username. Before each commit, check the diff for these.

## Hosting

The site is hosted on GitHub Pages from the `main` branch, repo root: https://gearhead901.github.io/Calculator_Website/

`index.html` at the repo root is the landing page and links to each prototype version, newest first. When a new prototype version is added, add a card for it to `index.html` (copy an existing `<a class="card">` block) and move the "Latest" tag to it.

A friend who is a software engineer will review the code and give pointers. They'll likely be added as a collaborator.
