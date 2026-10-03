// In-VR settings on the button bar: an overview page leading to Look, Play, Puzzles and View.
// Values come from get() and change via set(patch); main.js persists them.

export const TIME_PRESETS = ['3+2', '5+3', '10+0', '10+5', '15+10', '30+0']
export const COLORS = ['random', 'white', 'black']
export const MAIA_LEVELS = [1, 5, 9]      // lichess bots maia1 / maia5 / maia9
export const BOARD_SCALES = [0.8, 1, 1.25, 1.5]
export const PIECE_STYLES = ['solid', 'ghost', 'hidden']
export const VOICES = ['off', 'opponent', 'all']
export const BOARD_THEME_NAMES = ['walnut', 'green', 'ice', 'marble', 'midnight'] // see theme.js
export const PIECE_THEME_NAMES = ['antique', 'ivory', 'classic', 'gold', 'maple', 'neon']
export const DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest']
// lichess puzzle angles -> button label ('mix' = no theme filter)
export const THEMES = {
  mix: 'mixed', mateIn1: 'mate in 1', mateIn2: 'mate in 2', mateIn3: 'mate in 3', fork: 'forks',
  pin: 'pins', skewer: 'skewers', endgame: 'endgames', opening: 'openings'
}
export const ENVIRONMENTS = ['minimal', 'study', 'sunset', 'night'] // builders in environments.js

// Next entry after cur (first entry if cur isn't in the list).
export const cycle = (list, cur) => list[(list.map(String).indexOf(String(cur)) + 1) % list.length]

// get(): {time, increment, color, rated, level, maia, height, scale, flipped, environment, pieces, voice, hands, pdiff, ptheme, boardTheme, pieceTheme, fps, resolution}
export function settingsView({ board, get, set, onBack }) {
  let page = 'hub'
  const view = {
    stop() {},
    render() {
      const s = get()
      board.setStatus({ hub: hubPage, play: playPage, view: viewPage, look: lookPage, puzzles: puzzlePage }[page](s))
    }
  }
  const go = p => () => { page = p; view.render() }

  // Overview: every settings page one press away.
  function hubPage() {
    return {
      puzzle: true, text: 'Settings', sub: 'Look · Play · Puzzles · View',
      actions: [
        { label: 'Look', run: go('look'), primary: true },
        { label: 'Play', run: go('play') },
        { label: 'Puzzles', run: go('puzzles') },
        { label: 'View', run: go('view') },
        { label: 'Menu', run: onBack }
      ]
    }
  }

  function playPage(s) {
    const tc = `${s.time}+${s.increment}`
    return {
      puzzle: true, text: 'Settings · Play', sub: 'Opponents and clock',
      actions: [
        { label: `Stockfish L${s.level}`, run: () => set({ level: s.level % 8 + 1 }) },
        { label: `Maia ${s.maia}`, run: () => set({ maia: cycle(MAIA_LEVELS, s.maia) }) },
        { label: `Time ${tc}`, run: () => {
          const [time, increment] = cycle(TIME_PRESETS, tc).split('+').map(Number)
          set({ time, increment })
        } },
        { label: `Color ${s.color}`, run: () => set({ color: cycle(COLORS, s.color) }) },
        { label: s.rated ? 'Rated' : 'Casual', run: () => set({ rated: !s.rated }) },
        { label: 'All settings', run: go('hub') },
        { label: 'Menu', run: onBack }
      ]
    }
  }

  function puzzlePage(s) {
    return {
      puzzle: true, text: 'Settings · Puzzles', sub: 'Applies from the next puzzle',
      actions: [
        { label: `Difficulty ${s.pdiff}`, run: () => set({ pdiff: cycle(DIFFICULTIES, s.pdiff) }) },
        { label: `Theme ${THEMES[s.ptheme] ?? 'mixed'}`, run: () => set({ ptheme: cycle(Object.keys(THEMES), s.ptheme) }) },
        { label: 'All settings', run: go('hub') },
        { label: 'Menu', run: onBack }
      ]
    }
  }

  function lookPage(s) {
    return {
      puzzle: true, text: 'Settings · Look', sub: 'Scene, board and pieces',
      actions: [
        { label: `Scene ${s.environment}`, run: () => set({ environment: cycle(ENVIRONMENTS, s.environment) }) },
        { label: `Board ${s.boardTheme}`, run: () => set({ boardTheme: cycle(BOARD_THEME_NAMES, s.boardTheme) }) },
        { label: `Set ${s.pieceTheme}`, run: () => set({ pieceTheme: cycle(PIECE_THEME_NAMES, s.pieceTheme) }) },
        { label: `Pieces ${s.pieces}`, run: () => set({ pieces: cycle(PIECE_STYLES, s.pieces) }) },
        { label: `Size ${Math.round(s.scale * 100)}%`, run: () => set({ scale: cycle(BOARD_SCALES, s.scale) }) },
        { label: 'All settings', run: go('hub') },
        { label: 'Menu', run: onBack }
      ]
    }
  }

  function viewPage(s) {
    const cm = Math.round(s.height * 100)
    return {
      puzzle: true, text: 'Settings · View', sub: `Table ${cm > 0 ? '+' : ''}${cm} cm`,
      actions: [
        { label: `Voice ${s.voice}`, run: () => set({ voice: cycle(VOICES, s.voice) }) },
        { label: 'Table up', run: () => set({ height: s.height + 0.05 }) },
        { label: 'Table down', run: () => set({ height: s.height - 0.05 }) },
        { label: `Flip ${s.flipped ? 'on' : 'off'}`, run: () => set({ flipped: !s.flipped }) },
        { label: `Hands ${s.hands === 'grab' ? 'grab' : 'point'}`, run: () => set({ hands: s.hands === 'grab' ? 'ray' : 'grab' }) },
        { label: `FPS ${s.fps ? 'on' : 'off'}`, run: () => set({ fps: !s.fps }) },
        { label: `Resolution ${s.resolution}`, run: () => set({ resolution: s.resolution === 'native' ? 'normal' : 'native' }) },
        { label: 'All settings', run: go('hub') },
        { label: 'Menu', run: onBack }
      ]
    }
  }
  return view
}
