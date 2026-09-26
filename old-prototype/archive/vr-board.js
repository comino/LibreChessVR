/**
 * VRChessBoard - 3D visualization layer for chess
 *
 * This class handles the VR/3D rendering and interaction without knowing
 * anything about chess rules. It emits events when pieces are moved and
 * can update its visualization based on FEN positions.
 *
 * Usage:
 *   const board = new VRChessBoard(scene, assets)
 *   board.on('pieceMoved', ({from, to}) => { ... })
 *   board.setPosition(fen)
 */

import { BoardMapper } from './board-mapper.js'

export class VRChessBoard {
  constructor(sceneEl, config = {}) {
    this.scene = sceneEl
    this.config = {
      pieceScale: 0.003,
      pieceHeight: 0.00,
      positionOffset: { x: 0, y: 0, z: 0 },
      ...config
    }

    this.mapper = new BoardMapper()
    this.pieces = new Map() // square -> entity mapping
    this.pieceTemplates = {}
    this.listeners = {}

    // Track dragging state
    this.draggedPiece = null
    this.dragSourceSquare = null

    this.nodeMapping = {
      'Pawn': 'p',
      'Queen': 'q',
      'King': 'k',
      'Rook': 'r',
      'Knight': 'n',
      'Bishop': 'b'
    }
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

  /**
   * Initialize the board with loaded 3D models
   * @param {Object} loadedTemplates - Pre-extracted piece templates from GLB
   */
  setTemplates(templates) {
    this.pieceTemplates = templates
  }

  /**
   * Set board position from FEN string
   * @param {string} fen - Forsyth-Edwards Notation
   */
  setPosition(fen) {
    // Parse FEN
    const board = this._fenToBoard(fen)
    if (!board) return false

    // Clear existing pieces
    this.clearPieces()

    // Create pieces for each occupied square
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file]
        if (piece) {
          const square = this.mapper.indicesToSquare(rank, file)
          this.createPiece(square, piece.type, piece.color)
        }
      }
    }

    this.emit('positionSet', fen)
    return true
  }

  /**
   * Create a single chess piece at a square
   * @param {string} square - Chess notation like 'e4'
   * @param {string} type - Piece type: 'p', 'n', 'b', 'r', 'q', 'k'
   * @param {string} color - 'w' or 'b'
   */
  createPiece(square, type, color) {
    if (this.pieces.has(square)) {
      this.removePiece(square)
    }

    const position = this.mapper.squareToPosition(square)
    if (!position) return null

    const template = this.pieceTemplates[type]
    if (!template) {
      console.error(`Template not found for piece type: ${type}`)
      return null
    }

    // Create A-Frame entity
    const pieceEntity = document.createElement('a-entity')
    pieceEntity.setAttribute('class', `chess-piece ${color}-${type}`)
    pieceEntity.setAttribute('data-square', square)
    pieceEntity.setAttribute('data-piece-type', type)
    pieceEntity.setAttribute('data-piece-color', color)

    pieceEntity.setAttribute('position', {
      x: position.x + this.config.positionOffset.x,
      y: this.config.pieceHeight,
      z: position.z + this.config.positionOffset.z
    })

    pieceEntity.setAttribute('scale', {
      x: this.config.pieceScale,
      y: this.config.pieceScale,
      z: this.config.pieceScale
    })

    pieceEntity.setAttribute('shadow', 'cast: true')

    // VR interaction attributes
    pieceEntity.setAttribute('hoverable', '')
    pieceEntity.setAttribute('grabbable', '')
    pieceEntity.setAttribute('stretchable', '')
    pieceEntity.setAttribute('draggable', '')
    pieceEntity.setAttribute('droppable', '')

    // Clone the 3D model
    const clonedPiece = template.clone()
    this._applyPieceColor(clonedPiece, color)
    this._centerPiece(clonedPiece)

    // Add grab/drop listeners
    this._attachInteractionListeners(pieceEntity, square)

    // Wait for entity to be ready, then add model
    pieceEntity.addEventListener('loaded', () => {
      pieceEntity.object3D.add(clonedPiece)
    })

    // Add to scene
    const chessBoard = this.scene.querySelector('#chessBoard')
    chessBoard.appendChild(pieceEntity)

    this.pieces.set(square, pieceEntity)
    return pieceEntity
  }

  /**
   * Remove piece from square
   * @param {string} square
   */
  removePiece(square) {
    const entity = this.pieces.get(square)
    if (entity && entity.parentNode) {
      entity.parentNode.removeChild(entity)
      this.pieces.delete(square)
      return true
    }
    return false
  }

  /**
   * Move piece from one square to another (visual only)
   * @param {string} from
   * @param {string} to
   */
  movePieceVisual(from, to) {
    const pieceEntity = this.pieces.get(from)
    if (!pieceEntity) return false

    const newPosition = this.mapper.squareToPosition(to)
    if (!newPosition) return false

    // Remove captured piece if exists
    if (this.pieces.has(to)) {
      this.removePiece(to)
    }

    // Update position
    pieceEntity.setAttribute('position', {
      x: newPosition.x + this.config.positionOffset.x,
      y: this.config.pieceHeight,
      z: newPosition.z + this.config.positionOffset.z
    })

    pieceEntity.setAttribute('data-square', to)

    // Update internal tracking
    this.pieces.delete(from)
    this.pieces.set(to, pieceEntity)

    return true
  }

  /**
   * Clear all pieces from board
   */
  clearPieces() {
    for (const [square, entity] of this.pieces.entries()) {
      if (entity.parentNode) {
        entity.parentNode.removeChild(entity)
      }
    }
    this.pieces.clear()
  }

  /**
   * Get square from 3D position
   * @param {number} x
   * @param {number} z
   * @returns {string|null}
   */
  getSquareFromPosition(x, z) {
    return this.mapper.positionToSquare(x, z)
  }

  /**
   * Parse FEN string into 2D board array
   * @private
   */
  _fenToBoard(fen) {
    const parts = fen.split(' ')
    const position = parts[0]
    const ranks = position.split('/')

    if (ranks.length !== 8) return null

    const board = []

    // Process from rank 8 to rank 1 (FEN order)
    for (let i = 0; i < 8; i++) {
      const rank = []
      const rankStr = ranks[i]

      for (let j = 0; j < rankStr.length; j++) {
        const char = rankStr[j]

        if (char >= '1' && char <= '8') {
          // Empty squares
          const emptyCount = parseInt(char)
          for (let k = 0; k < emptyCount; k++) {
            rank.push(null)
          }
        } else {
          // Piece
          const color = char === char.toUpperCase() ? 'w' : 'b'
          const type = char.toLowerCase()
          rank.push({ type, color })
        }
      }

      board.push(rank)
    }

    return board
  }

  /**
   * Apply color to piece mesh
   * @private
   */
  _applyPieceColor(model, color) {
    model.traverse(child => {
      if (child.isMesh) {
        const meshName = child.name || ''

        if (meshName.includes('Plastic')) {
          child.visible = true

          if (child.material) {
            const mat = child.material.clone()
            if (color === 'w') {
              mat.color.set(0xFFFFFF)
              mat.emissive.set(0xAAAAAA)
            } else {
              mat.color.set(0x666666)
              mat.emissive.set(0x222222)
            }
            mat.needsUpdate = true
            child.material = mat
          }
        } else {
          child.visible = false
        }
      }
    })
  }

  /**
   * Center piece at origin with base at ground
   * @private
   */
  _centerPiece(model) {
    const bbox = new THREE.Box3().setFromObject(model)
    const center = new THREE.Vector3()
    bbox.getCenter(center)

    model.position.x -= center.x
    model.position.z -= center.z
    model.position.y -= bbox.min.y
  }

  /**
   * Attach interaction event listeners
   * @private
   */
  _attachInteractionListeners(entity, square) {
    entity.addEventListener('dragstart', (evt) => {
      this.draggedPiece = entity
      this.dragSourceSquare = square
      this.emit('pieceGrabbed', { square, entity })
    })

    entity.addEventListener('dragend', (evt) => {
      if (!this.draggedPiece) return

      const obj = entity.object3D
      const worldPos = new THREE.Vector3()
      obj.getWorldPosition(worldPos)

      const targetSquare = this.mapper.positionToSquare(worldPos.x, worldPos.z)

      if (targetSquare && targetSquare !== this.dragSourceSquare) {
        // Emit move event - let game logic validate
        this.emit('pieceMoved', {
          from: this.dragSourceSquare,
          to: targetSquare,
          entity: entity
        })
      } else {
        // Return to original position
        const originalPos = this.mapper.squareToPosition(this.dragSourceSquare)
        entity.setAttribute('position', {
          x: originalPos.x + this.config.positionOffset.x,
          y: this.config.pieceHeight,
          z: originalPos.z + this.config.positionOffset.z
        })
      }

      this.draggedPiece = null
      this.dragSourceSquare = null
    })
  }
}
