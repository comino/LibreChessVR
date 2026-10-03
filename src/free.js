// Free board for the idle screen: both sides move by the rules, no account needed. Continues
// from the position on display (e.g. a finished game); sessions rebind the board when they start.
import { Chess } from 'chess.js'
import { bindBoard } from './bind.js'

const START = new Chess().fen()

export class FreeBoard {
  constructor(board, onChange) {
    this.board = board
    this.onChange = onChange
    this.chess = new Chess()
  }

  get color() { return this.chess.turn() === 'w' ? 'white' : 'black' }
  active() { return true }
  changed() { return this.chess.fen() !== START }

  attach() {
    try { this.chess = new Chess(this.board.fen) } catch { this.chess = new Chess() }
    bindBoard(this.board, this)
  }

  tryMove(from, to, promo) {
    let mv
    try { mv = this.chess.move({ from, to, promotion: promo || 'q' }) } catch { return false }
    this.board.setPosition(this.chess.fen(), mv)
    this.board.announce(mv, true)
    this.onChange()
    return true
  }

  reset() {
    this.chess.reset()
    this.board.setPosition(START)
    this.onChange()
  }
}
