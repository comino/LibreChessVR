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

// Pieces missing from the board per color, e.g. {w: ['p','n'], b: []}, strongest first.
// Promotions can make a type exceed its start count; those just don't show as missing.
const START_COUNT = { q: 1, r: 2, b: 2, n: 2, p: 8 }
export function captured(fen) {
  const left = { w: {}, b: {} }
  for (const p of parseFen(fen)) left[p.color][p.type] = (left[p.color][p.type] || 0) + 1
  const lost = c => Object.entries(START_COUNT)
    .flatMap(([t, n]) => Array(Math.max(0, n - (left[c][t] || 0))).fill(t))
  return { w: lost('w'), b: lost('b') }
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
    if (f !== 8) throw new Error('Bad FEN rank: ' + fen)
  })
  return pieces
}
