// Parallax design tokens (see BRAND.md). CSS mirrors these as variables in index.html.

export const COLOR = {
  ink: '#0F1218', slate: '#1A1F28', steel: '#2A313D', steelHi: '#3A4456', walnut: '#4A3020',
  ivory: '#ECE6D6', mist: '#9AA3B2',
  brass: '#D9A441', moss: '#3F9D6A', azure: '#4C7FD1', ember: '#D5543F', violet: '#7B5CD6', amber: '#C98A2B'
}

// Square tints: the tile color is blended toward these token colors by TINT_MIX (reads on
// light and dark squares alike); hover adds a little emissive light on top.
const hex = c => parseInt(c.slice(1), 16)
export const TINT = {
  select: hex(COLOR.brass), target: hex(COLOR.moss), last: hex(COLOR.azure), check: hex(COLOR.ember),
  premove: hex(COLOR.violet), hint: hex(COLOR.amber), good: hex(COLOR.moss), bad: hex(COLOR.ember),
  hover: 0x303030
}
export const TINT_MIX = 0.55

export const BOARD = { light: 0xe3cfa6, dark: 0x8a5a36, frame: 0x2e1f14, label: '#d8c6a0' }
export const PIECES = { white: 0xf2ead8, black: 0x2f2b27 }
const css = n => '#' + n.toString(16).padStart(6, '0')
export const PIECE_CSS = { w: css(PIECES.white), b: css(PIECES.black) }

export const FONT = {
  display: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif",
  ui: "Inter, system-ui, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace"
}
