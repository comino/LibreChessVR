// Puzzle Rush: 3 minutes, 3 lives. A wrong move costs a life and moves on; difficulty rises
// every 5 solved puzzles. Best score kept in localStorage.rushBest.

import { PuzzleSession } from './puzzle.js'

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

  _miss() {} // rush has lives, not streaks

  _wrong() {
    this.running = false
    if (--this.lives <= 0) return this._end()
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

  _end() {
    this.stop()
    this.over = true
    try {
      this.best = Math.max(this.score, +localStorage.getItem('rushBest') || 0)
      localStorage.setItem('rushBest', this.best)
    } catch { this.best = this.score }
    this.board.cue('success')
    this._status(`Rush over — ${this.score} solved`)
  }

  _actions() {
    const flip = { label: 'Flip board', run: () => this.board.togglePeek() }
    return this.over
      ? [{ label: 'New rush', run: () => this.start() }, flip, ...this.menu?.() ?? []]
      : [flip, { label: 'End rush', run: () => this._end() }]
  }

  _sub() {
    if (this.over) return `Best ${this.best ?? 0}`
    this.shownSec = this._left()
    return `Score ${this.score} • ${'♥'.repeat(this.lives)} • ${this.shownSec} s`
  }
}
