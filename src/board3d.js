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
const _m = new THREE.Matrix4()
const TINT = { select: 0x8a7a1a, target: 0x1a6a2a, last: 0x1a3a6a, check: 0x9a1a1a }
const HOVER = new THREE.Color(0x303030)   // added on top of the tile's tint
const RAY_LEN = 1.5
const HEIGHT_RANGE = 0.45, HEIGHT_SPEED = 0.25 // table offset limit (m), m/s at full stick
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false })
const PICKER_Y = 0.115   // promotion picker floats above the tallest piece (king ≈ 0.10)

export class Board3D {
  onMove = null              // (from, to, promotion?) =>
  getTargets = () => []      // square => [squares], set by game logic
  canPick = () => false      // square => bool, set by game logic
  checkSquare = () => null   // () => square of the king in check, set by game logic
  onSquarePick = null        // square => ; when set, any square pick goes here (trainer)
  marks = {}                 // square -> tint hex, see setMarks
  handMode = 'ray'           // 'ray' = point & pinch, 'grab' = pinch-grab pieces
  onHeightChange = null      // (offset) => after a thumbstick height adjustment ends

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

    // Stage = table + board + panel + bar, raised/lowered together (setHeight).
    // The table reaches below the floor so it never floats when raised.
    this.stage = new THREE.Group()
    this.scene.add(this.stage)
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.44, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x4a3628, roughness: 0.8 }))
    table.position.set(BOARD_POS.x, 0, BOARD_POS.z)
    table.receiveShadow = true
    this.stage.add(table)

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(innerWidth, innerHeight)
    })
  }

  _board() {
    this.boardGroup = new THREE.Group()
    this.boardGroup.position.copy(BOARD_POS)
    this.stage.add(this.boardGroup)

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
    // Invisible cylinder used for ray hits: cheap per-frame hover, easy to hit.
    const h = box.max.y - box.min.y, r = 0.42 * SQUARE / this.pieceScale
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), PROXY_MAT)
    proxy.position.y = h / 2
    const group = new THREE.Group()
    group.add(inner, proxy)
    group.userData.proxy = proxy
    group.scale.setScalar(this.pieceScale)
    return group
  }

  // --- public API ---

  // Table height offset from the default (m), clamped.
  setHeight(offset) {
    this.stage.position.y = THREE.MathUtils.clamp(offset, -HEIGHT_RANGE, HEIGHT_RANGE)
  }

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
      piece.userData.proxy.userData.square = p.square
      this.pieceAt[p.square] = piece
      this.piecesGroup.add(piece)
    }
    this.selected = null
    this.lastMove = lastMove
    this.check = this.checkSquare()
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

  // Extra square tints owned by a session, e.g. {e4: 0x1a6a2a}; {} clears.
  setMarks(marks) {
    this.marks = marks
    this._applyTints()
  }

  // --- selection & tints ---

  _applyTints() {
    const tint = (sq, hex) => this.tiles[sq]?.material.emissive.setHex(hex)
    for (const sq in this.tiles) tint(sq, 0)
    if (this.lastMove) for (const sq of [this.lastMove.from, this.lastMove.to]) tint(sq, TINT.last)
    if (this.check) tint(this.check, TINT.check)
    for (const sq in this.marks) tint(sq, this.marks[sq])
    if (this.selected) {
      tint(this.selected, TINT.select)
      for (const sq of this.targets) tint(sq, TINT.target)
    }
    for (const sq of new Set(Object.values(this.hover)))
      this.tiles[sq]?.material.emissive.add(HOVER)
  }

  // key: 'mouse' | 'c0' | 'c1' | 'grab'; square or null. Retints only on change.
  _setHover(key, square) {
    if ((this.hover[key] ?? null) === (square ?? null)) return
    if (square) this.hover[key] = square
    else delete this.hover[key]
    this._applyTints()
  }

  _select(square) {
    if (this.onSquarePick) {
      if (!square) return
      buzz(this.source)
      return this.onSquarePick(square)
    }
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
    this.hover = {}

    this.controllers = []
    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i)
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x8899bb }))
      line.scale.z = RAY_LEN
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xe8e2d0 }))
      dot.visible = false
      ctrl.add(line, dot)
      ctrl.addEventListener('connected', e => {
        ctrl.userData.isHand = !!e.data?.hand
        ctrl.userData.source = e.data
        this._updateLines()
      })
      ctrl.addEventListener('disconnected', () => { ctrl.userData.source = null })
      ctrl.addEventListener('selectstart', () => {
        if (this.handMode === 'grab' && ctrl.userData.isHand) return // pinch-grab handles it
        this.source = ctrl.userData.source
        this._rayFrom(ctrl)
        this._pick()
      })
      this.scene.add(ctrl)
      this.controllers.push({ ctrl, line, dot })
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
    const mouseRay = e => this.raycaster.setFromCamera(new THREE.Vector2(
      (e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera)
    dom.addEventListener('click', e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
      this.source = null
      mouseRay(e)
      this._pick()
    })
    dom.addEventListener('pointermove', e => {
      mouseRay(e)
      this._hoverRay('mouse')
    })
  }

  _rayFrom(obj) {
    _m.identity().extractRotation(obj.matrixWorld)
    this.raycaster.ray.origin.setFromMatrixPosition(obj.matrixWorld)
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_m)
  }

  setHandMode(mode) {
    this.handMode = mode
    this._updateLines()
  }

  // Rays end at what they hit (with a dot); the square/button under them lights up.
  _controllerHover() {
    this.controllers.forEach(({ ctrl, line, dot }, i) => {
      const key = 'c' + i
      let dist
      if (line.visible && ctrl.visible) {
        this._rayFrom(ctrl)
        dist = this._hoverRay(key)
      } else {
        this._setHover(key, null)
        this.bar.hover(key, null)
      }
      line.scale.z = dist ?? RAY_LEN
      dot.visible = dist !== undefined
      dot.position.z = -(dist ?? 0)
    })
  }

  // Thumbstick forward/back on either controller raises/lowers the table.
  _thumbstick(dt) {
    let v = 0
    for (const { ctrl } of this.controllers) {
      const y = ctrl.userData.source?.gamepad?.axes?.[3] ?? 0 // xr-standard: [2,3] = stick
      if (Math.abs(y) > 0.3) v -= y                           // forward is negative
    }
    if (v) this.setHeight(this.stage.position.y + v * HEIGHT_SPEED * dt)
    else if (this.adjusting) this.onHeightChange?.(this.stage.position.y)
    this.adjusting = !!v
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
    if (this.onSquarePick) {
      const sq = xzToSquare(local.x, local.z, SQUARE)
      return sq && this.onSquarePick(sq)
    }
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
    delete this.hover.grab
    this.selected = null
    const sq = xzToSquare(piece.position.x, piece.position.z, SQUARE)
    const legal = !cancel && sq && sq !== from && this.targets.includes(sq)
    const { x, z } = squareToXZ(legal ? sq : from, SQUARE)
    piece.position.set(x, 0.005, z)
    this._applyTints()
    if (legal) this._emitMove(from, sq)
  }

  // Nearest interactive object on the current ray, using the cheap piece proxies:
  // {promo} while the picker is open, else {uv} on the button bar or {square}; null = miss.
  _cast() {
    const proxies = group => group.children.map(g => g.userData.proxy ?? g.children[1].userData.proxy)
    const objs = this.picker ? proxies(this.picker.group)
      : [...Object.values(this.tiles), ...proxies(this.piecesGroup), ...(this.bar.mesh.visible ? [this.bar.mesh] : [])]
    const h = this.raycaster.intersectObjects(objs, false)[0]
    if (!h) return null
    const hit = { dist: h.distance }
    if (h.object === this.bar.mesh) hit.uv = h.uv
    else if (this.picker) hit.promo = h.object.parent.parent.userData.promo
    else hit.square = h.object.userData.square
    return hit
  }

  // Acts on the current ray: picker choice (a miss cancels), bar button, or square.
  _pick() {
    const hit = this._cast()
    if (this.picker) return this._closePicker(hit?.promo ?? null)
    if (hit?.uv) return this.bar.press(hit.uv.x, hit.uv.y) && buzz(this.source)
    this._select(hit?.square ?? null)
  }

  // Hover feedback for one pointer; returns the hit distance (for the ray length).
  _hoverRay(key) {
    const hit = this._cast()
    this._setHover(key, hit?.square)
    this.bar.hover(key, hit?.uv)
    return hit?.dist
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
    this.stage.add(this.panel.mesh, this.bar.mesh)
  }

  // --- frame loop ---

  _tick() {
    const now = performance.now(), dt = Math.min(0.1, (now - (this.lastTick ?? now)) / 1000)
    this.lastTick = now
    const xr = this.renderer.xr.isPresenting
    if (!xr) this.controls.update()
    if (xr) this._controllerHover()
    this._thumbstick(dt)
    if (this.grab) {
      const p = this._pinchPos(this.grab.hand)
      if (!p) this._drop(true) // tracking lost -> piece returns home
      else {
        const local = this.boardGroup.worldToLocal(p)
        this.grab.piece.position.set(local.x, Math.max(0.01, local.y - 0.02), local.z)
        this._setHover('grab', xzToSquare(local.x, local.z, SQUARE))
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
