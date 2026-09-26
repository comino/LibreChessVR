// Coordinate trainer: a square name is shown, point at that square. 30 s rounds,
// alternating white/black view — drills 3D board vision directly.

import { TINT } from './theme.js'

const ROUND_MS = 30000, FLASH_MS = 400
const { good: GOOD, bad: BAD } = TINT
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const randomSquare = () => 'abcdefgh'[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8))

export class TrainerSession {
  constructor({ board, onStatus, menu }) {
    Object.assign(this, { board, onStatus, menu })
    this.color = 'black' // flips to white on the first round
    this.running = false
  }

  start() {
    this.stop()
    this.color = this.color === 'white' ? 'black' : 'white'
    Object.assign(this, { score: 0, misses: 0, running: true, endAt: performance.now() + ROUND_MS })
    this.board.canPick = () => false
    this.board.getTargets = () => []
    this.board.checkSquare = () => null
    this.board.onSquarePick = sq => this._pick(sq)
    this.board.setOrientation(this.color)
    this.board.setPosition(START)
    this._next()
    this.timer = setInterval(() => this._tick(), 250)
    this.onStatus?.(`Coordinates: find the squares (${this.board.viewSide()}'s view)`)
  }

  stop() {
    this.running = false
    clearInterval(this.timer)
    clearTimeout(this.flashTimer)
    this.board.onSquarePick = null
    this.board.setMarks({})
  }

  render() { this._show() }

  _next() {
    let sq
    do sq = randomSquare(); while (sq === this.target)
    this.target = sq
    this._show()
  }

  _pick(sq) {
    if (!this.running) return
    if (performance.now() >= this.endAt) return this._end() // tick may lag the deadline
    const ok = sq === this.target
    if (ok) this.score++
    else this.misses++
    this.board.cue(ok ? 'move' : 'error')
    this.board.setMarks(ok ? { [sq]: GOOD } : { [sq]: BAD, [this.target]: GOOD })
    clearTimeout(this.flashTimer)
    this.flashTimer = setTimeout(() => this.board.setMarks({}), FLASH_MS)
    this._next()
  }

  _tick() {
    if (performance.now() >= this.endAt) this._end()
    else if (this._left() !== this.shownSec) this._show() // redraw once per second
  }

  _left() { return Math.ceil((this.endAt - performance.now()) / 1000) }

  _end() {
    this.stop()
    let best = 0
    try {
      best = Math.max(this.score, +localStorage.getItem('coordBest') || 0)
      localStorage.setItem('coordBest', best)
    } catch { best = this.score }
    this.board.cue('success')
    this.onStatus?.(`Coordinates: ${this.score} right, ${this.misses} wrong (best ${best})`)
    this.result = `${this.score} right • ${this.misses} wrong • best ${best}`
    this._show()
  }

  _show() {
    const again = { label: 'New round', run: () => this.start(), primary: !this.running }
    const status = this.running
      ? { big: this.target, text: `${this.shownSec = this._left()} s`,
          sub: `Score ${this.score} • ${this.board.viewSide()}'s view` }
      : { text: 'Time!', sub: this.result }
    this.board.setStatus({ puzzle: true, ...status, actions: [again, ...this.menu?.() ?? []] })
  }
}
