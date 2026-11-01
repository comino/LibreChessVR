# CLAUDE.md — LibreChessVR

**LibreChessVR** — free 3D board vision practice for online players who find physical
boards harder to read. Browser first, optional WebXR / Meta Quest, optional Lichess games.
Static web app, no build step, no backend,
no npm. GitHub: `comino/LibreChessVR` (`main`; Linear project PRJ | LibreChessVR).
Project code is MIT licensed; retain the asset and dependency credits in `THIRD_PARTY_NOTICES.md`.

## Release path

No test or staging environment. A change is done when merged to `main` with the bx gate green
and proven in headless Chrome. `deploy/deploy.sh` ships straight to production
(librechessvr.com): Sven runs it, never an agent. Bump `CACHE` in `sw.js` with every
user-visible change so installed apps refresh. Tags, GitHub releases and the Quest APK are Sven's.

## What is live

`curl -s https://librechessvr.com/sw.js | grep CACHE`, then diff served files against `main`
(`curl -s https://librechessvr.com/src/main.js | diff - src/main.js`). Live is checked against `main`,
not the last tag (`VERSION`; CHANGELOG "Unreleased" = on `main`, untagged).

## Required gates

`bx test` (profile `LibreChessVR`, `boat: never`): 4 unit suites + 16 smoke pages, each one result
line (expect 20; the profile's `min_tests`). Smoke pages load three.js/chess.js from CDNs.

## Exercise path

Serve the tree (`python3 -m http.server`) and drive it in headless Chrome (`test/cdp-run.mjs`,
screenshot via `Page.captureScreenshot`). Smoke pages stub lichess; practice modes need no account.
Real games need Sven's Lichess token: never in bx or the repo.

## Error signature

No backend or telemetry. Failure shows as a non-200 from librechessvr.com, served files that differ
from `main` after a deploy, or a smoke page printing anything but `*-OK`.

## Design system (read before touching any UI)

`BRAND.md` is the design guide (name, voice, colors, type, shapes, scenes). All colors and
fonts come from `src/theme.js` (3D + canvas UI) and its mirror of CSS variables in `index.html`.
Never hardcode a color: add a token. Button labels: 1–2 words, sentence case; values as
"Name value". The visible name is LibreChessVR. Lead with practice, not account creation.
Compatibility identifiers (OAuth client, Android package, storage/cache keys and the debug
handle `window.parallax`) remain unchanged; they are not the public name.

## Where things are

- Before changing a module, read its row and the invariants it touches in `docs/ARCHITECTURE.md`
  (stack, module map, every input/rendering/session/lichess invariant).
- Hosting, caching, PWA, Quest APK, OAuth and headset testing: `docs/OPERATIONS.md`.

## Gotchas that have caused real bugs

- Board frame is always White's perspective (a1 = −x,+z local). Black view or flipping = rotate
  `boardGroup` 180°; never remap coordinates (an earlier prototype died on this).
- Picking never raycasts the GLB meshes: invisible proxy cylinders + `_touches()` silhouette
  check, all through `_cast()`, so hover and pick always agree.
- Stream message handlers must never throw: any exception → `_fail()`. A throw makes the
  reconnect replay the same messages forever.
- Lichess: a seek lives only while its HTTP request is open; seeks must be rapid or slower;
  puzzles always use an anonymous client (a board:play token gets 403).
- Clocks count from the server snapshot (`stateTs`); hiding controls, moving the camera or opening
  menus must never reset them. Navigation never pauses clocks or ends activities.
- Scenes: fixed light count (no shader recompiles), ≤ 45 env draw calls on the Quest (ui-smoke
  checks it), `disposeGroup` on every switch.
- `sw.js` is network-first for app files. Never stale-while-revalidate: it mixed old and new
  ES modules after a deploy.

## Testing (do this after changes)

    node test/test.js && node test/hunt-unit.js && node test/navigation-unit.js && node test/clock-unit.js
    test/run-smoke.sh                               # every test/*-smoke.html headless; all must print *-OK

On Linux set `CHROME` and `CHROME_FLAGS` (bx profile: `/usr/bin/chromium`, `--no-sandbox --disable-dev-shm-usage`).

`PORT=… test/run-smoke.sh page…` runs a subset on another port (parallel agents). Suites:
`smoke` (render), `ui` (bar/poke/picker/hover/scale/envs/styles), `grab`, `game` (fake lichess
stream: optimistic moves, offers, premoves, promotion, replay…), `puzzle`, `rush`, `trainer`,
`app` (real index.html + main.js vs stubbed `fetch`, navigation/state preservation),
`desktop` (complete page/CSS, controls, clocks, actions, mobile layout and simulated XR),
`menu` (UI rays/poke and input-mode transitions), and `hunt-*` — regression suites written by
adversarial bug-hunter agents (each check encodes a bug that was real). New bugs: write the
failing check first, then fix. Gotchas: ray-picking freshly created objects needs a rendered
frame (`board._tick()`); XR controllers need `updateMatrix()`; tints are `tile.userData.tint`
(hover is emissive). The runner (`test/cdp-run.mjs`) drives Chrome over DevTools in real time, one
page at a time with storage wiped in between — `--virtual-time-budget` stalls image decoding of
the textured GLB. Visual changes: screenshot headless Chrome (`--use-angle=swiftshader
--enable-unsafe-swiftshader`, `Page.captureScreenshot`) and look at it.
