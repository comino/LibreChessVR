# Changelog

## Unreleased

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
