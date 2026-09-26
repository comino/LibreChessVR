/**
 * ChessGame - Reusable chess game controller
 *
 * This class provides a clean interface between chess logic and any visualization.
 * It uses chess.js for game state management and exposes a simple event-driven API.
 *
 * Usage:
 *   const game = new ChessGame()
 *   game.on('positionChanged', (fen) => { ... })
 *   game.on('move', (move) => { ... })
 *   game.movePiece('e2', 'e4')
 */

import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm'

export class ChessGame {
  constructor(fen = null) {
    this.chess = fen ? new Chess(fen) : new Chess()
    this.listeners = {}
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  off(event, callback) {
    if (!this.listeners[event]) return
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
  }

  emit(event, data) {
    if (!this.listeners[event]) return
    this.listeners[event].forEach(callback => callback(data))
  }

  // Position management
  getFEN() {
    return this.chess.fen()
  }

  setFEN(fen) {
    try {
      this.chess.load(fen)
      this.emit('positionChanged', fen)
      return true
    } catch (e) {
      console.error('Invalid FEN:', e)
      return false
    }
  }

  reset() {
    this.chess.reset()
    this.emit('positionChanged', this.chess.fen())
    this.emit('reset')
  }

  // Piece information
  getPieceAt(square) {
    return this.chess.get(square)
  }

  getBoard() {
    return this.chess.board()
  }

  // Move handling
  movePiece(from, to, promotion = null) {
    try {
      const moveObj = { from, to }
      if (promotion) {
        moveObj.promotion = promotion
      }

      const move = this.chess.move(moveObj)

      if (move) {
        this.emit('move', {
          from: move.from,
          to: move.to,
          piece: move.piece,
          color: move.color,
          captured: move.captured,
          promotion: move.promotion,
          san: move.san,
          fen: this.chess.fen()
        })
        this.emit('positionChanged', this.chess.fen())

        if (this.chess.isGameOver()) {
          this.emit('gameOver', this.getGameStatus())
        }

        return move
      }

      return null
    } catch (e) {
      console.error('Invalid move:', e)
      return null
    }
  }

  // Legal moves
  getLegalMoves(square = null) {
    if (square) {
      return this.chess.moves({ square, verbose: true })
    }
    return this.chess.moves({ verbose: true })
  }

  isLegalMove(from, to) {
    const moves = this.chess.moves({ square: from, verbose: true })
    return moves.some(move => move.to === to)
  }

  // Game state
  isCheck() {
    return this.chess.inCheck()
  }

  isCheckmate() {
    return this.chess.isCheckmate()
  }

  isStalemate() {
    return this.chess.isStalemate()
  }

  isDraw() {
    return this.chess.isDraw()
  }

  isGameOver() {
    return this.chess.isGameOver()
  }

  getTurn() {
    return this.chess.turn()
  }

  getGameStatus() {
    return {
      isCheck: this.chess.inCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      isDraw: this.chess.isDraw(),
      isGameOver: this.chess.isGameOver(),
      turn: this.chess.turn(),
      fen: this.chess.fen()
    }
  }

  // History
  getHistory(verbose = false) {
    return this.chess.history({ verbose })
  }

  undo() {
    const move = this.chess.undo()
    if (move) {
      this.emit('undo', move)
      this.emit('positionChanged', this.chess.fen())
    }
    return move
  }

  // Validation
  static validateFEN(fen) {
    try {
      new Chess(fen)
      return { valid: true }
    } catch (e) {
      return { valid: false, error: e.message }
    }
  }
}
