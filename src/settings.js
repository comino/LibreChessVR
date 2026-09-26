// In-VR settings page on the button bar: cycles the same persisted values as the 2D form.

export const TIME_PRESETS = ['3+2', '5+3', '10+0', '10+5', '15+10', '30+0']
export const COLORS = ['random', 'white', 'black']

// Next entry after cur (first entry if cur isn't in the list).
export const cycle = (list, cur) => list[(list.indexOf(String(cur)) + 1) % list.length]

// get(): {time, increment, color, rated, level}; set(patch); height: {get(), nudge(m)}
export function settingsView({ board, get, set, height, onBack }) {
  return {
    stop() {},
    render() {
      const s = get(), tc = `${s.time}+${s.increment}`
      const cm = Math.round(height.get() * 100)
      board.setStatus({
        puzzle: true, text: 'Settings', sub: `Table ${cm > 0 ? '+' : ''}${cm} cm`,
        actions: [
          { label: `Stockfish L${s.level}`, run: () => set({ level: s.level % 8 + 1 }) },
          { label: `Time ${tc}`, run: () => {
            const [time, increment] = cycle(TIME_PRESETS, tc).split('+').map(Number)
            set({ time, increment })
          } },
          { label: `Color ${s.color}`, run: () => set({ color: cycle(COLORS, s.color) }) },
          { label: s.rated ? 'Rated' : 'Casual', run: () => set({ rated: !s.rated }) },
          { label: 'Table up', run: () => height.nudge(0.05) },
          { label: 'Table down', run: () => height.nudge(-0.05) },
          { label: 'Back', run: onBack }
        ]
      })
    }
  }
}
