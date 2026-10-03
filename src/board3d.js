// 3D chess board for WebXR. Dumb view: takes FEN, emits onMove(from, to, promotion).
// Input: controller ray / mouse (select piece, then target), pinch-grab with tracked
// hands, fingertip poke on the button bar. Pawn moves to the last rank open a Q/R/B/N picker.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildEnvironment, disposeGroup, woodTexture } from './environments.js'
import { squareToXZ, xzToSquare, parseFen, captured } from './coords.js'
import { StatusPanel, ButtonBar } from './panel.js'
import { playCue, buzz } from './feedback.js'
import { TINT, TINT_MIX, BOARD, BOARD_THEMES, PIECE_THEMES, PIECE_DEFAULTS, PIECES, COLOR, FONT, DETAIL_KINDS } from './theme.js'
import { canvasTexture, rng, glow, blobTexture, shadowBlob } from './scenes/common.js'
import { moveToSpeech, speak } from './speech.js'

const SQUARE = 0.06                      // 6cm squares -> 48cm board, tournament-ish size
const BOARD_POS = new THREE.Vector3(0, 0.73, -0.45)
const NODE_TYPE = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3()
const _m = new THREE.Matrix4(), _tint = new THREE.Color(), _dummy = new THREE.Object3D(), _ray = new THREE.Ray()
const BANDS = 12                         // silhouette resolution for picking (height bands)
const HOVER = new THREE.Color(TINT.hover)   // added on top of the tile's tint
const RAY_LEN = 1.5
const GRAB_HOLD = 120, GRAB_GAP = 0.012 // pinch-grab: hold (ms) and max thumb-index gap (m)
const BAR_X = 0.4

// Piece surface detail, computed per pixel from the offset to the piece's own origin in world
// meters (upright, independent of the model's units): turned-lathe rings, wood grain,
// brushed metal, or glow bands sweeping up (neon). A few ALU ops on pieces only.
const PIECE_DETAIL = {
  vertex: ['#include <begin_vertex>', `#include <begin_vertex>
    vDetailP = (modelMatrix * vec4(position, 1.0)).xyz - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;`],
  color: ['#include <color_fragment>', `#include <color_fragment>
    float lathe = 0.5 + 0.5 * sin(vDetailP.y * 1900.0); // coarse enough not to shimmer in VR
    if (uDetail == 1) diffuseColor.rgb *= 0.965 + 0.035 * lathe;
    if (uDetail == 2) {
      float rad = length(vDetailP.xz) * 1400.0 + vDetailP.y * 180.0 + sin(vDetailP.y * 520.0) * 0.9;
      float ring = smoothstep(0.15, 0.95, 0.5 + 0.5 * sin(rad));
      float fiber = 0.5 + 0.5 * sin(vDetailP.y * 2400.0 + vDetailP.x * 900.0);
      diffuseColor.rgb *= 0.8 + 0.14 * ring + 0.06 * fiber;
    }`],
  roughness: ['#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    if (uDetail == 1) roughnessFactor *= 0.9 + 0.12 * lathe;
    if (uDetail == 3) roughnessFactor = clamp(roughnessFactor + 0.07 * sin(vDetailP.y * 2600.0), 0.06, 1.0);`],
  emissive: ['#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    if (uDetail == 4) totalEmissiveRadiance *= 0.55 + 0.9 * smoothstep(-0.3, 0.6, sin(vDetailP.y * 120.0 - uDetailTime * 2.2));`]
}
const BORDER = 0.036 // frame width around the squares (coordinates are printed on it)
const SESSION_INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] }
const HEIGHT_RANGE = 0.45, HEIGHT_SPEED = 0.25 // table offset limit (m), m/s at full stick
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false })
const DISC_GEO = new THREE.CircleGeometry(0.48 * SQUARE, 24)   // promotion picker slots
const DISC_MAT = new THREE.MeshBasicMaterial({ color: TINT.target, transparent: true, opacity: 0.85 })
const PICKER_Y = 0.115   // promotion picker floats above the tallest piece (king ≈ 0.10)

export class Board3D {
  onMove = null              // (from, to, promotion?) =>
  getTargets = () => []      // square => [squares], set by game logic
  canPick = () => false      // square => bool, set by game logic
  checkSquare = () => null   // () => square of the king in check, set by game logic
  onSquarePick = null        // square => ; when set, any square pick goes here (trainer)
  marks = {}                 // square -> tint hex, see setMarks
  handMode = 'ray'           // 'ray' = point & pinch, 'grab' = pinch-grab pieces
  resolution = 'native'      // VR render resolution: 'native' | 'normal' (see setResolution)
  boardScale = 1
  shadowsDirty = true
  pieceStyle = 'solid'
  voice = 'off'              // 'off' | 'opponent' | 'all': spoken moves
  flipped = false
  onHeightChange = null      // (offset) => after a thumbstick height adjustment ends

  async init() {
    this._scene()
    this.setEnvironment('minimal')
    this._board()
    await this._loadPieces()
    this._ui()
    this._input()
    this.setBoardTheme('walnut')
    this.setPieceTheme('antique')
    this._captureEnv()
    this.renderer.setAnimationLoop(() => this._tick())
  }

  _scene() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.setPixelRatio(devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.autoUpdate = false // re-rendered via shadowsDirty (see _tick)
    this.renderer.xr.enabled = true
    document.body.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50)
    this.camera.position.set(0.1, 1.45, 0.45) // desktop: board, panel and bar in view

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0.1, 0.88, -0.55)
    this.controls.enableDamping = true

    // Soft room reflections, used by the piece materials only (tiles stay matte).
    this.envMap = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture
    // Lights persist across environments (shadow map allocated once); setEnvironment tunes them.
    this.hemi = new THREE.HemisphereLight()
    this.sun = new THREE.DirectionalLight()
    this.sun.castShadow = true
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -0.7
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 0.7
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.01 // low sunset sun: avoid acne on the tiles
    this.sun.target.position.copy(BOARD_POS) // shadow frustum centered on the board
    this.lamp = new THREE.PointLight(0xffffff, 0, 6) // intensity 0 in scenes without a lamp
    this.scene.add(this.hemi, this.lamp)

    // Stage = table + board + panel + bar, raised/lowered together (setHeight).
    // The table reaches below the floor so it never floats when raised.
    this.stage = new THREE.Group()
    this.scene.add(this.stage)
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.44, 0.75),
      new THREE.MeshStandardMaterial({ map: woodTexture(COLOR.walnut, 'rgba(20,10,4,0.4)', 2), roughness: 0.7 }))
    table.position.set(BOARD_POS.x, 0, BOARD_POS.z)
    table.receiveShadow = true
    this.stage.add(table)
    this.table = table
    // soft shadow of the table on the floor (in the scene: the floor doesn't move with the stage)
    this.tableShadow = shadowBlob(1.25, 1.25, [BOARD_POS.x, BOARD_POS.z], 0.9, 0.014) // above rugs
    this.scene.add(this.tableShadow)
    this.stage.add(this.sun, this.sun.target) // shadows follow the table height

    addEventListener('resize', () => this._resize())
  }

  _board() {
    this.boardGroup = new THREE.Group()
    this.boardGroup.position.copy(BOARD_POS)
    this.stage.add(this.boardGroup)

    const base = this.frame = new THREE.Mesh(
      new THREE.BoxGeometry(8 * SQUARE + 2 * BORDER, 0.015, 8 * SQUARE + 2 * BORDER),
      new THREE.MeshStandardMaterial({ color: BOARD.frame, roughness: 0.7 }))
    base.position.y = -0.008
    base.receiveShadow = true
    this.boardGroup.add(base)

    this.tiles = {}
    const tileGeo = new THREE.BoxGeometry(SQUARE, 0.01, SQUARE)
    for (const f of 'abcdefgh') for (let r = 1; r <= 8; r++) {
      const sq = f + r
      const light = ('abcdefgh'.indexOf(f) + r) % 2 === 0  // a1 (0+1) is dark
      const tile = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({
        color: light ? BOARD.light : BOARD.dark, roughness: 0.5
      }))
      tile.userData.light = light
      const { x, z } = squareToXZ(sq, SQUARE)
      tile.position.set(x, 0, z)
      tile.receiveShadow = true
      tile.userData.square = sq
      tile.userData.base = tile.material.color.clone()
      this.tiles[sq] = tile
      this.boardGroup.add(tile)
    }

    this.boardGroup.add(this._coordinates())

    this.piecesGroup = new THREE.Group()
    this.capturedGroup = new THREE.Group() // not pickable: outside piecesGroup
    this.boardGroup.add(this.piecesGroup, this.capturedGroup)
    // contact shadows: one instanced draw for every piece on and beside the board
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    this.contacts = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2
    }), 64)
    this.contacts.count = 0
    this.boardGroup.add(this.contacts)
    this.pieceAt = {}
    this.selected = null
    this.lastMove = null
  }

  // Coordinates printed on the frame like a tournament board: white's edges read upright from
  // white's seat, the far edges are turned to face black (so flips and black games stay readable).
  // One canvas texture on a plane just above the frame; tinted per board theme.
  _coordinates() {
    const W = 8 * SQUARE + 2 * BORDER, N = 1024, px = v => (v / W + 0.5) * N
    const edge = 4 * SQUARE + BORDER / 2
    const tex = canvasTexture(N, N, ctx => {
      ctx.fillStyle = '#ffffff'
      ctx.font = `600 ${Math.round(0.019 / W * N)}px ${FONT.ui}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const put = (text, x, z, flip) => {
        ctx.save()
        ctx.translate(px(x), px(z))
        if (flip) ctx.rotate(Math.PI)
        ctx.fillText(text, 0, 0)
        ctx.restore()
      }
      for (let i = 0; i < 8; i++) {
        const at = (i - 3.5) * SQUARE
        put('abcdefgh'[i], at, edge, false)      // near edge (rank 1 side)
        put('abcdefgh'[i], at, -edge, true)      // far edge, for black
        put(String(i + 1), -edge, -at, false)    // a-file side
        put(String(i + 1), edge, -at, true)      // h-file side, for black
      }
    })
    tex.repeat.set(1, 1)
    this.labelMat = new THREE.MeshStandardMaterial({
      map: tex, color: BOARD.label, transparent: true, depthWrite: false, roughness: 0.6
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, W), this.labelMat)
    plane.rotation.x = -Math.PI / 2
    plane.position.y = 0.0004 // just above the frame top (-0.0005), below the squares' tops
    plane.receiveShadow = true
    return plane
  }


  // Pieces: Poly Haven's scanned CC0 Staunton set (tools/build-pieces.mjs), one node per type
  // and color. Templates are baked, stood centered on y=0 and measured once per type.
  async _loadPieces() {
    const gltf = await new GLTFLoader().loadAsync('assets/pieces.glb')
    gltf.scene.updateMatrixWorld(true)
    this.templates = { w: {}, b: {} }
    this.scanMaps = {}
    gltf.scene.traverse(n => {
      const m = n.name.match(/^piece_(\w+?)_(white|black)/)
      if (!m || !NODE_TYPE[m[1]]) return
      const c = m[2][0], t = n.clone()
      n.matrixWorld.decompose(t.position, t.quaternion, t.scale) // bake ancestor transforms
      this.templates[c][NODE_TYPE[m[1]]] = t
      t.traverse(o => { if (o.isMesh) this.scanMaps[c] ??= o.material }) // scanned textures per color
    })
    const missing = ['w', 'b'].flatMap(c => [...'pnbrqk'].filter(t => !this.templates[c][t]).map(t => c + t))
    if (missing.length) throw new Error('Model missing pieces: ' + missing)
    const kingH = new THREE.Box3().setFromObject(this.templates.w.k).getSize(new THREE.Vector3()).y
    this.pieceScale = (1.7 * SQUARE) / kingH
    this.pieceH = {}
    for (const c of ['w', 'b']) for (const [type, t] of Object.entries(this.templates[c])) {
      const box = new THREE.Box3().setFromObject(t), ctr = box.getCenter(new THREE.Vector3())
      t.position.sub(ctr.setY(box.min.y))
      this.pieceH[type] = box.max.y - box.min.y
    }
    // Picking silhouette per type: widest radius in each height band (template units, white set).
    this.profile = {}
    for (const [type, t] of Object.entries(this.templates.w)) {
      const prof = this.profile[type] = new Array(BANDS).fill(0), h = this.pieceH[type]
      t.updateMatrixWorld(true)
      t.traverse(m => {
        const pos = m.isMesh && m.geometry.attributes.position
        for (let i = 0; pos && i < pos.count; i++) {
          const v = _vA.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
          const b = THREE.MathUtils.clamp(Math.floor(v.y / h * BANDS), 0, BANDS - 1)
          prof[b] = Math.max(prof[b], Math.hypot(v.x, v.z))
        }
      })
    }
    // Surface detail uniforms, shared by all four piece materials (one shader program).
    this.detailU = { uDetail: { value: 0 }, uDetailTime: { value: 0 } }
    const addDetail = shader => {
      Object.assign(shader.uniforms, this.detailU)
      shader.vertexShader = 'varying vec3 vDetailP;\n' + shader.vertexShader.replace(...PIECE_DETAIL.vertex)
      shader.fragmentShader = 'uniform int uDetail;\nuniform float uDetailTime;\nvarying vec3 vDetailP;\n' +
        shader.fragmentShader.replace(...PIECE_DETAIL.color).replace(...PIECE_DETAIL.roughness).replace(...PIECE_DETAIL.emissive)
    }
    // Shared across all pieces: pieces are rebuilt on every position change.
    const mat = color => Object.assign(new THREE.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.05, envMap: this.envMap, envMapIntensity: 0.6
    }), { onBeforeCompile: addDetail, customProgramCacheKey: () => 'piece-detail' })
    this.pieceMat = { w: mat(PIECES.white), b: mat(PIECES.black) }  // follows pieceStyle
    this.solidMat = { w: mat(PIECES.white), b: mat(PIECES.black) }  // promotion picker: always solid
    this.proxyGeo = {}
  }

  _makePiece(type, color) {
    const inner = this.templates[color][type].clone()
    inner.traverse(m => {
      if (!m.isMesh) return
      m.material = this.pieceMat[color]
      m.castShadow = this.pieceStyle === 'solid'
    })
    // Invisible cylinder used for ray hits: cheap per-frame hover, easy to hit.
    const h = this.pieceH[type], r = 0.42 * SQUARE / this.pieceScale
    // thetaStart π/12: no cap triangle edge on the straight-ahead axis (edge-on rays can miss)
    this.proxyGeo[type] ??= new THREE.CylinderGeometry(r, r, h, 12, 1, false, Math.PI / 12)
    const proxy = new THREE.Mesh(this.proxyGeo[type], PROXY_MAT)
    proxy.position.y = h / 2
    const group = new THREE.Group()
    group.add(inner, proxy)
    group.userData.proxy = proxy
    group.scale.setScalar(this.pieceScale)
    return group
  }

  // --- public API ---

  // Captured pieces stand beside the board at the capturer's right hand, 8 per column.
  _showCaptured(fen) {
    this.capturedGroup.clear()
    const lost = captured(fen)
    for (const [color, side] of [['b', 1], ['w', -1]]) lost[color].forEach((type, i) => {
      const piece = this._makePiece(type, color)
      piece.scale.multiplyScalar(0.6)
      const col = Math.floor(i / 8), row = i % 8
      piece.position.set(side * (4.8 + col * 0.7) * SQUARE, 0.005, side * (3.5 - row * 0.7) * SQUARE)
      this.capturedGroup.add(piece)
    })
  }

  // 'solid' | 'ghost' (see-through) | 'hidden' (blindfold). Pieces stay pickable through
  // their invisible proxies, and all square tints still show.
  setPieceStyle(style) {
    this.pieceStyle = style
    clearTimeout(this.showTimer)
    this._styleMaterials(style)
    // ghost pieces casting solid shadows would give their outlines away
    for (const g of [this.piecesGroup, this.capturedGroup]) g.traverse(m => { if (m.isMesh) m.castShadow = style === 'solid' })
  }

  // Puts a piece dropped elsewhere (grab mode) back on its own square.
  snapBack(square) {
    this.shadowsDirty = true
    this.contactsDirty = true
    const p = this.pieceAt[square]
    if (!p) return
    const { x, z } = squareToXZ(square, SQUARE)
    p.position.set(x, 0.005, z)
  }

  // Frame counter (FPS readout for tuning on the headset): updates the panel once a second.
  _fps(now) {
    this.frames = (this.frames ?? 0) + 1
    this.fpsT0 ??= now
    if (now - this.fpsT0 < 1000) return
    const fps = Math.round(this.frames * 1000 / (now - this.fpsT0))
    this.frames = 0
    this.fpsT0 = now
    this.fps = fps
    if (this.showFps) this.panel.setCorner(`${fps} fps`)
  }

  setShowFps(on) {
    this.showFps = on
    this.panel.setCorner(on ? (this.fps ? `${this.fps} fps` : '… fps') : '')
  }

  // Contact shadow under each piece; a lifted piece's shadow spreads and softens.
  _updateContacts() {
    const d = _dummy
    let n = 0
    for (const [group, size] of [[this.piecesGroup, 1], [this.capturedGroup, 0.6]]) for (const p of group.children) {
      const lift = Math.max(0, p.position.y - 0.005)
      d.position.set(p.position.x, 0.0056, p.position.z)
      d.scale.setScalar(SQUARE * 1.05 * size * (1 + lift * 8))
      d.updateMatrix()
      this.contacts.setMatrixAt(n++, d.matrix)
    }
    this.contacts.count = n
    this.contacts.instanceMatrix.needsUpdate = true
    this.contactsDirty = false
  }

  deselect() {
    this.selected = null
    this._applyTints()
  }

  // Momentary reveal while ghosted/hidden (training aid).
  showPieces(ms = 2000) {
    clearTimeout(this.showTimer)
    this._styleMaterials('solid')
    this.showTimer = setTimeout(() => this._styleMaterials(this.pieceStyle), ms)
  }

  _styleMaterials(style) {
    this.shadowsDirty = true
    this.contacts.visible = style !== 'hidden' // blindfold: shadows would give the pieces away
    for (const m of Object.values(this.pieceMat)) Object.assign(m, {
      visible: style !== 'hidden', transparent: style === 'ghost',
      opacity: style === 'ghost' ? 0.25 : 1, depthWrite: style !== 'ghost', needsUpdate: true
    })
  }

  // --- themes ---

  // Board look: square colors tint a grain texture (wood / marble / fine), each square showing
  // a different part of it so no two look alike. Textures are made once per grain kind.
  setBoardTheme(name) {
    const t = BOARD_THEMES[name] ?? BOARD_THEMES.walnut
    this.boardTheme = BOARD_THEMES[name] ? name : 'walnut'
    const r = rng(17)
    for (const tile of Object.values(this.tiles)) {
      const m = tile.material
      m.map?.dispose()
      m.map = this._grain(t.grain).clone()
      m.map.offset.set(r(), r())
      m.map.repeat.set(0.22, 0.22)
      m.map.rotation = r() < 0.5 ? 0 : Math.PI / 2
      m.roughness = t.grain === 'marble' ? 0.38 : 0.5 // polished, but no glare spot
      m.needsUpdate = true
      tile.userData.base.setHex(tile.userData.light ? t.light : t.dark)
    }
    this.frame.material.color.setHex(t.frame)
    this.labelMat.color.set(t.label)
    this.shadowsDirty = true
    this._applyTints()
  }

  _grain(kind) {
    this.grains ??= {}
    return this.grains[kind] ??= canvasTexture(512, 512, (ctx, w, h) => {
      const r = rng(kind.length * 31)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      if (kind === 'wood') {
        for (let i = 0; i < 90; i++) {
          ctx.strokeStyle = `rgba(90,60,30,${0.06 + r() * 0.12})`
          ctx.lineWidth = 0.6 + r() * 2.4
          const y0 = r() * h, amp = 2 + r() * 6, f = 0.006 + r() * 0.02
          ctx.beginPath()
          for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + Math.sin(x * f + i) * amp)
          ctx.stroke()
        }
      } else if (kind === 'marble') {
        for (let i = 0; i < 14; i++) {
          ctx.strokeStyle = `rgba(70,70,80,${0.08 + r() * 0.2})`
          ctx.lineWidth = 0.6 + r() * 2
          let x = r() * w, y = 0
          ctx.beginPath(); ctx.moveTo(x, y)
          while (y < h) { x += (r() - 0.5) * 40; y += 12 + r() * 20; ctx.lineTo(x, y) }
          ctx.stroke()
        }
      } else {
        for (let i = 0; i < 2500; i++) {            // fine speckle: matte printed-board look
          ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`
          ctx.fillRect(r() * w, r() * h, 2, 2)
        }
      }
    })
  }

  // Piece set: recolors the shared materials in place (no piece rebuild).
  setPieceTheme(name) {
    const t = PIECE_THEMES[name] ?? PIECE_THEMES.antique
    this.pieceTheme = PIECE_THEMES[name] ? name : 'antique'
    this.detailU.uDetail.value = Math.max(0, DETAIL_KINDS.indexOf(t.detail))
    for (const c of ['w', 'b']) for (const m of [this.pieceMat[c], this.solidMat[c]]) {
      const p = { ...PIECE_DEFAULTS, ...t[c] }, scan = this.scanMaps[c]
      m.color.setHex(p.color)
      m.emissive.setHex(p.emissive)
      Object.assign(m, { roughness: p.roughness, metalness: p.metalness })
      // every set keeps the scan's relief and occlusion; 'antique' also shows its wood and finish
      Object.assign(m, {
        normalMap: scan.normalMap, normalScale: scan.normalScale, aoMap: scan.aoMap,
        map: t.textured ? scan.map : null,
        roughnessMap: t.textured ? scan.roughnessMap : null,
        metalnessMap: t.textured ? scan.metalnessMap : null,
        needsUpdate: true
      })
    }
    this.shadowsDirty = true
  }

  // Pieces reflect the real scene: one cube capture per scene switch, never per frame.
  _captureEnv() {
    if (!this.pieceMat) return
    this.pmrem ??= new THREE.PMREMGenerator(this.renderer)
    const hide = [this.boardGroup, this.panel?.mesh, this.bar?.mesh].filter(Boolean)
    const was = hide.map(o => o.visible)
    hide.forEach(o => { o.visible = false })
    const pos = new THREE.Vector3(BOARD_POS.x, BOARD_POS.y + 0.35 + this.stage.position.y, BOARD_POS.z)
    const rt = this.pmrem.fromScene(this.scene, 0.02, 0.05, 60, { position: pos })
    hide.forEach((o, i) => { o.visible = was[i] })
    this.envRT?.dispose()
    this.envRT = rt
    for (const m of [...Object.values(this.pieceMat), ...Object.values(this.solidMat)]) {
      m.envMap = rt.texture
      m.envMapIntensity = 0.9
      m.needsUpdate = true
    }
  }

  // --- WebXR session (own launch UI instead of three's VRButton) ---

  async xrSupported() {
    return !!(await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false))
  }

  async enterVR() {
    await this._startSession(await navigator.xr.requestSession('immersive-vr', SESSION_INIT))
  }

  // Quest Browser can offer VR itself (no click needed; an installed immersive app starts here).
  async offerVR() {
    const s = await navigator.xr?.offerSession?.('immersive-vr', SESSION_INIT).catch(() => null)
    if (s) await this._startSession(s)
  }

  // 'native' = the headset panel's resolution (Quest 2: ~1.27x the browser default per axis),
  // 'normal' = the browser default. Applies from the next VR session.
  setResolution(r) {
    this.resolution = r
  }

  async _startSession(s) {
    const native = this.resolution === 'native' && window.XRWebGLLayer?.getNativeFramebufferScaleFactor?.(s)
    this.renderer.xr.setFramebufferScaleFactor(native || 1) // must be set before the session starts
    await this.renderer.xr.setSession(s)
  }

  // Desktop only: shift the rendered image right by px (e.g. a sidebar covering the left).
  setViewShift(px) {
    this.viewShift = px
    this._resize()
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight
    if (this.viewShift) this.camera.setViewOffset(innerWidth, innerHeight, -this.viewShift / 2, 0, innerWidth, innerHeight)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(innerWidth, innerHeight)
  }

  // Scenery + lighting preset (see environments.js); the previous one is disposed.
  setEnvironment(name) {
    this.shadowsDirty = true
    if (this.envGroup) {
      this.scene.remove(this.envGroup)
      disposeGroup(this.envGroup)
    }
    const env = buildEnvironment(name)
    this.env = env
    this.environment = env.name
    this.envGroup = env.group
    this.scene.add(env.group)
    this.scene.background = new THREE.Color(env.background)
    this.scene.fog = env.fog ?? null
    this.renderer.toneMappingExposure = env.exposure
    const [sky, ground, hi] = env.hemi
    this.hemi.color.set(sky)
    this.hemi.groundColor.set(ground)
    this.hemi.intensity = hi
    const [color, si, offset] = env.sun
    this.sun.color.set(color)
    this.sun.intensity = si
    this.sun.position.copy(BOARD_POS).add(new THREE.Vector3(...offset))
    const [lc, li, lp] = env.lamp ?? [0xffffff, 0, [0, 0, 0]]
    this.lamp.color.set(lc)
    this.lamp.intensity = li
    this.lamp.position.set(...lp)
    this._captureEnv()
    env.ready?.then(() => { if (this.env === env) this._captureEnv() }, // reflect the props too
      e => console.warn('scene props not loaded', e))
  }

  // Table height offset from the default (m), clamped.
  setHeight(offset) {
    this.shadowsDirty = true
    this.stage.position.y = THREE.MathUtils.clamp(offset, -HEIGHT_RANGE, HEIGHT_RANGE)
  }

  // color = the side the session plays; flipped (sticky setting) views it from the other side;
  // peek = a temporary flip toggled in-game, cleared when the next session orients the board.
  setOrientation(color) {
    this.orientation = color
    this.peek = false
    this._orient()
  }

  togglePeek() {
    this.peek = !this.peek
    this._orient()
  }

  setFlipped(flipped) {
    this.flipped = flipped
    this._orient()
  }

  // Side at the player's end of the table after flips.
  viewSide() { return this.boardGroup.rotation.y ? 'black' : 'white' }

  _orient() {
    this.shadowsDirty = true
    const black = (this.orientation === 'black') !== !!this.flipped !== !!this.peek
    this.boardGroup.rotation.y = black ? Math.PI : 0
  }

  // Board + pieces scale (1 = 6 cm squares); the table grows with bigger boards and the
  // button bar moves out so it never overlaps the board or captured pieces.
  setScale(s) {
    this.shadowsDirty = true
    this.boardScale = THREE.MathUtils.clamp(s, 0.5, 2)
    const grow = Math.max(1, this.boardScale)
    this.boardGroup.scale.setScalar(this.boardScale)
    this.table.scale.set(grow, 1, grow)
    this.tableShadow.scale.set(grow, grow, 1)
    const cam = this.sun.shadow.camera // shadow box covers table + captured pieces
    cam.left = cam.bottom = -0.7 * grow
    cam.right = cam.top = 0.7 * grow
    cam.updateProjectionMatrix()
    this.bar.mesh.position.x = BAR_X + (grow - 1) * 0.35
  }

  setPosition(fen, lastMove = null) {
    this.fen = fen
    this.shadowsDirty = true
    this._removePicker()
    this.piecesGroup.clear()
    this.pieceAt = {}
    this.anim = null
    this.grab = this.pendingGrab = null
    delete this.hover.grab
    for (const p of parseFen(fen)) {
      const piece = this._makePiece(p.type, p.color)
      const { x, z } = squareToXZ(p.square, SQUARE)
      piece.position.set(x, 0.005, z)
      Object.assign(piece.userData, { square: p.square, type: p.type, color: p.color })
      piece.userData.proxy.userData.square = p.square
      this.pieceAt[p.square] = piece
      this.piecesGroup.add(piece)
    }
    this._showCaptured(fen)
    this.contactsDirty = true
    this.selected = null
    this.lastMove = lastMove
    this.check = this.checkSquare()
    this._applyTints()
    if (lastMove) this.cue(lastMove.captured ? 'capture' : 'move') // sessions pass chess.js moves
    const handDropped = lastMove?.to === this.dropped
    this.dropped = null
    if (lastMove && this.pieceAt[lastMove.to] && !handDropped) { // a hand-placed piece doesn't re-slide
      const from = squareToXZ(lastMove.from, SQUARE)
      const to = squareToXZ(lastMove.to, SQUARE)
      this.anim = { obj: this.pieceAt[lastMove.to], from, to, t0: performance.now() }
      this.anim.obj.position.set(from.x, 0.005, from.z)
    }
    if (lastMove?.captured) this._burst(lastMove.to)
  }

  // Capture: a few soft sparks fly out of the square and fade (pooled sprites, ~0.5 s).
  _burst(square) {
    this.sparks ??= Array.from({ length: 8 }, () => {
      const s = glow(COLOR.brass, 0.03, 0)
      this.boardGroup.add(s)
      return s
    })
    const { x, z } = squareToXZ(square, SQUARE)
    this.sparks.forEach((s, i) => {
      const a = i / 8 * Math.PI * 2
      s.userData.v = new THREE.Vector3(Math.cos(a) * 0.12, 0.1 + (i % 3) * 0.04, Math.sin(a) * 0.12)
      s.position.set(x, 0.03, z)
    })
    this.burstT0 = performance.now()
  }

  // state: see StatusPanel.set, plus actions: [{label, run, confirm?}] for the button bar
  setStatus(state) {
    this.panel.set(state)
    this.bar.set(state.actions)
  }

  cue(kind) { playCue(kind) }

  // Speaks a chess.js verbose move if the voice setting covers it (mine = the player's move).
  announce(move, mine = false) {
    if (move && (this.voice === 'all' || (this.voice === 'opponent' && !mine))) speak(moveToSpeech(move))
  }

  // Extra square tints owned by a session, e.g. {e4: 0x1a6a2a}; {} clears.
  setMarks(marks) {
    this.marks = marks
    this._applyTints()
  }

  // --- selection & tints ---

  _applyTints() {
    const tint = (sq, hex) => { if (this.tiles[sq]) this.tiles[sq].userData.tint = hex }
    for (const sq in this.tiles) tint(sq, 0)
    if (this.lastMove) for (const sq of [this.lastMove.from, this.lastMove.to]) tint(sq, TINT.last)
    if (this.check) tint(this.check, TINT.check)
    for (const sq in this.marks) tint(sq, this.marks[sq])
    if (this.selected) {
      tint(this.selected, TINT.select)
      for (const sq of this.targets) tint(sq, TINT.target)
    }
    for (const t of Object.values(this.tiles)) {
      t.material.color.copy(t.userData.base)
      if (t.userData.tint) t.material.color.lerp(_tint.setHex(t.userData.tint), TINT_MIX)
      t.material.emissive.setHex(0)
    }
    for (const sq of new Set(Object.values(this.hover)))
      this.tiles[sq]?.material.emissive.add(HOVER)
  }

  _clearHover(...keys) {
    for (const k of keys) {
      this._setHover(k, null)
      this.bar.hover(k, null)
    }
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

  // Returns truthy if the move was made or is pending (promotion picker open).
  _emitMove(from, to) {
    const p = this.pieceAt[from]?.userData
    if (p?.type !== 'p' || (to[1] !== '8' && to[1] !== '1')) return this.onMove?.(from, to)
    this._openPicker(from, to)
    return true
  }

  // --- promotion picker: Q/R/B/N floating in a row over the promotion rank ---

  _openPicker(from, to) {
    this.shadowsDirty = true
    const color = this.pieceAt[from].userData.color
    // 4 files around the target in the mover's frame (Q leftmost, target 2nd unless at an edge)
    const mirror = i => color === 'w' ? i : 7 - i
    const start = Math.min(Math.max(mirror('abcdefgh'.indexOf(to[0])) - 1, 0), 4)
    const group = new THREE.Group()
    for (const [i, type] of [...'qrbn'].entries()) {
      const disc = new THREE.Mesh(DISC_GEO, DISC_MAT)
      disc.rotation.x = -Math.PI / 2
      const slot = new THREE.Group()
      const piece = this._makePiece(type, color)
      piece.traverse(m => { if (m.material === this.pieceMat[color]) m.material = this.solidMat[color] })
      slot.add(disc, piece)
      const file = 'abcdefgh'[mirror(start + i)]
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
    this.contactsDirty = true
    const { from, to } = this.picker
    this._removePicker()
    if (promo) return this.onMove?.(from, to, promo)
    const home = squareToXZ(from, SQUARE)
    this.pieceAt[from]?.position.set(home.x, 0.005, home.z)
  }

  _removePicker() {
    this.shadowsDirty = true
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
        new THREE.LineBasicMaterial({ color: COLOR.mist }))
      line.scale.z = RAY_LEN
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6),
        new THREE.MeshBasicMaterial({ color: COLOR.ivory }))
      dot.visible = false
      ctrl.add(line, dot)
      ctrl.addEventListener('connected', e => {
        ctrl.userData.isHand = !!e.data?.hand
        ctrl.userData.source = e.data
        this._updateLines()
      })
      ctrl.addEventListener('disconnected', () => { ctrl.userData.source = null })
      ctrl.addEventListener('selectstart', () => {
        if (ctrl.userData.isHand && this._handGrabs(this.hands[i])) return // pinch-grab handles it
        this.source = ctrl.userData.source
        this._rayFrom(ctrl)
        this._pick()
      })
      this.scene.add(ctrl)
      this.controllers.push({ ctrl, line, dot })
    }

    // Tracked hands: rendered meshes; pinch fires selectstart on the controller groups above
    // (a ray pick), unless it happens right at one of your pieces: then it grabs the piece.
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
    this.renderer.xr.addEventListener('sessionstart', () => this._clearHover('mouse'))
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
    // disconnect hides the hand group but leaves joint flags as they were
    if (hand.visible === false || !tip?.visible || !thumb?.visible) return null
    return tip.getWorldPosition(_vA).add(thumb.getWorldPosition(_vB)).multiplyScalar(0.5)
  }

  // Pinch point in board space, or null while tracking is lost.
  _pinchLocal(hand) {
    const p = hand && this._pinchPos(hand)
    return p && this.boardGroup.worldToLocal(p.clone())
  }

  // Own piece within reach of a board-space pinch point (just above the board), or null.
  _reachable(local) {
    if (!local || local.y < -0.02 || local.y > 0.18) return null
    let best = null
    for (const sq in this.pieceAt) {
      if (!this.canPick(sq)) continue
      const pos = this.pieceAt[sq].position
      const d = Math.hypot(pos.x - local.x, pos.z - local.z)
      if (d < 0.7 * SQUARE && (!best || d < best.d)) best = { sq, d }
    }
    return best?.sq ?? null
  }

  // Does this hand's pinch belong to pinch-grab (not the ray)? Always in grab mode; in point mode
  // when the pinch is right at one of your pieces (picker and trainer stay with the ray there).
  _handGrabs(hand) {
    if (this.handMode === 'grab' || this.grab?.hand === hand || this.pendingGrab?.hand === hand) return true
    return !this.picker && !this.onSquarePick && !!this._reachable(this._pinchLocal(hand))
  }

  _grabStart(hand) {
    if (this.grab || this.pendingGrab) return
    const local = this._pinchLocal(hand)
    if (!local) return
    if (this.handMode === 'grab') {
      if (this.picker) return this._closePicker(this._nearestPromo(local))
      if (this.onSquarePick) {
        const sq = local.y >= -0.02 && local.y <= 0.18 && xzToSquare(local.x, local.z, SQUARE)
        return sq && this.onSquarePick(sq)
      }
    } else if (this.picker || this.onSquarePick) return // point mode: the ray picks these
    if (this._reachable(local)) this.pendingGrab = { hand, t0: performance.now() } // see _confirmGrab
  }

  // A pinch grabs once held for GRAB_HOLD ms with the fingers firmly closed, and takes the piece
  // nearest to where the hand is then: closing fingers while still reaching in grab nothing early.
  _confirmGrab() {
    const { hand, t0 } = this.pendingGrab, local = this._pinchLocal(hand)
    if (!local) return (this.pendingGrab = null)            // tracking lost
    const tip = hand.joints['index-finger-tip'], thumb = hand.joints['thumb-tip']
    const gap = tip.getWorldPosition(_vA).distanceTo(thumb.getWorldPosition(_vB))
    if (performance.now() - t0 < GRAB_HOLD || gap > GRAB_GAP) return
    this.pendingGrab = null
    const from = this._reachable(local)
    if (!from) return
    this.grab = { hand, piece: this.pieceAt[from], from }
    this.selected = from
    this.targets = this.getTargets(from)
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
    if (this.pendingGrab?.hand === hand) this.pendingGrab = null // let go before it confirmed
    if (this.grab?.hand === hand) this._drop()
  }

  _drop(cancel = false) {
    this.contactsDirty = true
    const { piece, from } = this.grab
    this.grab = null
    delete this.hover.grab
    this.selected = null
    const sq = xzToSquare(piece.position.x, piece.position.z, SQUARE)
    const legal = !cancel && sq && sq !== from && this.targets.includes(sq)
    const { x, z } = squareToXZ(legal ? sq : from, SQUARE)
    piece.position.set(x, 0.005, z)
    this._applyTints()
    if (!legal) return
    this.dropped = sq
    if (!this._emitMove(from, sq)) this.snapBack(from) // refused (game over, not our turn…)
  }

  // Nearest interactive object on the current ray, using the cheap piece proxies:
  // {promo} while the picker is open, else {uv} on the button bar or {square}; null = miss.
  // A ray through a proxy but beside the real piece (see _touches) goes on to what is behind it.
  _cast() {
    const proxies = group => group.children.map(g => g.userData.proxy ?? g.children[1].userData.proxy)
    const objs = this.picker ? proxies(this.picker.group)
      : [...Object.values(this.tiles), ...proxies(this.piecesGroup), ...(this.bar.mesh.visible ? [this.bar.mesh] : [])]
    const hits = this.raycaster.intersectObjects(objs, false)
    const h = this.picker ? hits[0] : hits.find(h => this._touches(h)) ?? hits[0]
    if (!h) return null
    const hit = { dist: h.distance }
    if (h.object === this.bar.mesh) hit.uv = h.uv
    else if (this.picker) hit.promo = h.object.parent.parent.userData.promo
    else hit.square = h.object.userData.square
    return hit
  }

  // Does the ray really touch what it hit? Tiles, the bar and legal targets: yes. A piece proxy:
  // only if the ray passes within the piece's silhouette (+ margin) somewhere inside the cylinder.
  _touches(h) {
    const o = h.object, piece = o.parent
    if (o.material !== PROXY_MAT || (this.selected && this.targets.includes(o.userData.square))) return true
    const prof = this.profile[piece.userData.type], top = this.pieceH[piece.userData.type]
    const ray = _ray.copy(this.raycaster.ray).applyMatrix4(_m.copy(piece.matrixWorld).invert())
    const R = 0.42 * SQUARE / this.pieceScale, margin = 0.08 * SQUARE / this.pieceScale // ~5 mm: hand jitter
    const flat = Math.hypot(ray.direction.x, ray.direction.z), len = 2 * R / Math.max(flat, 0.05)
    const t0 = ray.origin.distanceTo(_vC.copy(h.point).applyMatrix4(_m))
    for (let k = 0; k <= 16; k++) {                 // walk the chord through the cylinder
      const p = ray.at(t0 + len * k / 16, _vC)
      if (p.y < 0 || p.y > top) continue
      const r = prof[Math.min(BANDS - 1, Math.floor(p.y / top * BANDS))]
      if (Math.hypot(p.x, p.z) < r + margin) return true
    }
    return false
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
    this.bar.mesh.position.set(BAR_X, 0.88, -0.34)
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
    else if (this.hover.c0 || this.hover.c1) this._clearHover('c0', 'c1') // left VR
    this._thumbstick(dt)
    this.env?.update?.(now / 1000, dt, this) // scene life: fire, clouds, birds, aurora…
    if (this.pendingGrab) this._confirmGrab()
    if (this.grab) {
      const p = this._pinchPos(this.grab.hand)
      if (!p) this._drop(true) // tracking lost -> piece returns home
      else {
        const local = this.boardGroup.worldToLocal(p)
        this.grab.piece.position.set(local.x, Math.max(0.01, local.y - 0.02), local.z)
        this._setHover('grab', xzToSquare(local.x, local.z, SQUARE))
      }
    }
    if (this.anim) {                     // arc over the board, then a small wooden settle
      const k = Math.min(1, (now - this.anim.t0) / 380)
      const e = Math.min(1, k / 0.8), glide = e * (2 - e)
      const settle = k > 0.8 ? Math.sin((k - 0.8) / 0.2 * Math.PI) * 0.004 : 0
      const { obj, from, to } = this.anim
      obj.position.set(
        from.x + (to.x - from.x) * glide,
        0.005 + Math.sin(Math.PI * glide) * 0.03 * (k < 0.8 ? 1 : 0) + settle,
        from.z + (to.z - from.z) * glide)
      if (k === 1) this.anim = null
    }
    if (this.burstT0) {
      const k = (now - this.burstT0) / 500
      this.sparks.forEach(s => {
        s.position.addScaledVector(s.userData.v, dt)
        s.userData.v.y -= 0.35 * dt
        s.material.opacity = k < 1 ? 0.9 * (1 - k) : 0
      })
      if (k >= 1) this.burstT0 = null
    }
    if (this.selected) {                 // legal targets breathe gently
      const p = 0.08 + 0.06 * Math.sin(now / 160)
      for (const sq of this.targets) if (!Object.values(this.hover).includes(sq))
        this.tiles[sq].material.emissive.setRGB(0.25 * p, 0.62 * p, 0.42 * p)
    }
    if (this.anim || this.grab || this.contactsDirty) this._updateContacts()
    if (this.detailU) this.detailU.uDetailTime.value = now / 1000
    this._fps(now)
    this.hands.forEach((hand, i) => {
      const tip = hand.joints['index-finger-tip']
      // disconnect hides the hand group but leaves joint flags as they were
      this.bar.poke(hand.visible !== false && tip?.visible ? tip.getWorldPosition(_vC) : null, i)
    })
    this.panel.tick()
    this.bar.tick()
    if (this.shadowsDirty || this.anim || this.grab) {
      this.renderer.shadowMap.needsUpdate = true
      this.shadowsDirty = false
    }
    this.renderer.render(this.scene, this.camera)
  }
}
