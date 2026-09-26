import { Board3D } from './board3d.js'
import { Lichess, isRapid } from './lichess.js'
import { GameSession } from './game.js'
import { PuzzleSession } from './puzzle.js'
import { TrainerSession } from './trainer.js'
import { RushSession } from './rush.js'
import { settingsView } from './settings.js'

const $ = id => document.getElementById(id)
const msg = t => { $('msg').textContent = t }

let lichess = null, session = null, username = null, seekAbort = null, connecting = false
let maiaTimer = null
let view = null // what the VR panel shows: game session, puzzles, trainer, or null (idle menu)

const board = new Board3D()
try {
  await board.init()
} catch (e) {
  msg('3D init failed: ' + e.message)
  throw e
}
window.parallax = { board } // debug handle (chrome://inspect, app tests)

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
  refresh()
}
const settings = () => ({
  time: +val('time'), increment: +val('inc'), color: val('color'), rated: val('rated'),
  level: Math.min(8, Math.max(1, Math.round(+val('ailevel')) || 3)),
  maia: [1, 5, 9].includes(+val('maia')) ? +val('maia') : 5, pdiff: val('pdiff'), ptheme: val('ptheme'),
  height: board.stage.position.y, scale: board.boardScale, flipped: !!board.flipped,
  environment: board.environment, pieces: board.pieceStyle, voice: board.voice, hands: board.handMode
})
const FIELD_OF = { time: 'time', increment: 'inc', color: 'color', rated: 'rated', level: 'ailevel', maia: 'maia', pdiff: 'pdiff', ptheme: 'ptheme' }
// View settings live on the board and persist in their own localStorage keys.
const VIEW_SETTERS = {
  height: h => { board.setHeight(h); board.onHeightChange(board.stage.position.y) },
  scale: s => { board.setScale(s); localStorage.setItem('boardScale', s) },
  flipped: f => { board.setFlipped(f); localStorage.setItem('flipped', f ? '1' : '') },
  environment: e => { board.setEnvironment(e); localStorage.setItem('environment', e) },
  hands: h => { $('handmode').value = h; $('handmode').onchange() },
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
// Full menu, shown on the idle panel.
function menu() {
  const { time, increment, level } = settings(), tc = `${time}+${increment}`
  const acts = [] // time control / color live on the idle panel's sub line
  if (username) {
    acts.push({ label: `Stockfish L${level}`, run: playAi, primary: true })
    acts.push({ label: `Maia ${settings().maia}`, run: playMaia })
    acts.push(seeking() ? { label: 'Cancel seek', run: cancelSeek } : { label: `Seek ${tc}`, run: seek })
  }
  acts.push({ label: 'Puzzles', run: startPuzzles, primary: !username }, { label: 'Puzzle rush', run: startRush },
    { label: 'Coordinates', run: startTrainer }, { label: 'Settings', run: openSettings })
  return acts
}

// Appended to every activity's own buttons: a running seek stays cancellable, Menu leaves.
function compactMenu() {
  return [...seeking() ? [{ label: 'Cancel seek', run: cancelSeek }] : [], { label: 'Menu', run: toMenu }]
}

function toMenu() {
  view?.stop()
  view = null
  board.setOrientation(board.orientation ?? 'white') // drops an in-game peek
  refresh()
}

// Message on the 2D page and, where the current view can show one, on the VR panel.
let note = null
function notify(text) {
  msg(text)
  if (view?.say) view.say(text)
  else if (!view) { note = text; refresh() }
}

function refresh() {
  $('seek').textContent = seeking() ? 'Cancel seek' : 'Seek human'
  if (view) view.render()
  else board.setStatus({ puzzle: true, brand: true, text: seeking() ? 'Seeking opponent…' : note || 'Choose how to play',
    sub: username ? idleSub() : 'Training works without an account', actions: menu() })
}

function idleSub() {
  const { time, increment, color, rated } = settings()
  return `${username} · ${time}+${increment} · ${color} · ${rated ? 'rated' : 'casual'}`
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
const playable = g => !UNPLAYABLE.includes(g.speed) && g.compat?.board !== false &&
  ['standard', 'fromPosition', undefined].includes(g.variant?.key)

// lichess re-sends gameStart for every ongoing game when the stream (re)opens.
function onEvent(ev) {
  if (ev.type === 'challengeDeclined') return notify('Challenge declined — try another time control or color')
  if (ev.type !== 'gameStart' || !playable(ev.game)) return
  const id = ev.game.gameId || ev.game.id
  if (id === session?.gameId || gameRunning()) return
  seekAbort?.abort()
  attach(id)
}

function attach(gameId) {
  if (session?.gameId === gameId || gameRunning()) return // never drop a live game
  note = null
  clearTimeout(maiaTimer)
  view?.stop()
  session = view = new GameSession({ lichess, board, username, gameId, onStatus: t => msg(t), menu: compactMenu })
  session.start().catch(e => { if (e.name !== 'AbortError') msg('Game stream lost: ' + e.message) })
}

const gameRunning = () => session && !session.finished

async function seek() {
  if (gameRunning()) return msg('Finish or resign the game first')
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
}

async function playAi() {
  if (gameRunning()) return
  notify('Challenging Stockfish…')
  const { level, time, increment, color } = settings()
  try {
    await lichess.challengeAi({ level, time, increment, color })
  } catch (e) {
    notify('Stockfish challenge failed: ' + e.message)
  }
}

// Puzzles and the trainer need no login; they replace whatever the board shows.
function startActivity(make) {
  if (gameRunning()) return msg('Finish or resign the game first')
  note = null
  view?.stop()
  session = null
  view = make()
}

// Maia: human-like lichess bots (maia1/5/9), challenged directly; they accept on their own.
async function playMaia() {
  if (gameRunning()) return
  const { maia, time, increment, rated, color } = settings()
  notify(`Challenging Maia ${maia}…`)
  clearTimeout(maiaTimer)
  maiaTimer = setTimeout(() => !gameRunning() && notify(`Maia ${maia} didn't answer — try again or another time control`), 20000)
  try {
    await lichess.challenge('maia' + maia, { time, increment, rated, color })
  } catch (e) {
    clearTimeout(maiaTimer)
    notify('Maia challenge failed: ' + e.message)
  }
}

function startPuzzles() {
  startActivity(() => {
    // Anonymous on purpose: a board:play token lacks puzzle:read and would get 403.
    const p = new PuzzleSession({ lichess: new Lichess(), board, onStatus: msg, menu: compactMenu,
      options: () => ({ difficulty: val('pdiff'), angle: val('ptheme') === 'mix' ? undefined : val('ptheme') }) })
    p.next()
    return p
  })
}

function openSettings() {
  startActivity(() => settingsView({
    board, get: settings, set: setSettings, onBack: toMenu
  }))
  refresh()
}

function startRush() {
  startActivity(() => {
    const r = new RushSession({ lichess: new Lichess(), board, onStatus: msg, menu: compactMenu })
    r.start()
    return r
  })
}

function startTrainer() {
  startActivity(() => {
    const t = new TrainerSession({ board, onStatus: msg, menu: compactMenu })
    t.start()
    return t
  })
}

// --- 2D page wiring ---

loadSettings()
for (const id of FIELDS) $(id).onchange = saveSettings

board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') // idle: the start position
const sidebar = () => board.setViewShift(innerWidth > 720 ? $('ui').offsetWidth + 16 : 0)
sidebar()
addEventListener('resize', sidebar)
board.setHeight(+localStorage.getItem('tableHeight') || 0)
board.setScale(+localStorage.getItem('boardScale') || 1)
board.setFlipped(!!localStorage.getItem('flipped'))
board.setEnvironment(localStorage.getItem('environment') || 'study')
board.setPieceStyle(localStorage.getItem('pieceStyle') || 'solid')
board.voice = localStorage.getItem('voice') || 'off'
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
$('seek').onclick = () => seeking() ? cancelSeek() : seek()
$('ai').onclick = playAi
$('maiaBtn').onclick = playMaia
$('puzzle').onclick = startPuzzles
$('coords').onclick = startTrainer
$('rush').onclick = startRush
// Resign asks twice here too (3 s window), like the in-VR button.
let resignArmed = 0
$('resign').onclick = () => {
  if (!gameRunning()) return
  if (performance.now() - resignArmed > 3000) {
    resignArmed = performance.now()
    $('resign').textContent = 'Confirm resign'
    return setTimeout(() => { $('resign').textContent = 'Resign' }, 3000)
  }
  resignArmed = 0
  $('resign').textContent = 'Resign'
  lichess.resign(session.gameId).catch(e => msg(e.message))
}

refresh()
const saved = localStorage.getItem('lichessToken')
if (saved) {
  $('token').value = saved
  connect(saved)
} else {
  msg('Create a lichess token and connect')
}
