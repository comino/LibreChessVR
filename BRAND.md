# Parallax — brand & design guide

**Parallax** · *Chess in depth.*
A VR chess client for lichess that trains the one thing flat screens can't: seeing the board in
three dimensions. Every surface — repo, 2D page, headset UI — follows this guide. Design tokens
live in one place: `src/theme.js` (3D + canvas UI) mirrored as CSS variables in `index.html`.

## Name & voice

- Product name: **Parallax** (wordmark in caps: PARALLAX). Never "ChessVR" in user-facing text.
- Tagline: *Chess in depth.*
- Voice: calm, precise, a good coach. Short sentences, chess vocabulary, no exclamation spam.
  "Your move", "Premove Nf3", "Rush over — 12 solved". Errors say what happened and what to do:
  "Seeks need rapid or slower (10+0, 5+5). Blitz works vs Stockfish."
- Button labels: 1–2 words, sentence case ("Offer draw", "Puzzle rush"). A value shown on a
  button reads as `Name value` ("Board 125%", "Voice opponent", "Seek 10+5"). Context that
  doesn't fit (time control, color, rating) goes on the panel's sub line. Leaving any screen
  is always "Menu". Separator: " · ". No exclamation marks.

## Logo

`assets/brand/mark.svg` — a 2×2 board square with a brass frame offset up-right: the same square
seen from a second viewpoint. `assets/brand/wordmark.svg` — mark + PARALLAX + tagline.
Keep the mark on Ink; minimum size 16 px; don't recolor the frame.

## Color

| Token | Hex | Use |
|-------|-----|-----|
| `ink` | `#0F1218` | page background, deepest surfaces |
| `slate` | `#1A1F28` | panels, cards |
| `steel` | `#2A313D` | buttons, inputs, dividers |
| `ivory` | `#ECE6D6` | primary text, light pieces |
| `mist` | `#9AA3B2` | secondary text |
| `brass` | `#D9A441` | **the** accent: primary actions, selection, active clock, logo frame |
| `moss` | `#3F9D6A` | legal targets, success, "solved" |
| `azure` | `#4C7FD1` | last move, information |
| `ember` | `#D5543F` | check, danger, low time, wrong move, confirm-to-resign |
| `violet` | `#7B5CD6` | premoves |
| `amber` | `#C98A2B` | hints |

Board: light squares `#E3CFA6`, dark squares `#8A5A36`, frame walnut. Square tints use the same
hues as UI tokens (darkened for emissive light), with this priority, lowest first:
last move (azure) < check (ember) < session marks (hint amber / premove violet / trainer) <
selection (brass) + targets (moss) < hover (brightens whatever is below).

## Type

- Display / wordmark: **Space Grotesk** 700, tracking +0.15em, caps.
- UI and body: **Inter** 400/500/600. Clocks: **JetBrains Mono** 600 (tabular digits).
- Fallbacks: system-ui / monospace. Canvas UI (panel, button bar) redraws once fonts load.

## Shape & space

- Radius: 16 px buttons, 24 px panels and cards; the in-VR bar uses the same ratios.
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32. Panels breathe: ≥ 24 px inner padding.
- Surfaces are flat Slate at ~90 % opacity over the scene; no gradients except the hero.

## In-VR UI

- **Status panel** (far, readable): names + clocks (mono), one status line, one sub line.
- **Button bar** (near, reachable): 3×3 max; hover = lighter steel; armed confirm = ember;
  primary action of a screen may use brass text.
- Sounds: wooden clack for moves, two clacks for captures, soft two-tone for start/solve,
  low buzz for errors. Voice announcements are optional (Settings → View).

## Scenes

Study (default) · Sunset · Night · Minimal. Each is lit so the board stays the brightest,
highest-contrast object in view; UI never fogs or tone-maps. Study = cozy old European house
(dark wood, fire, antique furniture); Sunset = warm, calm Mediterranean / Arabian terrace
(terracotta, whitewash, brass lanterns, olive trees) — few objects, lots of air.
