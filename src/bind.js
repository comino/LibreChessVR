// Wires a session to the board's input callbacks.
// Session needs: chess (chess.js), color ('white'|'black'), active(), tryMove(from, to, promo).
export function bindBoard(board, s) {
  board.onMove = (from, to, promo) => s.tryMove(from, to, promo)
  board.getTargets = sq => s.chess.moves({ square: sq, verbose: true }).map(m => m.to)
  board.canPick = sq => {
    const me = s.color[0]
    return s.active() && s.chess.turn() === me && s.chess.get(sq)?.color === me
  }
}
