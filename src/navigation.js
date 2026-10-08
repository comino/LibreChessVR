// Menu routes are independent of the activity on the board. Opening, going back and
// returning never stop a session; only an explicit start can replace one.
import { TIME_PRESETS, COLORS, MAIA_LEVELS, BOARD_SCALES, PIECE_STYLES, VOICES,
  BOARD_THEME_NAMES, PIECE_THEME_NAMES, DIFFICULTIES, THEMES, ENVIRONMENTS } from './settings.js'
import { isRapid } from './lichess.js'

const name = s => String(s).charAt(0).toUpperCase() + String(s).slice(1)
const TITLES = { home: 'Menu', play: 'Play', stockfish: 'Stockfish', maia: 'Maia', human: 'Online game',
  train: 'Practice', puzzles: 'Puzzles', settings: 'Settings', appearance: 'Appearance', comfort: 'Comfort',
  input: 'Input & audio', advanced: 'Advanced', account: 'Lichess account', confirm: 'Switch activity?' }
const START_LABELS = { free: 'Open free board', puzzles: 'Start puzzles', rush: 'Start rush',
  coordinates: 'Start coordinates', stockfish: 'Start game', maia: 'Start game', human: 'Find opponent' }

export class Navigation {
  constructor(options) { Object.assign(this, options); this.isOpen = false; this.stack = [] }

  open() { this.isOpen = true; this.stack = [{ id: 'home' }]; this.refresh() }
  close() { this.isOpen = false; this.hide() }
  go(id) {
    if (!this.isOpen) { this.isOpen = true; this.stack = [{ id: 'home' }] }
    this.stack.push(typeof id === 'string' ? { id } : id)
    this.refresh()
  }
  back() { if (this.stack.length > 1) this.stack.pop(); this.refresh() }

  choose(key, title, values, format = name, sub = 'Select a value. Changes are saved immediately.') {
    this.go({ id: 'choice', key, title, values, format, sub })
  }

  requestStart(kind) {
    const c = this.context()
    if (kind === c.kind) return this.close()
    if (c.live) return // a menu must never abandon a live online game
    if (['stockfish', 'maia', 'human'].includes(kind) && !c.username) return this.go('account')
    if (c.progress && kind !== 'human') return this.go({ id: 'confirm', kind })
    this.launch(kind)
  }

  launch(kind) {
    // Re-check after a confirmation: a seek may have matched while the page was open.
    if (this.context().live) return this.refresh()
    this.close()
    this.start(kind)
  }

  refresh() {
    if (!this.isOpen) return
    const c = this.context(), s = this.get(), route = this.stack.at(-1)
    const action = (label, run, detail, extra = {}) => ({ id: label, label, run, detail, ...extra })
    const link = (label, id, detail, disabled = false) => action(label, () => this.go(id), detail, { navigation: true, disabled })
    const field = (label, key, values, format = name, sub) => action(label,
      () => this.choose(key, label, values, format, sub), format(s[key]), { navigation: true })
    const start = kind => action(START_LABELS[kind], () => this.requestStart(kind), null,
      { primary: true, disabled: !!c.live })
    const tc = `${s.time}+${s.increment}`
    const time = action('Time control', () => this.choose('timeControl', 'Time control',
      route.id === 'human' ? TIME_PRESETS.filter(t => isRapid(...t.split('+').map(Number))) : TIME_PRESETS,
      v => v, 'Minutes + extra seconds per move.'), tc, { navigation: true })
    let actions = [], sub = '', columns = 1
    switch (route.id) {
      case 'home':
        sub = c.notice || (c.username ? `Connected as ${c.username}` : 'Practice reading a real chessboard. No account needed.')
        actions = [link('Practice', 'train', c.live ? 'Finish the current game first' : 'Puzzles, rush and square drills', !!c.live),
          action('Free board', () => this.requestStart('free'), 'Move both sides, undo and explore', { disabled: !!c.live }),
          link('Play', 'play', c.live ? 'Finish the current game first' : 'Stockfish, Maia or another player', !!c.live),
          link('Settings', 'settings', 'Appearance, comfort and input'),
          link('Account', 'account', c.username || 'Connect to lichess')]
        if (c.seeking) actions.push(action('Cancel seek', this.cancelSeek, 'Stop looking for an opponent'))
        break
      case 'play':
        sub = 'Choose an opponent, then set up your game.'
        actions = [link('Stockfish', 'stockfish', 'Chess engine · 8 levels'),
          link('Maia', 'maia', 'Human-like play · 3 levels'), link('Online player', 'human', 'Find a lichess opponent')]
        break
      case 'stockfish': case 'maia': case 'human':
        sub = c.notice || (c.username ? 'Your choices are saved for the next game.' : 'A lichess account is needed to play.')
        if (route.id === 'stockfish') actions.push(field('Level', 'level', [1, 2, 3, 4, 5, 6, 7, 8], String))
        if (route.id === 'maia') actions.push(field('Level', 'maia', MAIA_LEVELS, v => `Maia ${v}`))
        actions.push(time, field('Your side', 'color', COLORS))
        if (route.id !== 'stockfish') actions.push(field('Game type', 'rated', [false, true], v => v ? 'Rated' : 'Casual'))
        actions.push(start(route.id))
        if (route.id === 'human' && !isRapid(s.time, s.increment)) {
          actions.at(-1).disabled = true
          actions.at(-1).detail = 'Choose rapid or slower in Time control'
        }
        break
      case 'train':
        sub = 'Get used to reading pieces and squares in 3D.'
        actions = [link('Puzzles', 'puzzles', 'Choose a theme and difficulty'),
          action('Puzzle rush', () => this.requestStart('rush'), '3 minutes · 3 lives'),
          action('Coordinates', () => this.requestStart('coordinates'), 'Find squares · 30 seconds')]
        break
      case 'puzzles':
        sub = 'Difficulty and theme apply from the next puzzle.'
        actions = [field('Difficulty', 'pdiff', DIFFICULTIES), field('Theme', 'ptheme', Object.keys(THEMES), v => name(THEMES[v])),
          field('Piece visibility', 'pieces', PIECE_STYLES, name, 'Ghost or hidden pieces for blindfold practice.'), start('puzzles')]
        break
      case 'settings':
        sub = 'You can return to your activity from every page.'
        actions = [link('Appearance', 'appearance', 'Scene, board and piece set'),
          link('Comfort', 'comfort', 'Table height, board size and orientation'),
          link('Input & audio', 'input', 'Hands and spoken moves'), link('Advanced', 'advanced', 'Resolution and frame rate')]
        break
      case 'appearance':
        sub = 'Preview changes on the board.'
        actions = [field('Scene', 'environment', ENVIRONMENTS), field('Board theme', 'boardTheme', BOARD_THEME_NAMES),
          field('Piece set', 'pieceTheme', PIECE_THEME_NAMES)]
        break
      case 'comfort': {
        const cm = Math.round(s.height * 100)
        sub = `Table height ${cm > 0 ? '+' : ''}${cm} cm · Menu stays in place.`
        actions = [action('Table up', () => this.set({ height: s.height + 0.05 }), 'Raise by 5 cm', { disabled: s.height >= 0.45 }),
          action('Table down', () => this.set({ height: s.height - 0.05 }), 'Lower by 5 cm', { disabled: s.height <= -0.45 }),
          field('Board size', 'scale', BOARD_SCALES, v => `${Math.round(v * 100)}%`),
          field('Board orientation', 'flipped', [false, true], v => v ? 'Opposite side' : 'My side')]
        break
      }
      case 'input':
        sub = 'Menu pointing and touch work with either hand mode.'
        actions = [field('Piece interaction', 'hands', ['ray', 'grab'], v => v === 'grab' ? 'Grab pieces' : 'Point & pinch'),
          field('Spoken moves', 'voice', VOICES, v => ({ off: 'Off', opponent: 'Opponent only', all: 'All moves' })[v])]
        break
      case 'advanced':
        sub = 'Resolution changes apply the next time you enter VR.'
        actions = [field('Resolution', 'resolution', ['native', 'normal']),
          field('Frame rate', 'fps', [false, true], v => v ? 'Show FPS' : 'Hide FPS')]
        break
      case 'account':
        sub = c.username ? `Connected as ${c.username}` : 'Login opens lichess in the browser and leaves VR.'
        actions = c.username ? [] : [action('Log in', this.login, 'Return here after connecting', { primary: true })]
        break
      case 'choice': {
        sub = route.sub
        columns = route.values.length > 6 ? 3 : 2
        const current = route.key === 'timeControl' ? tc : s[route.key]
        actions = route.values.map(value => action(route.format(value), () => {
          if (route.key === 'timeControl') {
            const [time, increment] = value.split('+').map(Number)
            this.set({ time, increment })
          } else this.set({ [route.key]: value })
        }, null, { id: String(value), selected: String(value) === String(current) }))
        break
      }
      case 'confirm':
        sub = c.live ? 'A game has started. Return to it to keep playing.' : `This will leave your current ${c.label.toLowerCase()}.`
        actions = [action('Keep playing', () => this.close()),
          action(START_LABELS[route.kind], () => this.launch(route.kind), 'Replace the current activity', { danger: true, disabled: !!c.live })]
        break
    }
    this.show({ id: this.stack.map(r => r.key || r.id).join('/'), title: route.title || TITLES[route.id],
      path: this.stack.slice(0, -1).map(r => r.title || TITLES[r.id]).join(' / ') || 'LIBRECHESSVR',
      sub, actions, columns,
      context: `${c.label}${c.timed ? ' · Clock running' : ''}`,
      back: { id: 'back', label: '‹ Back', disabled: this.stack.length < 2, run: () => this.back() },
      returnAction: { id: 'return', label: `Return to ${c.label.toLowerCase()}`, primary: true, run: () => this.close() }
    })
  }
}
