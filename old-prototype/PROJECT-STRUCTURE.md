# Chess VR Frontend - Project Structure

## 📁 Core Files (Ready to Use)

```
chessvr/
├── chess-frontend.js       ← Main frontend library (copy this)
├── board-mapper.js         ← Coordinate utilities (copy this)
├── chess.glb               ← 3D piece models (copy this)
├── simple-demo.html        ← Working example
└── example-app.js          ← Example integration pattern
```

## 🚀 Quick Start

### 1. Copy Core Files to Your Project

```bash
cp chess-frontend.js your-project/
cp board-mapper.js your-project/
cp chess.glb your-project/
```

### 2. Create Your HTML

Copy the board HTML from `simple-demo.html` (lines 76-189) which includes:
- A-Frame scene setup
- VR controllers
- Chess board squares (corrected colors)
- Lighting

### 3. Create Your Application

Create `app.js` in your project:

```javascript
import { ChessFrontend } from './chess-frontend.js'
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm'

export class MyChessApp {
  constructor(sceneElement) {
    this.game = new Chess()
    this.frontend = new ChessFrontend(sceneElement)
  }

  async init() {
    await this.frontend.init()

    this.frontend.on('move', ({ from, to }) => {
      const move = this.game.move({ from, to })
      this.frontend.setPosition(this.game.fen())
    })

    this.frontend.setPosition(this.game.fen())
  }

  // Your app methods here
  loadPosition(fen) {
    this.game.load(fen)
    this.frontend.setPosition(fen)
  }

  getCurrentPosition() {
    return this.frontend.getPosition()
  }

  rotateBoard() {
    this.frontend.rotateBoard()
  }
}
```

### 4. Use in Your HTML

```html
<script type="module">
  import { MyChessApp } from './app.js'

  const scene = document.querySelector('a-scene')
  const app = new MyChessApp(scene)

  scene.addEventListener('loaded', async () => {
    await app.init()
    window.app = app  // For debugging
  })
</script>
```

## 📚 API Reference

### ChessFrontend Methods

```javascript
// Initialize (required)
await frontend.init()

// Position management
frontend.setPosition(fen)        // Set board from FEN
const fen = frontend.getPosition() // Get current FEN

// Event handling
frontend.on('move', ({ from, to, fen }) => { })

// View rotation
frontend.rotateBoard()           // Toggle view
frontend.setView('white')        // Set specific view
frontend.setView('black')
const view = frontend.getView()  // Get current view
```

## 📂 Project Layout Options

### Option A: Minimal (Your App's Folder)

```
your-app/
├── index.html              ← Your main HTML
├── app.js                  ← Your chess logic
├── chess-frontend.js       ← Copied from chessvr
├── board-mapper.js         ← Copied from chessvr
└── chess.glb               ← Copied from chessvr
```

### Option B: Organized (Larger Project)

```
your-app/
├── index.html
├── src/
│   ├── app.js              ← Your logic
│   └── chess-frontend/     ← Frontend as module
│       ├── chess-frontend.js
│       ├── board-mapper.js
│       └── assets/
│           └── chess.glb
```

### Option C: Modular (Multiple Apps)

```
your-project/
├── apps/
│   ├── game1.html
│   ├── game2.html
│   └── shared/
│       ├── chess-app.js    ← Shared logic
│       └── ui.js
└── lib/
    ├── chess-frontend.js   ← Shared frontend
    ├── board-mapper.js
    └── assets/
        └── chess.glb
```

## 🎯 What Goes Where

### Your Code (app.js)
- Game rules/validation
- Move history
- Player management
- AI/networking logic
- UI state management
- Custom features

### Frontend Library (chess-frontend.js)
- 3D visualization
- VR interaction
- FEN parsing
- Coordinate mapping
- Piece rendering

### Clear Separation
```
┌─────────────────┐
│   Your App      │  ← Game logic, rules, features
│   (app.js)      │
└────────┬────────┘
         │ FEN strings only
         │
┌────────▼────────┐
│ ChessFrontend   │  ← Visualization, VR, rendering
│ (library)       │
└─────────────────┘
```

## 📖 Documentation

- **SIMPLE-API.md** - Quick API reference
- **README.md** - Overview and features
- **docs/API.md** - Full API (advanced features)
- **docs/QUICKSTART.md** - Step-by-step tutorial

## 🔍 Examples

- **simple-demo.html** - Basic working example
- **example-app.js** - Integration pattern with chess.js
- **archive/** - Old versions and experiments

## 🛠️ Development Workflow

1. **Start with simple-demo.html**
   - See it working
   - Understand the structure

2. **Copy to your project**
   - Core files only
   - Customize HTML

3. **Build your app.js**
   - Add your game logic
   - Keep it separate from frontend

4. **Iterate**
   - Frontend stays unchanged
   - All changes in your app.js

## ⚡ Testing

Run local server:
```bash
python3 -m http.server 8000
```

Open: `http://localhost:8000/simple-demo.html`

Console debug:
```javascript
window.app.frontend.getPosition()  // Get FEN
window.app.frontend.setView('black')  // Rotate
```

## 🎨 Customization

### Board Appearance
Edit in HTML (colors, sizes, materials)

### Piece Models
Replace `chess.glb` with your own 3D models

### VR Controls
Modify controller setup in HTML

### Camera Position
Adjust camera position/rotation in HTML

## 📋 Checklist for New Projects

- [ ] Copy chess-frontend.js
- [ ] Copy board-mapper.js
- [ ] Copy chess.glb
- [ ] Copy board HTML from simple-demo.html
- [ ] Create app.js with your logic
- [ ] Initialize frontend in your app
- [ ] Handle 'move' events
- [ ] Sync FEN strings
- [ ] Test in browser

## 🆘 Troubleshooting

**"Frontend not initialized"**
- Call `await frontend.init()` first

**Pieces in wrong position**
- Hard refresh (Ctrl+Shift+R)
- Check board HTML is from simple-demo.html

**Can't grab pieces**
- Ensure super-hands is loaded
- Check VR controllers are set up

**Wrong square colors**
- Use board HTML from simple-demo.html (has corrected colors)

## 🔗 Next Steps

1. Review **SIMPLE-API.md** for complete API
2. Study **example-app.js** for patterns
3. Check **simple-demo.html** for working example
4. Build your app.js!
