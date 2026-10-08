// Shared setting values for VR navigation and pure logic tests.
// navigation.js presents choices; main.js persists them.

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
