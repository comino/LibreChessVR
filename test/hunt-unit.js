// Bug-hunting edge cases for the pure modules. Run: node test/hunt-unit.js
import { strict as assert } from 'assert'
import { squareToXZ, xzToSquare, parseFen, captured } from '../src/coords.js'
import { makeLineSplitter, isRapid, Lichess } from '../src/lichess.js'
import { cycle, BOARD_SCALES, MAIA_LEVELS, TIME_PRESETS } from '../src/settings.js'
import { moveToSpeech } from '../src/speech.js'

const failed = []
async function check(name, fn) {
  try { await fn() } catch (e) { failed.push(name); console.log(`FAIL ${name}: ${e.message}`) }
}
const enc = new TextEncoder()
const bodyOf = (chunks, signal) => new ReadableStream({
  start(c) {
    for (const ch of chunks) c.enqueue(typeof ch === 'string' ? enc.encode(ch) : ch)
    if (!signal) return c.close() // no signal: finite body; else stays open until aborted
    signal.addEventListener('abort', () => c.error(signal.reason))
  }
})

// --- coords ---
await check('xzToSquare: board edges and just off-board', () => {
  assert.equal(xzToSquare(-3.99, 3.99), 'a1')
  assert.equal(xzToSquare(3.99, -3.99), 'h8')
  for (const [x, z] of [[-4.2, 0], [4.2, 0], [0, 4.2], [0, -4.2], [NaN, 0]]) assert.equal(xzToSquare(x, z), null)
})

await check('parseFen: ignores castling/ep fields, placement-only FEN works', () => {
  assert.equal(parseFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2').length, 32)
  assert.equal(parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR').length, 32)
})

await check('parseFen: over-long rank never yields invalid squares', () => {
  let pieces
  try { pieces = parseFen('rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1') } catch { return }
  for (const p of pieces) assert.match(p.square, /^[a-h][1-8]$/, `bogus square ${p.square}`)
})

await check('captured: promotion to queen after losing the queen', () => {
  // white: queen gone, a pawn promoted -> 1 Q, 7 P on board
  const c = captured('4k3/8/8/8/8/8/PPPPPPP1/RNBQKBNR w - - 0 1')
  assert.deepEqual(c.w, ['p'])
  assert.deepEqual(captured('4k3/8/8/8/8/8/8/4K3 w - - 0 1').w, ['q', 'r', 'r', 'b', 'b', 'n', 'n', ...Array(8).fill('p')])
})

// --- speech ---
await check('moveToSpeech: en passant, promotion-capture, castling with mate', () => {
  const mv = (piece, to, flags, san, extra = {}) => ({ piece, to, flags, san, ...extra })
  assert.equal(moveToSpeech(mv('p', 'd6', 'e', 'exd6', { captured: 'p' })), 'Pawn takes D 6')
  assert.equal(moveToSpeech(mv('p', 'f8', 'cp', 'exf8=Q+', { captured: 'r', promotion: 'q' })), 'Pawn takes F 8, promotes to queen, check')
  assert.equal(moveToSpeech(mv('k', 'g8', 'k', 'O-O#')), 'Castles kingside, checkmate')
})

// --- settings ---
await check('cycle: numeric vs string values', () => {
  assert.equal(cycle(MAIA_LEVELS, '5'), 9)
  assert.equal(cycle(BOARD_SCALES, 1), 1.25)
  assert.equal(cycle(BOARD_SCALES, 1.5), 0.8)
  assert.equal(cycle(TIME_PRESETS, `${10}+${0}`), '10+5')
})

// --- isRapid (lichess: rapid iff limit + 40*inc >= 480 s) ---
await check('isRapid: boundaries', () => {
  assert.equal(isRapid(6, 3), true)     // 360 + 120 = 480
  assert.equal(isRapid(0.5, 12), true)  // 30 + 480
  assert.equal(isRapid(7.5, 0), false)  // 450
})

// --- NDJSON splitter ---
await check('splitter: CRLF, blank keepalives, multibyte split across chunks', async () => {
  const got = []
  const s = makeLineSplitter(o => got.push(o))
  s.push('{"a":1}\r\n\r\n\n')
  s.push('  \n{"n":"Kö')
  s.push('nig"}\r\n')
  s.end()
  assert.deepEqual(got, [{ a: 1 }, { n: 'König' }])
  // byte-level split of 'ö' through Lichess.stream's decoder
  const bytes = enc.encode('{"n":"ö"}\n'), i = bytes.indexOf(0xc3) + 1
  globalThis.fetch = async (url, { signal }) => new Response(bodyOf([bytes.slice(0, i), bytes.slice(i)], null))
  const out = []
  await new Lichess().stream('/x', o => out.push(o))
  assert.deepEqual(out, [{ n: 'ö' }])
})

// --- stream lifecycle ---
await check('stream: throwing handler tears down the HTTP request', async () => {
  let sig
  globalThis.fetch = async (url, o) => { sig = o.signal; return new Response(bodyOf(['{"a":1}\n'], o.signal)) }
  await assert.rejects(new Lichess().stream('/x', () => { throw new Error('handler') }), /handler/)
  assert.equal(sig.aborted, true, 'connection left open (seek stays live / stream leaks)')
})

await check('stream: malformed line tears down the HTTP request', async () => {
  let sig
  globalThis.fetch = async (url, o) => { sig = o.signal; return new Response(bodyOf(['<html>\n'], o.signal)) }
  await assert.rejects(new Lichess().stream('/x', () => {}), SyntaxError)
  assert.equal(sig.aborted, true)
})

await check('stream: caller abort reason is propagated, watchdog timer cleared', async () => {
  globalThis.fetch = async (url, o) => new Response(bodyOf([], o.signal))
  const ac = new AbortController()
  setTimeout(() => ac.abort(new Error('mine')), 20)
  const t0 = Date.now()
  await assert.rejects(new Lichess().stream('/x', () => {}, ac.signal, {}, 60), /mine/)
  assert.ok(Date.now() - t0 < 55)
})

// --- request params ---
await check('_check: object-shaped lichess error gives a readable message', async () => {
  globalThis.fetch = async () => new Response('{"error":{"clock.limit":["Invalid value"]}}', { status: 400, statusText: 'Bad Request' })
  await assert.rejects(new Lichess('t').challengeAi({ level: 1, time: 5, increment: 3 }), e => {
    assert.doesNotMatch(e.message, /\[object Object\]/)
    return true
  })
})

await check('challenge/seek: booleans serialized, no "undefined" values', async () => {
  const bodies = []
  globalThis.fetch = async (url, o) => { bodies.push(String(o.body)); return new Response(o.signal ? bodyOf([], null) : '{}') }
  await new Lichess('t').challenge('maia5', { time: 5, increment: 3, rated: false })
  await new Lichess('t').challengeAi({ level: 3, time: 10, increment: 0 })
  const seekAc = new AbortController()
  const p = new Lichess('t').seek({ time: 10, increment: 5, rated: true, color: 'random' }, seekAc.signal)
  await p
  for (const b of bodies) assert.doesNotMatch(b, /undefined|null/)
  assert.match(bodies[0], /rated=false/)
  assert.match(bodies[0], /clock.limit=300/)
  assert.match(bodies[2], /rated=true/)
})

await check('puzzleNext: undefined difficulty falls back to normal', async () => {
  const urls = []
  globalThis.fetch = async url => { urls.push(url); return new Response('{}') }
  await new Lichess().puzzleNext(undefined, undefined)
  assert.equal(urls[0], 'https://lichess.org/api/puzzle/next?difficulty=normal')
})

console.log(failed.length ? `HUNT-UNIT-FAIL ${failed.length}: ${failed.join(', ')}` : 'HUNT-UNIT-OK')
process.exit(failed.length ? 1 : 0)
