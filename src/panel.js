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
  constructor() {
    Object.assign(this, canvasPlane(BAR_W, BAR_H, 600))
    this.buttons = []
    this.armed = null
    this.armedPoke = {} // pointer key -> tip was seen in front of the bar
    this.hovered = {} // pointer key -> button index
    this.draw()
    fontsReady.then(() => this.draw())
  }

  // buttons: [{label, run, confirm?, primary?}] — confirm buttons need a second press within 3 s;
  // primary = the screen's main action (brass).
  set(buttons = []) {
    if (buttons.length > COLS * ROWS) console.warn('ButtonBar: dropping', buttons.slice(COLS * ROWS).map(b => b.label))
    this.buttons = buttons.slice(0, COLS * ROWS)
    this.armed = this.buttons.find(b => b.label === this.armed?.label) || null
    this.draw()
  }

  // u,v: texture coords (v = 1 at the top). Returns true if a button was hit.
  press(u, v) {
    const b = this.buttons[this._index(u, v)]
    if (!b) return false
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

  _index(u, v) { return Math.min(COLS - 1, Math.floor(u * COLS)) + COLS * Math.floor((1 - v) * ROWS) }

  // Fingertip poke: arms while the tip is in front of the bar, presses when it reaches the
  // surface (only from the front: a hand pulling back out through the bar never presses).
  poke(worldPos, key) {
    if (!worldPos || !this.mesh.visible) return void (this.armedPoke[key] = false)
    const p = this.mesh.worldToLocal(_p.copy(worldPos))
    const inside = Math.abs(p.x) < BAR_W / 2 && Math.abs(p.y) < BAR_H / 2
    if (!inside || p.z > 0.025) this.armedPoke[key] = inside && p.z < 0.15
    else if (p.z <= -0.04) this.armedPoke[key] = false // went through: must come back out front
    else if (this.armedPoke[key] && p.z < 0.01) {
      this.armedPoke[key] = false
      this.press(p.x / BAR_W + 0.5, p.y / BAR_H + 0.5)
    }
  }

  tick() {
    if (this.armed && performance.now() - this.armedAt > CONFIRM_MS) {
      this.armed = null
      this.draw()
    }
  }

  draw() {
    const { ctx, canvas: { width: w, height: h } } = this
    const bw = w / COLS, bh = h / ROWS
    ctx.clearRect(0, 0, w, h)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 27px ${FONT.ui}`
    this.buttons.forEach((b, i) => {
      const x = (i % COLS) * bw, y = Math.floor(i / COLS) * bh
      const hot = Object.values(this.hovered).includes(i), armed = b === this.armed
      const fill = armed ? COLOR.ember : b.primary ? COLOR.brass : hot ? COLOR.steelHi : COLOR.steel
      roundRect(ctx, x + 6, y + 6, bw - 12, bh - 12, 18, fill, hot && !armed ? COLOR.brass : null)
      ctx.fillStyle = b.primary && !armed ? COLOR.ink : COLOR.ivory
      const lines = armed ? ['Confirm?'] : wrap(ctx, b.label, bw - 36)
      lines.forEach((l, j) => ctx.fillText(l, x + bw / 2, y + bh / 2 + (j - (lines.length - 1) / 2) * 32))
    })
    this.mesh.visible = this.buttons.length > 0
    this.tex.needsUpdate = true
  }
}
