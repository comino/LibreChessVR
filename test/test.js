// Node unit tests for the pure logic. Run: node test/test.js
import { strict as assert } from 'assert'
import { squareToXZ, xzToSquare, parseFen, captured } from '../src/coords.js'
import { makeLineSplitter, isRapid, Lichess } from '../src/lichess.js'
import { cycle, TIME_PRESETS } from '../src/settings.js'

// --- coords ---
assert.deepEqual(squareToXZ('a1'), { x: -3.5, z: 3.5 })
assert.deepEqual(squareToXZ('h8'), { x: 3.5, z: -3.5 })
assert.deepEqual(squareToXZ('e4'), { x: 0.5, z: 0.5 })
assert.deepEqual(squareToXZ('a1', 0.06), { x: -0.21, z: 0.21 })

// --- xzToSquare: roundtrip for all squares, off-center rounding, off-board ---
for (const f of 'abcdefgh') for (let r = 1; r <= 8; r++) {
  const sq = f + r
  const { x, z } = squareToXZ(sq, 0.06)
  assert.equal(xzToSquare(x, z, 0.06), sq)
}
assert.equal(xzToSquare(0.52, 0.48), 'e4')  // rounds to nearest square center
assert.equal(xzToSquare(10, 0), null)
assert.equal(xzToSquare(-4.1, 0), null)

// --- parseFen ---
const start = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
assert.equal(start.length, 32)
const at = (list, sq) => list.find(p => p.square === sq)
assert.deepEqual(at(start, 'e1'), { square: 'e1', type: 'k', color: 'w' })
assert.deepEqual(at(start, 'd8'), { square: 'd8', type: 'q', color: 'b' })
assert.deepEqual(at(start, 'a2'), { square: 'a2', type: 'p', color: 'w' })
assert.equal(at(start, 'e4'), undefined)

// sparse position with gaps inside a rank
const sparse = parseFen('8/8/8/3r4/4K3/8/8/8 w - - 0 1')
assert.equal(sparse.length, 2)
assert.deepEqual(at(sparse, 'd5'), { square: 'd5', type: 'r', color: 'b' })
assert.deepEqual(at(sparse, 'e4'), { square: 'e4', type: 'k', color: 'w' })

assert.throws(() => parseFen('8/8/8 w - - 0 1'))

// --- captured ---
assert.deepEqual(captured('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), { w: [], b: [] })
// white lost the d-pawn and queen's knight; black lost queen and h-pawn
assert.deepEqual(captured('rnb1kbnr/ppppppp1/8/8/8/8/PPP1PPPP/R1BQKBNR w KQkq - 0 1'), { w: ['n', 'p'], b: ['q', 'p'] })
// promoted second queen: pawn shows as missing, queens never negative
assert.deepEqual(captured('4k3/8/8/8/8/8/8/QQ2K3 w - - 0 1').w, ['r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'])

// --- NDJSON splitter: chunks cutting lines anywhere, keepalive newlines ---
const got = []
const s = makeLineSplitter(o => got.push(o))
s.push('{"type":"gameSt')
s.push('art","game":{"id":"abc"}}\n\n{"type":"ga')
s.push('meState","moves":"e2e4 e7e5"}\n')
s.push('{"a":1}')  // stream may end without trailing newline
s.end()
assert.equal(got.length, 3)
assert.equal(got[0].type, 'gameStart')
assert.equal(got[0].game.id, 'abc')
assert.equal(got[1].moves, 'e2e4 e7e5')
assert.equal(got[2].a, 1)

// --- isRapid: Board API seeks need limit + 40 × increment ≥ 480 s ---
assert.equal(isRapid(10, 0), true)
assert.equal(isRapid(8, 0), true)     // exactly 480 s
assert.equal(isRapid(7, 1), false)    // 420 + 40 = 460 s: blitz
assert.equal(isRapid(7, 2), true)     // 420 + 80
assert.equal(isRapid(5, 3), false)    // 300 + 120 = 420: blitz
assert.equal(isRapid(5, 5), true)     // 300 + 200
assert.equal(isRapid(3, 2), false)

// --- settings cycle ---
assert.equal(cycle(TIME_PRESETS, '10+0'), '10+5')
assert.equal(cycle(TIME_PRESETS, '30+0'), '3+2')     // wraps
assert.equal(cycle(TIME_PRESETS, '7+7'), '3+2')      // unknown -> first
assert.equal(cycle(['random', 'white', 'black'], 'black'), 'random')

// --- stream watchdog: silent stream -> 'Stream stalled'; data keeps it alive; abort stays AbortError ---
const enc = new TextEncoder()
function fakeStream(chunks, everyMs) {  // sends chunks every everyMs, then stays open silently
  globalThis.fetch = async (url, { signal }) => {
    if (signal.aborted) throw signal.reason                // like real fetch
    return new Response(new ReadableStream({
    start(c) {
      let i = 0
      const t = setInterval(() => { if (i < chunks.length) c.enqueue(enc.encode(chunks[i++])) }, everyMs)
      signal.addEventListener('abort', () => { clearInterval(t); c.error(signal.reason) })
    }
  }))
  }
}
const li = new Lichess('tok')
const got2 = []
fakeStream(['{"a":1}\n', '\n', '\n', '{"a":2}\n'], 30)
await assert.rejects(li.stream('/x', o => got2.push(o), undefined, {}, 80), /Stream stalled/)
assert.deepEqual(got2.map(o => o.a), [1, 2])       // data spaced 30 ms never tripped the 80 ms watchdog
fakeStream([], 1000)
const ac = new AbortController()
setTimeout(() => ac.abort(), 20)
await assert.rejects(li.stream('/x', () => {}, ac.signal, {}, 5000), e => e.name === 'AbortError')
const pre = new AbortController(); pre.abort()
await assert.rejects(li.stream('/x', () => {}, pre.signal, {}, 5000), e => e.name === 'AbortError')

console.log('All tests passed')
