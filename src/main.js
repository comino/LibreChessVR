import { Board3D } from './board3d.js'
import { Lichess, isRapid } from './lichess.js'
import { GameSession } from './game.js'
import { PuzzleSession } from './puzzle.js'

const $ = id => document.getElementById(id)
const msg = t => { $('msg').textContent = t }

let lichess = null, session = null, username = null, seekAbort = null, connecting = false
let puzzles = null

const board = new Board3D()
try {
  await board.init()
} catch (e) {
  msg('3D init failed: ' + e.message)
  throw e
}

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
  session = new GameSession({ lichess, board, username, gameId, onStatus: t => msg(t) })
  session.start().catch(e => { if (e.name !== 'AbortError') msg('Game stream lost: ' + e.message) })
}

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

$('seek').onclick = async () => {
  const time = +$('time').value, increment = +$('inc').value
  if (!isRapid(time, increment))
    return msg('Seeks must be rapid: minutes + ⅔ × increment ≥ 8 (e.g. 10+0, 5+5). Blitz works vs Stockfish.')
  seekAbort?.abort()
  seekAbort = new AbortController()
  msg('Seeking opponent…')
  try {
    await lichess.seek({
      time, increment, rated: $('rated').checked, color: $('color').value
    }, seekAbort.signal)
  } catch (e) {
    if (e.name !== 'AbortError') msg('Seek failed: ' + e.message)
  }
}

$('ai').onclick = async () => {
  msg('Challenging Stockfish…')
  try {
    await lichess.challengeAi({
      level: +$('ailevel').value, time: +$('time').value,
      increment: +$('inc').value, color: $('color').value
    })
  } catch (e) {
    msg('AI challenge failed: ' + e.message)
  }
}

$('puzzle').onclick = () => {
  if (session && !session.finished) return msg('Finish or resign the game first')
  session?.stop()
  session = null
  lichess ??= new Lichess() // puzzles work without a token
  puzzles ??= new PuzzleSession({ lichess, board, onStatus: msg })
  puzzles.next($('pdiff').value)
}

$('resign').onclick = () => {
  if (session && !session.finished) lichess.resign(session.gameId).catch(e => msg(e.message))
}

const saved = localStorage.getItem('lichessToken')
if (saved) {
  $('token').value = saved
  connect(saved)
} else {
  msg('Create a lichess token and connect')
}
