/**
 * app.js - Example Chess Application
 *
 * This template shows how to integrate the chess frontend with your game logic.
 * Replace the placeholder methods with your own implementation.
 */

import { ChessFrontend } from './chess-frontend.js'
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm'

export class ChessApp {
  constructor(sceneElement) {
    // Initialize chess game logic (using chess.js as example)
    this.game = new Chess()

    // Initialize frontend (visualization only)
    this.frontend = new ChessFrontend(sceneElement)

    // Your app state
    this.moveHistory = []
    this.currentPlayer = 'white'
  }

  async init() {
    // Initialize the frontend
    await this.frontend.init()

    // Listen for move events from the frontend
    this.frontend.on('move', ({ from, to }) => {
      this.handleMove(from, to)
    })

    // Set initial position
    this.frontend.setPosition(this.game.fen())
  }

  /**
   * Handle move attempts from the frontend
   * This is where YOUR game logic goes
   */
  handleMove(from, to) {
    // Validate move using chess.js (replace with your own logic)
    const move = this.game.move({ from, to })

    if (move) {
      // Valid move - update frontend with new position
      this.frontend.setPosition(this.game.fen())

      // Track move history
      this.moveHistory.push(move)

      // Your additional logic here:
      // - Check for checkmate/stalemate
      // - Send move to server
      // - Update UI
      // - Play sound
      // - etc.

      console.log('Move:', move.san, 'FEN:', this.game.fen())
    } else {
      // Invalid move - reset to current position
      this.frontend.setPosition(this.game.fen())
      console.log('Invalid move:', from, to)
    }
  }

  /**
   * Load a specific position
   */
  loadPosition(fen) {
    if (this.game.load(fen)) {
      this.frontend.setPosition(fen)
      return true
    }
    return false
  }

  /**
   * Get current position
   */
  getCurrentPosition() {
    return this.frontend.getPosition()
  }

  /**
   * Rotate board view
   */
  rotateBoard() {
    this.frontend.rotateBoard()
  }

  /**
   * Set specific view
   */
  setView(color) {
    this.frontend.setView(color)
  }

  /**
   * Undo last move
   */
  undoMove() {
    this.game.undo()
    this.frontend.setPosition(this.game.fen())
  }

  /**
   * Reset game
   */
  reset() {
    this.game.reset()
    this.frontend.setPosition(this.game.fen())
    this.moveHistory = []
  }

  /**
   * Get move history
   */
  getHistory() {
    return this.moveHistory
  }

  /**
   * Check if game is over
   */
  isGameOver() {
    return this.game.isGameOver()
  }

  /**
   * Get game status
   */
  getStatus() {
    if (this.game.isCheckmate()) return 'checkmate'
    if (this.game.isStalemate()) return 'stalemate'
    if (this.game.isDraw()) return 'draw'
    if (this.game.isCheck()) return 'check'
    return 'active'
  }
}
