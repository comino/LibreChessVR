# Contributing to LibreChessVR

LibreChessVR is chess in VR straight from the browser, with nothing to install, and 3D
board-vision practice for online players. Improvements to board readability, practice
exercises, accessibility and comfortable interaction fit that goal. Issues, documentation fixes and focused pull requests are welcome. Discuss large
features in an issue first so the scope and interaction design can be agreed on.

## Start from a clean clone

Fork [the repository](https://github.com/comino/LibreChessVR), clone your fork, and create a
branch from `main`. The web app is static ES modules: running it requires no npm install,
bundler, API key or Lichess account.

```sh
git clone https://github.com/YOUR-USERNAME/LibreChessVR.git
cd LibreChessVR
git switch -c describe-your-change
python3 -m http.server 8123
```

Open `http://localhost:8123`. Practice puzzles use Lichess anonymously; Free board and Find
squares need no account. Runtime modules and fonts load from external CDNs, so the initial
load needs internet access. Optional online games require a Lichess account.

For development and automated checks install Git, **Node.js 22.7 or newer**, Python 3,
and a current Google Chrome or Chromium. Linux and macOS use the same commands below.
On Windows, use a compatible Linux environment with a browser executable available inside
that environment; native Windows scripts are not currently maintained. A headset is useful
for interaction work but is not required to contribute.

Use a current patch of Node 22 or 24. [Node 22.7](https://nodejs.org/en/blog/release/v22.7.0)
enabled the syntax detection used by this
repository's package-free ES modules; older 22.x releases cannot run the documented commands
without extra flags.

## Run the checks

From the repository root:

```sh
node test/run-tests.mjs                        # all Node and browser checks
node test/run-tests.mjs test/clock-unit.js     # one Node check
node test/run-tests.mjs test/game-smoke.html   # one browser suite
```

The browser runner (`test/run-smoke.sh`) finds Chrome on macOS or Chromium on Linux itself.
Otherwise set `CHROME` to your browser executable; `CHROME_FLAGS` adds flags (containers
without user namespaces need `--no-sandbox`; normal development keeps the sandbox).
It serves the tree on port 8123 with DevTools on 9123; `PORT=18423` picks another pair.

A successful run exits zero and every suite prints its `*-OK` line. A JUnit report per file
is written to `test-results/junit.xml` (ignored by Git). Slow machines can raise
`SMOKE_TIMEOUT` (seconds per page, default 360). CDN access is required for browser checks:
proxy, DNS or certificate problems can prevent modules from loading. Do not bypass
certificate validation to make a check pass. Avoid fixing flaky tests by adding arbitrary
sleeps; wait for the relevant state instead.

Browser suites use fake Lichess responses and synthetic controller/hand input. They do not
prove live account integration, actual headset comfort/performance or Android packaging.
Record those checks separately and say when they were not performed. The
[release checklist](docs/release-checklist.md) describes manual validation.

## Find the code

| Area | Files |
| --- | --- |
| Page startup and activity lifecycle | `index.html`, `src/main.js` |
| Menu routes and settings | `src/navigation.js`, `src/settings.js` |
| Rendering, picking and XR input | `src/board3d.js`, `src/panel.js` |
| Games and Lichess requests | `src/game.js`, `src/lichess.js`, `src/auth.js` |
| Practice activities | `src/puzzle.js`, `src/rush.js`, `src/trainer.js`, `src/free.js` |
| Scene builders and appearance | `src/scenes/`, `src/environments.js`, `src/theme.js` |
| Automated checks | `test/` |
| Original artwork and third-party models | `assets/`, `THIRD_PARTY_NOTICES.md` |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the detailed architecture and invariants reference, useful to
human contributors as well as coding agents. Read the relevant sections before changing an area.
[BRAND.md](BRAND.md) describes the visual design and voice. Match the surrounding JavaScript
style (two-space indentation, single quotes, native ES modules); avoid broad formatting-only
changes. Add colors and fonts through `src/theme.js` and the page's matching CSS variables.

Preserve the single board coordinate convention, separate menu navigation from activity
lifetime, and keep selection/ray/touch geometry consistent. New bug fixes should include a
regression check that fails before the fix. Prefer pure checks for logic and browser checks
for DOM, WebGL and input behavior. Keep network calls deterministic in automated tests and
never require a contributor's real account or access token.

## Assets and licensing

Contribute code and original artwork under the project's [MIT license](LICENSE). Only submit
material you have the right to share under its stated license. For third-party assets, add
the original source URL, author, license and any modifications to
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); retain existing attribution, including the
older model still present in Git history. Discuss assets with different licensing terms
before adding them.

Keep mobile/Quest budgets in mind: record texture dimensions, triangle/draw counts and
visual results when replacing models. Checked-in GLBs are ready to use; rebuilding them
is optional: `tools/build-pieces.mjs` and `tools/build-props.mjs` (usage in each file's
header, assets in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Do not add runtime
npm/build requirements as a side effect of an asset change.

Never commit access tokens, signing keys, password files, browser profiles or private
service configuration. Use fake credentials in tests. If a credential was committed,
revoke it; deleting the current file does not remove it from history. Report vulnerabilities
through [SECURITY.md](SECURITY.md).

## Open a pull request

Keep the change focused and explain the user-visible problem, the resulting behavior and
why the approach fits the project. Link the issue when there is one. Run the relevant checks
while working and the full suite before requesting review for code changes. Report the
commands and results honestly, including failures or checks you could not run. For docs-only
changes, verify links and examples; a full rendering run is usually unnecessary.

Include screenshots for visual changes and identify the browser/headset and input modes
you tested. “Desktop only; no headset available” is useful information. Avoid claiming XR
validation from emulated input. Keep test artifacts out of commits.

Maintainers review reproducible regressions and changes within the project's scope (chess
in VR from the browser, 3D board-vision practice). Other features may need a design
discussion or remain open; there is no guaranteed response time or support commitment for
every browser, headset or Android configuration.
Keep reports and review discussion respectful and focused on the work.
