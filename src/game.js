// One lichess game: streams state, keeps chess.js in sync, relays board moves.

import { Chess } from 'chess.js'
import { bindBoard, showPiecesAction } from './bind.js'
import { TINT } from './theme.js'

const STATUS_TEXT = {
  mate: 'Checkmate', resign: 'Resignation', outoftime: 'Time out', timeout: 'Timeout',
  draw: 'Draw', stalemate: 'Stalemate', aborted: 'Aborted'
}
const lower = s => (s || '').toLowerCase()
const PREMOVE = TINT.premove

// Same position with the other side to move (en passant dropped): premove candidates.
function flipTurn(fen) {
  const f = fen.split(' ')
  f[1] = f[1] === 'w' ? 'b' : 'w'
  f[3] = '-'
  return f.join(' ')
}
const VARIANTS = ['standard', 'fromPosition'] // what chess.js can follow

export class GameSession {
  // menu: () => actions shown once the game is over (new game, puzzles)
  constructor({ lichess, board, username, gameId, onStatus, menu }) {
    Object.assign(this, { lichess, board, username, gameId, onStatus, menu })
    this.abort = new AbortController()
    this.chess = new Chess()
    this.applied = 0
    this.color = 'white'
    this.finished = false
  }

  async start() {
    bindBoard(this.board, this)
    // until gameFull arrives: no stale buttons from the previous view
    this.board.setStatus({ puzzle: true, text: 'Connecting to game…', actions: [] })
    // During the opponent's turn own pieces stay pickable for premoves.
    this.board.canPick = sq => this.active() && this.chess.get(sq)?.color === this.color[0]
    this.board.getTargets = sq => this._premoveBoard().moves({ square: sq, verbose: true }).map(m => m.to)
    // The stream dies on network blips or headset sleep; reconnect until the game
    // ends — each reconnect replays gameFull, which fully resets our state.
    let failures = 0
    while (!this.finished && !this.abort.signal.aborted) {
      try {
        await this.lichess.streamGame(this.gameId, m => { failures = 0; this._onMsg(m) }, this.abort.signal)
      } catch (e) {
        if (e.name === 'AbortError') return
        if (++failures >= 10) return this._fail('Lost the game stream: ' + e.message)
        this.say('Reconnecting: ' + e.message)
      }
      if (!this.finished) await new Promise(r => setTimeout(r, 2000))
    }
  }

  stop() {
    this.stopped = true
    this.abort.abort()
    this.board.deselect()
    clearInterval(this.goneTimer)
  }
  active() { return !!this.state && !this.finished }
  render() { if (this.state) this._render() }

  // A message we can't apply means our state is wrong: stop instead of reconnecting
  // into the same failure forever.
  _onMsg(msg) {
    if (this.abort.signal.aborted) return // rest of a chunk after stop()/_fail
    try {
      this._handle(msg)
    } catch (e) {
      this._fail('Sync error: ' + e.message)
    }
  }

  _fail(text) {
    this.error = text
    this.finished = true
    this._clearPremove()
    this.abort.abort()
    if (this.state) this._render()
    else this.board.setStatus({ puzzle: true, text, actions: this.menu?.() })
    this.onStatus?.(text, true)
  }

  _handle(msg) {
    if (msg.type === 'gameFull') {
      const variant = msg.variant?.key ?? 'standard'
      if (!VARIANTS.includes(variant)) return this._fail(`Variant ${variant} isn't supported — play it on lichess`)
      this.color = lower(msg.white.id) === lower(this.username) ? 'white' : 'black'
      const name = p => p.name || p.id || (p.aiLevel ? 'Stockfish ' + p.aiLevel : '?')
      this.names = { white: name(msg.white), black: name(msg.black) }
      this.opponent = this.color === 'white' ? msg.black : msg.white
      this.clock = msg.clock // {initial, increment} in ms; absent for correspondence
      this.rated = !!msg.rated
      this.initialFen = msg.initialFen && msg.initialFen !== 'startpos' ? msg.initialFen : undefined
      this._reset()
      this.serverMoves = 0
      this.board.setOrientation(this.color)
      if (!msg.state.moves) this.board.cue('start')
      this._applyState(msg.state)
    } else if (msg.type === 'gameState') {
      this._applyState(msg)
    } else if (msg.type === 'opponentGone') {
      clearInterval(this.goneTimer)
      this.claimAt = msg.gone ? performance.now() + (msg.claimWinInSeconds ?? 0) * 1000 : null
      if (msg.gone) this.goneTimer = setInterval(() => { // countdown, then Claim win
        this.render()
        if (this._canClaim()) clearInterval(this.goneTimer)
      }, 1000)
      this.render()
    }
  }

  _reset() {
    this.chess = new Chess(this.initialFen)
    this.applied = 0
    this._clearPremove()
  }

  _applyState(state) {
    const moves = state.moves ? state.moves.split(' ') : []
    // Only a shrinking *server* list is a takeback; a state sent before our optimistic
    // move arrived (moves < applied) is just stale and must not undo it.
    if (moves.length < this.serverMoves) this._reset()
    this.serverMoves = moves.length
    let last = null
    const fresh = moves.slice(this.applied)
    for (const uci of fresh) last = this._applyUci(uci)
    this.applied = Math.max(this.applied, moves.length)
    if (last || moves.length === 0) this.board.setPosition(this.chess.fen(), last)
    // speak single new moves only (not replays after reconnects or takebacks)
    if (last && fresh.length === 1) this.board.announce(last, last.color === this.color[0])
    const wasFinished = this.finished
    this.state = state
    this.stateTs = performance.now()
    this.finished = !!state.status && state.status !== 'started'
    if (this.finished) {
      this._clearPremove()
      this.board.deselect() // a piece picked up before the end must not linger
    }
    if (this.finished && !wasFinished) this.board.cue(this._won() ? 'success' : this._won() === false ? 'error' : 'move')
    this._render()
    if (last && this.premove && !this.finished && this.chess.turn() === this.color[0]) this._playPremove()
  }

  _render() {
    const s = this.state, me = this.color[0], opp = me === 'w' ? 'b' : 'w'
    const last = this.chess.history().at(-1)
    let text = (last ? last + ' · ' : '') + (this.chess.turn() === me ? 'Your move' : 'Waiting…')
    if (s[opp + 'draw']) text = 'Draw offered to you'
    else if (s[opp + 'takeback']) text = 'Takeback requested'
    else if (s[me + 'draw']) text = 'You offered a draw'
    if (this.premove) text = `Premove ${this.premove.san}`
    if (this.claimAt) text = this._canClaim() ? 'Opponent left — claim the win'
      : `Opponent left — claim in ${Math.ceil((this.claimAt - performance.now() - 100) / 1000)} s`
    if (this.error) text = this.error
    else if (this.replayIdx != null) text = this._replayText()
    else if (this.finished) {
      text = STATUS_TEXT[s.status] || s.status
      if (s.winner) text += this._won() ? ' — you win' : ' — you lose'
    }
    this.view = {
      names: this.names, myColor: this.color, wtime: s.wtime, btime: s.btime,
      turn: this.chess.turn(), running: !this.finished && this.applied >= 2,
      text, actions: this._actions(), ts: this.stateTs // clocks count from the server snapshot
    }
    this.board.setStatus(this.view)
    this.onStatus?.(text, this.finished)
  }

  // 100 ms slack: the 1 s countdown interval may fire a hair before claimAt
  _canClaim() { return this.claimAt && performance.now() >= this.claimAt - 100 }

  _won() { return this.state.winner ? this.state.winner === this.color : null }

  // Button bar: answer offers, offer a draw, abort (before both moved) or resign.
  _actions() {
    if (this.error) return this.menu?.() ?? [] // state untrustworthy: no rematch/replay
    if (this.reviewing) return [
      { label: 'Prev move', run: () => this._step(-1) }, { label: 'Next move', run: () => this._step(1) },
      { label: 'Flip board', run: () => this.board.togglePeek() },
      { label: 'Done', run: () => { this.reviewing = false; this._step(Infinity) } }]
    if (this.finished) return [
      ...this._canRematch() ? [{ label: 'Rematch', run: () => this._rematch(), primary: true }] : [],
      ...this.applied ? [{ label: 'Review game', run: () => { this.reviewing = true; this._render() } }] : [],
      ...this.menu?.() ?? []]
    const s = this.state, me = this.color[0], opp = me === 'w' ? 'b' : 'w'
    const { lichess: li, gameId: id } = this
    const call = fn => () => fn().catch(e => this.say(e.message))
    const acts = this._canClaim() ? [{ label: 'Claim win', run: call(() => li.claimVictory(id)) }] : []
    if (s[opp + 'draw']) acts.push(
      { label: 'Accept draw', run: call(() => li.draw(id, true)) },
      { label: 'Decline draw', run: call(() => li.draw(id, false)) })
    else if (!s[me + 'draw']) acts.push({ label: 'Offer draw', run: call(() => li.draw(id, true)) })
    if (s[opp + 'takeback']) acts.push(
      { label: 'Accept takeback', run: call(() => li.takeback(id, true)) },
      { label: 'Decline takeback', run: call(() => li.takeback(id, false)) })
    if (this.premove) acts.push({ label: 'Cancel premove', run: () => { this._clearPremove(); this._render() } })
    acts.push({ label: 'Flip board', run: () => this.board.togglePeek() }, ...showPiecesAction(this.board))
    acts.push(this.applied < 2
      ? { label: 'Abort', run: call(() => li.abort(id)) }
      : { label: 'Resign', confirm: true, run: call(() => li.resign(id)) })
    return acts
  }

  // Post-game replay: step through the moves on the board; null index = final position.
  _step(d) {
    const hist = this.chess.history({ verbose: true }), n = hist.length
    const prev = this.replayIdx ?? n
    const i = Math.max(0, Math.min(n, prev + d))
    const c = new Chess(this.initialFen)
    for (const m of hist.slice(0, i)) c.move({ from: m.from, to: m.to, promotion: m.promotion })
    this.replayIdx = i === n ? null : i
    this.shown = this.replayIdx == null ? null : c
    const m = hist[i - 1]
    this.board.setPosition(c.fen(), m)
    if (d === 1 && i !== prev) this.board.announce(m) // forward step names the move just replayed
    this._render()
  }

  _replayText() {
    const i = this.replayIdx, n = this.chess.history().length
    return i ? `Move ${i}/${n}: ${this.chess.history()[i - 1]}` : `Start · 0/${n}`
  }

  // Same clock, colors swapped: Stockfish starts at once, a human gets a challenge.
  _canRematch() {
    return this.clock && !this.rematched && (this.opponent.aiLevel || this.opponent.id)
  }

  _rematch() {
    if (!this._canRematch()) return // once per game: a second AI game would run unseen
    this.rematched = true
    const opp = this.opponent
    const params = {
      time: this.clock.initial / 60000, increment: this.clock.increment / 1000,
      color: this.color === 'white' ? 'black' : 'white'
    }
    const req = opp.aiLevel
      ? this.lichess.challengeAi({ level: opp.aiLevel, ...params })
      : this.lichess.challenge(opp.id, { ...params, rated: this.rated })
    this.say(opp.aiLevel ? 'Starting rematch…' : `Rematch offered to ${opp.name || opp.id}…`)
    req.catch(e => this.say('Rematch failed: ' + e.message))
  }

  // Transient message on the VR panel and the 2D page; clocks keep running.
  say(text) {
    if (this.stopped) return // left this view: late messages (e.g. a failed rematch) stay quiet
    if (this.view) this.board.setStatus({ ...this.view, text, actions: this._actions() })
    this.onStatus?.(text, false)
  }

  _applyUci(uci) {
    const from = uci.slice(0, 2), to = uci.slice(2, 4)
    try {
      return this.chess.move({ from, to, promotion: uci[4] })
    } catch (e) {
      // lichess may send castling as king-takes-own-rook (e1h1): map to e1g1
      const k = this.chess.get(from), r = this.chess.get(to)
      if (k?.type !== 'k' || r?.type !== 'r' || r.color !== k.color) throw e
      return this.chess.move({ from, to: (to[0] > from[0] ? 'g' : 'c') + to[1] })
    }
  }

  // Board for target squares: the real one on our turn, else the premove view.
  _premoveBoard() {
    return this.chess.turn() === this.color[0] ? this.chess : new Chess(flipTurn(this.chess.fen()))
  }

  _setPremove(from, to, promo) {
    let mv
    try { mv = this._premoveBoard().move({ from, to, promotion: promo || 'q' }) } catch { return }
    this.premove = { from, to, promo, san: mv.san }
    this.board.snapBack(from) // a grab-dropped piece waits on its own square
    this.board.setMarks({ [from]: PREMOVE, [to]: PREMOVE })
    this._render()
  }

  _playPremove() {
    const { from, to, promo } = this.premove
    this._clearPremove()
    if (!this.tryMove(from, to, promo)) this.say('Premove cancelled')
  }

  _clearPremove() {
    this.premove = null
    this.board.setMarks({})
  }

  // Returns true if the move was made (false: illegal or not possible now).
  tryMove(from, to, promotion = 'q') {
    if (this.finished || !this.state) return false
    if (this.chess.turn() !== this.color[0]) {
      this._setPremove(from, to, promotion)
      return false
    }
    let mv
    try {
      mv = this.chess.move({ from, to, promotion })
    } catch {
      this.board.snapBack(from) // illegal (e.g. a premove the position no longer allows)
      return false
    }
    this.applied++ // optimistic; the stream echo then adds nothing
    const sent = this.applied
    this.board.setPosition(this.chess.fen(), mv)
    this.board.announce(mv, true)
    this.lichess.move(this.gameId, from + to + (mv.promotion || '')).catch(e => {
      // stopped (board may belong to another session), or a resync that already has our move
      if (this.abort.signal.aborted || this.applied !== sent || this.serverMoves >= sent) return
      this._clearPremove()
      this.chess.undo()
      this.applied--
      this.board.setPosition(this.chess.fen())
      this.board.cue('error')
      this.say('Move rejected: ' + e.message)
    })
    return true
  }
}
