# CLAUDE.md — Parallax

**Parallax** (*chess in depth*) — VR chess client for lichess (WebXR, Meta Quest). Goal: train
3D board vision for a player who normally plays 2D. Static web app, no build step, no backend,
no npm. GitHub: `comino/parallax` (local folder still `chessvr/`).

## Design system (read before touching any UI)

`BRAND.md` is the design guide (name, voice, colors, type, shapes, scenes). All colors and
fonts come from `src/theme.js` (3D + canvas UI) and its mirror of CSS variables in `index.html`.
Never hardcode a color: add a token. Button labels: 1–2 words, sentence case; values as
"Name value". The product name is Parallax everywhere users can see it.

## Stack

- Three.js 0.170 + native WebXR via CDN import map (`index.html`)
- chess.js v1 (CDN) for rules/FEN
- Lichess **Board API**, fully client-side (lichess supports CORS); token in localStorage

## Architecture

| File | Role |
|------|------|
| `src/coords.js` | Pure: square↔XZ mapping, FEN parsing, `captured(fen)`. Unit-tested. |
| `src/board3d.js` | Dumb 3D view. Takes FEN via `setPosition`, emits `onMove(from,to,promo?)`. Selection, promotion picker, controller/mouse/hand input, `cue(kind)` sounds. |
| `src/panel.js` | `StatusPanel` (names, clocks, text), `ButtonBar` (ray/click/fingertip-poke buttons, confirm-twice) and `MoveList` (SAN rows left of the board, mirrors the bar; `board.setMoves(verbose, cur)`, `bindBoard`/`startActivity` clear it; games pass the replay index). |
| `src/feedback.js` | Synthesized WebAudio cues + controller haptics. No audio files. |
| `src/bind.js` | `bindBoard(board, session)`: shared `onMove/getTargets/canPick` wiring for both sessions. |
| `src/lichess.js` | Board API client: NDJSON streams, seek (connection must stay open!), moves, draw/takeback/abort/resign. |
| `src/game.js` | `GameSession`: one game stream ↔ chess.js ↔ board. Optimistic local moves, rollback on server reject, offers → button bar. |
| `src/puzzle.js` | `PuzzleSession`: fetches `/api/puzzle/next`, replays game PGN, validates solution moves, auto-plays replies, auto-advances. |
| `src/rush.js` | `RushSession extends PuzzleSession`: 3 min, 3 lives, wrong move = life lost + next puzzle, difficulty rises every 5 solved; best in `localStorage.rushBest`. Overrides the puzzle hooks only. |
| `src/free.js` | `FreeBoard`: idle-screen board, both sides move by the rules (no account). `attach()` (main.js `toMenu` + startup) continues from `board.fen`; menu shows Undo / Reset board when possible. |
| `src/speech.js` | `moveToSpeech(verboseMove)` (pure, unit-tested: "Knight takes F 3, check") + `speak()` via speechSynthesis. `board.announce(move, mine)` filters by `board.voice` (off/opponent/all). |
| `src/trainer.js` | `TrainerSession`: coordinate drill — big target square on the panel, point at it; 30 s rounds alternating white/black view; best in `localStorage.coordBest`. |
| `src/environments.js` | Scene registry (`buildEnvironment`, `disposeGroup`) + minimal. |
| `src/scenes/` | One file per scene (`study`, `sunset`, `night`) + `common.js` helpers (seeded `rng`, canvas textures, `glow` sprites, `instanced`, `points`, `fire` (flames + sparks), `pineGeometry`/`cypressGeometry`, `mergeStatic`, `props`). Builders may return `update(t, dt, {lamp})` — called every frame by the board for scene life. |
| `src/settings.js` | In-VR settings, three pages: Play (Stockfish level, Maia 1/5/9, time, color, rated) View (scene, board scale, table ↑/↓, flipped view) and Puzzles (difficulty, theme). `cycle()` unit-tested. main.js maps Play values onto the 2D form fields; View values live on the board (`VIEW_SETTERS`, own localStorage keys). |
| `src/main.js` | 2D page + in-VR menu (`menu()`: Stockfish/seek/cancel/puzzles, from persisted `settings`), event stream, resumes ongoing game. `view` = what the panel shows; `refresh()` re-renders it. `window.parallax.board` = debug handle. |
| `src/theme.js` | Design tokens: `COLOR`, `TINT` (+`TINT_MIX`), `BOARD`, `PIECES`, `FONT`. |
| `assets/brand/` | Logo mark + wordmark SVGs. `docs/img/` = README screenshots. |
| `assets/props/` | Scanned CC0 scene furniture (Poly Haven), one GLB per model, built by `tools/build-props.mjs <id[@256]>…` (joins meshes per material, 512 px WebP). Watch the real triangle count it prints: the site's listed polycount can be wrong (`wooden_candlestick` = 213k). |
| `assets/pieces.glb` | Scanned piece set (Poly Haven `chess_set`, CC0, Riley Queen): nodes `piece_<type>_<white|black>`, PBR textures as 512 px webp. Rebuild with `tools/build-pieces.mjs` (usage in its header). |

## Key invariants & gotchas

- Board frame is ALWAYS white's perspective (a1 = −x,+z local). Black view = rotate
  `boardGroup` 180°; never remap coordinates (an earlier prototype died on this).
- GLB piece nodes carry ancestor transforms → templates bake `matrixWorld` via
  decompose at load; recentering must SUBTRACT the bbox offset, not set it.
- Piece scale is derived from the king's bbox (king = 1.7 × square size), not hardcoded.
- Pieces are rebuilt on every `setPosition`: materials (`pieceMat.w/b`, with the RoomEnvironment
  envMap — pieces only, it washes out the tiles) and proxy geometries are shared, never per piece.
- Captured pieces live in `capturedGroup` (not pickable), at each capturer's right hand.
- Ray picking/hover never touches the GLB meshes: each piece has an invisible cylinder
  `userData.proxy` (too many triangles for per-frame raycasts on the Quest). `_cast()` is
  the single ray resolver for click, trigger and hover, so hover and pick always agree.
  Proxies are much wider than the pieces, so `_touches()` re-checks a proxy hit against the
  piece's silhouette (`board.profile[type]`: widest radius per height band, measured at load,
  + ~5 mm margin); a ray only through the empty part goes on to what is behind (pawn behind a
  queen). Legal targets of the selected piece keep their full proxy.
- Hover state lives in `board.hover[key]` (`mouse`, `c0`, `c1`, `grab`); tints are
  recomputed in `_applyTints` (last move < check < selection < hover brighten).
- XR controller groups have `matrixAutoUpdate = false` — tests must `updateMatrix()`.
- Orientation = `setOrientation(color)` (session's side) XOR `setFlipped(bool)` (sticky setting)
  XOR `peek` (in-game "Flip board", cleared by the next `setOrientation`). `viewSide()` = side
  shown at the player's end. Never remap coordinates for any of them.
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
  Light count is fixed (hemi, sun in `stage`, `lamp` at intensity 0 when unused) so switching
  never recompiles shaders; the sun's shadow box scales with the board.
  Scenes animate via `env.update` (fire flicker drives the lamp light, clock with real time,
  dust, clouds, birds, aurora, shooting stars, fireflies). Quest budget: ≤ 45 env draw calls
  (ui-smoke checks it) — use `instanced` for repeats and `mergeStatic(group)` to fuse plain
  static meshes (flag animated ones `userData.dynamic`); seeded `rng` for stable layouts.
  The env list lives in settings.js (pure, Node-testable); names must match `BUILDERS`.
  Scanned props: `props(group, items)` loads them *after* the scene shows and resolves `env.ready`;
  the board then recaptures reflections (only if that env is still current). `disposeGroup` sets
  `userData.disposed`, so props of a scene switched away mid-load are freed, never added. Draw
  budget counts props: tests `await board.env.ready` before counting.
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
- PuzzleSession hooks for subclasses: `_wrong()`, `_solved()`, `_actions()`, `_sub()`, `_miss()`;
  `next()` uses `_halt()` (ends the puzzle) so a subclass's own timers survive; `stop()` is the
  public full stop. Rush keeps its clock in `stop()`-cleared `this.clock`.
- Coordinates are printed on the frame (`_coordinates()`: one canvas texture on a plane just
  above the frame, `BORDER` = 3.6 cm); near/left edges face white, far/right edges face black.
- Themes: `BOARD_THEMES` / `PIECE_THEMES` in theme.js (names mirrored in settings.js). Pieces are
  one template per color (`templates.w/b`); every set keeps the scan's normal + AO maps, only
  `textured` sets (antique, the default) also use its color/roughness/metal maps.
  `setBoardTheme` sets `tile.userData.base` (tints lerp from it) + a per-square offset of one
  shared grain texture (wood/marble/fine); `setPieceTheme` recolors `pieceMat`+`solidMat` in place.
  Settings → Look (scene, board, set, piece style, size); View = comfort (voice, table, flip, hands, FPS).
- Reflections: `_captureEnv()` renders the scene once into a PMREM env map at each scene switch
  (board/UI hidden during capture) — never per frame.
- Piece surface detail: `PIECE_DETAIL` shader chunks via `onBeforeCompile` on the 4 piece
  materials (`uDetail` per set: lathe/wood/brushed/glow, from `PIECE_THEMES[].detail`). Keep
  pattern frequencies low: fine stripes alias and shimmer in VR.
- Grounding: `board.contacts` = one InstancedMesh of soft blobs under every piece (+captured),
  rebuilt when `contactsDirty` / each frame while animating or grabbing; hidden in blindfold.
  Table floor shadow lives in the scene. Scene decals share a material → `mergeInto()` (one draw).
- Motion: move = arc + settle (380 ms), capture = 8 pooled spark sprites, legal targets pulse
  (emissive, skipped under hover). `setShowFps` = panel corner readout (Settings → View).
- Piece styles (`setPieceStyle`: solid/ghost/hidden) only change the shared `pieceMat`s; proxies
  keep pieces pickable. `showPieces(ms)` reveals temporarily. The promotion picker swaps in
  `solidMat` so it is always visible. Sessions add "Show pieces" via `showPiecesAction(board)`.
- Menus: the idle panel shows the full `menu()`; every activity (game over, puzzles, rush,
  trainer) appends only `compactMenu()` = [Cancel seek?] + Menu (→ `toMenu()` stops the view).
- ButtonBar holds 9; it `console.warn`s when a screen passes more. Finished games show
  Rematch + "Review game" (sub-view: Prev/Next/Flip/Done) + menu = 9 max.
- Puzzle **Hint** = `setMarks` on the from-square of the next solution move; any move,
  `stop()` and `bindBoard` clear marks.
- Premoves (game.js): during the opponent's turn `canPick` allows own pieces and targets come
  from `flipTurn(fen)`; `tryMove` then queues `this.premove` (violet marks, "Premove Nf3").
  `_applyState` plays it via `_playPremove()` *after* `_render()` (so "Premove cancelled"
  isn't overwritten). `tryMove` returns true only when a move was made.
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
  fires `selectstart` on the controller groups → normal ray select — except a pinch right at
  one of your pieces (`_handGrabs`/`_reachable`), which grabs it instead. Piece grabs confirm
  in `_tick` (`pendingGrab` → `_confirmGrab`): held `GRAB_HOLD` ms with thumb–index gap ≤
  `GRAB_GAP`; the piece is chosen then, a pinch released earlier grabs nothing (tests shift
  `pendingGrab.t0`). `_reachHover` lights up the piece a pinch would grab (hover `h0`/`h1`).
  `grab`: no hand rays; three's
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

    node test/test.js && node test/hunt-unit.js     # pure logic (Node)
    test/run-smoke.sh                               # every test/*-smoke.html headless; all must print *-OK

`PORT=… test/run-smoke.sh page…` runs a subset on another port (parallel agents). Suites:
`smoke` (render), `ui` (bar/poke/picker/hover/scale/envs/styles), `grab`, `game` (fake lichess
stream: optimistic moves, offers, premoves, promotion, replay…), `puzzle`, `rush`, `trainer`,
`app` (real index.html + main.js vs stubbed `fetch`), and `hunt-*` — regression suites written by
adversarial bug-hunter agents (each check encodes a bug that was real). New bugs: write the
failing check first, then fix. Gotchas: ray-picking freshly created objects needs a rendered
frame (`board._tick()`); XR controllers need `updateMatrix()`; tints are `tile.userData.tint`
(hover is emissive). The runner (`test/cdp-run.mjs`) drives Chrome over DevTools in real time, one
page at a time with storage wiped in between — `--virtual-time-budget` stalls image decoding of
the textured GLB. Visual changes: screenshot headless Chrome (`--use-angle=swiftshader
--enable-unsafe-swiftshader`, `Page.captureScreenshot`) and look at it. Real games need a token.

## App packaging & deploy

- Hosted on fred: `deploy/deploy.sh` → `/opt/parallax/web`, Caddy site in
  `deploy/Caddyfile.parallax` (appended to `/etc/caddy/Caddyfile`; backups `Caddyfile.bak-parallax-*`).
  URL https://parallax.46-224-133-201.sslip.io. Bump `CACHE` in `sw.js` on each ship.
- Short address **chess.janasven.de**: nginx 301 on janasven (`/etc/nginx/sites-available/chess`,
  certbot TLS; `*.janasven.de` wildcard at netcup) → the fred URL. The app's origin stays fred.
- Caching: Caddy sends `Cache-Control: no-cache` on every file (revalidate → 304s); `sw.js` is
  network-first for app files (cache only offline) and cache-first for versioned CDN modules.
  Never go back to stale-while-revalidate for app modules: it mixed old and new ES modules
  after a deploy (old settings page inside a new scene).
- PWA: `manifest.webmanifest`, `sw.js` (registered on https only, so localhost dev never caches),
  icons `assets/brand/icon-*.png`. `.well-known/assetlinks.json` ties the APK to the site (no URL bar).
- Quest APK: `android/build.sh` (Meta's Bubblewrap fork, `horizonOSAppMode: immersive`,
  package `com.comino.parallax`). Toolchain: brew `openjdk@17`, `android-commandlinetools`
  (SDK root needs a `tools -> cmdline-tools/latest` symlink for Bubblewrap), `~/.bubblewrap/config.json`.
  Signing key: `~/.parallax/parallax.keystore` + `keystore.pass` — **never lose it** (updates must
  match; the asset-links fingerprint is derived from it). Bump `appVersionCode` for updates.
- Login: `src/auth.js` OAuth PKCE with lichess (client_id `parallax`, no registration);
  redirect back to the app origin, token then stored like a pasted one.
- VR resolution: `_startSession` sets `setFramebufferScaleFactor` before every session —
  `XRWebGLLayer.getNativeFramebufferScaleFactor` for `resolution: 'native'` (default), 1 for
  'normal' (Settings → View, `localStorage.resolution`; applies from the next VR entry).
- Launch: headsets get `#launch` (Enter VR) + `board.offerVR()` (Quest's own VR prompt);
  three's VRButton is gone — `board.enterVR()` / `xrSupported()`.

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

- Chat, requesting takebacks, claim draw when the opponent leaves, time-control picker per game
- PGN export
