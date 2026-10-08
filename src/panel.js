// In-scene UI: a status panel (names, clocks, text) and a reachable button bar
// pressed by controller ray, mouse click or fingertip poke.

import * as THREE from 'three'
import { COLOR, FONT, PIECE_CSS } from './theme.js'

function canvasPlane(w, h, px) {
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = Math.round(px * h / w)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false }))
  return { canvas, ctx: canvas.getContext('2d'), tex, mesh }
}

const _p = new THREE.Vector3()
const LOW_TIME = 20000 // ms: clock turns ember

const fmt = ms => {
  const t = Math.ceil(ms / 1000)
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}

// Canvas text doesn't trigger web-font downloads: load the brand fonts explicitly, then redraw.
const fontsReady = globalThis.document?.fonts
  ? Promise.all([`600 30px Inter`, `500 30px Inter`, `700 40px 'Space Grotesk'`, `600 40px 'JetBrains Mono'`]
    .map(f => document.fonts.load(f).catch(() => {})))
  : Promise.resolve()

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke() }
}

// The logo mark (assets/brand/mark.svg) drawn at x,y with size s.
function drawMark(ctx, x, y, s) {
  const u = s / 64
  roundRect(ctx, x, y, s, s, 14 * u, COLOR.ink)
  ctx.strokeStyle = COLOR.brass
  ctx.lineWidth = 3 * u
  ctx.beginPath(); ctx.roundRect(x + 23 * u, y + 11 * u, 30 * u, 30 * u, 3 * u); ctx.stroke()
  const q = 15 * u
  for (const [i, j, c] of [[0, 0, COLOR.ivory], [1, 0, COLOR.steelHi], [0, 1, COLOR.steelHi], [1, 1, COLOR.ivory]]) {
    ctx.fillStyle = c
    ctx.fillRect(x + 11 * u + i * q, y + 23 * u + j * q, q, q)
  }
}

export class StatusPanel {
  constructor() {
    Object.assign(this, canvasPlane(0.5, 0.25, 512))
    this.status = null
    this.pills = {} // last clock pill color per side (inspectable)
    this.draw()
    fontsReady.then(() => this.draw())
  }

  // status: {names:{white,black}, myColor, wtime, btime, turn, running, text, ts?}
  //      or {puzzle: true, text, sub, big?, brand?} — big: one large word (trainer target),
  //         brand: show the logo + wordmark (idle menu)
  set(status) {
    this.status = { ...status, ts: status.ts ?? performance.now() }
    this.draw()
  }

  // Redraws only when the running clock's shown second changes.
  // Small text in the top-right corner (FPS readout); '' hides it.
  setCorner(text) {
    if (text === this.corner) return
    this.corner = text
    this.draw()
  }

  tick() {
    const s = this.status
    if (!s?.running) return
    const left = (s.turn === 'w' ? s.wtime : s.btime) - (performance.now() - s.ts)
    if (Math.ceil(left / 1000) !== this.shownSec) this.draw()
  }

  draw() {
    const { ctx } = this, s = this.status
    if (s?.running) this.shownSec = Math.ceil(((s.turn === 'w' ? s.wtime : s.btime) - (performance.now() - s.ts)) / 1000)
    ctx.clearRect(0, 0, 512, 256)
    roundRect(ctx, 2, 2, 508, 252, 28, 'rgba(26,31,40,0.94)', COLOR.steel)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.letterSpacing = '0px'
    if (s?.big) {
      this._text(s.big, COLOR.ivory, `700 112px ${FONT.display}`, 256, 124)
      roundRect(ctx, 226, 140, 60, 5, 2.5, COLOR.brass)
      this._text(s.text, COLOR.ivory, `600 28px ${FONT.ui}`, 256, 190)
      this._text(s.sub, COLOR.mist, `500 20px ${FONT.ui}`, 256, 226)
    } else if (s?.brand || !s) {
      drawMark(ctx, 150, 34, 64)
      ctx.textAlign = 'left'
      ctx.letterSpacing = '5px'
      this._text('PARALLAX', COLOR.ivory, `700 34px ${FONT.display}`, 230, 72)
      ctx.letterSpacing = '3px'
      this._text('CHESS IN DEPTH', COLOR.mist, `500 13px ${FONT.ui}`, 232, 94)
      ctx.letterSpacing = '0px'
      ctx.textAlign = 'center'
      this._text(s?.text, COLOR.ivory, `600 26px ${FONT.ui}`, 256, 170)
      this._text(s?.sub, COLOR.mist, `500 19px ${FONT.ui}`, 256, 206)
    } else if (s.puzzle) {
      this._text(s.text, COLOR.ivory, `600 30px ${FONT.ui}`, 256, 118)
      this._text(s.sub, COLOR.mist, `500 20px ${FONT.ui}`, 256, 164)
    } else {
      const opp = s.myColor === 'white' ? 'b' : 'w'
      this._clockRow(28, opp)
      this._clockRow(168, s.myColor[0])
      this._text(s.text, COLOR.mist, `500 22px ${FONT.ui}`, 256, 138)
    }
    if (this.corner) {
      ctx.textAlign = 'right'
      this._text(this.corner, COLOR.brass, `600 16px ${FONT.mono}`, 492, 22)
    }
    this.tex.needsUpdate = true
  }

  // One player row (top y): color dot, name, clock pill (brass = running, ember = low).
  _clockRow(y, c) {
    const s = this.status, ctx = this.ctx, active = s.turn === c && s.running
    const left = Math.max(0, (c === 'w' ? s.wtime : s.btime) - (active ? performance.now() - s.ts : 0))
    const low = left < LOW_TIME
    ctx.beginPath()
    ctx.arc(46, y + 30, 11, 0, Math.PI * 2)
    ctx.fillStyle = PIECE_CSS[c]
    ctx.fill()
    ctx.strokeStyle = COLOR.mist; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.textAlign = 'left'
    this._text(s.names[c === 'w' ? 'white' : 'black'], COLOR.ivory, `500 28px ${FONT.ui}`, 70, y + 40)
    const pill = this.pills[c] = low ? COLOR.ember : active ? COLOR.brass : COLOR.steel
    roundRect(ctx, 330, y + 4, 156, 52, 14, pill)
    ctx.textAlign = 'center'
    this._text(fmt(left), active || low ? COLOR.ink : COLOR.ivory, `600 34px ${FONT.mono}`, 408, y + 43)
  }

  _text(text, color, font, x, y) {
    if (!text) return
    Object.assign(this.ctx, { fillStyle: color, font })
    this.ctx.fillText(text, x, y)
  }
}

// Greedy word wrap to fit maxW pixels (buttons show 1–3 short lines).
function wrap(ctx, text, maxW) {
  const lines = []
  for (const w of text.split(' ')) {
    const cur = lines.at(-1)
    if (cur && ctx.measureText(cur + ' ' + w).width <= maxW) lines[lines.length - 1] = cur + ' ' + w
    else lines.push(w)
  }
  return lines
}

const BAR_W = 0.3, BAR_H = 0.18, COLS = 3, ROWS = 3, CONFIRM_MS = 3000

// Move list beside the board: up to LIST_ROWS full moves in SAN around the current move (brass).
const LIST_ROWS = 10
export class MoveList {
  constructor() {
    Object.assign(this, canvasPlane(0.17, 0.26, 256))
    this.mesh.visible = false
    this.lines = []
    this.key = ''
  }

  // moves: chess.js verbose moves (before = FEN, for numbering); cur: index of the shown move.
  set(moves, cur = moves.length - 1) {
    this.cur = cur
    const rows = []
    let curRow = -1
    moves.forEach((m, i) => {
      const num = +m.before.split(' ')[5]
      if (m.color === 'w' || !rows.length) rows.push({ num, white: m.color === 'w', sans: [] })
      rows.at(-1).sans.push(m.san)
      if (i === cur) curRow = rows.length - 1
    })
    const start = Math.max(0, Math.min(rows.length - LIST_ROWS, curRow - LIST_ROWS + 1)) // current row in view
    const shown = rows.slice(start, start + LIST_ROWS)
    this.lines = shown.map(r => `${r.num}${r.white ? '.' : '…'} ${r.sans.join(' ')}`)
    this.curRow = curRow - start
    this.curSide = moves[cur]?.color === 'b' && shown[this.curRow]?.white ? 1 : 0
    this.mesh.visible = moves.length > 0
    const key = this.lines.join('|') + '#' + this.curRow + this.curSide
    if (key !== this.key) (this.key = key, this.draw(shown))
  }

  draw(rows) {
    const { ctx } = this, w = 256, h = this.canvas.height
    ctx.clearRect(0, 0, w, h)
    roundRect(ctx, 2, 2, w - 4, h - 4, 20, 'rgba(26,31,40,0.94)', COLOR.steel)
    ctx.textBaseline = 'middle'
    ctx.font = `600 15px ${FONT.ui}`
    ctx.fillStyle = COLOR.mist
    ctx.fillText('MOVES', 20, 26)
    rows.forEach((r, i) => {
      const y = 58 + i * 32, cells = r.white ? r.sans : ['…', ...r.sans]
      ctx.font = `500 17px ${FONT.mono}`
      ctx.fillStyle = COLOR.mist
      ctx.fillText(`${r.num}.`, 20, y)
      cells.forEach((san, k) => {
        const x = 70 + k * 88, hot = i === this.curRow && k === (r.white ? this.curSide : 1)
        if (hot) roundRect(ctx, x - 6, y - 13, 84, 26, 6, COLOR.brass)
        ctx.font = `600 18px ${FONT.ui}`
        ctx.fillStyle = hot ? COLOR.ink : COLOR.ivory
        ctx.fillText(san, x, y)
      })
    })
    this.tex.needsUpdate = true
  }
}

export class ButtonBar {
  constructor(width = BAR_W, height = BAR_H, pixels = 600) {
    Object.assign(this, canvasPlane(width, height, pixels), { width, height })
    this.buttons = []
    this.regions = []
    this.mesh.visible = false
    this.armed = null
    this.armedPoke = {} // pointer key -> tip was seen in front of the bar
    this.hovered = {} // pointer key -> button index
    this.draw()
    fontsReady.then(() => this.draw())
  }

  // buttons: [{label, run, confirm?, primary?}] — confirm buttons need a second press within 3 s;
  // primary = the screen's main action (brass).
  set(buttons = [], navigation = null, title = '') {
    if (buttons.length > COLS * ROWS) console.warn('ButtonBar: dropping', buttons.slice(COLS * ROWS).map(b => b.label))
    this.buttons = buttons.slice(0, COLS * ROWS)
    this.navigation = navigation
    this.title = title
    this.resize(BAR_W, navigation ? 0.26 : BAR_H)
    const top = navigation ? 64 : 0
    this.regions = this.buttons.map((b, i) => {
      const slot = b.slot ?? i
      return { x: (slot % COLS) * 200 + 6, y: top + Math.floor(slot / COLS) * 120 + 6, w: 188, h: 108 }
    })
    if (navigation) {
      this.buttons.push(navigation)
      this.regions.push({ x: 6, y: 434, w: 588, h: 80 })
    }
    this.armed = this.buttons.find(b => b.label === this.armed?.label) || null
    this.mesh.visible = this.buttons.length > 0
    this.draw()
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return
    Object.assign(this, { width, height })
    this.mesh.geometry.dispose()
    this.mesh.geometry = new THREE.PlaneGeometry(width, height)
    this.canvas.height = Math.round(this.canvas.width * height / width)
  }

  // u,v: texture coords (v = 1 at the top). Returns true if a button was hit.
  press(u, v) {
    const b = this.buttons[this._index(u, v)]
    if (!b || b.disabled) return false
    this.onPress?.()
    this.pressed = b.id ?? b.label
    this.pressedAt = performance.now()
    if (b.confirm && this.armed !== b) {
      this.armed = b
      this.armedAt = performance.now()
    } else {
      this.armed = null
      b.run()
    }
    this.draw()
    return true
  }

  // Highlights the button under a pointer; uv null clears. Redraws only on change.
  hover(key, uv) {
    const i = uv ? this._index(uv.x, uv.y) : -1
    if ((this.hovered[key] ?? -1) === i) return
    this.hovered[key] = i
    this.draw()
  }

  _index(u, v) {
    const x = u * this.canvas.width, y = (1 - v) * this.canvas.height
    return this.regions.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  }

  // The same bounds drive drawing, rays, touch and interaction tests.
  buttonUV(label) {
    const r = this.regions[this.buttons.findIndex(b => b.label === label)]
    return r && { x: (r.x + r.w / 2) / this.canvas.width, y: 1 - (r.y + r.h / 2) / this.canvas.height }
  }

  // Fingertip poke: arms while the tip is in front of the bar, presses when it reaches the
  // surface (only from the front: a hand pulling back out through the bar never presses).
  poke(worldPos, key) {
    if (!worldPos || !this.mesh.visible) {
      this.armedPoke[key] = false
      this.hover('poke' + key, null)
      return
    }
    const p = this.mesh.worldToLocal(_p.copy(worldPos))
    const inside = Math.abs(p.x) < this.width / 2 && Math.abs(p.y) < this.height / 2
    this.hover('poke' + key, inside && p.z > -0.04 && p.z < 0.15
      ? { x: p.x / this.width + 0.5, y: p.y / this.height + 0.5 } : null)
    if (!inside || p.z > 0.025) this.armedPoke[key] = inside && p.z < 0.15
    else if (p.z <= -0.04) this.armedPoke[key] = false // went through: must come back out front
    else if (this.armedPoke[key] && p.z < 0.01) {
      this.armedPoke[key] = false
      this.press(p.x / this.width + 0.5, p.y / this.height + 0.5)
    }
  }

  tick() {
    if (this.pressed && performance.now() - this.pressedAt > 180) {
      this.pressed = null
      this.draw()
    }
    if (this.armed && performance.now() - this.armedAt > CONFIRM_MS) {
      this.armed = null
      this.draw()
    }
  }

  draw() {
    const { ctx, canvas: { width: w, height: h } } = this
    ctx.clearRect(0, 0, w, h)
    if (this.navigation) {
      roundRect(ctx, 0, 0, w, h, 24, COLOR.slate, COLOR.steel)
      Object.assign(ctx, { textAlign: 'left', textBaseline: 'middle', font: `600 25px ${FONT.ui}`, fillStyle: COLOR.ivory })
      ctx.fillText(this.title, 20, 32)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 27px ${FONT.ui}`
    this.buttons.forEach((b, i) => {
      const { x, y, w: bw, h: bh } = this.regions[i]
      const hot = Object.values(this.hovered).includes(i), armed = b === this.armed
      const pressed = this.pressed === (b.id ?? b.label)
      const fill = armed ? COLOR.ember : b.primary ? COLOR.brass : hot || pressed ? COLOR.steelHi : COLOR.steel
      roundRect(ctx, x, y, bw, bh, 18, fill, hot && !armed ? COLOR.brass : null)
      ctx.fillStyle = b.disabled ? COLOR.mist : armed ? COLOR.ivory : b.primary ? COLOR.ink : b.danger ? COLOR.ember : COLOR.ivory
      const lines = armed ? ['Confirm?'] : wrap(ctx, b.label, bw - 36)
      lines.forEach((l, j) => ctx.fillText(l, x + bw / 2, y + bh / 2 + (j - (lines.length - 1) / 2) * 32))
    })
    this.tex.needsUpdate = true
  }
}

function fit(ctx, text, maxWidth) {
  let value = String(text || '')
  if (ctx.measureText(value).width <= maxWidth) return value
  while (value && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1)
  return value + '…'
}

// One stable surface for navigation. The Back and Return bounds never depend on content.
export class MenuPanel extends ButtonBar {
  constructor() { super(0.48, 0.52, 960) }

  setPage(page) {
    if (page.id !== this.page?.id) {
      this.hovered = {}
      this.armedPoke = {}
      this.armed = null
      this.pressed = null
    }
    this.page = page
    const cols = page.columns || 1, gap = 20, cellW = (904 - gap * (cols - 1)) / cols
    const cellH = cols === 1 ? 78 : 132
    this.buttons = [page.back, ...page.actions, page.returnAction]
    this.regions = [{ x: 28, y: 24, w: 168, h: 66 }, ...page.actions.map((_, i) => ({
      x: 28 + i % cols * (cellW + gap), y: 244 + Math.floor(i / cols) * (cellH + gap), w: cellW, h: cellH
    })), { x: 28, y: 920, w: 904, h: 92 }]
    this.mesh.visible = true
    this.draw()
  }

  draw() {
    const { ctx, page } = this
    if (!page) return
    ctx.clearRect(0, 0, 960, 1040)
    roundRect(ctx, 2, 2, 956, 1036, 36, COLOR.slate, COLOR.steelHi)
    Object.assign(ctx, { textAlign: 'left', textBaseline: 'middle', fillStyle: COLOR.mist, font: `500 26px ${FONT.ui}` })
    ctx.fillText(fit(ctx, page.path, 688), 224, 56)
    Object.assign(ctx, { fillStyle: COLOR.ivory, font: `700 44px ${FONT.display}` })
    ctx.fillText(page.title, 36, 136)
    Object.assign(ctx, { fillStyle: COLOR.mist, font: `500 26px ${FONT.ui}` })
    wrap(ctx, page.sub || '', 888).slice(0, 2).forEach((line, i) => ctx.fillText(line, 36, 185 + i * 32))
    ctx.fillStyle = COLOR.steelHi
    ctx.fillRect(28, 850, 904, 2)
    ctx.fillStyle = COLOR.mist
    ctx.fillText(fit(ctx, page.context, 888), 36, 884)
    this.buttons.forEach((b, i) => {
      const r = this.regions[i], hot = !b.disabled && Object.values(this.hovered).includes(i)
      const pressed = this.pressed === (b.id ?? b.label)
      const fill = b.disabled ? COLOR.ink : b.primary ? COLOR.brass : hot || pressed ? COLOR.steelHi : COLOR.steel
      roundRect(ctx, r.x, r.y, r.w, r.h, 18, fill, b.selected || hot ? COLOR.brass : null)
      const center = (page.columns > 1 && i > 0 && i < this.buttons.length - 1) || i === this.buttons.length - 1
      Object.assign(ctx, { textAlign: center ? 'center' : 'left', font: `600 32px ${FONT.ui}`,
        fillStyle: b.disabled ? COLOR.mist : b.primary ? COLOR.ink : b.selected ? COLOR.brass : b.danger ? COLOR.ember : COLOR.ivory })
      const x = center ? r.x + r.w / 2 : r.x + 22
      const label = (b.selected ? '✓ ' : '') + b.label
      const lines = wrap(ctx, label, r.w - 58)
      const y = r.y + r.h / 2 - (b.detail ? 15 : 0)
      lines.slice(0, 2).forEach((line, j) => ctx.fillText(line, x, y + (j - (Math.min(lines.length, 2) - 1) / 2) * 36))
      if (b.detail) {
        Object.assign(ctx, { font: `500 24px ${FONT.ui}`, fillStyle: b.primary ? COLOR.ink : COLOR.mist })
        ctx.fillText(fit(ctx, b.detail, r.w - 70), x, r.y + r.h / 2 + 20)
      }
      if (b.navigation) {
        Object.assign(ctx, { textAlign: 'right', font: `500 40px ${FONT.ui}`, fillStyle: COLOR.mist })
        ctx.fillText('›', r.x + r.w - 20, r.y + r.h / 2)
      }
    })
    this.tex.needsUpdate = true
  }
}
