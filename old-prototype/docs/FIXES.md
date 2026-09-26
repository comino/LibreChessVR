# Bug Fixes Applied

## Issues Fixed

### 1. ✅ Board Square Colors
**Problem:** a1 was light, should be dark
**Fix:** Updated `board-template.html` with correct colors:
- a1 = DARK (#B58863)
- h1 = LIGHT (#F0D9B5)
- Pattern alternates correctly across all 64 squares

### 2. ✅ Position Mirroring
**Problem:** FEN positions were mirrored (Queen on h5 instead of a5)
**Fix:** Updated `board-mapper.js`:
- Changed firstSquare from `z: 1.05` to `z: -1.05` (a1 is now at bottom)
- Changed Z calculation from `z - (rank * size)` to `z + (rank * size)`
- Now rank 0 (rank 1) is at z=-1.05, rank 7 (rank 8) is at z=1.05

### 3. ✅ View Rotation
**Problem:** No way to switch between white/black perspective
**Fix:** Added to `chess-frontend.js`:
```javascript
frontend.rotateBoard()          // Toggle view
frontend.setView('white')       // Set specific view
frontend.setView('black')
frontend.getView()              // Get current view
```

## Files Updated

1. **board-mapper.js** - Fixed coordinate mapping
2. **chess-frontend.js** - Added rotation methods
3. **board-template.html** - NEW file with correct board
4. **example-app.js** - Added rotation methods
5. **SIMPLE-API.md** - Documented rotation API

## Current Status of Demo Files

⚠️ **OLD FILES** (need manual board update):
- `simple-demo.html` - Has OLD board with wrong colors
- `vr-chess-v2.html` - Has OLD board with wrong colors
- `vr-chess.html` - Legacy, has OLD board

✅ **CORRECT TEMPLATE:**
- `board-template.html` - Copy this board into your HTML files

## How to Fix Your HTML Files

Replace the `<a-entity id="chessBoard">` section in your HTML with the content from `board-template.html`.

### Quick Test of Coordinates

To verify positions are correct, test in browser console:

```javascript
// Should show a1 at bottom-left
console.log(window.app.frontend.mapper.squareToPosition('a1'))
// Expected: { x: -1.05, y: 0, z: -1.05 }

// Should show a8 at top-left
console.log(window.app.frontend.mapper.squareToPosition('a8'))
// Expected: { x: -1.05, y: 0, z: 1.05 }

// Should show h1 at bottom-right
console.log(window.app.frontend.mapper.squareToPosition('h1'))
// Expected: { x: 1.05, y: 0, z: -1.05 }

// Should show h8 at top-right
console.log(window.app.frontend.mapper.squareToPosition('h8'))
// Expected: { x: 1.05, y: 0, z: 1.05 }
```

### Quick Test of Board Colors

In starting position, place a Queen on a1:
```javascript
window.app.frontend.setPosition('Q7/8/8/8/8/8/8/8 w - - 0 1')
```

The Queen should appear on:
- Bottom-left corner
- On a DARK square

### Test Rotation

```javascript
// White's view (default)
window.app.setView('white')

// Black's view (rotated 180°)
window.app.setView('black')

// Toggle
window.app.rotateBoard()
```

## Coordinate System Summary

**From White's Perspective (default view):**
```
     a    b    c    d    e    f    g    h
8  [-1.05, 1.05]              [1.05, 1.05]
7
6
5
4
3
2
1  [-1.05,-1.05]              [1.05,-1.05]

X: -1.05 (a-file) to 1.05 (h-file)
Z: -1.05 (rank 1) to 1.05 (rank 8)
```

**Board Colors:**
- a1 = DARK
- a2 = LIGHT
- a3 = DARK
- ...
- h8 = DARK

(Each rank alternates starting color, each file alternates starting color)
