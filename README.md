<p align="center"><img src="assets/brand/wordmark.svg" width="420" alt="LibreChessVR — read a real chessboard"></p>

**A free 3D board vision practice tool for online chess players who find physical boards harder to read.**

LibreChessVR is a small open-source practice project, licensed under [MIT](LICENSE).

If you are used to a flat online board, reading the same position from a player's seat can
feel unfamiliar. This small project gives you a 3D board to practice on: solve puzzles,
find squares, or move pieces around. It works in a desktop browser and optionally in VR.

[**Start practicing at chess.janasven.de**](https://chess.janasven.de/)

No account, installation or headset is needed for practice. A Lichess account is only needed
if you want to play games against Stockfish, Maia or another person.

![The practice board and menu](docs/img/practice.png)

## Try it

1. Open [LibreChessVR](https://chess.janasven.de/).
2. Choose **Practice puzzles**, **Find squares**, or **Free board**.
3. Read the position from the player's seat. Drag to change the view; click a piece and then
   its destination. You can change the board, pieces and scene.
4. On a compatible headset, choose **Enter VR** to sit at the board. Point with a controller,
   point and pinch with your hands, or pick pieces up directly.

In VR, **Menu** opens Practice, Free board, Play and Settings. **Back** goes up one level;
**Return** takes you back to the same activity and position. Timed games and drills keep
running while you browse settings.

## Practice modes

- **Puzzles:** Lichess puzzles on a 3D board, with difficulty, themes, hints and a streak counter.
- **Find squares:** 30-second coordinate drills from both White's and Black's perspective.
- **Free board:** move both sides, Undo and Reset. Menu navigation preserves your move history.
- **Puzzle rush:** three minutes and three lives, with difficulty increasing as you solve.
- **Blindfold practice:** ghost or hide pieces, reveal them briefly, and optionally hear moves.
  These controls are under Practice → Puzzles → Piece visibility and Settings → Input & audio.

## Optional games and VR

Connect Lichess to play Stockfish, the Maia bots or another player on the same 3D board.
Games support premoves, draw and takeback responses, promotion, rematches and post-game review.
Seeks against humans require rapid or slower; blitz works for direct engine challenges.

In VR you can adjust table height and board size, switch between hand and controller input,
and use the same settings without leaving a game. Scenes include Study, Sunset, Night and
Minimal. Appearance changes are previews on the board, with visible setting choices.

On Quest, open [chess.janasven.de](https://chess.janasven.de/) in the browser. You can also use
*Install app*. The optional Android wrapper can be built with `android/build.sh` and installed
with `adb install -r android/app-release-signed.apk`.

## Data

Practice needs no login. Puzzles are fetched anonymously from Lichess. Puzzle results and
practice records stay in your browser and are not sent to your Lichess account. If you connect
Lichess for games, the login token stays in your browser.

## Run locally

```sh
git clone https://github.com/comino/LibreChessVR.git
cd LibreChessVR
python3 -m http.server 8123
```

Open `http://localhost:8123` in your browser. No build step or API key is needed.
WebXR requires HTTPS or localhost. For a Quest in developer mode, use
`adb reverse tcp:8123 tcp:8123`, then visit `http://localhost:8123` on the headset.

To host your own copy, serve `index.html`, `manifest.webmanifest`, `sw.js`, `LICENSE`,
`THIRD_PARTY_NOTICES.md`, `src/` and `assets/` on any static HTTPS host. Libraries and fonts
load from their CDNs; puzzles and optional games use Lichess. The configurations in `deploy/`
and `android/` describe the maintained instance; use your own host and signing key for a fork.

## Development

Static ES modules (Three.js 0.170 + chess.js 1.0 from a CDN import map). Architecture,
invariants and gotchas: [`CLAUDE.md`](CLAUDE.md). Brand & design system: [`BRAND.md`](BRAND.md);
tokens in [`src/theme.js`](src/theme.js).

Tests need Node.js 22 or newer and Chrome/Chromium. If Chrome is not in the default macOS
location, set `CHROME` to your browser executable when running the smoke script.

```sh
node test/test.js && node test/hunt-unit.js && node test/navigation-unit.js   # pure logic
test/run-smoke.sh                              # 14 headless-Chrome suites, all must print *-OK
```

The smoke suites drive the real modules against a fake lichess (streams, reconnects, offers,
premoves), fake hands and controllers, and the real 2D page. `hunt-*` suites are regression
tests from adversarial bug hunts.

## Contributing

Issues and pull requests are welcome at [comino/LibreChessVR](https://github.com/comino/LibreChessVR).
For interaction bugs, include your browser or headset, whether you used hands or controllers,
and the steps to reproduce the problem. Run the checks above for code changes; include a
screenshot for visual changes and say whether you tested on a headset.

The project focuses on helping online players read physical chessboards. Contributions to
board readability, practice exercises and comfortable interaction are especially useful.

## License and credits

Project code and original artwork are covered by the [MIT license](LICENSE).
Third-party models, libraries and fonts keep their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), including attribution for the model in older commits.

Chess pieces ([Chess Set](https://polyhaven.com/a/chess_set) by Riley Queen) and scene furniture
(`assets/props/`) are scanned models from [Poly Haven](https://polyhaven.com), CC0.
