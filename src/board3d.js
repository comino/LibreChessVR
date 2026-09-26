// 3D chess board for WebXR. Dumb view: takes FEN, emits onMove(from, to, promotion).
// Input: controller ray / mouse (select piece, then target), pinch-grab with tracked
// hands, fingertip poke on the button bar. Pawn moves to the last rank open a Q/R/B/N picker.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { squareToXZ, xzToSquare, parseFen } from './coords.js'
import { StatusPanel, ButtonBar } from './panel.js'
import { playCue, buzz } from './feedback.js'

const SQUARE = 0.06                      // 6cm squares -> 48cm board, tournament-ish size
const BOARD_POS = new THREE.Vector3(0, 0.73, -0.45)
const NODE_MAP = { Pawn: 'p', Queen: 'q', King: 'k', Rook: 'r', Knight: 'n', Bishop: 'b' }
const TILE = { light: 0xd9c49a, dark: 0x77502e }
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3()
const TINT = { select: 0x8a7a1a, target: 0x1a6a2a, last: 0x1a3a6a }
const PICKER_Y = 0.115   // promotion picker floats above the tallest piece (king ≈ 0.10)

export class Board3D {
  onMove = null              // (from, to, promotion?) =>
  getTargets = () => []      // square => [squares], set by game logic
  canPick = () => false      // square => bool, set by game logic
  handMode = 'ray'           // 'ray' = point & pinch, 'grab' = pinch-grab pieces

  async init() {
    this._scene()
    this._board()
    await this._loadPieces()
    this._ui()
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
    const before = this.piecesGroup.children.length
    this._removePicker()
    this.piecesGroup.clear()
    this.pieceAt = {}
    this.anim = null
    this.grab = null
    for (const p of parseFen(fen)) {
      const piece = this._makePiece(p.type, p.color)
      const { x, z } = squareToXZ(p.square, SQUARE)
      piece.position.set(x, 0.005, z)
      Object.assign(piece.userData, { square: p.square, type: p.type, color: p.color })
      this.pieceAt[p.square] = piece
      this.piecesGroup.add(piece)
    }
    this.selected = null
    this.lastMove = lastMove
    this._applyTints()
    if (lastMove) this.cue(this.piecesGroup.children.length < before ? 'capture' : 'move')
    if (lastMove && this.pieceAt[lastMove.to]) {
      const from = squareToXZ(lastMove.from, SQUARE)
      const to = squareToXZ(lastMove.to, SQUARE)
      this.anim = { obj: this.pieceAt[lastMove.to], from, to, t0: performance.now() }
      this.anim.obj.position.set(from.x, 0.005, from.z)
    }
  }

  // state: see StatusPanel.set, plus actions: [{label, run, confirm?}] for the button bar
  setStatus(state) {
    this.panel.set(state)
    this.bar.set(state.actions)
  }

  cue(kind) { playCue(kind) }

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
    const from = this.selected
    const move = from && this.targets.includes(square)
    this.selected = !move && square && square !== from && this.canPick(square) ? square : null
    if (this.selected) this.targets = this.getTargets(square)
    this._applyTints()
    if (move || this.selected) buzz(this.source)
    if (move) this._emitMove(from, square)
  }

  _emitMove(from, to) {
    const p = this.pieceAt[from]?.userData
    if (p?.type === 'p' && (to[1] === '8' || to[1] === '1')) this._openPicker(from, to)
    else this.onMove?.(from, to)
  }

  // --- promotion picker: Q/R/B/N floating in a row over the promotion rank ---

  _openPicker(from, to) {
    const color = this.pieceAt[from].userData.color
    // 4 files around the target, clamped to the board; Q leftmost from the mover's side
    const start = Math.min(Math.max('abcdefgh'.indexOf(to[0]) - 1, 0), 4)
    const group = new THREE.Group()
    const discMat = new THREE.MeshBasicMaterial({ color: TINT.target, transparent: true, opacity: 0.85 })
    for (const [i, type] of [...'qrbn'].entries()) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.48 * SQUARE, 24), discMat)
      disc.rotation.x = -Math.PI / 2
      const slot = new THREE.Group()
      slot.add(disc, this._makePiece(type, color))
      const file = 'abcdefgh'[color === 'w' ? start + i : start + 3 - i]
      const { x, z } = squareToXZ(file + to[1], SQUARE)
      slot.position.set(x, PICKER_Y, z)
      slot.userData.promo = type
      group.add(slot)
    }
    this.picker = { from, to, group }
    this.boardGroup.add(group)
  }

  // promo = chosen piece type, or null to cancel (the pawn returns home).
  _closePicker(promo) {
    const { from, to } = this.picker
    this._removePicker()
    if (promo) return this.onMove?.(from, to, promo)
    const home = squareToXZ(from, SQUARE)
    this.pieceAt[from]?.position.set(home.x, 0.005, home.z)
  }

  _removePicker() {
    if (this.picker) this.boardGroup.remove(this.picker.group)
    this.picker = null
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
        ctrl.userData.source = e.data
        this._updateLines()
      })
      ctrl.addEventListener('selectstart', () => {
        if (this.handMode === 'grab' && ctrl.userData.isHand) return // pinch-grab handles it
        this.source = ctrl.userData.source
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
    this.hands = []
    const handFactory = new XRHandModelFactory()
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i)
      hand.add(handFactory.createHandModel(hand, 'mesh'))
      hand.addEventListener('pinchstart', () => this._grabStart(hand))
      hand.addEventListener('pinchend', () => this._grabEnd(hand))
      this.scene.add(hand)
      this.hands.push(hand)
    }

    // A click that ends an orbit drag is not a pick.
    const dom = this.renderer.domElement
    let down = null
    dom.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY] })
    dom.addEventListener('click', e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
      this.source = null
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
    if (this.picker) return this._closePicker(this._nearestPromo(local))
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

  _nearestPromo(local) {
    let best = null, bestD = 0.8 * SQUARE
    for (const slot of this.picker.group.children) {
      const { x, y, z } = slot.position
      const d = Math.hypot(x - local.x, y + 0.03 - local.y, z - local.z) // aim at the piece body
      if (d < bestD) [best, bestD] = [slot.userData.promo, d]
    }
    return best
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
    if (legal) this._emitMove(from, sq)
  }

  // Resolves the current raycaster ray: picker first, then button bar, then board.
  _pick() {
    if (this.picker) return this._closePicker(this._hit(this.picker.group.children, 'promo'))
    const h = this.bar.mesh.visible && this.raycaster.intersectObject(this.bar.mesh)[0]
    if (h && this.bar.press(h.uv.x, h.uv.y)) return buzz(this.source)
    this._select(this._hit([...Object.values(this.tiles), ...this.piecesGroup.children], 'square'))
  }

  // userData[key] of the nearest hit object or its ancestors, else null.
  _hit(objs, key) {
    for (const h of this.raycaster.intersectObjects(objs, true))
      for (let o = h.object; o; o = o.parent) if (o.userData[key]) return o.userData[key]
    return null
  }

  // --- in-scene UI ---

  _ui() {
    this.panel = new StatusPanel()
    this.panel.mesh.position.set(0, 1.25, BOARD_POS.z - 0.5)
    this.panel.mesh.rotation.x = -0.15
    // Button bar right of the board, within arm's reach, turned toward the player.
    this.bar = new ButtonBar()
    this.bar.mesh.position.set(0.4, 0.86, -0.34)
    this.bar.mesh.rotation.set(-0.5, -0.9, 0, 'YXZ')
    this.scene.add(this.panel.mesh, this.bar.mesh)
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
    this.hands.forEach((hand, i) => {
      const tip = hand.joints['index-finger-tip']
      this.bar.poke(tip?.visible ? tip.getWorldPosition(_vC) : null, i)
    })
    this.panel.tick()
    this.bar.tick()
    this.renderer.render(this.scene, this.camera)
  }
}
