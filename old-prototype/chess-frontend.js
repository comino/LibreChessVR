/**
 * ChessFrontend - Minimal API for chess visualization
 *
 * Simple interface: set FEN, read FEN, get move events.
 * All internal complexity is hidden.
 *
 * Usage:
 *   const frontend = new ChessFrontend(sceneElement)
 *   await frontend.init()
 *
 *   frontend.setPosition(fen)
 *   const currentFen = frontend.getPosition()
 *   frontend.on('move', ({ from, to, fen }) => { ... })
 */

import { BoardMapper } from './board-mapper.js'

export class ChessFrontend {
  constructor(sceneElement, config = {}) {
    this.scene = sceneElement
    this.config = {
      pieceScale: 0.003,
      pieceHeight: 0.00,
      ...config
    }

    this.mapper = new BoardMapper()
    this.pieces = new Map()
    this.pieceTemplates = {}
    this.listeners = {}
    this.currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    this.initialized = false
    this.rotated = true // Board is rotated by default to show white view (camera at z=1.5 is black's side)

    this.nodeMapping = {
      'Pawn': 'p',
      'Queen': 'q',
      'King': 'k',
      'Rook': 'r',
      'Knight': 'n',
      'Bishop': 'b'
    }
  }

  /**
   * Initialize the frontend (must be called after scene loads)
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return

    return new Promise((resolve, reject) => {
      const template = this.scene.querySelector('#chessPiecesTemplate')

      if (!template) {
        reject(new Error('Chess pieces template not found in scene'))
        return
      }

      template.addEventListener('model-loaded', () => {
        const model = template.getObject3D('mesh')
        if (!model) {
          reject(new Error('Failed to load chess model'))
          return
        }

        // Extract templates
        model.traverse(node => {
          if (node.name && this.nodeMapping[node.name]) {
            const pieceType = this.nodeMapping[node.name]
            this.pieceTemplates[pieceType] = node.clone()
          }
        })

        this.initialized = true

        // Set board rotation to match initial state
        const boardEntity = this.scene.querySelector('#chessBoard')
        if (this.rotated) {
          boardEntity.setAttribute('rotation', '0 180 0')
        }

        // Set initial position
        this.setPosition(this.currentFen)

        resolve()
      })

      template.addEventListener('model-error', (e) => {
        reject(new Error('Failed to load chess model: ' + e.message))
      })
    })
  }

  /**
   * Set board position from FEN
   * @param {string} fen - Forsyth-Edwards Notation
   */
  setPosition(fen) {
    if (!this.initialized) {
      console.warn('ChessFrontend not initialized. Call init() first.')
      return
    }

    const board = this._fenToBoard(fen)
    if (!board) {
      console.error('Invalid FEN:', fen)
      return
    }

    this.currentFen = fen
    this._clearPieces()

    // Create pieces
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file]
        if (piece) {
          const square = this.mapper.indicesToSquare(rank, file)
          this._createPiece(square, piece.type, piece.color)
        }
      }
    }
  }

  /**
   * Get current position as FEN
   * @returns {string}
   */
  getPosition() {
    return this.currentFen
  }

  /**
   * Rotate board 180 degrees (switch between white/black perspective)
   */
  rotateBoard() {
    this.rotated = !this.rotated
    const boardEntity = this.scene.querySelector('#chessBoard')

    if (this.rotated) {
      // White's view - rotate 180 degrees (camera is at black's side by default)
      boardEntity.setAttribute('rotation', '0 180 0')
    } else {
      // Black's view - no rotation (default, camera at z=1.5 is black's side)
      boardEntity.setAttribute('rotation', '0 0 0')
    }
  }

  /**
   * Set view perspective
   * @param {string} color - 'white' or 'black'
   */
  setView(color) {
    const shouldRotate = (color === 'white')
    if (shouldRotate !== this.rotated) {
      this.rotateBoard()
    }
  }

  /**
   * Get current view perspective
   * @returns {string} - 'white' or 'black'
   */
  getView() {
    return this.rotated ? 'white' : 'black'
  }

  /**
   * Register event listener
   * @param {string} event - Event name ('move')
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  /**
   * Remove event listener
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (!this.listeners[event]) return
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
  }

  /**
   * Emit event
   * @private
   */
  _emit(event, data) {
    if (!this.listeners[event]) return
    this.listeners[event].forEach(callback => callback(data))
  }

  /**
   * Parse FEN to board array
   * @private
   */
  _fenToBoard(fen) {
    const parts = fen.split(' ')
    const position = parts[0]
    const ranks = position.split('/')

    if (ranks.length !== 8) return null

    const board = []

    // FEN lists ranks 8→1, but we need array indexed 0→7 where 0=rank1, 7=rank8
    for (let i = 0; i < 8; i++) {
      const rank = []
      const rankStr = ranks[7 - i]  // i=0 → ranks[7] (rank1), i=7 → ranks[0] (rank8)

      for (let j = 0; j < rankStr.length; j++) {
        const char = rankStr[j]

        if (char >= '1' && char <= '8') {
          const emptyCount = parseInt(char)
          for (let k = 0; k < emptyCount; k++) {
            rank.push(null)
          }
        } else {
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
   * Create piece entity
   * @private
   */
  _createPiece(square, type, color) {
    const position = this.mapper.squareToPosition(square)
    if (!position) return

    const template = this.pieceTemplates[type]
    if (!template) return

    const entity = document.createElement('a-entity')
    entity.setAttribute('class', `chess-piece ${color}-${type}`)
    entity.setAttribute('data-square', square)
    entity.setAttribute('data-piece-type', type)
    entity.setAttribute('data-piece-color', color)

    entity.setAttribute('position', {
      x: position.x,
      y: this.config.pieceHeight,
      z: position.z
    })

    entity.setAttribute('scale', {
      x: this.config.pieceScale,
      y: this.config.pieceScale,
      z: this.config.pieceScale
    })

    entity.setAttribute('shadow', 'cast: true')
    entity.setAttribute('hoverable', '')
    entity.setAttribute('grabbable', '')
    entity.setAttribute('stretchable', '')
    entity.setAttribute('draggable', '')
    entity.setAttribute('droppable', '')

    const clonedPiece = template.clone()
    this._applyPieceColor(clonedPiece, color)
    this._centerPiece(clonedPiece)

    // Attach interaction
    this._attachInteractionListeners(entity, square)

    entity.addEventListener('loaded', () => {
      entity.object3D.add(clonedPiece)
    })

    const chessBoard = this.scene.querySelector('#chessBoard')
    chessBoard.appendChild(entity)
    this.pieces.set(square, entity)
  }

  /**
   * Clear all pieces
   * @private
   */
  _clearPieces() {
    for (const [, entity] of this.pieces.entries()) {
      if (entity.parentNode) {
        entity.parentNode.removeChild(entity)
      }
    }
    this.pieces.clear()
  }

  /**
   * Apply color to piece
   * @private
   */
  _applyPieceColor(model, color) {
    model.traverse(child => {
      if (child.isMesh && (child.name || '').includes('Plastic')) {
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
      } else if (child.isMesh) {
        child.visible = false
      }
    })
  }

  /**
   * Center piece model
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
   * Attach drag listeners
   * @private
   */
  _attachInteractionListeners(entity, square) {
    let dragStart = square

    entity.addEventListener('dragstart', () => {
      dragStart = square
    })

    entity.addEventListener('dragend', () => {
      const obj = entity.object3D
      const worldPos = new THREE.Vector3()
      obj.getWorldPosition(worldPos)

      const targetSquare = this.mapper.positionToSquare(worldPos.x, worldPos.z)

      if (targetSquare && targetSquare !== dragStart) {
        // Emit move event - external logic decides if valid
        this._emit('move', {
          from: dragStart,
          to: targetSquare,
          fen: this.currentFen
        })
      } else {
        // Return to original position
        const originalPos = this.mapper.squareToPosition(dragStart)
        entity.setAttribute('position', {
          x: originalPos.x,
          y: this.config.pieceHeight,
          z: originalPos.z
        })
      }
    })
  }
}
