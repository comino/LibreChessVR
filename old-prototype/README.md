# Chess VR Frontend

**Reusable 3D chess visualization for WebXR applications.**

A clean, FEN-based chess frontend that handles all visualization while your application focuses on game logic.

## ✨ Features

- **Pure FEN interface** - No chess rules in the frontend
- **VR controller support** - Grab and move pieces naturally
- **View rotation** - Switch between white/black perspective
- **Event-driven** - Simple callback system
- **Zero dependencies** - Uses chess.js only if YOU want validation
- **No build process** - Pure ES6 modules

## 🚀 Quick Start

### 1. Copy Core Files

```bash
cp chess-frontend.js your-project/
cp board-mapper.js your-project/
cp chess.glb your-project/
```

### 2. Create app.js

```javascript
import { ChessFrontend } from './chess-frontend.js'

export class MyChessApp {
  constructor(sceneElement) {
    this.frontend = new ChessFrontend(sceneElement)
  }

  async init() {
    await this.frontend.init()

    this.frontend.on('move', ({ from, to }) => {
      // YOUR validation logic here
      // Update with: this.frontend.setPosition(newFen)
    })

    this.frontend.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  }
}
```

### 3. Test It

```bash
python3 -m http.server 8000
# Open http://localhost:8000/simple-demo.html
```

## 📖 API

```javascript
// Initialize
const frontend = new ChessFrontend(sceneElement)
await frontend.init()

// Set position from FEN
frontend.setPosition(fen)

// Get current FEN
const fen = frontend.getPosition()

// Listen for moves
frontend.on('move', ({ from, to }) => { })

// Rotate board
frontend.rotateBoard()
frontend.setView('white')  // or 'black'
```

**That's the entire API.** See [SIMPLE-API.md](SIMPLE-API.md) for details.

## 📁 Files

### Core Library
- `chess-frontend.js` - Main frontend (only file you need to import)
- `board-mapper.js` - Coordinate utilities (used internally)
- `chess.glb` - 3D piece models

### Examples & Docs
- `simple-demo.html` - Working demo
- `example-app.js` - Integration example
- `SIMPLE-API.md` - API reference
- `PROJECT-STRUCTURE.md` - Project layout guide

### Archive
- `archive/` - Old versions, experiments, alternative APIs

## 🎯 Architecture

```
Your App (app.js)          Chess Frontend
─────────────────          ──────────────
Game rules        ◄──────► Visualization only
Move validation   FEN only  3D rendering
Player logic               VR interaction
History                    Event emission
AI/networking              Coordinate mapping
```

**Clean separation**: Your app never touches 3D code. Frontend never validates moves.

## 🔧 Integration Examples

### With chess.js (local validation)

```javascript
import { Chess } from 'chess.js'
import { ChessFrontend } from './chess-frontend.js'

const game = new Chess()
const frontend = new ChessFrontend(scene)

await frontend.init()

frontend.on('move', ({ from, to }) => {
  const move = game.move({ from, to })
  frontend.setPosition(game.fen())  // Always sync, invalid moves reset
})
```

### With remote server

```javascript
frontend.on('move', async ({ from, to }) => {
  const res = await fetch('/api/move', {
    method: 'POST',
    body: JSON.stringify({ from, to, fen: frontend.getPosition() })
  })
  const { newFen } = await res.json()
  frontend.setPosition(newFen)
})
```

### Custom validation

```javascript
frontend.on('move', ({ from, to }) => {
  if (myCustomValidation(from, to)) {
    const newFen = calculateNewPosition(from, to)
    frontend.setPosition(newFen)
  } else {
    frontend.setPosition(frontend.getPosition())  // Reset
  }
})
```

## 📚 Documentation

- **[SIMPLE-API.md](SIMPLE-API.md)** - Complete API reference
- **[PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md)** - Project layout guide
- **[docs/QUICKSTART.md](docs/QUICKSTART.md)** - Step-by-step tutorial
- **[docs/API.md](docs/API.md)** - Advanced features (full API)

## 🎮 Controls

### VR Mode (Meta Quest)
- **Grip button** - Grab and move pieces
- **Trigger** - Click UI buttons
- **WASD** - Move around (desktop preview)

### Desktop Preview
- **Mouse** - Look around
- **WASD** - Move around
- **Note**: Piece interaction requires VR mode

## 🛠️ Development

### Run Example
```bash
python3 -m http.server 8000
# Open http://localhost:8000/simple-demo.html
```

### Debug in Console
```javascript
window.app.frontend.getPosition()      // Get FEN
window.app.frontend.setView('black')   // Rotate
window.app.frontend.mapper.squareToPosition('e4')  // Debug coords
```

## 🎨 Customization

### Piece Scale/Height
```javascript
const frontend = new ChessFrontend(scene, {
  pieceScale: 0.003,
  pieceHeight: 0.00
})
```

### Board Colors
Edit square colors in your HTML (see simple-demo.html)

### 3D Models
Replace `chess.glb` with your own models

## 🔍 Technical Details

- **A-Frame 1.4.2** - WebXR framework
- **super-hands 3.0.3** - VR grab interaction
- **FEN** - Standard chess position notation
- **Coordinate system**:
  - Files: a=rightmost (x=1.05), h=leftmost (x=-1.05) [mirrored for rotation]
  - Ranks: 1=bottom (z=-1.05), 8=top (z=1.05)
  - Camera at z=1.5 (black's side by default, board rotates 180° for white view)

## ✅ Fixes Applied

- ✅ Square colors corrected (a1 is dark)
- ✅ Position mirroring fixed (pieces on correct squares)
- ✅ FEN parsing corrected (ranks parsed 8→1)
- ✅ File coordinates mirrored for rotation
- ✅ View rotation working (white/black perspective)

## 📦 What's Included

```
chessvr/
├── chess-frontend.js       # Main library (7KB)
├── board-mapper.js         # Utilities (4KB)
├── chess.glb               # 3D models (2.5MB)
├── simple-demo.html        # Working example
├── example-app.js          # Integration pattern
├── SIMPLE-API.md           # API docs
├── PROJECT-STRUCTURE.md    # Layout guide
├── README.md               # This file
├── archive/                # Old versions
└── docs/                   # Detailed docs
```

## 🆘 Support

**Common Issues:**

- **"Frontend not initialized"** - Call `await frontend.init()` first
- **Wrong piece positions** - Hard refresh (Ctrl+Shift+R)
- **Can't grab pieces** - Ensure super-hands library is loaded
- **Wrong square colors** - Copy board HTML from simple-demo.html

## 🎯 Use Cases

- ✅ Local chess game with rules
- ✅ Online multiplayer chess
- ✅ Chess puzzles/trainers
- ✅ Chess variants (no built-in rules = full flexibility)
- ✅ Chess analysis tools
- ✅ Educational chess apps
- ✅ Chess AI demonstrations

## 🚫 What This Is NOT

- ❌ A complete chess game (no rules built-in)
- ❌ A chess engine (you provide logic)
- ❌ A UI framework (visualization only)

**This is a visualization library.** You write the game logic.

## 📄 License

Use freely for any project.

## 🙏 Credits

Built with A-Frame, super-hands, and chess.js (optional).

---

**Ready to build your chess app? Start with [SIMPLE-API.md](SIMPLE-API.md)!**
