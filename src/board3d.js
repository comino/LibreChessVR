// 3D chess board for WebXR. Dumb view: takes FEN, emits {from, to} via onMove.
// Interaction: point (controller ray or mouse) + select a piece, then a target square.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { squareToXZ, xzToSquare, parseFen } from './coords.js'

const SQUARE = 0.06                      // 6cm squares -> 48cm board, tournament-ish size
const BOARD_POS = new THREE.Vector3(0, 0.73, -0.45)
const NODE_MAP = { Pawn: 'p', Queen: 'q', King: 'k', Rook: 'r', Knight: 'n', Bishop: 'b' }
const TILE = { light: 0xd9c49a, dark: 0x77502e }
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3()
const TINT = { select: 0x8a7a1a, target: 0x1a6a2a, last: 0x1a3a6a }

export class Board3D {
  onMove = null              // (from, to) =>
  getTargets = () => []      // square => [squares], set by game logic
  canPick = () => false      // square => bool, set by game logic
  handMode = 'ray'           // 'ray' = point & pinch, 'grab' = pinch-grab pieces

  async init() {
    this._scene()
    this._board()
    await this._loadPieces()
    this._panelInit()
    this._input()
    this.renderer.setAnimationLoop(() => this._tick())
  }

  _scene() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.setPixelRatio(devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.xr.enabled = true
    document.body.appendChild(this.renderer.domElement)
    document.body.appendChild(VRButton.createButton(this.renderer))

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1b2028)
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50)
    this.camera.position.set(0, 1.35, 0.15)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.copy(BOARD_POS)
    this.controls.enableDamping = true

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 2.0)
    sun.position.set(0.8, 2.5, 0.5)
    sun.castShadow = true
    sun.shadow.camera.left = sun.shadow.camera.bottom = -0.6
    sun.shadow.camera.right = sun.shadow.camera.top = 0.6
    sun.shadow.mapSize.set(1024, 1024)
    this.scene.add(sun)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.9 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.72, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x4a3628, roughness: 0.8 }))
    table.position.set(BOARD_POS.x, 0.36, BOARD_POS.z)
    table.receiveShadow = true
    this.scene.add(table)

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(innerWidth, innerHeight)
    })
  }

  _board() {
    this.boardGroup = new THREE.Group()
    this.boardGroup.position.copy(BOARD_POS)
    this.scene.add(this.boardGroup)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8 * SQUARE + 0.05, 0.015, 8 * SQUARE + 0.05),
      new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 0.7 }))
    base.position.y = -0.008
    base.receiveShadow = true
    this.boardGroup.add(base)

    this.tiles = {}
    const tileGeo = new THREE.BoxGeometry(SQUARE, 0.01, SQUARE)
    for (const f of 'abcdefgh') for (let r = 1; r <= 8; r++) {
      const sq = f + r
      const light = ('abcdefgh'.indexOf(f) + r) % 2 === 0  // a1 (0+1) is dark
      const tile = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({
        color: light ? TILE.light : TILE.dark, roughness: 0.5
      }))
      const { x, z } = squareToXZ(sq, SQUARE)
      tile.position.set(x, 0, z)
      tile.receiveShadow = true
      tile.userData.square = sq
      this.tiles[sq] = tile
      this.boardGroup.add(tile)
    }

    // Coordinate labels on all four edges (sprites always face the viewer)
    for (let i = 0; i < 8; i++) {
      const off = 4.1 * SQUARE, at = (i - 3.5) * SQUARE
      for (const s of [1, -1]) {
        this.boardGroup.add(this._label('abcdefgh'[i], at, off * s))
        this.boardGroup.add(this._label(String(i + 1), off * s, -at))
      }
    }

    this.piecesGroup = new THREE.Group()
    this.boardGroup.add(this.piecesGroup)
    this.pieceAt = {}
    this.selected = null
    this.lastMove = null
  }

  _label(text, x, z) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#cbb894'
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, 34)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
    sp.scale.setScalar(0.035)
    sp.position.set(x, 0.02, z)
    return sp
  }

  async _loadPieces() {
    const gltf = await new GLTFLoader().loadAsync('assets/chess.glb')
    gltf.scene.updateMatrixWorld(true)
    this.templates = {}
    gltf.scene.traverse(n => {
      if (!NODE_MAP[n.name]) return
      const t = n.clone()
      n.matrixWorld.decompose(t.position, t.quaternion, t.scale) // bake ancestor transforms
      this.templates[NODE_MAP[n.name]] = t
    })
    const missing = 'pnbrqk'.split('').filter(t => !this.templates[t])
    if (missing.length) throw new Error('Model missing pieces: ' + missing)
    const kingH = new THREE.Box3().setFromObject(this.templates.k).getSize(new THREE.Vector3()).y
    this.pieceScale = (1.7 * SQUARE) / kingH
  }

  _makePiece(type, color) {
    const mat = new THREE.MeshStandardMaterial({
      color: color === 'w' ? 0xf2ead8 : 0x3b3630, roughness: 0.35, metalness: 0.05,
      side: THREE.DoubleSide // piece shells are open at the base (felt mesh is hidden)
    })
    const inner = this.templates[type].clone()
    let anyPlastic = false
    inner.traverse(m => { if (m.isMesh && m.name.includes('Plastic')) anyPlastic = true })
    inner.traverse(m => {
      if (!m.isMesh) return
      m.visible = !anyPlastic || m.name.includes('Plastic')
      m.material = mat
      m.castShadow = true
    })
    const box = new THREE.Box3().setFromObject(inner)
    const c = box.getCenter(new THREE.Vector3())
    inner.position.x -= c.x
    inner.position.y -= box.min.y
    inner.position.z -= c.z
    const group = new THREE.Group()
    group.add(inner)
    group.scale.setScalar(this.pieceScale)
    return group
  }

  // --- public API ---

  setOrientation(color) {
    this.boardGroup.rotation.y = color === 'black' ? Math.PI : 0
  }

  setPosition(fen, lastMove = null) {
    this.piecesGroup.clear()
    this.pieceAt = {}
    this.anim = null
    this.grab = null
    for (const p of parseFen(fen)) {
      const piece = this._makePiece(p.type, p.color)
      const { x, z } = squareToXZ(p.square, SQUARE)
      piece.position.set(x, 0.005, z)
      piece.userData.square = p.square
      this.pieceAt[p.square] = piece
      this.piecesGroup.add(piece)
    }
    this.selected = null
    this.lastMove = lastMove
    this._applyTints()
    if (lastMove && this.pieceAt[lastMove.to]) {
      const from = squareToXZ(lastMove.from, SQUARE)
      const to = squareToXZ(lastMove.to, SQUARE)
      this.anim = { obj: this.pieceAt[lastMove.to], from, to, t0: performance.now() }
      this.anim.obj.position.set(from.x, 0.005, from.z)
    }
  }

  // state: {names:{white,black}, myColor, wtime, btime, turn, running, text}
  setStatus(state) {
    this.status = { ...state, ts: performance.now() }
    this._panelDraw()
  }

  // --- selection & tints ---

  _applyTints() {
    for (const sq in this.tiles) this.tiles[sq].material.emissive.setHex(0)
    if (this.lastMove) for (const sq of [this.lastMove.from, this.lastMove.to])
      this.tiles[sq]?.material.emissive.setHex(TINT.last)
    if (this.selected) {
      this.tiles[this.selected].material.emissive.setHex(TINT.select)
      for (const sq of this.targets) this.tiles[sq].material.emissive.setHex(TINT.target)
    }
  }

  _select(square) {
    if (this.selected && square === this.selected) {
      this.selected = null
    } else if (this.selected && this.targets.includes(square)) {
      const from = this.selected
      this.selected = null
      this.onMove?.(from, square)
    } else if (this.canPick(square)) {
      this.selected = square
      this.targets = this.getTargets(square)
    } else {
      this.selected = null
    }
    this._applyTints()
  }

  // --- input ---

  _input() {
    this.raycaster = new THREE.Raycaster()
    const tmpMat = new THREE.Matrix4()

    this.controllers = []
    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i)
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x8899bb }))
      line.scale.z = 1.5
      ctrl.add(line)
      ctrl.addEventListener('connected', e => {
        ctrl.userData.isHand = !!e.data?.hand
        this._updateLines()
      })
      ctrl.addEventListener('selectstart', () => {
        if (this.handMode === 'grab' && ctrl.userData.isHand) return // pinch-grab handles it
        tmpMat.identity().extractRotation(ctrl.matrixWorld)
        this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld)
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat)
        this._pick()
      })
      this.scene.add(ctrl)
      this.controllers.push({ ctrl, line })
    }

    // Tracked hands: rendered meshes; pinch fires selectstart on the controller
    // groups above (ray mode), or grabs the nearest piece directly (grab mode).
    this.grab = null
    const handFactory = new XRHandModelFactory()
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i)
      hand.add(handFactory.createHandModel(hand, 'mesh'))
      hand.addEventListener('pinchstart', () => this._grabStart(hand))
      hand.addEventListener('pinchend', () => this._grabEnd(hand))
      this.scene.add(hand)
    }

    this.renderer.domElement.addEventListener('click', e => {
      const ndc = new THREE.Vector2(
        (e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
      this.raycaster.setFromCamera(ndc, this.camera)
      this._pick()
    })
  }

  setHandMode(mode) {
    this.handMode = mode
    this._updateLines()
  }

  _updateLines() {
    for (const { ctrl, line } of this.controllers)
      line.visible = !(this.handMode === 'grab' && ctrl.userData.isHand)
  }

  // --- hand grab ---

  // Pinch point = midpoint of thumb and index tips; null while tracking is lost.
  _pinchPos(hand) {
    const tip = hand.joints['index-finger-tip'], thumb = hand.joints['thumb-tip']
    if (!tip?.visible || !thumb?.visible) return null
    return tip.getWorldPosition(_vA).add(thumb.getWorldPosition(_vB)).multiplyScalar(0.5)
  }

  _grabStart(hand) {
    if (this.handMode !== 'grab' || this.grab) return
    const p = this._pinchPos(hand)
    if (!p) return
    const local = this.boardGroup.worldToLocal(p.clone())
    if (local.y < -0.02 || local.y > 0.18) return
    let best = null
    for (const sq in this.pieceAt) {
      if (!this.canPick(sq)) continue
      const pos = this.pieceAt[sq].position
      const d = Math.hypot(pos.x - local.x, pos.z - local.z)
      if (d < 0.7 * SQUARE && (!best || d < best.d)) best = { sq, d }
    }
    if (!best) return
    this.grab = { hand, piece: this.pieceAt[best.sq], from: best.sq }
    this.selected = best.sq
    this.targets = this.getTargets(best.sq)
    this._applyTints()
  }

  _grabEnd(hand) {
    if (this.grab?.hand === hand) this._drop()
  }

  _drop(cancel = false) {
    const { piece, from } = this.grab
    this.grab = null
    this.selected = null
    const sq = xzToSquare(piece.position.x, piece.position.z, SQUARE)
    const legal = !cancel && sq && sq !== from && this.targets.includes(sq)
    const { x, z } = squareToXZ(legal ? sq : from, SQUARE)
    piece.position.set(x, 0.005, z)
    this._applyTints()
    if (legal) this.onMove?.(from, sq)
  }

  _pick() {
    const objs = [...Object.values(this.tiles), ...this.piecesGroup.children]
    const hits = this.raycaster.intersectObjects(objs, true)
    for (const h of hits) {
      let o = h.object
      while (o && !o.userData.square) o = o.parent
      if (o) return this._select(o.userData.square)
    }
    this.selected = null
    this._applyTints()
  }

  // --- status panel ---

  _panelInit() {
    this.panelCanvas = document.createElement('canvas')
    this.panelCanvas.width = 512
    this.panelCanvas.height = 256
    this.panelTex = new THREE.CanvasTexture(this.panelCanvas)
    this.panelTex.colorSpace = THREE.SRGBColorSpace
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true }))
    panel.position.set(0, 1.25, BOARD_POS.z - 0.5)
    panel.rotation.x = -0.15
    this.scene.add(panel)
    this.status = null
    this._panelDraw()
  }

  _panelDraw() {
    const ctx = this.panelCanvas.getContext('2d')
    ctx.clearRect(0, 0, 512, 256)
    ctx.fillStyle = 'rgba(15,18,24,0.85)'
    ctx.beginPath()
    ctx.roundRect(0, 0, 512, 256, 24)
    ctx.fill()
    const s = this.status
    if (!s) {
      ctx.fillStyle = '#8899aa'
      ctx.font = '32px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No game', 256, 140)
      this.panelTex.needsUpdate = true
      return
    }
    if (s.puzzle) {
      ctx.fillStyle = '#c8ccd4'
      ctx.font = '32px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(s.text || '', 256, 118)
      ctx.fillStyle = '#8899aa'
      ctx.font = '24px sans-serif'
      ctx.fillText(s.sub || '', 256, 168)
      this.panelTex.needsUpdate = true
      return
    }
    const elapsed = s.running ? performance.now() - s.ts : 0
    const live = c => Math.max(0, (c === 'w' ? s.wtime : s.btime) - (s.turn === c ? elapsed : 0))
    const fmt = ms => {
      const t = Math.ceil(ms / 1000)
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
    }
    const opp = s.myColor === 'white' ? 'b' : 'w'
    const me = s.myColor[0]
    const row = (y, c) => {
      const active = s.turn === c && s.running
      ctx.fillStyle = active ? '#e8d44a' : '#c8ccd4'
      ctx.font = '34px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(s.names[c === 'w' ? 'white' : 'black'], 30, y)
      ctx.textAlign = 'right'
      ctx.font = 'bold 40px monospace'
      ctx.fillText(fmt(live(c)), 482, y)
    }
    row(60, opp)
    row(225, me)
    ctx.fillStyle = '#8899aa'
    ctx.font = '26px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(s.text || '', 256, 143)
    this.panelTex.needsUpdate = true
  }

  // --- frame loop ---

  _tick() {
    if (!this.renderer.xr.isPresenting) this.controls.update()
    if (this.grab) {
      const p = this._pinchPos(this.grab.hand)
      if (!p) this._drop(true) // tracking lost -> piece returns home
      else {
        const local = this.boardGroup.worldToLocal(p)
        this.grab.piece.position.set(local.x, Math.max(0.01, local.y - 0.02), local.z)
      }
    }
    if (this.anim) {
      const k = Math.min(1, (performance.now() - this.anim.t0) / 300)
      const e = k * (2 - k)
      const { obj, from, to } = this.anim
      obj.position.set(
        from.x + (to.x - from.x) * e,
        0.005 + Math.sin(Math.PI * e) * 0.03,
        from.z + (to.z - from.z) * e)
      if (k === 1) this.anim = null
    }
    if (this.status?.running && performance.now() - (this._clockDrawn || 0) > 500) {
      this._clockDrawn = performance.now()
      this._panelDraw()
    }
    this.renderer.render(this.scene, this.camera)
  }
}
