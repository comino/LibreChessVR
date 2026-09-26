# ChessVR

Play on lichess with your real account, in VR on a Meta Quest (or any WebXR browser).
Purpose: train 3D board vision. Pure static web app — no build step, no backend.

## Setup

1. Create a lichess API token with `board:play` + `challenge:write` scopes:
   [create token](https://lichess.org/account/oauth/token/create?scopes[]=board:play&scopes[]=challenge:write&description=ChessVR)
2. Serve the directory: `python3 -m http.server 8000`
3. Open `http://localhost:8000`, paste the token, connect.
4. Click **Enter VR**. The button bar right of the board starts Stockfish games, seeks a human
   or opens puzzles, using the time control / level set on the 2D page (remembered).
   You can solve puzzles while a seek is running; the game takes over when matched.

## On the Quest

WebXR needs a secure context. Two options:

- **Dev**: connect the Quest via USB, run `adb reverse tcp:8000 tcp:8000`, then open
  `http://localhost:8000` in the Quest browser (localhost counts as secure).
- **Standalone**: host the directory on any HTTPS server and open the URL.

## Controls

- The ray stops where it hits; the square or button under it lights up. A king in check glows red.
- Point at a piece, **trigger** to select — legal targets light up green.
- Point at a target square, **trigger** to move. Select the piece again to cancel.
- **Maia** (menu): play the human-like Maia bots (maia1/5/9) with one press.
- **Settings** (menu): Play page (Stockfish level, Maia level, time control, color, rated) and
  View page (scene: minimal / study / sunset / night, board size 80–150%, table up/down, flipped view) — no need to take the headset off.
- **Flip board** (in games and puzzles): see the position from your opponent's side. After a game, **Rematch** swaps colors (humans get a challenge), and
  **Review game** steps through it on the board. Puzzles have a **Hint** button,
  themes (mate in 1/2/3, forks, pins, skewers, endgames, openings), difficulty, and a streak
  counter (solved in a row without mistakes or hints; best is kept).
- **Puzzle rush** (menu): 3 minutes, 3 lives — solve as many as you can; a wrong move costs a
  life, difficulty rises every 5 solved, best score kept.
- **Blindfold training** (Settings → View → Pieces): ghost (see-through) or hidden pieces;
  moves still work by square, and **Show pieces** reveals them for 2 s.
- **Voice** (Settings → View): announces moves ("Knight takes F 3, check") — opponent's only or
  all; pairs well with blindfold mode. Moves make a wooden click.
- **Coordinates** (menu): a square name appears — point at that square. 30 s rounds,
  alternating white/black view; best score is kept. Trains 3D board vision directly.
- Hands: "point & pinch" works like the trigger; "grab pieces" lets you pick up and drop pieces.
- Promotion: a Q/R/B/N row floats over the last rank — pick one; anywhere else cancels.
- Button bar right of the board (trigger, or poke it with a fingertip): offer/accept/decline
  draw, accept/decline takeback, abort (before both moved), resign (press twice), next puzzle.
- Thumbstick forward/back raises/lowers the table (remembered) — for sitting vs standing.
- Captured pieces stand beside the board; the panel shows the last move (e.g. `Nf3 · Your move`).
- Sounds on move/capture/error/solve; controllers buzz on select and move. Clocks turn red under 20 s.
- Desktop: same with mouse click; drag to orbit the camera.

## Notes / limitations

- Seeking a human needs rapid or slower (minutes + ⅔ × increment ≥ 8); blitz works
  vs Stockfish. No bullet (lichess Board API rule).
- Reconnect: reload the page — it resumes your ongoing game automatically.

## Development

- `node test/test.js` — unit tests for FEN parsing, coordinates, NDJSON splitting, seek rules.
- `test/run-smoke.sh` — runs all headless-Chrome smoke pages (board render, game session with
  a fake lichess, puzzles, hand grab, button bar/picker/poke); every line must end in `-OK`.
- `test/smoke.html` — renders a mid-game position without a lichess account
  (`#closeup` for a near camera, `#picker` for the promotion picker).
- `old-prototype/` — the previous A-Frame prototype, kept for reference only.
