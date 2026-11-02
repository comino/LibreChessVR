# Changelog

## Unreleased

- "Cancel challenge" pressed while Lichess never answers the challenge request (for example
  after the headset slept) releases the lock after 20 s; a late answer is withdrawn on Lichess.
- The VR panel, VR menu, wordmark and sharing image use the new line, "No install, just chess
  in VR", instead of "Read a real chessboard". The sharing image now names librechessvr.com.
- Reloading the page while a challenge is open keeps it pending, so a second game can't start
  until Lichess accepts, declines or expires it (at most 20 s); "Cancel challenge" still works.
- **Lock view** on desktop freezes camera rotation, panning and zoom, so an imprecise
  click near a piece still plays it. Works with the sidebar hidden; the choice is saved. Fixes #3.
- Knight facing adds Outward and Inward: knights on files a–d and e–h face away from or
  toward each other, so b1 and g1 are mirrored (#4). A knight that crosses the centre turns.
- One challenge at a time: while Stockfish, Maia or a rematch is pending, other game starts
  wait, and "Cancel challenge" withdraws it on Lichess. Resign asks again for each new game.
- Pieces reflect the room around the board again. Reflections were captured from the
  middle of the room floor because three.js r170 ignored the capture position.
- Disabled buttons look disabled, and keyboard focus is visible on every button and link.
- The offline cache cleans up only LibreChessVR's own caches, survives a full storage quota,
  and never stores signed-in requests or Lichess login callbacks.
- The page, README, app description and brand guide lead with chess in VR straight from the
  browser, nothing to install. Desktop board vision practice stays the second audience.
- Knights show their side profile by default. Choose Right, Forward, Left or Backward
  under Appearance or in the desktop sidebar; the preference is saved. Directions follow
  each player's side, including captured pieces and promoted knights. Fixes #2.

## 0.1.0-beta.1 — 2026-10-15

First public beta of LibreChessVR: free 3D board vision practice, with optional
VR and Lichess games. Project code is MIT licensed.

### Included

- Lichess puzzles, coordinate drills, a free board with Undo, puzzle rush and
  blindfold practice. Practice needs no account.
- Optional Lichess login for games against Stockfish, Maia and other players,
  with clocks, premoves, rematches and post-game review.
- WebXR play with controllers or hand tracking, plus desktop mouse controls.
- Study, Sunset, Night and Minimal scenes; adjustable boards, pieces and comfort
  settings.
- Persistent VR navigation, desktop controls that can be hidden, and player clocks
  that stay visible while changing the board view.
- Browser installation support, the public address
  [librechessvr.com](https://librechessvr.com/), and the launch trailer in the README.

### Beta scope

- VR requires a compatible WebXR browser and HTTPS or localhost. Headset and
  hand-tracking behavior can vary by device and browser.
- Dependencies load from CDNs; puzzles and online games need internet access.
  Practice settings and results stay in the browser. Optional Lichess login stores
  its token in that browser.
- Human matchmaking requires rapid or slower time controls. Bullet is unsupported.
- This release distributes the web app. The Android wrapper remains an optional
  source build.

Report problems in [GitHub issues](https://github.com/comino/LibreChessVR/issues),
including this version, your browser/headset and steps to reproduce.
