# VR Chess - Reusable Frontend API Documentation

## Overview

The VR Chess frontend is built with a clean separation between game logic and visualization. The architecture consists of three main components:

1. **ChessGame** - Pure game state and rule validation (uses chess.js)
2. **VRChessBoard** - 3D visualization layer (knows nothing about chess rules)
3. **BoardMapper** - Coordinate conversion utilities

## Architecture Diagram

```
┌─────────────────┐
│   chess.js      │  (Rule validation & FEN)
└────────┬────────┘
         │
┌────────▼────────┐      Events       ┌──────────────────┐
│   ChessGame     │◄────────────────►│   VRChessBoard   │
│  (Model/Logic)  │    (pieceMoved,  │  (View/Render)   │
└─────────────────┘     positionSet)  └────────┬─────────┘
         │                                     │
         │                              ┌──────▼──────┐
         │                              │ BoardMapper │
         │                              │ (Utilities) │
         └──────────────────────────────┴─────────────┘
```

## 1. ChessGame API

### Constructor

```javascript
const game = new ChessGame(fen = null)
```

Creates a new chess game instance. Optionally accepts a FEN string to start from a specific position.

### Event System

```javascript
game.on(event, callback)
game.off(event, callback)
```

**Events:**
- `'positionChanged'` - Fired when board position changes (callback receives FEN string)
- `'move'` - Fired after a legal move (callback receives move object)
- `'gameOver'` - Fired when game ends (callback receives game status)
- `'undo'` - Fired when a move is undone
- `'reset'` - Fired when game is reset

### Position Management

```javascript
// Get current position as FEN
const fen = game.getFEN()
// -> 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

// Set position from FEN
game.setFEN('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3')
// -> true (success) or false (invalid FEN)

// Reset to starting position
game.reset()
```

### Piece Information

```javascript
// Get piece at square
const piece = game.getPieceAt('e4')
// -> { type: 'p', color: 'w' } or null

// Get entire board as 2D array
const board = game.getBoard()
// -> 8x8 array of piece objects or null
```

### Move Handling

```javascript
// Make a move
const move = game.movePiece('e2', 'e4')
// -> {
//      from: 'e2',
//      to: 'e4',
//      piece: 'p',
//      color: 'w',
//      san: 'e4',
//      fen: '...'
//    } or null if illegal

// With pawn promotion
game.movePiece('e7', 'e8', 'q')

// Get legal moves for a square
const moves = game.getLegalMoves('e2')
// -> Array of move objects with verbose info

// Check if move is legal
game.isLegalMove('e2', 'e4')
// -> true or false
```

### Game State

```javascript
game.getTurn()         // -> 'w' or 'b'
game.isCheck()         // -> true/false
game.isCheckmate()     // -> true/false
game.isStalemate()     // -> true/false
game.isDraw()          // -> true/false
game.isGameOver()      // -> true/false

// Get comprehensive status
const status = game.getGameStatus()
// -> {
//      isCheck: false,
//      isCheckmate: false,
//      isStalemate: false,
//      isDraw: false,
//      isGameOver: false,
//      turn: 'w',
//      fen: '...'
//    }
```

### History & Undo

```javascript
// Get move history
const moves = game.getHistory()
// -> ['e4', 'e5', 'Nf3', ...]

const verboseMoves = game.getHistory(true)
// -> Array of detailed move objects

// Undo last move
const undoneMove = game.undo()
// -> move object or null
```

### Static Methods

```javascript
// Validate FEN string
const result = ChessGame.validateFEN(fen)
// -> { valid: true } or { valid: false, error: '...' }
```

## 2. VRChessBoard API

### Constructor

```javascript
const board = new VRChessBoard(sceneElement, config = {})
```

**Config options:**
```javascript
{
  pieceScale: 0.003,              // Scale of 3D pieces
  pieceHeight: 0.00,              // Height above board
  positionOffset: { x: 0, y: 0, z: 0 }  // Global position offset
}
```

### Event System

```javascript
board.on(event, callback)
board.off(event, callback)
```

**Events:**
- `'pieceMoved'` - Fired when user drops a piece (callback receives `{from, to, entity}`)
- `'pieceGrabbed'` - Fired when user grabs a piece (callback receives `{square, entity}`)
- `'positionSet'` - Fired after board position is set (callback receives FEN string)

### Setup

```javascript
// Set 3D model templates (after GLB loads)
board.setTemplates({
  'p': pawnModel,
  'n': knightModel,
  'b': bishopModel,
  'r': rookModel,
  'q': queenModel,
  'k': kingModel
})
```

### Position Management

```javascript
// Set entire board from FEN
board.setPosition(fen)
// -> true/false

// Clear all pieces
board.clearPieces()
```

### Piece Manipulation

```javascript
// Create single piece
board.createPiece('e4', 'p', 'w')
// -> entity or null

// Remove piece
board.removePiece('e4')
// -> true/false

// Move piece visually (no validation)
board.movePieceVisual('e2', 'e4')
// -> true/false
```

### Coordinate Conversion

```javascript
// Get square from 3D position
const square = board.getSquareFromPosition(0.15, 1.05)
// -> 'e1' or null

// Access mapper directly
const pos = board.mapper.squareToPosition('e4')
// -> { x: 0.15, y: 0, z: 0.15 }
```

## 3. BoardMapper API

### Constructor

```javascript
const mapper = new BoardMapper(config = {})
```

**Config options:**
```javascript
{
  squareSize: 0.3,
  boardCenter: { x: 0, y: 0, z: 0 },
  firstSquare: { x: -1.05, y: 0, z: 1.05 }  // a1 position
}
```

### Coordinate Conversions

```javascript
// 3D position → square notation
mapper.positionToSquare(0.15, 1.05)
// -> 'e1'

// Square notation → 3D position
mapper.squareToPosition('e4')
// -> { x: 0.15, y: 0, z: 0.15 }

// Square notation → array indices
mapper.squareToIndices('e4')
// -> { rank: 3, file: 4 }

// Array indices → square notation
mapper.indicesToSquare(3, 4)
// -> 'e4'
```

### Utilities

```javascript
// Get all 64 squares
mapper.getAllSquares()
// -> ['a1', 'b1', ..., 'g8', 'h8']

// Validate square
mapper.isValidSquare('e4')  // -> true
mapper.isValidSquare('z9')  // -> false

// Get distance between squares
mapper.getSquareDistance('e2', 'e4')
// -> 2 (Chebyshev distance)

// Get square color
mapper.getSquareColor('e4')
// -> 'light' or 'dark'

// Update configuration
mapper.updateConfig({ squareSize: 0.35 })
```

## Usage Examples

### Example 1: Basic Integration

```javascript
import { ChessGame } from './chess-game.js'
import { VRChessBoard } from './vr-board.js'

const game = new ChessGame()
const board = new VRChessBoard(sceneElement)

// Load templates (after GLB loads)
board.setTemplates(extractedTemplates)

// Set initial position
board.setPosition(game.getFEN())

// Handle moves from VR
board.on('pieceMoved', ({ from, to, entity }) => {
  const move = game.movePiece(from, to)

  if (move) {
    // Legal move - sync visual
    board.movePieceVisual(from, to)
    console.log(`Played: ${move.san}`)
  } else {
    // Illegal - reset piece position
    const pos = board.mapper.squareToPosition(from)
    entity.setAttribute('position', pos)
  }
})

// Handle position changes from game logic
game.on('positionChanged', (fen) => {
  board.setPosition(fen)
})
```

### Example 2: Programmatic Control

```javascript
// Make moves programmatically
game.movePiece('e2', 'e4')
game.movePiece('e7', 'e5')

// Sync VR board
board.setPosition(game.getFEN())

// Check game state
if (game.isCheck()) {
  console.log(`${game.getTurn() === 'w' ? 'White' : 'Black'} is in check!`)
}
```

### Example 3: Load Custom Position

```javascript
// Load Scholar's Mate position
const fen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'

game.setFEN(fen)
board.setPosition(fen)

console.log(game.isCheckmate())  // -> true
```

### Example 4: Move Validation

```javascript
// Get all legal moves for current position
const allMoves = game.getLegalMoves()

// Get legal moves for specific piece
const pawnMoves = game.getLegalMoves('e2')

// Check if specific move is legal
if (game.isLegalMove('e2', 'e4')) {
  console.log('e2-e4 is legal')
}
```

## Browser Console Debug API

When the page loads, `game` and `vrBoard` are exposed to `window`:

```javascript
// In browser console:
window.game.getFEN()
window.game.movePiece('e2', 'e4')
window.game.undo()
window.game.reset()

window.vrBoard.getSquareFromPosition(0.15, 1.05)
window.vrBoard.mapper.squareToPosition('e4')
```

## File Structure

```
chessvr/
├── chess-game.js       # ChessGame class (model)
├── vr-board.js         # VRChessBoard class (view)
├── board-mapper.js     # BoardMapper utilities
├── vr-chess-v2.html    # Integrated demo
├── chess.glb           # 3D models
└── API.md              # This file
```

## Dependencies

- **chess.js v1.0.0+** - Chess logic and validation
- **A-Frame 1.4.2** - WebXR framework
- **aframe-extras** - Additional A-Frame components
- **super-hands 3.0.3** - VR interaction

All dependencies loaded via CDN (no build process required).

## Design Principles

1. **Separation of Concerns** - Game logic never touches 3D rendering
2. **Event-Driven** - Loose coupling via event system
3. **FEN as Source of Truth** - Position always representable as FEN
4. **Framework Agnostic** - VRChessBoard could be swapped for 2D canvas, Three.js, etc.
5. **No Build Process** - Pure ES6 modules, works directly in browser
