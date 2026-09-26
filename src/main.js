import { Board3D } from './board3d.js'
import { Lichess, isRapid } from './lichess.js'
import { GameSession } from './game.js'
import { PuzzleSession } from './puzzle.js'
import { TrainerSession } from './trainer.js'
import { settingsView } from './settings.js'

const $ = id => document.getElementById(id)
const msg = t => { $('msg').textContent = t }

let lichess = null, session = null, username = null, seekAbort = null, connecting = false
let view = null // what the VR panel shows: game session, puzzles, trainer, or null (idle menu)

const board = new Board3D()
try {
  await board.init()
} catch (e) {
  msg('3D init failed: ' + e.message)
  throw e
}
window.chessvr = { board } // debug handle (chrome://inspect, app-smoke test)

// --- settings: 2D form fields, persisted so the in-VR menu uses the same values ---

const FIELDS = ['time', 'inc', 'color', 'rated', 'ailevel', 'pdiff']
const val = id => $(id).type === 'checkbox' ? $(id).checked : $(id).value
function loadSettings() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('settings')) || {} } catch { /* corrupt */ }
  for (const id of FIELDS) if (id in saved) $(id)[$(id).type === 'checkbox' ? 'checked' : 'value'] = saved[id]
}
function saveSettings() {
  localStorage.setItem('settings', JSON.stringify(Object.fromEntries(FIELDS.map(id => [id, val(id)]))))
  refresh()
}
const settings = () => ({
  time: +val('time'), increment: +val('inc'), color: val('color'), rated: val('rated'), level: +val('ailevel')
})
const FIELD_OF = { time: 'time', increment: 'inc', color: 'color', rated: 'rated', level: 'ailevel' }
function setSettings(patch) {
  for (const [k, v] of Object.entries(patch)) $(FIELD_OF[k])[typeof v === 'boolean' ? 'checked' : 'value'] = v
  saveSettings()
}
function nudgeHeight(d) {
  board.setHeight(board.stage.position.y + d)
  board.onHeightChange(board.stage.position.y)
  refresh()
}

// --- in-VR menu ---

const seeking = () => seekAbort && !seekAbort.signal.aborted
// except: label of the activity already showing (no button to start it again)
function menu({ except } = {}) {
  const { time, increment, level } = settings(), tc = `${time}+${increment}`
  const acts = []
  if (username) {
    acts.push({ label: `Stockfish L${level} ${tc}`, run: playAi })
    if (seeking()) acts.push({ label: 'Cancel seek', run: cancelSeek })
    else if (isRapid(time, increment)) acts.push({ label: `Seek human ${tc}`, run: seek }) // lichess: seeks rapid+
  }
  acts.push({ label: 'Puzzles', run: startPuzzles }, { label: 'Coordinates', run: startTrainer },
    { label: 'Settings', run: openSettings })
  return acts.filter(a => a.label !== except)
}

// Message on the 2D page and, where the current view can show one, on the VR panel.
let note = null
function notify(text) {
  msg(text)
  if (view?.say) view.say(text)
  else if (!view) { note = text; refresh() }
}

function refresh() {
  if (view) view.render()
  else board.setStatus({ puzzle: true, text: seeking() ? 'Seeking opponent…' : note || 'ChessVR',
    sub: username ? 'Connected as ' + username : 'Puzzles work without login', actions: menu() })
}

// --- lichess connection & games ---

async function connect(token) {
  if (connecting) return
  connecting = true
  const li = new Lichess(token)
  try {
    username = (await li.account()).username
  } catch (e) {
    msg('Login failed: ' + e.message)
    connecting = false
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
const playable = g => g.speed !== 'correspondence' && g.compat?.board !== false

// lichess re-sends gameStart for every ongoing game when the stream (re)opens.
function onEvent(ev) {
  if (ev.type === 'challengeDeclined') return notify('Challenge declined')
  if (ev.type !== 'gameStart' || !playable(ev.game)) return
  const id = ev.game.gameId || ev.game.id
  if (id === session?.gameId || gameRunning()) return
  seekAbort?.abort()
  attach(id)
}

function attach(gameId) {
  if (session?.gameId === gameId || gameRunning()) return // never drop a live game
  view?.stop()
  session = view = new GameSession({ lichess, board, username, gameId, onStatus: t => msg(t), menu })
  session.start().catch(e => { if (e.name !== 'AbortError') msg('Game stream lost: ' + e.message) })
}

const gameRunning = () => session && !session.finished

async function seek() {
  if (gameRunning()) return msg('Finish or resign the game first')
  const { time, increment, rated, color } = settings()
  if (!isRapid(time, increment))
    return msg('Seeks must be rapid: minutes + ⅔ × increment ≥ 8 (e.g. 10+0, 5+5). Blitz works vs Stockfish.')
  seekAbort?.abort()
  const ctl = seekAbort = new AbortController()
  msg('Seeking opponent…')
  refresh()
  try {
    await lichess.seek({ time, increment, rated, color }, ctl.signal)
  } catch (e) {
    if (e.name !== 'AbortError') msg('Seek failed: ' + e.message)
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
  msg('Challenging Stockfish…')
  const { level, time, increment, color } = settings()
  try {
    await lichess.challengeAi({ level, time, increment, color })
  } catch (e) {
    msg('AI challenge failed: ' + e.message)
  }
}

// Puzzles and the trainer need no login; they replace whatever the board shows.
function startActivity(make) {
  if (gameRunning()) return msg('Finish or resign the game first')
  view?.stop()
  session = null
  view = make()
}

function startPuzzles() {
  startActivity(() => {
    // Anonymous on purpose: a board:play token lacks puzzle:read and would get 403.
    const p = new PuzzleSession({ lichess: new Lichess(), board, onStatus: msg, menu: () => menu({ except: 'Puzzles' }) })
    p.next(val('pdiff'))
    return p
  })
}

function openSettings() {
  startActivity(() => settingsView({
    board, get: settings, set: setSettings,
    height: { get: () => board.stage.position.y, nudge: nudgeHeight },
    onBack: () => { view = null; refresh() }
  }))
  refresh()
}

function startTrainer() {
  startActivity(() => {
    const t = new TrainerSession({ board, onStatus: msg, menu: () => menu({ except: 'Coordinates' }) })
    t.start()
    return t
  })
}

// --- 2D page wiring ---

loadSettings()
for (const id of FIELDS) $(id).onchange = saveSettings

board.setHeight(+localStorage.getItem('tableHeight') || 0)
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
$('seek').onclick = seek
$('ai').onclick = playAi
$('puzzle').onclick = startPuzzles
$('coords').onclick = startTrainer
$('resign').onclick = () => {
  if (gameRunning()) lichess.resign(session.gameId).catch(e => msg(e.message))
}

refresh()
const saved = localStorage.getItem('lichessToken')
if (saved) {
  $('token').value = saved
  connect(saved)
} else {
  msg('Create a lichess token and connect')
}
