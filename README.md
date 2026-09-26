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
- Desktop: same with mouse click; drag to orbit the camera.

## Notes / limitations

- The lichess Board API allows blitz, rapid, classical, correspondence — **no bullet**.
- Promotion is always to a queen for now.
- Reconnect: reload the page — it resumes your ongoing game automatically.

## Development

- `node test/test.js` — unit tests for FEN parsing, coordinates, NDJSON splitting.
- `test/smoke.html` — renders a mid-game position without a lichess account
  (`#closeup` in the URL for a near camera).
- `old-prototype/` — the previous A-Frame prototype, kept for reference only.
