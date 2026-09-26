# Quick Start - VR Chess Frontend

## 5-Minute Integration

### Step 1: Copy files to your project

```bash
cp chess-frontend.js your-project/
cp board-mapper.js your-project/
cp chess.glb your-project/
```

### Step 2: Create your HTML with A-Frame scene

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://aframe.io/releases/1.4.2/aframe.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/c-frame/aframe-extras@7.0.0/dist/aframe-extras.min.js"></script>
  <script src="https://unpkg.com/super-hands@3.0.3/dist/super-hands.min.js"></script>
</head>
<body>
  <a-scene>
    <a-assets>
      <a-asset-item id="chessPieces" src="chess.glb"></a-asset-item>
    </a-assets>

    <!-- Camera with VR controllers -->
    <a-entity position="0 0.9 1.5">
      <a-camera wasd-controls></a-camera>
      <a-entity hand-controls="hand: left" laser-controls super-hands></a-entity>
      <a-entity hand-controls="hand: right" laser-controls super-hands></a-entity>
    </a-entity>

    <!-- Lighting -->
    <a-entity light="type: ambient; intensity: 0.8"></a-entity>
    <a-entity light="type: directional; intensity: 0.5" position="2 4 2"></a-entity>

    <!-- Chess board (copy from simple-demo.html) -->
    <a-entity id="chessBoard" position="0 0.85 0">
      <!-- Board base and squares here -->
      <a-entity id="chessPiecesTemplate" gltf-model="#chessPieces" visible="false"></a-entity>
    </a-entity>
  </a-scene>

  <script type="module">
    import { ChessFrontend } from './chess-frontend.js'

    const scene = document.querySelector('a-scene')
    const frontend = new ChessFrontend(scene)

    scene.addEventListener('loaded', async () => {
      await frontend.init()

      // Listen for moves
      frontend.on('move', ({ from, to }) => {
        console.log(`Move: ${from} -> ${to}`)
        // Validate and update position here
      })

      // Set initial position
      frontend.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    })
  </script>
</body>
</html>
```

### Step 3: Write your app.js

```javascript
import { ChessFrontend } from './chess-frontend.js'

class MyApp {
  constructor(sceneElement) {
    this.frontend = new ChessFrontend(sceneElement)
    this.currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  }

  async init() {
    await this.frontend.init()

    this.frontend.on('move', ({ from, to }) => {
      this.handleMove(from, to)
    })

    this.frontend.setPosition(this.currentFen)
  }

  handleMove(from, to) {
    // YOUR LOGIC HERE
    // Validate move, update game state, etc.

    // If valid:
    // this.currentFen = newFen
    // this.frontend.setPosition(newFen)

    // If invalid:
    // this.frontend.setPosition(this.currentFen)
  }

  setPosition(fen) {
    this.currentFen = fen
    this.frontend.setPosition(fen)
  }

  getPosition() {
    return this.frontend.getPosition()
  }
}

export { MyApp }
```

## That's It!

Three methods:
- `frontend.setPosition(fen)` - Update visualization
- `frontend.getPosition()` - Get current FEN
- `frontend.on('move', callback)` - Listen for user moves

## Run It

```bash
python3 -m http.server 8000
# Open http://localhost:8000/your-file.html
```

## Complete Examples

- See `simple-demo.html` for complete working example
- See `example-app.js` for app structure with chess.js integration
- See `SIMPLE-API.md` for full documentation

## Common Patterns

### With chess.js (local validation)

```javascript
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm'

const game = new Chess()
const frontend = new ChessFrontend(scene)

frontend.on('move', ({ from, to }) => {
  const move = game.move({ from, to })

  if (move) {
    frontend.setPosition(game.fen())  // Valid
  } else {
    frontend.setPosition(game.fen())  // Invalid - reset
  }
})
```

### With server (remote validation)

```javascript
frontend.on('move', async ({ from, to }) => {
  const res = await fetch('/api/move', {
    method: 'POST',
    body: JSON.stringify({ from, to, fen: frontend.getPosition() })
  })

  const { newFen, valid } = await res.json()

  if (valid) {
    frontend.setPosition(newFen)
  } else {
    frontend.setPosition(frontend.getPosition())  // Reset
  }
})
```

### Load custom position

```javascript
// Scholar's mate
frontend.setPosition('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4')

// Endgame
frontend.setPosition('8/8/4k3/8/8/4K3/4Q3/8 w - - 0 1')
```

## Troubleshooting

**"Frontend not initialized"**
- Make sure to call `await frontend.init()` before using other methods
- Wait for scene 'loaded' event

**"Template not found"**
- Ensure you have `<a-entity id="chessPiecesTemplate" gltf-model="#chessPieces" visible="false"></a-entity>` in your scene

**Pieces not visible**
- Check that `chess.glb` is in correct path
- Check browser console for loading errors

**Pieces not grabbable**
- Ensure super-hands is loaded
- Ensure controllers have `super-hands` attribute
- Check that pieces have `grabbable`, `draggable` attributes (frontend adds these automatically)

## Next Steps

- Test with `simple-demo.html`
- Read `SIMPLE-API.md` for complete API
- Check `example-app.js` for integration patterns
- See `API.md` if you need the full API
