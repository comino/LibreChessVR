/**
 * Example application showing how to use ChessFrontend
 *
 * This is what YOUR app.js would look like.
 * The frontend handles all visualization - you just work with FEN strings.
 */

import { ChessFrontend } from './chess-frontend.js'
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm'

export class MyChessApp {
  constructor(sceneElement) {
    // Your chess logic (could be anything - local, remote, AI, etc.)
    this.game = new Chess()

    // The visualization frontend
    this.frontend = new ChessFrontend(sceneElement)
  }

  async init() {
    // Initialize the frontend
    await this.frontend.init()

    // Listen for move events from the frontend
    this.frontend.on('move', ({ from, to }) => {
      this.handleMove(from, to)
    })

    // Sync initial position
    this.frontend.setPosition(this.game.fen())

    console.log('Chess app initialized')
  }

  handleMove(from, to) {
    console.log(`Move attempted: ${from} -> ${to}`)

    // Validate move with your game logic
    const move = this.game.move({ from, to })

    if (move) {
      // Valid move - update frontend with new FEN
      console.log(`Valid move: ${move.san}`)
      this.frontend.setPosition(this.game.fen())

      // Check game status
      if (this.game.isGameOver()) {
        this.handleGameOver()
      }
    } else {
      // Invalid move - reset frontend to current position
      console.log('Invalid move - resetting')
      this.frontend.setPosition(this.game.fen())
    }
  }

  handleGameOver() {
    if (this.game.isCheckmate()) {
      const winner = this.game.turn() === 'w' ? 'Black' : 'White'
      alert(`Checkmate! ${winner} wins!`)
    } else if (this.game.isStalemate()) {
      alert('Stalemate!')
    } else if (this.game.isDraw()) {
      alert('Draw!')
    }
  }

  // Your app's API
  loadPosition(fen) {
    this.game.load(fen)
    this.frontend.setPosition(fen)
  }

  getCurrentPosition() {
    return this.frontend.getPosition()
  }

  reset() {
    this.game.reset()
    this.frontend.setPosition(this.game.fen())
  }

  undo() {
    this.game.undo()
    this.frontend.setPosition(this.game.fen())
  }

  // View rotation
  rotateBoard() {
    this.frontend.rotateBoard()
  }

  setView(color) {
    this.frontend.setView(color)
  }

  getView() {
    return this.frontend.getView()
  }
}
