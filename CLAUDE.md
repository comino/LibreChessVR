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
| `src/coords.js` | Pure: square↔XZ mapping, FEN parsing. Unit-tested. |
| `src/board3d.js` | Dumb 3D view. Takes FEN via `setPosition`, emits `onMove(from,to)`. Selection UI, clocks panel, controller/mouse raycast input. |
| `src/lichess.js` | Board API client: NDJSON streams, seek (connection must stay open!), moves. |
| `src/game.js` | `GameSession`: one game stream ↔ chess.js ↔ board. Optimistic local moves, rollback on server reject. |
| `src/puzzle.js` | `PuzzleSession`: fetches `/api/puzzle/next`, replays game PGN, validates solution moves, auto-plays replies, auto-advances. |
| `src/main.js` | UI wiring, event stream, resumes ongoing game on load. |
| `assets/chess.glb` | Piece models (from old prototype). Node names `Pawn/Knight/...`; each piece has `*_Plastic_0` (shown, recolored) and `*_Velvet_0` (hidden) meshes. |

## Key invariants & gotchas

- Board frame is ALWAYS white's perspective (a1 = −x,+z local). Black view = rotate
  `boardGroup` 180°; never remap coordinates (the old prototype died on this).
- GLB piece nodes carry ancestor transforms → templates bake `matrixWorld` via
  decompose at load; recentering must SUBTRACT the bbox offset, not set it.
- Piece scale is derived from the king's bbox (king = 1.7 × square size), not hardcoded.
- `_applyState` applies only moves beyond `this.applied`; our own moves are applied
  optimistically so the stream echo is a no-op (no re-render, keeps animation).
- Lichess seek (`POST /api/board/seek`) is only active while the HTTP request is open.
- Board API: no bullet games. Promotion auto-queens (`game.js _tryMove`).
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
4. Puzzle logic: same headless-Chrome screenshot of `test/puzzle-smoke.html`
   (stubbed puzzles, drives wrong/correct/mating moves) — expect `PUZZLE-OK`.
5. Hand-grab logic: same for `test/grab-smoke.html` (fake hand joints drive
   grab/drop/tracking-loss paths) — expect `GRAB-OK`.
6. Real-game test needs a lichess token (play Stockfish level 1).

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

- Underpromotion picker, premoves, draw offers, chat, takeback
- In-VR seek UI (currently seek from the 2D page, then Enter VR)
- Haptics/audio feedback on grab and drop
