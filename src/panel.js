// In-scene UI: a status panel (names, clocks, text) and a reachable button bar
// pressed by controller ray, mouse click or fingertip poke.

import * as THREE from 'three'

function canvasPlane(w, h, px) {
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = Math.round(px * h / w)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  return { canvas, ctx: canvas.getContext('2d'), tex, mesh }
}

const fmt = ms => {
  const t = Math.ceil(ms / 1000)
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}

export class StatusPanel {
  constructor() {
    Object.assign(this, canvasPlane(0.5, 0.25, 512))
    this.status = null
    this.draw()
  }

  // status: {names:{white,black}, myColor, wtime, btime, turn, running, text, ts?}
  //      or {puzzle: true, text, sub}
  set(status) {
    this.status = { ...status, ts: status.ts ?? performance.now() }
    this.draw()
  }

  tick() {
    if (this.status?.running && performance.now() - this.drawn > 500) this.draw()
  }

  draw() {
    const { ctx } = this, s = this.status
    this.drawn = performance.now()
    ctx.clearRect(0, 0, 512, 256)
    ctx.fillStyle = 'rgba(15,18,24,0.85)'
    ctx.beginPath()
    ctx.roundRect(0, 0, 512, 256, 24)
    ctx.fill()
    ctx.textAlign = 'center'
    if (!s || s.puzzle) {
      this._text(s ? s.text : 'No game', '#c8ccd4', '32px sans-serif', 256, s ? 118 : 140)
      this._text(s?.sub, '#8899aa', '24px sans-serif', 256, 168)
    } else {
      const opp = s.myColor === 'white' ? 'b' : 'w'
      this._clockRow(60, opp)
      this._clockRow(225, s.myColor[0])
      this._text(s.text, '#8899aa', '26px sans-serif', 256, 143)
    }
    this.tex.needsUpdate = true
  }

  _clockRow(y, c) {
    const s = this.status, active = s.turn === c && s.running
    const elapsed = active ? performance.now() - s.ts : 0
    const color = active ? '#e8d44a' : '#c8ccd4'
    this.ctx.textAlign = 'left'
    this._text(s.names[c === 'w' ? 'white' : 'black'], color, '34px sans-serif', 30, y)
    this.ctx.textAlign = 'right'
    this._text(fmt(Math.max(0, (c === 'w' ? s.wtime : s.btime) - elapsed)), color, 'bold 40px monospace', 482, y)
  }

  _text(text, color, font, x, y) {
    if (!text) return
    Object.assign(this.ctx, { fillStyle: color, font })
    this.ctx.fillText(text, x, y)
  }
}

const BAR_W = 0.3, BAR_H = 0.12, COLS = 3, ROWS = 2, CONFIRM_MS = 3000

export class ButtonBar {
  constructor() {
    Object.assign(this, canvasPlane(BAR_W, BAR_H, 600))
    this.buttons = []
    this.armed = null
    this.pokes = {}
    this.hovered = {} // pointer key -> button index
    this.draw()
  }

  // buttons: [{label, run, confirm?}] — confirm buttons need a second press within 3 s.
  set(buttons = []) {
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

  // Fingertip poke: press when the tip reaches the surface, re-arm once it backs off.
  poke(worldPos, key) {
    if (!worldPos || !this.mesh.visible) return void (this.pokes[key] = false)
    const p = this.mesh.worldToLocal(worldPos.clone())
    const inside = Math.abs(p.x) < BAR_W / 2 && Math.abs(p.y) < BAR_H / 2
    if (!this.pokes[key] && inside && p.z < 0.01 && p.z > -0.04) {
      this.pokes[key] = true
      this.press(p.x / BAR_W + 0.5, p.y / BAR_H + 0.5)
    } else if (this.pokes[key] && (!inside || p.z > 0.025)) {
      this.pokes[key] = false
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
    ctx.font = '30px sans-serif'
    this.buttons.forEach((b, i) => {
      const x = (i % COLS) * bw, y = Math.floor(i / COLS) * bh
      const hot = Object.values(this.hovered).includes(i)
      ctx.fillStyle = b === this.armed ? '#8a2a1a' : hot ? 'rgba(70,82,100,0.95)' : 'rgba(42,48,56,0.92)'
      ctx.beginPath()
      ctx.roundRect(x + 6, y + 6, bw - 12, bh - 12, 16)
      ctx.fill()
      ctx.fillStyle = '#e0e4ea'
      const lines = b === this.armed ? ['Confirm?'] : b.label.split(' ')
      lines.forEach((l, j) => ctx.fillText(l, x + bw / 2, y + bh / 2 + (j - (lines.length - 1) / 2) * 34))
    })
    this.mesh.visible = this.buttons.length > 0
    this.tex.needsUpdate = true
  }
}
