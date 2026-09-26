// Pure chess helpers: square <-> board coordinates, FEN parsing.
// Board frame: white's perspective, a1 at (-3.5s, +3.5s), h8 at (+3.5s, -3.5s).
// Black view is done by rotating the whole board group 180°, never by remapping.

export function squareToXZ(square, s = 1) {
  const f = square.charCodeAt(0) - 97
  const r = +square[1] - 1
  return { x: (f - 3.5) * s, z: (3.5 - r) * s }
}

// Inverse of squareToXZ: nearest square for a board-local position, null if off-board.
export function xzToSquare(x, z, s = 1) {
  const f = Math.round(x / s + 3.5), r = Math.round(3.5 - z / s)
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? 'abcdefgh'[f] + (r + 1) : null
}

// Returns [{square, type: 'pnbrqk', color: 'w'|'b'}] from the piece-placement field.
export function parseFen(fen) {
  const rows = fen.split(' ')[0].split('/')
  if (rows.length !== 8) throw new Error('Bad FEN: ' + fen)
  const pieces = []
  rows.forEach((row, i) => {
    let f = 0
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { f += +ch; continue }
      pieces.push({
        square: 'abcdefgh'[f] + (8 - i),
        type: ch.toLowerCase(),
        color: ch === ch.toUpperCase() ? 'w' : 'b'
      })
      f++
    }
  })
  return pieces
}
