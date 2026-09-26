import { Board3D } from './board3d.js'
import { Lichess, isRapid } from './lichess.js'
import { GameSession } from './game.js'
import { PuzzleSession } from './puzzle.js'

const $ = id => document.getElementById(id)
const msg = t => { $('msg').textContent = t }

let lichess = null, session = null, username = null, seekAbort = null, connecting = false
let puzzles = null
let view = null // what the VR panel shows: session, puzzles, or null (idle menu)

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

// --- in-VR menu ---

const seeking = () => seekAbort && !seekAbort.signal.aborted
function menu({ withPuzzles = true } = {}) {
  const { time, increment, level } = settings(), tc = `${time}+${increment}`
  const acts = []
  if (username) {
    acts.push({ label: `Stockfish L${level} ${tc}`, run: playAi })
    acts.push(seeking() ? { label: 'Cancel seek', run: cancelSeek } : { label: `Seek human ${tc}`, run: seek })
  }
  if (withPuzzles) acts.push({ label: 'Puzzles', run: startPuzzles })
  return acts
}

function refresh() {
  if (view) view.render()
  else board.setStatus({ puzzle: true, text: seeking() ? 'Seeking opponent…' : 'ChessVR',
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
      if (nowPlaying?.length) attach(nowPlaying[0].gameId)
      await lichess.streamEvents(onEvent)
    } catch (e) {
      msg('Event stream lost: ' + e.message)
    }
    await new Promise(r => setTimeout(r, 3000))
  }
}

function onEvent(ev) {
  if (ev.type === 'gameStart') {
    seekAbort?.abort()
    attach(ev.game.gameId || ev.game.id)
  }
}

function attach(gameId) {
  if (session?.gameId === gameId) return
  puzzles?.stop()
  session?.stop()
  session = view = new GameSession({ lichess, board, username, gameId, onStatus: t => msg(t), menu })
  session.start().catch(e => { if (e.name !== 'AbortError') msg('Game stream lost: ' + e.message) })
}

const gameRunning = () => session && !session.finished

async function seek() {
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

function startPuzzles() {
  if (gameRunning()) return msg('Finish or resign the game first')
  session?.stop()
  session = null
  lichess ??= new Lichess() // puzzles work without a token
  puzzles ??= new PuzzleSession({ lichess, board, onStatus: msg, menu: () => menu({ withPuzzles: false }) })
  view = puzzles
  puzzles.next(val('pdiff'))
}

// --- 2D page wiring ---

loadSettings()
for (const id of FIELDS) $(id).onchange = saveSettings

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
