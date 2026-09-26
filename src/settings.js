// In-VR settings on the button bar, two pages: Play (opponents, clock) and View (board).
// Values come from get() and change via set(patch); main.js persists them.

export const TIME_PRESETS = ['3+2', '5+3', '10+0', '10+5', '15+10', '30+0']
export const COLORS = ['random', 'white', 'black']
export const MAIA_LEVELS = [1, 5, 9]      // lichess bots maia1 / maia5 / maia9
export const BOARD_SCALES = [0.8, 1, 1.25, 1.5]
export const DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest']
// lichess puzzle angles -> button label ('mix' = no theme filter)
export const THEMES = {
  mix: 'Mixed', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', fork: 'Forks',
  pin: 'Pins', skewer: 'Skewers', endgame: 'Endgames', opening: 'Openings'
}
export const ENVIRONMENTS = ['minimal', 'study', 'sunset', 'night'] // builders in environments.js

// Next entry after cur (first entry if cur isn't in the list).
export const cycle = (list, cur) => list[(list.map(String).indexOf(String(cur)) + 1) % list.length]

// get(): {time, increment, color, rated, level, maia, height, scale, flipped, environment, pdiff, ptheme}
export function settingsView({ board, get, set, onBack }) {
  let page = 'play'
  const view = {
    stop() {},
    render() {
      const s = get()
      board.setStatus({ play: playPage, view: viewPage, puzzles: puzzlePage }[page](s))
    }
  }
  const go = p => () => { page = p; view.render() }

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
        { label: 'Puzzle settings', run: go('puzzles') },
        { label: 'View settings', run: go('view') },
        { label: 'Back', run: onBack }
      ]
    }
  }

  function puzzlePage(s) {
    return {
      puzzle: true, text: 'Settings · Puzzles', sub: 'Applies from the next puzzle',
      actions: [
        { label: `Level ${s.pdiff}`, run: () => set({ pdiff: cycle(DIFFICULTIES, s.pdiff) }) },
        { label: THEMES[s.ptheme] ?? 'Mixed', run: () => set({ ptheme: cycle(Object.keys(THEMES), s.ptheme) }) },
        { label: 'Play settings', run: go('play') },
        { label: 'Back', run: onBack }
      ]
    }
  }

  function viewPage(s) {
    const cm = Math.round(s.height * 100)
    return {
      puzzle: true, text: 'Settings · View', sub: `Table ${cm > 0 ? '+' : ''}${cm} cm`,
      actions: [
        { label: `Scene ${s.environment}`, run: () => set({ environment: cycle(ENVIRONMENTS, s.environment) }) },
        { label: `Board ${Math.round(s.scale * 100)}%`, run: () => set({ scale: cycle(BOARD_SCALES, s.scale) }) },
        { label: 'Table up', run: () => set({ height: s.height + 0.05 }) },
        { label: 'Table down', run: () => set({ height: s.height - 0.05 }) },
        { label: s.flipped ? 'Flipped view' : 'Normal view', run: () => set({ flipped: !s.flipped }) },
        { label: 'Play settings', run: go('play') },
        { label: 'Back', run: onBack }
      ]
    }
  }
  return view
}
