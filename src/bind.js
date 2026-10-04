// Wires a session to the board's input callbacks.
// Session needs: chess (chess.js), color ('white'|'black'), active(), tryMove(from, to, promo);
// optional shown: a chess.js instance on display instead of chess (game replay).
// "Show pieces" button for ghost/hidden piece styles (empty when pieces are solid).
export const showPiecesAction = board =>
  board.pieceStyle === 'solid' ? [] : [{ label: 'Show pieces', run: () => board.showPieces() }]

export function bindBoard(board, s) {
  board.onMove = (from, to, promo) => s.tryMove(from, to, promo)
  board.onSquarePick = null
  board.setMarks({})
  board.setMoves([])
  board.getTargets = sq => s.chess.moves({ square: sq, verbose: true }).map(m => m.to)
  board.checkSquare = () => {
    const c = s.shown ?? s.chess
    return c.inCheck() ? c.board().flat().find(p => p?.type === 'k' && p.color === c.turn()).square : null
  }
  board.canPick = sq => {
    const me = s.color[0]
    return s.active() && s.chess.turn() === me && s.chess.get(sq)?.color === me
  }
}
