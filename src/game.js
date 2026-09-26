// One lichess game: streams state, keeps chess.js in sync, relays board moves.

import { Chess } from 'chess.js'
import { bindBoard } from './bind.js'

const STATUS_TEXT = {
  mate: 'Checkmate', resign: 'Resignation', outoftime: 'Time out', timeout: 'Timeout',
  draw: 'Draw', stalemate: 'Stalemate', aborted: 'Aborted'
}
const lower = s => (s || '').toLowerCase()

export class GameSession {
  constructor({ lichess, board, username, gameId, onStatus }) {
    Object.assign(this, { lichess, board, username, gameId, onStatus })
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
        this._say('Reconnecting: ' + e.message)
      }
      if (!this.finished) await new Promise(r => setTimeout(r, 2000))
    }
  }

  stop() { this.abort.abort() }
  active() { return !this.finished }

  _onMsg(msg) {
    if (msg.type === 'gameFull') {
      this.color = lower(msg.white.id) === lower(this.username) ? 'white' : 'black'
      const name = p => p.name || p.id || (p.aiLevel ? 'Stockfish ' + p.aiLevel : '?')
      this.names = { white: name(msg.white), black: name(msg.black) }
      this.initialFen = msg.initialFen && msg.initialFen !== 'startpos' ? msg.initialFen : undefined
      this._reset()
      this.board.setOrientation(this.color)
      this._applyState(msg.state)
    } else if (msg.type === 'gameState') {
      this._applyState(msg)
    }
  }

  _reset() {
    this.chess = new Chess(this.initialFen)
    this.applied = 0
  }

  _applyState(state) {
    const moves = state.moves ? state.moves.split(' ') : []
    if (moves.length < this.applied) this._reset() // takeback: replay from scratch
    let last = null
    for (const uci of moves.slice(this.applied)) last = this._applyUci(uci)
    this.applied = moves.length
    if (last || moves.length === 0) this.board.setPosition(this.chess.fen(), last)
    this.state = state
    this.finished = !!state.status && state.status !== 'started'
    this._render()
  }

  _render() {
    const s = this.state, me = this.color[0], opp = me === 'w' ? 'b' : 'w'
    let text = this.chess.turn() === me ? 'Your move' : 'Waiting…'
    if (s[opp + 'draw']) text = 'Draw offered to you'
    else if (s[opp + 'takeback']) text = 'Takeback requested'
    else if (s[me + 'draw']) text = 'You offered a draw'
    if (this.finished) {
      text = STATUS_TEXT[s.status] || s.status
      if (s.winner) text += s.winner === this.color ? ' — you win' : ' — you lose'
    }
    this.view = {
      names: this.names, myColor: this.color, wtime: s.wtime, btime: s.btime,
      turn: this.chess.turn(), running: !this.finished && this.applied >= 2,
      text, actions: this._actions(), ts: performance.now()
    }
    this.board.setStatus(this.view)
    this.onStatus?.(text, this.finished)
  }

  // Button bar: answer offers, offer a draw, abort (before both moved) or resign.
  _actions() {
    if (this.finished) return []
    const s = this.state, me = this.color[0], opp = me === 'w' ? 'b' : 'w'
    const { lichess: li, gameId: id } = this
    const call = fn => () => fn().catch(e => this._say(e.message))
    const acts = []
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

  // Transient message on the VR panel and the 2D page; clocks keep running.
  _say(text) {
    if (this.view) this.board.setStatus({ ...this.view, text })
    this.onStatus?.(text, false)
  }

  _applyUci(uci) {
    return this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
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
      if (this.applied !== sent) return // a reconnect already resynced the state
      this.chess.undo()
      this.applied--
      this.board.setPosition(this.chess.fen())
      this.board.cue('error')
      this._say('Move rejected: ' + e.message)
    })
  }
}
