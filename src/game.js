// One lichess game: streams state, keeps chess.js in sync, relays board moves.

import { Chess } from 'chess.js'

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
    this.board.onMove = (f, t) => this._tryMove(f, t)
    this.board.getTargets = sq => this.chess.moves({ square: sq, verbose: true }).map(m => m.to)
    this.board.canPick = sq => {
      const p = this.chess.get(sq)
      return !this.finished && !!p && p.color === this.color[0] && this.chess.turn() === this.color[0]
    }
    // The stream dies on network blips or headset sleep; reconnect until the game
    // ends — each reconnect replays gameFull, which fully resets our state.
    while (!this.finished && !this.abort.signal.aborted) {
      try {
        await this.lichess.streamGame(this.gameId, m => this._onMsg(m), this.abort.signal)
      } catch (e) {
        if (e.name === 'AbortError') return
        this.onStatus?.('Reconnecting: ' + e.message, false)
      }
      if (!this.finished) await new Promise(r => setTimeout(r, 2000))
    }
  }

  stop() { this.abort.abort() }

  _onMsg(msg) {
    if (msg.type === 'gameFull') {
      this.color = lower(msg.white.id) === lower(this.username) ? 'white' : 'black'
      const name = p => p.name || p.id || (p.aiLevel ? 'Stockfish ' + p.aiLevel : '?')
      this.names = { white: name(msg.white), black: name(msg.black) }
      this.chess = msg.initialFen && msg.initialFen !== 'startpos'
        ? new Chess(msg.initialFen) : new Chess()
      this.applied = 0
      this.board.setOrientation(this.color)
      this._applyState(msg.state)
    } else if (msg.type === 'gameState') {
      this._applyState(msg)
    }
  }

  _applyState(state) {
    const moves = state.moves ? state.moves.split(' ') : []
    let last = null
    for (const uci of moves.slice(this.applied)) last = this._applyUci(uci)
    this.applied = moves.length
    if (last || moves.length === 0) this.board.setPosition(this.chess.fen(), last)

    this.finished = !!state.status && state.status !== 'started'
    let text = this.chess.turn() === this.color[0] ? 'Your move' : 'Waiting…'
    if (this.finished) {
      text = STATUS_TEXT[state.status] || state.status
      if (state.winner) text += ` — ${state.winner} wins`
    }
    this.board.setStatus({
      names: this.names, myColor: this.color,
      wtime: state.wtime, btime: state.btime,
      turn: this.chess.turn(), running: !this.finished && moves.length >= 2, text
    })
    this.onStatus?.(text, this.finished)
  }

  _applyUci(uci) {
    return this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  }

  _tryMove(from, to) {
    if (this.finished || this.chess.turn() !== this.color[0]) return
    let mv
    try {
      mv = this.chess.move({ from, to, promotion: 'q' }) // auto-queen for now
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
      this.onStatus?.('Move rejected: ' + e.message, false)
    })
  }
}
