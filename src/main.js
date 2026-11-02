import { Board3D } from './board3d.js'
import { Lichess, isRapid } from './lichess.js'
import { GameSession } from './game.js'
import { PuzzleSession } from './puzzle.js'
import { TrainerSession } from './trainer.js'
import { RushSession } from './rush.js'
import { Navigation } from './navigation.js'
import { startLogin, finishLogin } from './auth.js'
import { FreeBoard } from './free.js'
import { showPiecesAction } from './bind.js'
import { DesktopView } from './desktop.js'
import { Confirmation, PendingChallenge } from './actions.js'

const $ = id => document.getElementById(id)
let desktop = null
const msg = t => { $('msg').textContent = t; desktop?.setMessage(t) }

let lichess = null, session = null, username = null, seekAbort = null, connecting = false
let view = null // the activity only; browsing a menu never replaces or stops it
let activityKind = 'free', note = null
const resignConfirmation = new Confirmation()
let resignTimer = null
const pendingChallenge = new PendingChallenge({
  cancel: id => lichess.cancelChallenge(id), changed: () => { saveChallenge(); refresh() }, message: notify
})
// An open challenge survives a reload (Lichess may still accept it), per account.
function saveChallenge() {
  const saved = pendingChallenge.saved()
  try {
    if (saved) localStorage.setItem('pendingChallenge', JSON.stringify({ ...saved, username }))
    else localStorage.removeItem('pendingChallenge')
  } catch { /* optional: storage full or blocked */ }
}
function restoreChallenge() {
  try {
    const saved = JSON.parse(localStorage.getItem('pendingChallenge'))
    if (saved?.username === username) pendingChallenge.restore(saved)
  } catch { /* nothing to restore */ }
}

const board = new Board3D()
try {
  await board.init()
} catch (e) {
  msg('3D init failed: ' + e.message)
  throw e
}
window.parallax = { board } // debug handle (chrome://inspect, app tests)
const free = new FreeBoard(board, () => !view && refresh()) // idle: move both sides freely

// --- settings: 2D form fields, persisted so the in-VR menu uses the same values ---

const FIELDS = ['time', 'inc', 'color', 'rated', 'ailevel', 'maia', 'pdiff', 'ptheme']
const val = id => $(id).type === 'checkbox' ? $(id).checked : $(id).value
function loadSettings() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('settings')) } catch { /* corrupt */ }
  if (!saved || typeof saved !== 'object') saved = {}
  for (const id of FIELDS) if (id in saved) $(id)[$(id).type === 'checkbox' ? 'checked' : 'value'] = saved[id]
}
function saveSettings() {
  localStorage.setItem('settings', JSON.stringify(Object.fromEntries(FIELDS.map(id => [id, val(id)]))))
  syncLook()
  refresh()
}
const settings = () => ({
  time: +val('time'), increment: +val('inc'), color: val('color'), rated: val('rated'),
  level: Math.min(8, Math.max(1, Math.round(+val('ailevel')) || 3)),
  maia: [1, 5, 9].includes(+val('maia')) ? +val('maia') : 5, pdiff: val('pdiff'), ptheme: val('ptheme'),
  height: board.stage.position.y, scale: board.boardScale, flipped: !!board.flipped,
  environment: board.environment, pieces: board.pieceStyle, voice: board.voice, hands: board.handMode,
  boardTheme: board.boardTheme, pieceTheme: board.pieceTheme, knightFacing: board.knightFacing,
  fps: !!board.showFps, resolution: board.resolution
})
const FIELD_OF = { time: 'time', increment: 'inc', color: 'color', rated: 'rated', level: 'ailevel', maia: 'maia', pdiff: 'pdiff', ptheme: 'ptheme' }
// View settings live on the board and persist in their own localStorage keys.
const VIEW_SETTERS = {
  height: h => { board.setHeight(h); board.onHeightChange(board.stage.position.y) },
  scale: s => { board.setScale(s); localStorage.setItem('boardScale', s) },
  flipped: f => { board.setFlipped(f); localStorage.setItem('flipped', f ? '1' : '') },
  environment: e => { board.setEnvironment(e); localStorage.setItem('environment', e) },
  hands: h => { $('handmode').value = h; $('handmode').onchange() },
  boardTheme: t => { board.setBoardTheme(t); localStorage.setItem('boardTheme', t) },
  pieceTheme: t => { board.setPieceTheme(t); localStorage.setItem('pieceTheme', t) },
  knightFacing: f => { board.setKnightFacing(f); localStorage.setItem('knightFacing', board.knightFacing) },
  fps: f => { board.setShowFps(f); localStorage.setItem('showFps', f ? '1' : '') },
  resolution: r => { board.setResolution(r); localStorage.setItem('resolution', r) },
  pieces: p => { board.setPieceStyle(p); localStorage.setItem('pieceStyle', p) },
  voice: v => { board.voice = v; localStorage.setItem('voice', v) }
}
function setSettings(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (VIEW_SETTERS[k]) VIEW_SETTERS[k](v)
    else $(FIELD_OF[k])[typeof v === 'boolean' ? 'checked' : 'value'] = v
  }
  saveSettings()
}

// --- in-VR menu ---

const seeking = () => seekAbort && !seekAbort.signal.aborted
// Sessions supply their own actions; the board adds a persistent Menu footer to all of them.
function compactMenu() {
  return [
    ...seeking() ? [{ label: 'Cancel seek', run: cancelSeek }] : [],
    ...pendingChallenge.current ? [{ label: 'Cancel challenge', run: () => pendingChallenge.cancel(),
      disabled: !canCancelChallenge() }] : []
  ]
}

const canCancelChallenge = () => {
  const p = pendingChallenge.current
  return !!p && !p.cancelling
}

function startFree() {
  if (gameRunning()) return
  note = null
  view?.stop()
  view = null
  activityKind = 'free'
  free.attach()
  board.setOrientation(board.orientation ?? 'white') // drops an in-game peek
  refresh()
}

function activityContext() {
  const live = !!gameRunning()
  const label = { free: 'Free board', puzzles: 'Puzzle', rush: 'Rush', coordinates: 'Coordinates',
    game: session?.reviewing ? 'Game review' : 'Game' }[activityKind]
  return { kind: activityKind, label, username, live, seeking: !!seeking(), notice: pendingChallenge.current?.notice || note,
    pendingChallenge: pendingChallenge.current && { label: pendingChallenge.current.label, cancellable: canCancelChallenge() },
    timed: live || activityKind === 'rush' && !view?.over || activityKind === 'coordinates' && !!view?.running,
    progress: activityKind === 'free' ? free.changed() : live || !!view?.running || activityKind === 'rush' && !view?.over }
}

const navigation = new Navigation({
  show: page => board.showMenu(page), hide: () => board.hideMenu(), context: activityContext,
  get: settings, set: setSettings, login: () => startLogin(), cancelSeek,
  cancelChallenge: () => pendingChallenge.cancel(),
  start: kind => ({ free: startFree, puzzles: startPuzzles, rush: startRush, coordinates: startTrainer,
    stockfish: playAi, maia: playMaia, human: seek })[kind]()
})
window.parallax.navigation = navigation
board.menuAction = { id: 'menu', label: 'Menu', run: () => navigation.open() }
board.onStatus = () => {
  syncActionControls()
  const title = activityContext().label
  if (board.activityTitle !== title) {
    board.activityTitle = board.bar.title = title
    board.bar.draw()
  }
  navigation.refresh()
  desktop?.setStatus()
}

// Message on the 2D page and, where the current view can show one, on the VR panel.
function notify(text) {
  note = text
  msg(text)
  if (view?.say) view.say(text)
  else if (!view) refresh()
  navigation.refresh()
}

function refresh() {
  syncActionControls()
  $('seek').textContent = seeking() ? 'Cancel seek' : 'Seek human'
  if (view) view.render()
  else board.setStatus({ puzzle: true, text: seeking() ? 'Seeking opponent…' : note || 'Free board',
    sub: `${free.color === 'white' ? 'White' : 'Black'} to move · Move both sides`, actions: [
      { label: 'Undo', disabled: !free.canUndo(), run: () => free.undo(), slot: 0 },
      { label: 'Reset board', disabled: !free.changed(), confirm: true, run: () => free.reset(), slot: 8 },
      { label: 'Flip board', run: () => board.togglePeek() }, ...showPiecesAction(board), ...compactMenu()
    ] })
}

function resetResign() {
  resignConfirmation.reset()
  clearTimeout(resignTimer)
  resignTimer = null
  $('resign').textContent = 'Resign'
}

function syncActionControls() {
  const live = !!gameRunning(), pending = !!pendingChallenge.current
  for (const id of ['ai', 'maiaBtn', 'seek']) $(id).disabled = live || pending
  $('resign').disabled = !live
  if (!live || resignConfirmation.armed && resignConfirmation.armed.key !== session.gameId) resetResign()
  const cancel = $('cancelChallenge')
  if (cancel) {
    cancel.hidden = !pending
    cancel.disabled = !canCancelChallenge()
  }
}

// --- lichess connection & games ---

async function connect(token) {
  if (connecting) return
  connecting = true
  const li = new Lichess(token)
  try {
    username = (await li.account()).username
  } catch (e) {
    connecting = false
    // offline (e.g. headset just woke up): retry; a rejected token needs the user
    if (e instanceof TypeError) {
      msg('Offline — retrying login…')
      setTimeout(() => connect(token), 5000)
    } else msg(`Login failed (${e.message}) — check the token and its scopes`)
    return
  }
  lichess = li
  localStorage.setItem('lichessToken', token)
  $('auth').style.display = 'none'
  $('play').style.display = ''
  msg('Connected as ' + username)
  restoreChallenge()
  refresh()
  runEvents()
}

// The event stream dies on network blips or headset sleep; reconnect forever and
// re-check ongoing games each time so a game started while offline gets attached.
async function runEvents() {
  for (;;) {
    try {
      const { nowPlaying } = await lichess.playing()
      const live = nowPlaying?.find(playable)
      if (live) attach(live.gameId)
      await lichess.streamEvents(onEvent)
    } catch (e) {
      msg('Event stream lost: ' + e.message)
    }
    await new Promise(r => setTimeout(r, 3000))
  }
}

// Real-time board-compatible games only; correspondence games would hijack the board.
// nowPlaying entries lack compat.board, so speeds/variants are checked explicitly.
const UNPLAYABLE = ['ultraBullet', 'bullet', 'correspondence']
const playable = g => !!g && !UNPLAYABLE.includes(g.speed) && g.compat?.board !== false &&
  ['standard', 'fromPosition', undefined].includes(g.variant?.key)

// lichess re-sends gameStart for every ongoing game when the stream (re)opens.
function onEvent(ev) {
  if (ev.type === 'challengeDeclined' || ev.type === 'challengeCanceled') {
    const text = ev.type === 'challengeDeclined' ? 'Challenge declined — try another time control or color' : 'Challenge cancelled'
    if (pendingChallenge.ended(ev.challenge?.id, text)) return
    if (ev.type === 'challengeDeclined' && !pendingChallenge.current && !gameRunning()) notify(text)
    return
  }
  if (ev.type !== 'gameStart' || !playable(ev.game)) return
  const id = ev.game.gameId || ev.game.id
  if (id === session?.gameId || gameRunning() || pendingChallenge.wasCancelled(id)) return // before aborting a seek
  seekAbort?.abort()
  attach(id)
}

function attach(gameId) {
  if (session?.gameId === gameId || gameRunning() || pendingChallenge.wasCancelled(gameId)) return // never drop a live game
  note = null
  resetResign()
  seekAbort?.abort()
  view?.stop()
  activityKind = 'game'
  session = view = new GameSession({ lichess, board, username, gameId, onStatus: t => msg(t), menu: compactMenu,
    challengePending: () => !!pendingChallenge.current,
    requestRematch: (opponent, params) => requestChallenge(opponent.aiLevel ? 'Stockfish' : opponent.name || opponent.id,
      () => opponent.aiLevel ? lichess.challengeAi({ level: opponent.aiLevel, ...params }) : lichess.challenge(opponent.id, params),
      { failure: 'Rematch failed: ', started: opponent.aiLevel ? 'Starting rematch…' : `Rematch offered to ${opponent.name || opponent.id}…` }) })
  pendingChallenge.gameStarted(gameId)
  session.start().catch(e => { if (e.name !== 'AbortError') msg('Game stream lost: ' + e.message) })
}

const gameRunning = () => session && !session.finished

async function seek() {
  if (gameRunning()) return msg('Finish or resign the game first')
  if (pendingChallenge.current) return notify('Cancel the pending challenge first')
  const { time, increment, rated, color } = settings()
  if (!isRapid(time, increment))
    return notify('Seeks need rapid or slower (10+0, 5+5). Blitz works vs Stockfish and Maia.')
  seekAbort?.abort()
  note = null
  const ctl = seekAbort = new AbortController()
  msg('Seeking opponent…')
  refresh()
  try {
    await lichess.seek({ time, increment, rated, color }, ctl.signal)
  } catch (e) {
    if (e.name !== 'AbortError') notify('Seek failed: ' + e.message)
  }
  ctl.abort() // closed by the server or failed: no longer seeking
  refresh()
}

function cancelSeek() {
  seekAbort?.abort()
  msg('Seek cancelled')
  note = null
  refresh()
}

function requestChallenge(label, create, options = {}) {
  if (gameRunning() || pendingChallenge.current) return false
  seekAbort?.abort()
  const owner = view, kind = activityKind
  void pendingChallenge.start(label, create, { ...options, message: text => {
    if (view === owner && activityKind === kind) notify(text)
    else $('msg').textContent = text // a delayed failure belongs to its originating activity: log only
  } })
  return true
}

function playAi() {
  const { level, time, increment, color } = settings()
  return requestChallenge('Stockfish', () => lichess.challengeAi({ level, time, increment, color }))
}

// Puzzles and the trainer need no login; they replace whatever the board shows.
function startActivity(kind, make) {
  if (gameRunning()) return msg('Finish or resign the game first')
  note = null
  view?.stop()
  session = null
  activityKind = kind
  board.setMoves([])
  view = make()
  refresh()
}

// Maia: human-like lichess bots (maia1/5/9), challenged directly; they accept on their own.
function playMaia() {
  const { maia, time, increment, rated, color } = settings()
  return requestChallenge(`Maia ${maia}`, () => lichess.challenge('maia' + maia, { time, increment, rated, color }))
}

function startPuzzles() {
  startActivity('puzzles', () => {
    // Anonymous on purpose: a board:play token lacks puzzle:read and would get 403.
    const p = new PuzzleSession({ lichess: new Lichess(), board, onStatus: msg, menu: compactMenu,
      options: () => ({ difficulty: val('pdiff'), angle: val('ptheme') === 'mix' ? undefined : val('ptheme') }) })
    p.next()
    return p
  })
}

function startRush() {
  startActivity('rush', () => {
    const r = new RushSession({ lichess: new Lichess(), board, onStatus: msg, menu: compactMenu })
    r.start()
    return r
  })
}

function startTrainer() {
  startActivity('coordinates', () => {
    const t = new TrainerSession({ board, onStatus: msg, menu: compactMenu })
    t.start()
    return t
  })
}

// --- 2D page wiring ---

loadSettings()
for (const id of FIELDS) $(id).onchange = saveSettings

board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') // idle: the start position
free.attach()
desktop = new DesktopView(board, navigation, $('ui'))
board.setHeight(+localStorage.getItem('tableHeight') || 0)
board.setScale(+localStorage.getItem('boardScale') || 1)
board.setFlipped(!!localStorage.getItem('flipped'))
board.setEnvironment(localStorage.getItem('environment') || 'study')
board.setPieceStyle(localStorage.getItem('pieceStyle') || 'solid')
board.voice = localStorage.getItem('voice') || 'off'
board.setBoardTheme(localStorage.getItem('boardTheme') || 'walnut')
board.setPieceTheme(localStorage.getItem('pieceTheme') || 'antique')
board.setKnightFacing(localStorage.getItem('knightFacing'))
board.setShowFps(!!localStorage.getItem('showFps'))
board.setResolution(localStorage.getItem('resolution') === 'normal' ? 'normal' : 'native')

// Look dropdowns on the 2D page share the in-VR setters (and their persistence).
const LOOK = { scene: 'environment', boardTheme: 'boardTheme', pieceTheme: 'pieceTheme', knightFacing: 'knightFacing' }
function syncLook() {
  const s = settings()
  for (const [id, key] of Object.entries(LOOK)) if ($(id)) $(id).value = s[key]
}
for (const [id, key] of Object.entries(LOOK)) if ($(id)) $(id).onchange = () => setSettings({ [key]: $(id).value })

syncLook()
board.onHeightChange = h => localStorage.setItem('tableHeight', h.toFixed(3))

$('handmode').value = localStorage.getItem('handMode') || 'ray'
board.setHandMode($('handmode').value)
$('handmode').onchange = () => {
  localStorage.setItem('handMode', $('handmode').value)
  board.setHandMode($('handmode').value)
}

$('connect').onclick = () => {
  const t = $('token').value.trim()
  t ? connect(t) : msg('Paste a lichess API token first')
}
$('seek').onclick = () => seeking() ? cancelSeek() : navigation.requestStart('human')
$('ai').onclick = () => navigation.requestStart('stockfish')
$('maiaBtn').onclick = () => navigation.requestStart('maia')
$('puzzle').onclick = () => navigation.requestStart('puzzles')
$('coords').onclick = () => navigation.requestStart('coordinates')
$('rush').onclick = () => navigation.requestStart('rush')
$('freeBoard').onclick = () => navigation.requestStart('free')
const cancelChallengeButton = document.createElement('button')
cancelChallengeButton.id = 'cancelChallenge'
cancelChallengeButton.textContent = 'Cancel challenge'
cancelChallengeButton.hidden = true
cancelChallengeButton.onclick = () => pendingChallenge.cancel()
$('logout').before(cancelChallengeButton)
// Resign asks twice here too (3 s window), like the in-VR button.
$('resign').onclick = () => {
  if (!gameRunning()) return
  const gameId = session.gameId
  if (!resignConfirmation.confirm(gameId)) {
    const armed = resignConfirmation.armed
    $('resign').textContent = 'Confirm resign'
    clearTimeout(resignTimer)
    resignTimer = setTimeout(() => { if (resignConfirmation.armed === armed) resetResign() }, 3000)
    return
  }
  resetResign()
  lichess.resign(gameId).catch(e => { if (session?.gameId === gameId && gameRunning()) msg(e.message) })
}

$('login').onclick = () => startLogin()
$('logout').onclick = () => { localStorage.removeItem('lichessToken'); location.reload() }

// --- launch: a headset gets a full-screen Enter VR screen (plus the browser's own VR offer) ---

function showLaunch(on) {
  if ($('launch')) $('launch').hidden = !on
  desktop.setLaunch(on)
}
board.renderer.xr.addEventListener('sessionstart', () => { desktop.setImmersive(true); showLaunch(false) })
board.renderer.xr.addEventListener('sessionend', () => { desktop.setImmersive(false); board.xrSupported().then(showLaunch) })
const enter = () => board.enterVR().catch(e => { showLaunch(false); msg('Enter VR failed: ' + e.message) })
if ($('enter')) {
  $('enter').onclick = enter
  $('setup').onclick = () => showLaunch(false)
}
$('enterSide').onclick = enter
board.xrSupported().then(ok => {
  $('enterSide').hidden = !ok
  if (!ok) return
  showLaunch(true)
  board.offerVR()
})

// Installed app: cache the shell for fast, offline starts (never on localhost: dev reloads stay fresh).
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js')

refresh()
if (!desktop.collapsed) navigation.open()
finishLogin().then(token => {
  const t = token || localStorage.getItem('lichessToken')
  if (t) {
    $('token').value = t
    connect(t)
  } else msg('Ready to practice. Try a puzzle, find squares, or explore the free board.')
}).catch(e => msg(e.message))
