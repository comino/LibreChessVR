// Lichess puzzle mode: fetch a puzzle, replay its game, validate solution moves.
// Any mating move counts as solved (lichess rule). Wrong moves roll back, free retry.

import { Chess } from 'chess.js'
import { bindBoard } from './bind.js'

export class PuzzleSession {
  // menu: () => extra actions for the button bar (start a game, seek, …)
  constructor({ lichess, board, onStatus, menu }) {
    Object.assign(this, { lichess, board, onStatus, menu })
    this.running = false
    this.run = 0 // bumps on stop(), so a fetch finishing late is dropped
  }

  active() { return this.running }
  render() { this._status(this.text) }

  async next(difficulty = this.difficulty) {
    this.stop()
    const run = this.run
    this.difficulty = difficulty
    this._status('Fetching puzzle…')
    let data
    try {
      data = await this.lichess.puzzleNext(difficulty)
    } catch (e) {
      if (run === this.run) this._status('Puzzle fetch failed: ' + e.message)
      return
    }
    if (run === this.run) this._setup(data)
  }

  stop() {
    this.run++
    this.running = false
    clearTimeout(this.timer)
  }

  _setup({ game, puzzle }) {
    this.chess = new Chess()
    for (const san of game.pgn.split(' ')) if (san) this.chess.move(san)
    this.solution = puzzle.solution
    this.idx = 0
    this.info = `Puzzle ${puzzle.id} • rating ${puzzle.rating}`
    this.color = this.chess.turn() === 'w' ? 'white' : 'black'
    this.running = true
    bindBoard(this.board, this)
    this.board.setOrientation(this.color)
    const last = this.chess.history({ verbose: true }).at(-1)
    this.board.setPosition(this.chess.fen(), last && { from: last.from, to: last.to })
    this._status(`Find the best move for ${this.color}`)
  }

  _status(text) {
    this.text = text
    const actions = [{ label: 'Next puzzle', run: () => this.next() }, ...this.menu?.() ?? []]
    this.board.setStatus({ puzzle: true, text, sub: this.info, actions })
    this.onStatus?.(text)
  }

  tryMove(from, to, promo) {
    const expected = this.solution[this.idx] || ''
    let mv
    try {
      mv = this.chess.move({ from, to, promotion: promo || expected[4] || 'q' })
    } catch {
      this.board.setPosition(this.chess.fen())
      return
    }
    const uci = mv.from + mv.to + (mv.promotion || '')
    if (uci !== expected && !this.chess.isCheckmate()) {
      this.chess.undo()
      this.board.setPosition(this.chess.fen())
      this.board.cue('error')
      this._status('Not it — try again')
      return
    }
    this.idx++
    this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to })
    if (this.idx >= this.solution.length || this.chess.isCheckmate()) {
      this.running = false
      this.board.cue('success')
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
