// Lichess puzzle mode: fetch a puzzle, replay its game, validate solution moves.
// Any mating move counts as solved (lichess rule). Wrong moves roll back, free retry.

import { Chess } from 'chess.js'
import { bindBoard, showPiecesAction } from './bind.js'

const HINT = 0x8a6a1a

// Streak = puzzles solved in a row without a mistake or hint; kept across sessions.
function loadStats() {
  try { return { streak: 0, best: 0, solved: 0, ...JSON.parse(localStorage.getItem('puzzleStats')) } }
  catch { return { streak: 0, best: 0, solved: 0 } }
}

export class PuzzleSession {
  // menu: () => extra actions for the button bar (start a game, seek, …)
  // options: () => {difficulty, angle} read on every fetch, so settings apply to the next puzzle
  constructor({ lichess, board, onStatus, menu, options }) {
    Object.assign(this, { lichess, board, onStatus, menu, options })
    this.stats = loadStats()
    this.running = false
    this.run = 0 // bumps on stop(), so a fetch finishing late is dropped
  }

  active() { return this.running }
  render() { this._status(this.text) }

  async next() {
    if (this.running) this._miss() // skipping an unsolved puzzle breaks the streak
    this._halt()
    const run = this.run
    const { difficulty, angle } = this.options?.() ?? {}
    this._status('Fetching puzzle…')
    let data
    try {
      data = await this.lichess.puzzleNext(difficulty, angle)
    } catch (e) {
      if (run === this.run) this._status('Puzzle fetch failed: ' + e.message)
      return
    }
    if (run === this.run) this._setup(data)
  }

  stop() { this._halt() }

  // Ends the current puzzle (subclasses keep their own timers running across puzzles).
  _halt() {
    this.run++
    this.running = false
    clearTimeout(this.timer)
    this.board.setMarks({})
  }

  // Lights up the piece that has to move next (breaks the streak).
  hint() {
    const uci = this._myTurn() && this.solution[this.idx]
    if (!uci) return
    this._miss()
    this.board.setMarks({ [uci.slice(0, 2)]: HINT })
    this.render()
  }

  _miss() {
    this.clean = false
    this._saveStats({ streak: 0 })
  }

  _saveStats(patch) {
    Object.assign(this.stats, patch)
    this.stats.best = Math.max(this.stats.best, this.stats.streak)
    try { localStorage.setItem('puzzleStats', JSON.stringify(this.stats)) } catch { /* private mode */ }
  }

  _setup({ game, puzzle }) {
    this.chess = new Chess()
    for (const san of game.pgn.split(' ')) if (san) this.chess.move(san)
    this.solution = puzzle.solution
    this.idx = 0
    this.info = `Puzzle ${puzzle.id} • rating ${puzzle.rating}`
    this.clean = true
    this.color = this.chess.turn() === 'w' ? 'white' : 'black'
    this.running = true
    bindBoard(this.board, this)
    this.board.setOrientation(this.color)
    const last = this.chess.history({ verbose: true }).at(-1)
    this.board.setPosition(this.chess.fen(), last && { from: last.from, to: last.to })
    this._status(`Find the best move for ${this.color}`)
  }

  _myTurn() { return this.running && this.chess.turn() === this.color[0] }

  _status(text) {
    this.text = text
    this.board.setStatus({ puzzle: true, text, sub: this._sub(), actions: this._actions() })
    this.onStatus?.(text)
  }

  _actions() {
    return [{ label: 'Next puzzle', run: () => this.next() },
      ...this._myTurn() ? [{ label: 'Hint', run: () => this.hint() }] : [],
      { label: 'Flip board', run: () => this.board.togglePeek() }, ...showPiecesAction(this.board), ...this.menu?.() ?? []]
  }

  _sub() {
    const { streak, best } = this.stats
    return this.info && `${this.info} • streak ${streak} (best ${best})`
  }

  // Hooks for wrong / solved; the wrong move is already undone on the board.
  _wrong() {
    this._miss()
    this._status('Not it — try again')
  }

  _solved() {
    this._saveStats({ streak: this.clean ? this.stats.streak + 1 : 0, solved: this.stats.solved + 1 })
    this.board.cue('success')
    this._status('Solved! Next puzzle…')
    this.timer = setTimeout(() => this.next(), 2000)
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
      this._wrong()
      return
    }
    this.idx++
    this.board.setMarks({})
    this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to })
    if (this.idx >= this.solution.length || this.chess.isCheckmate()) {
      this.running = false
      this._solved()
    } else {
      this._status('Good move…')
      this.timer = setTimeout(() => this._reply(), 500)
    }
  }

  _reply() {
    const uci = this.solution[this.idx++]
    let mv
    try {
      mv = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      this.running = false // not the player's fault: skip without breaking the streak
      this._status('Puzzle data error — skipping')
      this.timer = setTimeout(() => this.next(), 1500)
      return
    }
    this.board.setMarks({})
    this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to })
    this._status(`Your move (${this.color})`)
  }
}
