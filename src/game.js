// One lichess game: streams state, keeps chess.js in sync, relays board moves.

import { Chess } from 'chess.js'
import { bindBoard } from './bind.js'

const STATUS_TEXT = {
  mate: 'Checkmate', resign: 'Resignation', outoftime: 'Time out', timeout: 'Timeout',
  draw: 'Draw', stalemate: 'Stalemate', aborted: 'Aborted'
}
const lower = s => (s || '').toLowerCase()
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
    // The stream dies on network blips or headset sleep; reconnect until the game
    // ends — each reconnect replays gameFull, which fully resets our state.
    while (!this.finished && !this.abort.signal.aborted) {
      try {
        await this.lichess.streamGame(this.gameId, m => this._onMsg(m), this.abort.signal)
      } catch (e) {
        if (e.name === 'AbortError') return
        this.say('Reconnecting: ' + e.message)
      }
      if (!this.finished) await new Promise(r => setTimeout(r, 2000))
    }
  }

  stop() {
    this.abort.abort()
    clearInterval(this.goneTimer)
  }
  active() { return !!this.state && !this.finished }
  render() { if (this.state) this._render() }

  // A message we can't apply means our state is wrong: stop instead of reconnecting
  // into the same failure forever.
  _onMsg(msg) {
    try {
      this._handle(msg)
    } catch (e) {
      this._fail('Sync error: ' + e.message)
    }
  }

  _fail(text) {
    this.error = text
    this.finished = true
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
  }

  _applyState(state) {
    const moves = state.moves ? state.moves.split(' ') : []
    // Only a shrinking *server* list is a takeback; a state sent before our optimistic
    // move arrived (moves < applied) is just stale and must not undo it.
    if (moves.length < this.serverMoves) this._reset()
    this.serverMoves = moves.length
    let last = null
    for (const uci of moves.slice(this.applied)) last = this._applyUci(uci)
    this.applied = Math.max(this.applied, moves.length)
    if (last || moves.length === 0) this.board.setPosition(this.chess.fen(), last)
    const wasFinished = this.finished
    this.state = state
    this.stateTs = performance.now()
    this.finished = !!state.status && state.status !== 'started'
    if (this.finished && !wasFinished) this.board.cue(this._won() ? 'success' : this._won() === false ? 'error' : 'move')
    this._render()
  }

  _render() {
    const s = this.state, me = this.color[0], opp = me === 'w' ? 'b' : 'w'
    const last = this.chess.history().at(-1)
    let text = (last ? last + ' · ' : '') + (this.chess.turn() === me ? 'Your move' : 'Waiting…')
    if (s[opp + 'draw']) text = 'Draw offered to you'
    else if (s[opp + 'takeback']) text = 'Takeback requested'
    else if (s[me + 'draw']) text = 'You offered a draw'
    if (this.claimAt) text = this._canClaim() ? 'Opponent left — claim the win'
      : `Opponent left — claim in ${Math.ceil((this.claimAt - performance.now()) / 1000)} s`
    if (this.error) text = this.error
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

  _canClaim() { return this.claimAt && performance.now() >= this.claimAt }

  _won() { return this.state.winner ? this.state.winner === this.color : null }

  // Button bar: answer offers, offer a draw, abort (before both moved) or resign.
  _actions() {
    if (this.finished) return [...this.clock && !this.error ? [{ label: 'Rematch', run: () => this._rematch() }] : [],
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
    acts.push(this.applied < 2
      ? { label: 'Abort', run: call(() => li.abort(id)) }
      : { label: 'Resign', confirm: true, run: call(() => li.resign(id)) })
    return acts
  }

  // Same clock, colors swapped: Stockfish starts at once, a human gets a challenge.
  _rematch() {
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
    if (this.view) this.board.setStatus({ ...this.view, text })
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

  tryMove(from, to, promotion = 'q') {
    if (this.finished || this.chess.turn() !== this.color[0]) return
    let mv
    try {
      mv = this.chess.move({ from, to, promotion })
    } catch {
      this.board.setPosition(this.chess.fen())
      return
    }
    this.applied++ // optimistic; the stream echo then adds nothing
    const sent = this.applied
    this.board.setPosition(this.chess.fen(), { from, to })
    this.lichess.move(this.gameId, from + to + (mv.promotion || '')).catch(e => {
      // stopped (board may belong to another session) or a reconnect already resynced
      if (this.abort.signal.aborted || this.applied !== sent) return
      this.chess.undo()
      this.applied--
      this.board.setPosition(this.chess.fen())
      this.board.cue('error')
      this.say('Move rejected: ' + e.message)
    })
  }
}
