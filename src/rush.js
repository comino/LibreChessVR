// Puzzle Rush: 3 minutes, 3 lives. A wrong move costs a life and moves on; difficulty rises
// every 5 solved puzzles. Best score kept in localStorage.rushBest.

import { PuzzleSession } from './puzzle.js'
import { showPiecesAction } from './bind.js'

const RUSH_MS = 180000, LIVES = 3, PER_LEVEL = 5
const LEVELS = ['easiest', 'easier', 'normal', 'harder', 'hardest']

export class RushSession extends PuzzleSession {
  constructor(opts) {
    super(opts)
    this.options = () => ({ difficulty: LEVELS[Math.min(LEVELS.length - 1, Math.floor(this.score / PER_LEVEL))] })
    this.over = true
  }

  start() {
    this.stop()
    Object.assign(this, { score: 0, lives: LIVES, over: false, endAt: performance.now() + RUSH_MS, info: null })
    this.clock = setInterval(() => this._tick(), 250)
    this.board.cue('start')
    this.next()
  }

  stop() {
    super.stop()
    clearInterval(this.clock)
  }

  next() { if (!this.over) return super.next() }

  // The 250 ms clock tick may lag the deadline: a move after it never counts.
  tryMove(...args) {
    if (performance.now() >= this.endAt) return this._end()
    return super.tryMove(...args)
  }

  _miss() {} // rush has lives, not streaks

  // The clock keeps running, so don't leave the board empty: retry shortly.
  _fetchFailed(e) {
    this._status('Network hiccup — retrying…')
    this.timer = setTimeout(() => this.next(), 1500)
  }

  _wrong() {
    this.running = false
    if (--this.lives <= 0) return this._end('error')
    this._status(`Wrong — ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`)
    this.timer = setTimeout(() => this.next(), 700)
  }

  _solved() {
    this.score++
    this.board.cue('success')
    this._status('Solved!')
    this.timer = setTimeout(() => this.next(), 400)
  }

  _left() { return Math.max(0, Math.ceil((this.endAt - performance.now()) / 1000)) }

  // Redraws only when the shown second changes.
  _tick() {
    if (performance.now() >= this.endAt) return this._end()
    if (this._left() !== this.shownSec) this.render()
  }

  _end(cue = 'success') {
    if (this.over) return
    this.stop()
    this.over = true
    try {
      this.best = Math.max(this.score, +localStorage.getItem('rushBest') || 0)
      localStorage.setItem('rushBest', this.best)
    } catch { this.best = this.score }
    this.board.cue(cue)
    this._status(`Rush over — ${this.score} solved`)
  }

  _actions() {
    const flip = { label: 'Flip board', run: () => this.board.togglePeek() }
    return this.over
      ? [{ label: 'New rush', run: () => this.start(), primary: true }, flip, ...this.menu?.() ?? []]
      : [flip, ...showPiecesAction(this.board), { label: 'End rush', run: () => this._end() },
        ...(this.menu?.() ?? []).filter(b => b.label !== 'Menu')] // e.g. Cancel seek
  }

  _sub() {
    if (this.over) return `Best ${this.best ?? 0}`
    this.shownSec = this._left()
    return `Score ${this.score} • ${'♥'.repeat(this.lives)} • ${this.shownSec} s`
  }
}
