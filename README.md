<p align="center"><img src="assets/brand/wordmark.svg" width="420" alt="Parallax — chess in depth"></p>

<p align="center"><b>Play lichess in VR and train the one thing flat screens can't: seeing the board in depth.</b><br>
Meta Quest · any WebXR browser · your real lichess account · no install, no build, no backend</p>

![Parallax — a game against Maia in the Study](docs/img/game.jpg)

## Why

Most of us learned chess on a 2D diagram. Over a real board — or in VR — the same position
suddenly looks different. Parallax puts a tournament-size board on a table in front of you and
gives you everything you need to get fluent in 3D: real games, puzzles, drills and blindfold
training, all without taking the headset off.

## Features

**Play**
- **Your lichess account** — Stockfish (levels 1–8), the human-like **Maia** bots (1/5/9) or a
  seek against people. Resumes an ongoing game on load; survives headset sleep and network blips.
- **Premoves**, draw offers, answering takeback requests, abort/resign (resign asks twice), claim the win when
  your opponent leaves, **Rematch** and a **Review** of the finished game on the board.
- **Promotion picker** — Q/R/B/N float over the last rank; underpromote in one pinch.

**Train**
- **Puzzles** from lichess with themes (mate in 1/2/3, forks, pins, skewers, endgames,
  openings), difficulty, hints and a streak counter.
- **Puzzle rush** — 3 minutes, 3 lives, rising difficulty.
- **Coordinates** — a square name appears, point at it; rounds alternate white's and black's view.
- **Blindfold** — ghost or hidden pieces with a 2-second "Show pieces", plus spoken moves.
- **Flip board** — look at your own game from the opponent's side.
- **Move list** beside the board, following the game and post-game review; a **free board** to
  move both sides when nothing is running (Undo / Reset).

**Feel**
- Living scenes — a cozy **Study** in an old European house: antique furniture, a crackling fire,
  ticking clock and dust in the window light; a warm Mediterranean **Sunset** terrace with a day
  bed, brass lanterns and olive trees under drifting clouds; a **Night** campsite with a crackling fire pit, aurora,
  shooting stars and fireflies; or **Minimal**. Each keeps the board the clearest thing in view.
- **Themes** — boards: walnut, green, ice, marble, midnight; piece sets: antique (scanned wood), ivory, classic, gold &
  silver, maple, neon. Pieces reflect the scene around them.
- Board size 80–150 %, table height by thumbstick or buttons, wooden move sounds, haptics,
  and an FPS readout for tuning (Settings → View).
- Controllers (point + trigger), hand tracking (point & pinch from afar, or just pinch a piece to pick it up), fingertip-poke
  buttons, or mouse on desktop.

| | | |
|---|---|---|
| ![Sunset puzzle](docs/img/sunset.jpg) | ![Night rush](docs/img/night.jpg) | ![Blindfold ghost pieces](docs/img/ghost.jpg) |
| Puzzles at sunset | Puzzle rush at night | Blindfold: ghost pieces |

## Install on the Quest (app)

Parallax runs as a Quest app: it sits in your Library, launches into its own window and offers
VR right away. Open **chess.janasven.de** in the Quest Browser (it forwards to the app at
https://parallax.46-224-133-201.sslip.io) and choose *Install app*.

1. Headset in developer mode, connected by USB (or wireless adb).
2. `adb install -r android/app-release-signed.apk` (build it with `android/build.sh`).
3. Library → Unknown Sources → **Parallax**. Log in with lichess once; the app remembers you.

Or skip the APK: open the URL in the Quest Browser and use *Install app* from the menu.

## Run it yourself

1. **Serve the folder** (any static server): `python3 -m http.server 8123`
2. **On the Quest** — WebXR needs a secure origin:
   - dev mode: `adb reverse tcp:8123 tcp:8123`, then open `http://localhost:8123` in the Quest browser;
   - or host the folder on any HTTPS server.
3. **Log in with lichess** (optional for training) — one click, no token to copy (or paste an
   API token with `board:play` + `challenge:write` under *Use an API token instead*).
   The login stays in your browser.
4. **Enter VR.** The button bar right of the board has everything: start a game, puzzles,
   rush, coordinates and settings (Play, Puzzles, View — incl. scene, pieces, voice and hands).

![The 2D page doubles as setup and desktop view](docs/img/landing.jpg)

## Good to know

- Seeks against humans must be rapid or slower (minutes + ⅔ × increment ≥ 8); blitz works
  against Stockfish and Maia. Bullet isn't available to third-party boards on lichess.
- Puzzle results aren't recorded to your lichess account.
- Supported variants: standard and from-position.

## Development

Static ES modules (Three.js 0.170 + chess.js 1.0 from a CDN import map). Architecture,
invariants and gotchas: [`CLAUDE.md`](CLAUDE.md). Brand & design system: [`BRAND.md`](BRAND.md);
tokens in [`src/theme.js`](src/theme.js).

```sh
node test/test.js && node test/hunt-unit.js   # pure logic
test/run-smoke.sh                              # 13 headless-Chrome suites, all must print *-OK
```

The smoke suites drive the real modules against a fake lichess (streams, reconnects, offers,
premoves), fake hands and controllers, and the real 2D page. `hunt-*` suites are regression
tests from adversarial bug hunts.

## Credits

Chess pieces ([Chess Set](https://polyhaven.com/a/chess_set) by Riley Queen) and scene furniture
(`assets/props/`) are scanned models from [Poly Haven](https://polyhaven.com), CC0.
