// Spoken moves ("Knight takes F 3, check") via the browser's speechSynthesis.

const NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }
const sq = s => `${s[0].toUpperCase()} ${s[1]}` // "E 4": a bare "a4" reads like a word

// m: chess.js verbose move {piece, from, to, captured?, promotion?, san, flags}
export function moveToSpeech(m) {
  let text = m.flags.includes('k') ? 'Castles kingside'
    : m.flags.includes('q') ? 'Castles queenside'
    : `${NAMES[m.piece]} ${m.captured ? 'takes ' : ''}${sq(m.to)}`
  if (m.promotion) text += `, promotes to ${NAMES[m.promotion].toLowerCase()}`
  if (m.san.endsWith('#')) text += ', checkmate'
  else if (m.san.endsWith('+')) text += ', check'
  return text
}

export function speak(text) {
  const synth = globalThis.speechSynthesis
  if (!synth) return
  synth.cancel() // newest move wins
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.05
  synth.speak(u)
}
