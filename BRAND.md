# LibreChessVR — writing and visual guide

**LibreChessVR** · *Board vision practice for online chess players.*
A free 3D board vision practice tool for people who learned chess online and find physical
boards harder to read. Puzzles, square drills and a free board are the main activities;
VR and Lichess games are optional. This is a small practice project. Describe its purpose
plainly, without a sales pitch or promises of rating gains. Design tokens
live in one place: `src/theme.js` (3D + canvas UI) mirrored as CSS variables in `index.html`.

## Name & voice

- Name and installed-app label: **LibreChessVR**, with this capitalization.
- Main explanation: *Board vision practice for online chess players.* Short version: *Read a real chessboard.*
- LibreChessVR is an open-source community project under MIT. Use the full name consistently;
  explain that desktop practice works too, even though VR is part of the name.
- Say who it helps: online players who find real boards unfamiliar. Lead with practice;
  make clear that no account or headset is needed. Lichess login is only for playing games.
- Describe exercises and intent, not proven improvements in OTB performance. No growth,
  subscription, premium or launch-hype language.
- Voice: calm, precise, a good coach. Short sentences, chess vocabulary, no exclamation spam.
  "Your move", "Premove Nf3", "Rush over — 12 solved". Errors say what happened and what to do:
  "Seeks need rapid or slower (10+0, 5+5). Blitz works vs Stockfish."
- Button labels: 1–2 words, sentence case ("Offer draw", "Puzzle rush"). A value shown on a
  button reads as `Name value` ("Board 125%", "Voice opponent", "Seek 10+5"). Context that
  doesn't fit (time control, color, rating) goes on the panel's sub line. "Menu" opens navigation without ending an activity. "Back" goes up one menu level;
  "Return to …" closes navigation. Only explicit End / Resign / Start actions replace an activity. Separator: " · ". No exclamation marks.

## Logo

`assets/brand/mark.svg` — a 2×2 board square with a brass frame offset up-right: the same square
seen from a second viewpoint. `assets/brand/wordmark.svg` — mark + name + short explanation.
Keep the mark on Ink; minimum size 16 px; don't recolor the frame.
`assets/brand/preview.png` is the 1200×630 sharing image, made from the practice board.

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

- Display / wordmark: **Space Grotesk** 700, title case, normal or slightly tight tracking.
- UI and body: **Inter** 400/500/600. Clocks: **JetBrains Mono** 600 (tabular digits).
- Fallbacks: system-ui / monospace. Canvas UI (panel, button bar) redraws once fonts load.

## Shape & space

- Radius: 16 px buttons, 24 px panels and cards; the in-VR bar uses the same ratios.
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32. Panels breathe: ≥ 24 px inner padding.
- Surfaces are flat Slate at ~90 % opacity over the scene; no gradients except the hero.

## In-VR UI

- **Status panel** (far, readable): names + clocks (mono), one status line, one sub line.
- **Activity bar** (near, reachable): current activity title, up to 3×3 actions, and a fixed
  full-width Menu footer. Board tools and destructive game actions keep their slots.
- **Menu panel**: one bounded surface with breadcrumb, title, helper text and controls together.
  Back stays at the top left; Return to the current activity stays at the bottom. Settings use
  visible choices with selected states. Opening or backing out preserves the board, history,
  game stream and clocks. Timed activities keep running with their status visible.
- Menu placement is fixed while open, independently of table height and board size. Both
  pointing and fingertip touch work regardless of the piece-grabbing preference. Hover =
  lighter steel with a brass outline; primary = brass; destructive = ember; disabled = mist.
  Every accepted UI press has an audible tick; controllers also provide haptics.
- Sounds: wooden clack for moves, two clacks for captures, soft two-tone for start/solve,
  low buzz for errors. Voice announcements are optional (Settings → Input & audio).

## Scenes

Study (default) · Sunset · Night · Minimal. Each is lit so the board stays the brightest,
highest-contrast object in view; UI never fogs or tone-maps. Study = cozy old European house
(dark wood, fire, antique furniture); Sunset = warm, calm Mediterranean / Arabian terrace
(terracotta, whitewash, brass lanterns, olive trees) — few objects, lots of air; Night = campsite clearing in the pines (fire pit,
lantern on a boulder, aurora).
