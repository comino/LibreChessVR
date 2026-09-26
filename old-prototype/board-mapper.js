/**
 * BoardMapper - Coordinate conversion utilities
 *
 * Handles mapping between:
 * - 3D world coordinates (x, y, z)
 * - Chess square notation (e.g. 'e4')
 * - Array indices (0-63 or [rank, file])
 */

export class BoardMapper {
  constructor(boardConfig = {}) {
    // Default configuration matching the VR board
    this.config = {
      squareSize: 0.3,
      boardCenter: { x: 0, y: 0, z: 0 },
      firstSquare: { x: -1.05, y: 0, z: -1.05 }, // a1 position (bottom-left from white's view)
      ...boardConfig
    }

    // Pre-compute square centers for fast lookup
    this.squareCenters = this._computeSquareCenters()
  }

  /**
   * Convert 3D position to chess square notation
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @param {number} tolerance - Distance tolerance (default: half square size)
   * @returns {string|null} Square notation like 'e4' or null if out of bounds
   */
  positionToSquare(x, z, tolerance = null) {
    tolerance = tolerance ?? this.config.squareSize / 2

    for (const [square, center] of Object.entries(this.squareCenters)) {
      const dx = Math.abs(center.x - x)
      const dz = Math.abs(center.z - z)

      if (dx <= tolerance && dz <= tolerance) {
        return square
      }
    }

    return null
  }

  /**
   * Convert chess square notation to 3D position
   * @param {string} square - Square notation like 'e4'
   * @returns {{x: number, y: number, z: number}|null}
   */
  squareToPosition(square) {
    const center = this.squareCenters[square]
    if (!center) return null

    return {
      x: center.x,
      y: this.config.boardCenter.y,
      z: center.z
    }
  }

  /**
   * Convert square notation to array indices
   * @param {string} square - Square notation like 'e4'
   * @returns {{rank: number, file: number}|null} - rank: 0-7 (1-8), file: 0-7 (a-h)
   */
  squareToIndices(square) {
    if (!square || square.length !== 2) return null

    const file = square.charCodeAt(0) - 'a'.charCodeAt(0) // 0-7
    const rank = parseInt(square[1]) - 1 // 0-7

    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null

    return { rank, file }
  }

  /**
   * Convert array indices to square notation
   * @param {number} rank - 0-7 (representing ranks 1-8)
   * @param {number} file - 0-7 (representing files a-h)
   * @returns {string|null}
   */
  indicesToSquare(rank, file) {
    if (rank < 0 || rank > 7 || file < 0 || file > 7) return null

    const fileChar = String.fromCharCode('a'.charCodeAt(0) + file)
    const rankNum = rank + 1

    return fileChar + rankNum
  }

  /**
   * Get all 64 square notations in order
   * @returns {string[]}
   */
  getAllSquares() {
    const squares = []
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        squares.push(this.indicesToSquare(rank, file))
      }
    }
    return squares
  }

  /**
   * Check if square notation is valid
   * @param {string} square
   * @returns {boolean}
   */
  isValidSquare(square) {
    if (!square || square.length !== 2) return false
    const file = square[0]
    const rank = square[1]
    return file >= 'a' && file <= 'h' && rank >= '1' && rank <= '8'
  }

  /**
   * Pre-compute all square center positions
   * @private
   */
  _computeSquareCenters() {
    const centers = {}
    const { firstSquare, squareSize } = this.config

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = this.indicesToSquare(rank, file)
        // Files are reversed: file 0 (a) should be at rightmost (x=1.05), file 7 (h) at leftmost (x=-1.05)
        centers[square] = {
          x: firstSquare.x + ((7 - file) * squareSize),
          z: firstSquare.z + (rank * squareSize) // Z increases as rank increases (a1 to a8)
        }
      }
    }

    return centers
  }

  /**
   * Get the distance between two squares
   * @param {string} square1
   * @param {string} square2
   * @returns {number|null} - Chebyshev distance (king moves)
   */
  getSquareDistance(square1, square2) {
    const idx1 = this.squareToIndices(square1)
    const idx2 = this.squareToIndices(square2)

    if (!idx1 || !idx2) return null

    const rankDiff = Math.abs(idx1.rank - idx2.rank)
    const fileDiff = Math.abs(idx1.file - idx2.file)

    return Math.max(rankDiff, fileDiff)
  }

  /**
   * Get color of a square
   * @param {string} square
   * @returns {'light'|'dark'|null}
   */
  getSquareColor(square) {
    const indices = this.squareToIndices(square)
    if (!indices) return null

    // Light square when rank + file is even
    return (indices.rank + indices.file) % 2 === 0 ? 'light' : 'dark'
  }

  /**
   * Update board configuration (useful for recalibration)
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    this.squareCenters = this._computeSquareCenters()
  }
}
