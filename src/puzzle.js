// Lichess puzzle mode: fetch a puzzle, replay its game, validate solution moves.
// Any mating move counts as solved (lichess rule). Wrong moves roll back, free retry.

import { Chess } from 'chess.js'

export class PuzzleSession {
  constructor({ lichess, board, onStatus }) {
    Object.assign(this, { lichess, board, onStatus })
    this.active = false
  }

  async next(difficulty = this.difficulty) {
    this.stop()
    this.active = true
    this.difficulty = difficulty
    this.onStatus?.('Fetching puzzle…')
    try {
      this._setup(await this.lichess.puzzleNext(difficulty))
    } catch (e) {
      this.active = false
      this.onStatus?.('Puzzle fetch failed: ' + e.message)
    }
  }

  stop() {
    this.active = false
    clearTimeout(this.timer)
  }

  _setup({ game, puzzle }) {
    this.chess = new Chess()
    for (const san of game.pgn.split(' ')) if (san) this.chess.move(san)
    this.solution = puzzle.solution
    this.idx = 0
    this.info = `Puzzle ${puzzle.id} • rating ${puzzle.rating}`
    this.color = this.chess.turn() === 'w' ? 'white' : 'black'
    this.board.onMove = (f, t) => this._tryMove(f, t)
    this.board.getTargets = sq => this.chess.moves({ square: sq, verbose: true }).map(m => m.to)
    this.board.canPick = sq => {
      const p = this.chess.get(sq)
      return this.active && !!p && p.color === this.color[0] && this.chess.turn() === this.color[0]
    }
    this.board.setOrientation(this.color)
    const last = this.chess.history({ verbose: true }).at(-1)
    this.board.setPosition(this.chess.fen(), last && { from: last.from, to: last.to })
    this._status(`Find the best move for ${this.color}`)
  }

  _status(text) {
    this.board.setStatus({ puzzle: true, text, sub: this.info })
    this.onStatus?.(text)
  }

  _tryMove(from, to) {
    const expected = this.solution[this.idx] || ''
    let mv
    try {
      mv = this.chess.move({ from, to, promotion: expected.slice(4) || 'q' })
    } catch {
      this.board.setPosition(this.chess.fen())
      return
    }
    const uci = mv.from + mv.to + (mv.promotion || '')
    if (uci !== expected && !this.chess.isCheckmate()) {
      this.chess.undo()
      this.board.setPosition(this.chess.fen())
      this._status('Not it — try again')
      return
    }
    this.idx++
    this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to })
    if (this.idx >= this.solution.length || this.chess.isCheckmate()) {
      this._status('Solved! Next puzzle…')
      this.timer = setTimeout(() => this.next(), 2000)
    } else {
      this.timer = setTimeout(() => this._reply(), 500)
    }
  }

  _reply() {
    const uci = this.solution[this.idx++]
    const mv = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to })
    this._status(`Your move (${this.color})`)
  }
}
