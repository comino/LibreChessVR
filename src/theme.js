// 3D Chess Practice design tokens (see BRAND.md). CSS mirrors these in index.html.

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

// Board themes: square colors (they tint the grain texture), frame, coordinate labels.
export const BOARD_THEMES = {
  walnut: { light: 0xe3cfa6, dark: 0x8a5a36, frame: 0x2e1f14, label: '#d8c6a0', grain: 'wood' },
  green: { light: 0xeeeed2, dark: 0x6f9a52, frame: 0x26331f, label: '#e8ecd0', grain: 'fine' },
  ice: { light: 0xdee3e6, dark: 0x7c98a8, frame: 0x26323c, label: '#dfe7ec', grain: 'fine' },
  marble: { light: 0xeeebe6, dark: 0x6e6a68, frame: 0x2a2826, label: '#e6e2dc', grain: 'marble' },
  midnight: { light: 0x4a5470, dark: 0x1e2434, frame: 0x0f1218, label: '#9aa3b2', grain: 'fine' }
}
export const BOARD = BOARD_THEMES.walnut

// Piece sets: material params for white (w) and black (b); unset params use the defaults.
export const PIECE_DEFAULTS = { roughness: 0.35, metalness: 0.05, emissive: 0 }
export const PIECE_THEMES = {
  antique: { textured: true, detail: 'none', w: { color: 0xffffff, roughness: 1, metalness: 1 }, b: { color: 0xffffff, roughness: 1, metalness: 1 } },
  ivory: { detail: 'lathe', w: { color: 0xf2ead8 }, b: { color: 0x2f2b27 } },
  classic: { detail: 'lathe', w: { color: 0xfafafa, roughness: 0.18 }, b: { color: 0x17171a, roughness: 0.18 } },
  gold: { detail: 'brushed', w: { color: 0xe0b85e, metalness: 0.85, roughness: 0.28 }, b: { color: 0xd0d4dc, metalness: 0.75, roughness: 0.3 } },
  maple: { detail: 'wood', w: { color: 0xe8c99a, roughness: 0.55 }, b: { color: 0x5a3a22, roughness: 0.55 } },
  neon: { detail: 'glow', w: { color: 0x9ff4ff, emissive: 0x0a8aa0, roughness: 0.3 }, b: { color: 0xff8ad8, emissive: 0x8a1066, roughness: 0.3 } }
}
// Procedural surface detail per set (shader, no textures): see board3d PIECE_DETAIL.
export const DETAIL_KINDS = ['none', 'lathe', 'wood', 'brushed', 'glow']
export const PIECES = { white: PIECE_THEMES.ivory.w.color, black: PIECE_THEMES.ivory.b.color }
const css = n => '#' + n.toString(16).padStart(6, '0')
export const PIECE_CSS = { w: css(PIECES.white), b: css(PIECES.black) }

export const FONT = {
  display: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif",
  ui: "Inter, system-ui, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace"
}
