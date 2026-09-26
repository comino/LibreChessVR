# ChessVR

Play on lichess with your real account, in VR on a Meta Quest (or any WebXR browser).
Purpose: train 3D board vision. Pure static web app — no build step, no backend.

## Setup

1. Create a lichess API token with `board:play` + `challenge:write` scopes:
   [create token](https://lichess.org/account/oauth/token/create?scopes[]=board:play&scopes[]=challenge:write&description=ChessVR)
2. Serve the directory: `python3 -m http.server 8000`
3. Open `http://localhost:8000`, paste the token, connect.
4. Seek a human game or challenge Stockfish. When the game starts, click **Enter VR**.

## On the Quest

WebXR needs a secure context. Two options:

- **Dev**: connect the Quest via USB, run `adb reverse tcp:8000 tcp:8000`, then open
  `http://localhost:8000` in the Quest browser (localhost counts as secure).
- **Standalone**: host the directory on any HTTPS server and open the URL.

## Controls

- Point at a piece, **trigger** to select — legal targets light up green.
- Point at a target square, **trigger** to move. Select the piece again to cancel.
- Hands: "point & pinch" works like the trigger; "grab pieces" lets you pick up and drop pieces.
- Promotion: a Q/R/B/N row floats over the last rank — pick one; anywhere else cancels.
- Button bar right of the board (trigger, or poke it with a fingertip): offer/accept/decline
  draw, accept/decline takeback, abort (before both moved), resign (press twice), next puzzle.
- Sounds on move/capture/error/solve; controllers buzz on select and move.
- Desktop: same with mouse click; drag to orbit the camera.

## Notes / limitations

- Seeking a human needs rapid or slower (minutes + ⅔ × increment ≥ 8); blitz works
  vs Stockfish. No bullet (lichess Board API rule).
- Seek/challenge from the 2D page, then Enter VR.
- Reconnect: reload the page — it resumes your ongoing game automatically.

## Development

- `node test/test.js` — unit tests for FEN parsing, coordinates, NDJSON splitting, seek rules.
- `test/run-smoke.sh` — runs all headless-Chrome smoke pages (board render, game session with
  a fake lichess, puzzles, hand grab, button bar/picker/poke); every line must end in `-OK`.
- `test/smoke.html` — renders a mid-game position without a lichess account
  (`#closeup` for a near camera, `#picker` for the promotion picker).
- `old-prototype/` — the previous A-Frame prototype, kept for reference only.
