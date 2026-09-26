# CLAUDE.md — ChessVR

VR chess client for lichess (WebXR, Meta Quest). Goal: train 3D board vision for a
player who normally plays 2D. Static web app, no build step, no backend, no npm.

## Stack

- Three.js 0.170 + native WebXR via CDN import map (`index.html`)
- chess.js v1 (CDN) for rules/FEN
- Lichess **Board API**, fully client-side (lichess supports CORS); token in localStorage

## Architecture

| File | Role |
|------|------|
| `src/coords.js` | Pure: square↔XZ mapping, FEN parsing, `captured(fen)`. Unit-tested. |
| `src/board3d.js` | Dumb 3D view. Takes FEN via `setPosition`, emits `onMove(from,to,promo?)`. Selection, promotion picker, controller/mouse/hand input, `cue(kind)` sounds. |
| `src/panel.js` | `StatusPanel` (names, clocks, text) and `ButtonBar` (ray/click/fingertip-poke buttons, confirm-twice). |
| `src/feedback.js` | Synthesized WebAudio cues + controller haptics. No audio files. |
| `src/bind.js` | `bindBoard(board, session)`: shared `onMove/getTargets/canPick` wiring for both sessions. |
| `src/lichess.js` | Board API client: NDJSON streams, seek (connection must stay open!), moves, draw/takeback/abort/resign. |
| `src/game.js` | `GameSession`: one game stream ↔ chess.js ↔ board. Optimistic local moves, rollback on server reject, offers → button bar. |
| `src/puzzle.js` | `PuzzleSession`: fetches `/api/puzzle/next`, replays game PGN, validates solution moves, auto-plays replies, auto-advances. |
| `src/trainer.js` | `TrainerSession`: coordinate drill — big target square on the panel, point at it; 30 s rounds alternating white/black view; best in `localStorage.coordBest`. |
| `src/environments.js` | Procedural scenes (minimal, study, sunset, night): builders return a group + background/fog/exposure/light params; `woodTexture()` canvas grain; `disposeGroup()`. |
| `src/settings.js` | In-VR settings, three pages: Play (Stockfish level, Maia 1/5/9, time, color, rated) View (scene, board scale, table ↑/↓, flipped view) and Puzzles (difficulty, theme). `cycle()` unit-tested. main.js maps Play values onto the 2D form fields; View values live on the board (`VIEW_SETTERS`, own localStorage keys). |
| `src/main.js` | 2D page + in-VR menu (`menu()`: Stockfish/seek/cancel/puzzles, from persisted `settings`), event stream, resumes ongoing game. `view` = what the panel shows; `refresh()` re-renders it. `window.chessvr.board` = debug handle. |
| `assets/chess.glb` | Piece models (from old prototype). Node names `Pawn/Knight/...`; each piece has `*_Plastic_0` (shown, recolored) and `*_Velvet_0` (hidden) meshes. |

## Key invariants & gotchas

- Board frame is ALWAYS white's perspective (a1 = −x,+z local). Black view = rotate
  `boardGroup` 180°; never remap coordinates (the old prototype died on this).
- GLB piece nodes carry ancestor transforms → templates bake `matrixWorld` via
  decompose at load; recentering must SUBTRACT the bbox offset, not set it.
- Piece scale is derived from the king's bbox (king = 1.7 × square size), not hardcoded.
- Pieces are rebuilt on every `setPosition`: materials (`pieceMat.w/b`, with the RoomEnvironment
  envMap — pieces only, it washes out the tiles) and proxy geometries are shared, never per piece.
- Captured pieces live in `capturedGroup` (not pickable), at each capturer's right hand.
- Ray picking/hover never touches the GLB meshes: each piece has an invisible cylinder
  `userData.proxy` (too many triangles for per-frame raycasts on the Quest). `_cast()` is
  the single ray resolver for click, trigger and hover, so hover and pick always agree.
- Hover state lives in `board.hover[key]` (`mouse`, `c0`, `c1`, `grab`); tints are
  recomputed in `_applyTints` (last move < check < selection < hover brighten).
- XR controller groups have `matrixAutoUpdate = false` — tests must `updateMatrix()`.
- Orientation = `setOrientation(color)` (session's side) XOR `setFlipped(bool)` (sticky practice
  view, also a "Flip board" button in games/puzzles). Never remap coordinates for either.
- `setScale(s)` scales `boardGroup` (all logic is in board-local units, so input needs no
  changes), grows the table for s>1 and moves the bar out (`BAR_X`).
- Proxy cylinders use `thetaStart = π/12`: a ray exactly along a cap-triangle edge (e.g. aiming
  straight at a piece's axis) can miss both triangles.
- Maia = lichess bots `maia1/5/9`, challenged via `POST /api/challenge/{bot}`; they accept
  on their own and the normal `gameStart` path attaches the game.
- Environments: `board.setEnvironment(name)` disposes the old group (leak-tested via
  `renderer.info.memory`), sets background/fog/exposure and re-tunes the persistent `hemi` +
  `sun` lights (sun targets the board so its shadow frustum stays on it). ACES tone mapping
  is global; panel/bar/label materials are `toneMapped: false` to keep text colors exact.
  The env list lives in settings.js (pure, Node-testable); names must match `BUILDERS`.
- `board.stage` holds table + board + panel + bar; `setHeight(offset)` (±0.45 m) moves it.
  Thumbstick Y on either controller adjusts it; `onHeightChange` fires once on release and
  main.js persists `localStorage.tableHeight`. The table box reaches below the floor.
- `_applyState` applies only moves beyond `this.applied`; our own moves are applied
  optimistically so the stream echo is a no-op (no re-render, keeps animation).
- Lichess seek (`POST /api/board/seek`) is only active while the HTTP request is open.
- Board API: no bullet; **seeks** must be rapid+ (`isRapid`: limit + 40×inc ≥ 480 s),
  blitz only for direct/AI challenges.
- Takebacks shrink the `moves` list → `_applyState` rebuilds chess.js from `initialFen`.
- Any exception while handling a stream message → `_fail()`: session finished, stream
  aborted, error on the panel, menu shown. Never let it throw (reconnect replays the same
  messages → endless loop). Variants other than standard/fromPosition are refused.
- Castling may arrive king-takes-rook (`e1h1`); `_applyUci` maps it to `e1g1`.
- Finished games offer **Rematch** (needs `gameFull.clock`, hidden after `_fail`): AI → `challengeAi`
  with colors swapped; human → `POST /api/challenge/{user}`. `challengeDeclined` events → `view.say()`.
- Post-game replay (`_step`): builds a chess.js instance for move i and sets `session.shown`;
  bindBoard's `checkSquare` uses `shown ?? chess`. `replayIdx == null` = final position.
  No rematch/replay buttons after `_fail` (state untrustworthy).
- Puzzles: `options()` (difficulty + lichess `angle` theme) is read on every fetch, so settings
  apply to the next puzzle. Streak/best/solved in `localStorage.puzzleStats`; any wrong move or
  hint sets `clean = false` and resets the streak immediately.
- Puzzle **Hint** = `setMarks` on the from-square of the next solution move; any move,
  `stop()` and `bindBoard` clear marks.
- `opponentGone` → countdown text, then a "Claim win" button (`claim-victory`).
- Sessions talk to the in-VR UI only via `board.setStatus({..., actions})`; actions are
  `{label, run, confirm?}` rendered by `ButtonBar` (3×3, max 9). `ts` in the status keeps
  clocks from jumping when a transient message (`_say`) is shown.
- Promotion: board detects pawn→last rank from `userData.type` and opens the picker;
  sessions just receive the promo letter. `setPosition` always closes the picker.
- `board.onSquarePick` (trainer) takes over every square pick incl. grab-mode pinches;
  `bindBoard` and `TrainerSession.stop()` clear it. `board.setMarks({sq: hex})` = session tints.
- main.js: puzzles/trainer are "activities" started via `startActivity` (stops `view` first);
  `menu({except})` hides the button of the activity already showing.
- `PuzzleSession.stop()` bumps `run`, so an in-flight fetch can't take over the board
  after a game starts.
- Hand tracking: hand meshes via `XRHandModelFactory`; two modes, persisted as
  `localStorage.handMode` and set via `board.setHandMode`. `ray` (default): pinch
  fires `selectstart` on the controller groups → normal ray select. `grab`: three's
  `pinchstart/pinchend` hand events grab the nearest pickable piece within 0.7
  squares of the pinch point (thumb+index tip midpoint); the piece follows the hand
  (`_tick`), release snaps to the nearest square and emits `onMove` if legal, else
  returns home. Tracking loss mid-grab cancels safely. All in `board3d.js` —
  worldToLocal handles the black 180° rotation; sessions are unaware of input mode.
- Puzzles: `/api/puzzle/next` works without auth (results are NOT recorded to the
  lichess account). Any mating move is accepted, matching lichess rules; wrong moves
  roll back with free retry. Panel uses the `puzzle: true` status branch (no clocks).
- Event/game streams have a 20 s stall watchdog (`STALL_MS`): half-open TCP after headset
  sleep never errors on its own; lichess keepalives arrive every few seconds.
- `attach()` never replaces a running game; lichess re-sends `gameStart` for all ongoing games
  on reconnect. Correspondence / non-board-compatible games are never auto-attached.
- Game takebacks are detected by the *server* move count shrinking (`serverMoves`), not by
  `moves < applied` — a state sent before our optimistic move is merely stale.
- Clocks count from `stateTs` (server snapshot time), so re-renders don't make them jump.
- Puzzles always use an anonymous client (a board:play token lacks `puzzle:read` → 403).
- Streams die on headset sleep/network blips → both the event stream (`main.js runEvents`)
  and the game stream (`game.js start`) auto-reconnect in a loop; a game-stream
  reconnect replays `gameFull`, which fully resets session state.

## Testing (do this after changes)

1. `node test/test.js` — pure logic.
2. Syntax check: `node --input-type=module --check < src/foo.js`.
3. Visual smoke test without a lichess account:
   `python3 -m http.server 8123` then headless Chrome screenshot of
   `http://localhost:8123/test/smoke.html` with
   `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=25000 --screenshot=...`
   — page shows `SMOKE-OK 32 pieces` plus scale/bbox diagnostics in `#result`.
4. `test/run-smoke.sh` runs every smoke page headless (`--dump-dom`) and exits non-zero
   unless each prints `*-OK`: `puzzle-smoke` (stubbed puzzles, fetch race, underpromotion),
   `grab-smoke` (fake hand joints), `game-smoke` (fake lichess stream: optimistic moves,
   rejects, draw/takeback offers, resign confirm, promotion via picker, results),
   `trainer-smoke` (scoring, flashes, grab pinch, round end/best, color flip, unhook),
   `ui-smoke` (button bar ray/poke/confirm, drag-click, picker grab/ray/cancel/edges),
   `app-smoke` (real index.html + main.js vs stubbed `fetch`: menu, settings, seek/cancel,
   AI challenge, game over → menu, puzzles, seek-while-puzzling → game takes over).
   Tests that ray-pick freshly created objects must `board._tick()` first (world matrices).
5. Real-game test needs a lichess token (play Stockfish level 1).

## Testing on the Quest

WebXR needs a secure context — plain `http://<lan-ip>:8123` never shows the VR button.
Use adb reverse (headset in developer mode, USB or wireless adb):

    adb reverse tcp:8123 tcp:8123
    python3 -m http.server 8123

then open `http://localhost:8123` in the Quest Browser (localhost = secure context;
stable origin, so the lichess token survives in localStorage). Debug the headset tab
from desktop Chrome via `chrome://inspect#devices`. The Quest browser caches hard —
force-reload after JS changes. Alternative without dev mode:
`cloudflared tunnel --url http://localhost:8123` (URL rotates → token retyped each run).
Desktop pre-check for controller input: Meta's Immersive Web Emulator extension.

## Ideas / not yet done

- Premoves, chat, requesting takebacks, claim draw when the opponent leaves
- Move list / PGN view
