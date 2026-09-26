# Chess Frontend - Simple API

**Ultra-minimal interface for chess visualization. You only work with FEN strings.**

## Installation

Just import the class:

```javascript
import { ChessFrontend } from './chess-frontend.js'
```

## Complete API

### 1. Initialize

```javascript
const frontend = new ChessFrontend(sceneElement)
await frontend.init()
```

### 2. Set Position

```javascript
frontend.setPosition(fen)
```

### 3. Get Position

```javascript
const fen = frontend.getPosition()
```

### 4. Listen for Moves

```javascript
frontend.on('move', ({ from, to, fen }) => {
  // User moved a piece in VR
  // Validate with YOUR logic, then update position
})
```

### 5. Rotate View (White/Black perspective)

```javascript
// Toggle rotation
frontend.rotateBoard()

// Set specific view
frontend.setView('white')  // or 'black'

// Get current view
const view = frontend.getView()  // returns 'white' or 'black'
```

## Your app.js

```javascript
import { ChessFrontend } from './chess-frontend.js'
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm'

export class MyChessApp {
  constructor(sceneElement) {
    this.game = new Chess()  // Your game logic
    this.frontend = new ChessFrontend(sceneElement)  // Visualization
  }

  async init() {
    await this.frontend.init()

    // When user moves piece in VR, validate and update
    this.frontend.on('move', ({ from, to }) => {
      const move = this.game.move({ from, to })

      if (move) {
        // Valid - sync new position
        this.frontend.setPosition(this.game.fen())
      } else {
        // Invalid - reset to current position
        this.frontend.setPosition(this.game.fen())
      }
    })

    // Initial sync
    this.frontend.setPosition(this.game.fen())
  }

  // Your app's methods
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
}
```

## HTML Setup

Your HTML needs:

1. A-Frame scene
2. Chess GLB asset
3. Empty board squares
4. Hidden template entity with id `chessPiecesTemplate`

See `simple-demo.html` for complete example.

## Examples

### Load Position
```javascript
app.loadPosition('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3')
```

### Get Current Position
```javascript
const fen = app.getCurrentPosition()
console.log(fen)
```

### Reset Game
```javascript
app.reset()
```

## That's All

No methods for:
- Creating pieces
- Moving pieces
- Coordinate conversion
- Event management internals

**You only care about FEN strings. The frontend handles everything else.**

## Testing

Run `simple-demo.html` to see it in action:

```bash
python3 -m http.server 8000
# Open http://localhost:8000/simple-demo.html
```

## Events

Only one event: `'move'`

```javascript
frontend.on('move', ({ from, to, fen }) => {
  // from: 'e2'
  // to: 'e4'
  // fen: current position before move
})
```

Your responsibility:
1. Validate the move with YOUR logic
2. Call `frontend.setPosition(newFen)` if valid
3. Call `frontend.setPosition(currentFen)` if invalid (resets piece)

## Integration Patterns

### Local Game
```javascript
// You handle chess logic
const game = new Chess()
frontend.on('move', ({ from, to }) => {
  const move = game.move({ from, to })
  frontend.setPosition(game.fen())
})
```

### Remote Game
```javascript
// Send move to server, server responds with new FEN
frontend.on('move', async ({ from, to }) => {
  const response = await fetch('/api/move', {
    method: 'POST',
    body: JSON.stringify({ from, to })
  })
  const { fen } = await response.json()
  frontend.setPosition(fen)
})
```

### AI Opponent
```javascript
// Make move, get AI response
frontend.on('move', async ({ from, to }) => {
  const playerMove = game.move({ from, to })
  if (!playerMove) {
    frontend.setPosition(game.fen())
    return
  }

  frontend.setPosition(game.fen())

  // AI makes move
  const aiMove = await getAIMove(game.fen())
  game.move(aiMove)
  frontend.setPosition(game.fen())
})
```

## Files

- `chess-frontend.js` - The frontend class (all complexity hidden)
- `board-mapper.js` - Used internally by frontend
- `example-app.js` - Example showing how to use it
- `simple-demo.html` - Working demo
- `SIMPLE-API.md` - This file

## vs Full API

**Simple API** (`chess-frontend.js`):
- ✓ Minimal surface area
- ✓ Only FEN strings
- ✓ Easy to learn
- ✗ Less control

**Full API** (`chess-game.js` + `vr-board.js`):
- ✓ Full control
- ✓ Granular methods
- ✓ More flexible
- ✗ More complex

**Use simple API unless you need fine-grained control.**
