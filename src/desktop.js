import { clockState } from './clock.js'

const setText = (element, text) => { if (element.textContent !== text) element.textContent = text }

// Presentation only: sessions and the existing action bar own game state and confirmation.
export class DesktopView {
  constructor(board, navigation, sidebar) {
    Object.assign(this, { board, navigation, sidebar, collapsed: false, launching: false, immersive: false })
    try { this.collapsed = localStorage.getItem('controlsHidden') === '1' } catch { /* optional preference */ }
    this.root = document.createElement('div')
    this.root.id = 'desktop'
    this.root.innerHTML = `
      <button id="controlsToggle" type="button" aria-controls="ui" aria-expanded="true">Hide controls</button>
      <section id="desktopStatus" aria-label="Activity status" hidden>
        <div id="desktopClocks" hidden>
          <div class="desktop-clock" data-player="opponent"><span class="clock-name"></span><span class="clock-value" role="timer"></span></div>
          <div class="desktop-clock" data-player="self"><span class="clock-name"></span><span class="clock-value" role="timer"></span></div>
        </div>
        <strong id="desktopTitle"></strong>
        <div id="desktopMessage" role="status"></div>
        <div id="desktopDetail"></div>
      </section>
      <nav id="desktopActions" aria-label="Activity actions" hidden></nav>`
    sidebar.before(this.root)
    this.toggle = this.root.querySelector('#controlsToggle')
    this.status = this.root.querySelector('#desktopStatus')
    this.clocks = this.root.querySelector('#desktopClocks')
    this.title = this.root.querySelector('#desktopTitle')
    this.message = this.root.querySelector('#desktopMessage')
    this.detail = this.root.querySelector('#desktopDetail')
    this.actions = this.root.querySelector('#desktopActions')
    this.toggle.onclick = () => {
      this.collapsed = !this.collapsed
      try { localStorage.setItem('controlsHidden', this.collapsed ? '1' : '') } catch { /* optional preference */ }
      if (this.collapsed) navigation.close()
      this.layout()
    }
    addEventListener('resize', () => this.layout())
    this.layout()
    // Derive time from timestamps, including after a background tab wakes up.
    this.timer = setInterval(() => this.update(), 100)
  }

  setLaunch(on) { this.launching = on; this.layout() }
  setImmersive(on) { this.immersive = on; this.layout() }
  setMessage(text) { this.notice = text; this.update() }
  setStatus() { this.notice = null; this.update() }

  layout() {
    this.root.hidden = this.launching || this.immersive
    this.sidebar.hidden = this.root.hidden || this.collapsed
    this.toggle.textContent = this.collapsed ? 'Show controls' : 'Hide controls'
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed))
    document.body.classList.toggle('controls-hidden', this.collapsed)
    this.board.setViewShift(!this.sidebar.hidden && innerWidth > 720 ? this.sidebar.offsetWidth + 16 : 0)
    this.update()
  }

  update(now = performance.now()) {
    if (this.root.hidden) return
    const s = this.board.panel.status
    const game = !!s?.names && ['white', 'black'].includes(s.myColor) && Number.isFinite(s.wtime) && Number.isFinite(s.btime)
    this.status.hidden = (!this.collapsed && !game) || (!this.collapsed && innerWidth <= 720)
    this.clocks.hidden = !game
    if (game) {
      const own = s.myColor[0], colors = [own === 'w' ? 'b' : 'w', own]
      Array.from(this.clocks.children).forEach((row, i) => {
        const color = colors[i], name = color === 'w' ? 'white' : 'black'
        const clock = clockState(s, color, now)
        row.dataset.color = name
        row.classList.toggle('active', clock.active)
        row.classList.toggle('low', clock.low)
        setText(row.querySelector('.clock-name'), s.names[name])
        const value = row.querySelector('.clock-value')
        setText(value, clock.text)
        value.setAttribute('aria-label', `${name} time`)
      })
    }
    setText(this.title, s?.big || this.board.activityTitle || 'Free board')
    this.title.hidden = game
    setText(this.message, this.notice || s?.text || '')
    setText(this.detail, this.notice ? '' : s?.sub || '')
    this.actions.hidden = !this.collapsed
    if (this.collapsed) this.renderActions()
  }

  renderActions() {
    const bar = this.board.bar, menu = this.board.menuOpen
    const buttons = menu ? [{ label: 'Return', run: () => this.navigation.close() }] : bar.buttons
    const key = JSON.stringify([menu, buttons.map(b => [b.label, !!b.disabled, !!b.primary, !!b.danger, b === bar.armed])])
    if (key === this.actionKey) return
    this.actionKey = key
    const focused = this.actions.contains(document.activeElement) ? document.activeElement.dataset.action : null
    this.actions.replaceChildren(...buttons.map(action => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.action = action.label
      button.textContent = action === bar.armed ? `Confirm ${action.label.toLowerCase()}` : action.label
      button.disabled = !!action.disabled
      button.classList.toggle('primary', !!action.primary)
      button.classList.toggle('danger', !!action.danger)
      button.classList.toggle('armed', action === bar.armed)
      button.onclick = () => {
        if (menu) this.navigation.close()
        else {
          // Resolve the current action on click; stream updates may replace callbacks.
          const uv = bar.buttonUV(action.label)
          if (uv) bar.press(uv.x, uv.y)
        }
        this.update()
      }
      return button
    }))
    if (focused) [...this.actions.children].find(b => b.dataset.action === focused)?.focus({ preventScroll: true })
  }
}
