import assert from 'node:assert/strict'
import { Confirmation, PendingChallenge } from '../src/actions.js'
import { Lichess } from '../src/lichess.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
let checks = 0
const check = async (name, run) => { await run(); checks++; console.log('ok:', name) }

await check('resign always needs a second click, including at page time zero', () => {
  let now = 0
  const confirm = new Confirmation({ now: () => now })
  assert.equal(confirm.confirm('game-a'), false)
  now = 1000
  assert.equal(confirm.confirm('game-a'), true)
  assert.equal(confirm.confirm('game-a'), false, 'successful confirmation is consumed')
})
await check('a confirmation belongs to its game and expires even if the timer was delayed', () => {
  let now = 1000
  const confirm = new Confirmation({ now: () => now })
  assert.equal(confirm.confirm('game-a'), false)
  assert.equal(confirm.confirm('game-b'), false)
  now = 4000
  assert.equal(confirm.confirm('game-b'), false, 'deadline is exclusive')
  now = 4001
  assert.equal(confirm.confirm('game-b'), true)
  assert.equal(confirm.confirm(null), false)
  assert.equal(confirm.confirm(null), false)
})
await check('leaving or finishing a game explicitly clears its armed confirmation', () => {
  const confirm = new Confirmation({ now: () => 1000 })
  assert.equal(confirm.confirm('game-a'), false)
  confirm.reset()
  assert.equal(confirm.confirm('game-a'), false)
})
await check('default timers do not receive a PendingChallenge as their browser receiver', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout
  try {
    globalThis.setTimeout = function () { assert.ok(!(this instanceof PendingChallenge)); return 1 }
    globalThis.clearTimeout = function () { assert.ok(!(this instanceof PendingChallenge)) }
    const pending = new PendingChallenge({ cancel: async () => {} })
    await pending.start('Stockfish', async () => ({ id: 'a' }))
    pending.gameStarted('a')
  } finally {
    globalThis.setTimeout = originalSet
    globalThis.clearTimeout = originalClear
  }
})

function fixture(cancel = async () => {}) {
  const messages = [], cancelled = [], timers = []
  let changes = 0
  const pending = new PendingChallenge({
    cancel: id => { cancelled.push(id); return cancel(id) },
    changed: () => changes++, message: text => messages.push(text),
    setTimer: fn => { timers.push(fn); return fn }, clearTimer: () => {}
  })
  return { pending, messages, cancelled, timers, changes: () => changes }
}

await check('repeated starts and switching opponent cannot duplicate an in-flight challenge', async () => {
  const { pending } = fixture(), creation = deferred()
  let posts = 0
  const first = pending.start('Stockfish', () => { posts++; return creation.promise })
  assert.equal(await pending.start('Maia 5', () => { posts++; return Promise.resolve({ id: 'b' }) }), false)
  assert.equal(posts, 1)
  creation.resolve({ id: 'a' })
  await first
  assert.equal(await pending.start('Stockfish', async () => { posts++; return { id: 'b' } }), false,
    'successful POST remains pending until the game arrives')
  pending.gameStarted('a')
  assert.equal(pending.current, null)
  assert.equal(await pending.start('Maia 5', async () => ({ challenge: { id: 'b' } })), true)
  assert.equal(pending.current.id, 'b')
})
await check('definitive API rejection releases the lock and permits a retry', async () => {
  const { pending, messages } = fixture()
  await pending.start('Stockfish', async () => { throw Object.assign(new Error('Bad clock'), { status: 400 }) })
  assert.equal(pending.current, null)
  assert.match(messages.at(-1), /Stockfish challenge failed: Bad clock/)
  assert.equal(await pending.start('Stockfish', async () => ({ id: 'retry' })), true)
})
await check('lost or malformed responses keep the lock until a game resolves the uncertainty', async () => {
  for (const error of [new TypeError('offline'), new SyntaxError('bad JSON'), Object.assign(new Error('server failed'), { status: 503 })]) {
    const { pending, messages } = fixture()
    await pending.start('Stockfish', async () => { throw error })
    assert.ok(pending.current)
    assert.match(messages.at(-1), /status unknown/)
    assert.equal(await pending.start('Maia 5', async () => ({ id: 'duplicate' })), false)
    pending.gameStarted('accepted')
    assert.equal(pending.current, null)
  }
})
await check('cancel before creation resolves waits for the ID and server acknowledgement', async () => {
  const cancellation = deferred(), creation = deferred()
  const { pending, cancelled } = fixture(() => cancellation.promise)
  const first = pending.start('Maia 5', () => creation.promise)
  await pending.cancel()
  assert.equal(pending.current.cancelling, true)
  assert.deepEqual(cancelled, [])
  creation.resolve({ challenge: { id: 'a' } })
  await tick()
  assert.deepEqual(cancelled, ['a'])
  assert.equal(await pending.start('Stockfish', async () => ({ id: 'b' })), false)
  cancellation.resolve({ ok: true })
  await first
  assert.equal(pending.current, null)
})
await check('cancellation failure remains pending and offers a safe cancellation retry', async () => {
  let tries = 0
  const { pending, messages } = fixture(async () => { if (++tries === 1) throw new Error('offline') })
  await pending.start('Maia 5', async () => ({ id: 'a' }))
  await pending.cancel()
  assert.equal(pending.current.id, 'a')
  assert.equal(pending.current.cancelling, false)
  assert.match(messages.at(-1), /Cancellation failed/)
  assert.equal(await pending.start('Stockfish', async () => ({ id: 'b' })), false)
  await pending.cancel()
  assert.equal(pending.current, null)
})
await check('cancellation 404 resolves an expired challenge and suppresses its late game event', async () => {
  const { pending, messages } = fixture(async () => { throw Object.assign(new Error('not found'), { status: 404 }) })
  await pending.start('Maia 5', async () => ({ id: 'expired' }))
  await pending.cancel()
  assert.equal(pending.current, null)
  assert.equal(pending.wasCancelled('expired'), true)
  assert.equal(messages.at(-1), 'Challenge is no longer active')
  assert.equal(await pending.start('Stockfish', async () => ({ id: 'next' })), true)
})
await check('other cancellation errors cannot masquerade as a terminal challenge result', async () => {
  for (const error of [400, 401, 403, 429, 503].map(status => Object.assign(new Error('rejected'), { status }))
    .concat(new TypeError('network lost'))) {
    const { pending } = fixture(async () => { throw error })
    await pending.start('Maia 5', async () => ({ id: 'still-pending' }))
    await pending.cancel()
    assert.equal(pending.current.id, 'still-pending')
    assert.equal(pending.current.cancelling, false)
    assert.equal(pending.wasCancelled('still-pending'), false)
    assert.equal(await pending.start('Stockfish', async () => ({ id: 'duplicate' })), false)
  }
})
await check('missing response ID: cancel releases the lock locally, never as a confirmed cancellation', async () => {
  const { pending, cancelled, messages } = fixture()
  await pending.start('Maia 5', async () => ({}))
  await pending.cancel()
  assert.equal(pending.current, null, 'no permanent lock (PRJ-54 story bughunter)')
  assert.deepEqual(cancelled, [], 'nothing to cancel on Lichess without an id')
  assert.match(messages.at(-1), /Challenge cleared/)
})
await check('game event before POST resolution suppresses late failure and timeout notices', async () => {
  const { pending, messages, timers } = fixture(), creation = deferred()
  const first = pending.start('Stockfish', () => creation.promise)
  pending.gameStarted('a')
  creation.reject(new Error('late failure'))
  await first
  timers[0]()
  assert.equal(pending.current, null)
  assert.deepEqual(messages, ['Challenging Stockfish…'])
})
await check('ambiguous failure after a different game attaches retains its unresolved challenge', async () => {
  const { pending, messages } = fixture(), creation = deferred()
  const first = pending.start('Stockfish', () => creation.promise)
  pending.gameStarted('possibly-unrelated-game')
  creation.reject(new TypeError('response lost'))
  await first
  assert.ok(pending.current)
  assert.match(pending.current.notice, /status unknown/)
  assert.equal(await pending.start('Maia 5', async () => ({ id: 'duplicate' })), false)
  assert.deepEqual(messages, ['Challenging Stockfish…'], 'new game panel is not overwritten')
})
await check('request-specific messages retain rematch context instead of using a new activity sink', async () => {
  const { pending, messages } = fixture(), rematchMessages = []
  await pending.start('bob', async () => { throw new Error('declined') }, {
    message: text => rematchMessages.push(text), failure: 'Rematch failed: ', started: 'Rematch offered to bob…'
  })
  assert.deepEqual(messages, [])
  assert.deepEqual(rematchMessages, ['Rematch offered to bob…', 'Rematch failed: declined'])
})
await check('same-game event before POST resolution keeps the accepted game', async () => {
  const { pending, cancelled } = fixture(), creation = deferred()
  const first = pending.start('Stockfish', () => creation.promise)
  pending.gameStarted('a')
  creation.resolve({ id: 'a' })
  await first
  assert.equal(pending.current, null)
  assert.deepEqual(cancelled, [])
})
await check('a different game context cancels only the delayed request it superseded', async () => {
  const { pending, cancelled, messages } = fixture(), creation = deferred()
  const first = pending.start('Maia 5', () => creation.promise)
  pending.gameStarted('existing-game')
  creation.resolve({ challenge: { id: 'new-challenge' } })
  await first
  assert.deepEqual(cancelled, ['new-challenge'])
  assert.equal(pending.current, null)
  assert.deepEqual(messages, ['Challenging Maia 5…'])
})
await check('cancellation still targets its challenge when acceptance races with it', async () => {
  const creation = deferred(), { pending, cancelled } = fixture()
  const first = pending.start('Maia 5', () => creation.promise)
  await pending.cancel()
  pending.gameStarted('a')
  creation.resolve({ challenge: { id: 'a' } })
  await first
  assert.deepEqual(cancelled, ['a'])
  assert.equal(pending.current, null)
})
await check('a failed cancellation of the attached game does not leave a permanent pending lock', async () => {
  const cancellation = deferred(), { pending } = fixture(() => cancellation.promise)
  await pending.start('Maia 5', async () => ({ id: 'a' }))
  const cancel = pending.cancel()
  pending.gameStarted('a')
  cancellation.reject(Object.assign(new Error('game already played'), { status: 400 }))
  await cancel
  assert.equal(pending.current, null)
  assert.equal(pending.wasCancelled('a'), false)
  assert.equal(await pending.start('Stockfish', async () => ({ id: 'b' })), true)
})
await check('terminal events are matched by ID, including events before the POST response', async () => {
  const creation = deferred(), { pending, messages } = fixture()
  const first = pending.start('Maia 5', () => creation.promise)
  pending.ended('unrelated', 'Unrelated decline')
  pending.ended('a', 'Challenge declined')
  assert.ok(pending.current)
  creation.resolve({ challenge: { id: 'a' } })
  await first
  assert.equal(pending.current, null)
  assert.equal(messages.at(-1), 'Challenge declined')
})
await check('late cancellation and timer callbacks cannot clear or overwrite a new challenge', async () => {
  const cancellation = deferred(), { pending, messages, timers } = fixture(() => cancellation.promise)
  await pending.start('Maia 5', async () => ({ id: 'a' }))
  const cancelling = pending.cancel()
  assert.equal(pending.ended('other', 'Other decline'), false)
  assert.equal(pending.ended('a', 'Challenge cancelled'), true)
  await pending.start('Stockfish', async () => ({ id: 'b' }))
  const lastMessage = messages.at(-1)
  cancellation.reject(new Error('old failure'))
  await cancelling
  timers[0]()
  assert.equal(pending.current.id, 'b')
  assert.equal(messages.at(-1), lastMessage)
})
await check('waiting timeout reports status without allowing another POST', async () => {
  const { pending, timers, messages } = fixture()
  await pending.start('Maia 5', async () => ({ id: 'a' }))
  timers[0]()
  assert.match(messages.at(-1), /Still waiting for Maia 5/)
  assert.equal(await pending.start('Stockfish', async () => ({ id: 'b' })), false)
})
await check('confirmed cancellations identify late game events without suppressing accepted games', async () => {
  const { pending } = fixture()
  await pending.start('Maia 5', async () => ({ id: 'cancelled-game' }))
  await pending.cancel()
  assert.equal(pending.wasCancelled('cancelled-game'), true)
  await pending.start('Stockfish', async () => ({ id: 'accepted-game' }))
  pending.gameStarted('accepted-game')
  assert.equal(pending.wasCancelled('accepted-game'), false)
})
await check('Lichess cancellation uses the challenge endpoint and preserves error status', async () => {
  const original = globalThis.fetch, requests = []
  try {
    globalThis.fetch = async (url, options) => { requests.push({ url, options }); return new Response('{"ok":true}') }
    const li = new Lichess('test-token')
    await li.cancelChallenge('challenge-a')
    assert.equal(requests[0].url, 'https://lichess.org/api/challenge/challenge-a/cancel')
    assert.equal(requests[0].options.method, 'POST')
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token')
    globalThis.fetch = async () => new Response('{"error":"unavailable"}', { status: 503 })
    await assert.rejects(li.challengeAi({ level: 1, time: 10, increment: 0 }), e => e.status === 503)
  } finally { globalThis.fetch = original }
})
await check('an unknown-status challenge (failed creation) can still be released', async () => {
  for (const fail of [Object.assign(new Error('bad gateway'), { status: 503 }), new TypeError('Failed to fetch')]) {
    const p = new PendingChallenge({ cancel: async () => { throw new Error('no id to cancel') }, setTimer: () => 0, clearTimer: () => {} })
    await p.start('Maia 5', async () => { throw fail })
    assert.ok(p.current, 'unknown status keeps the lock at first: ' + fail.message)
    await p.cancel()
    assert.equal(p.current, null, 'cancel releases an unknown-status lock: ' + fail.message)
  }
})
await check('cancel pressed during creation, creation then fails on the network', async () => {
  const d = deferred()
  const p = new PendingChallenge({ cancel: async () => {}, setTimer: () => 0, clearTimer: () => {} })
  const started = p.start('Maia 5', () => d.promise)
  await p.cancel()
  d.reject(new TypeError('Failed to fetch'))
  await started
  assert.ok(p.current && !p.current.cancelling, 'a retry is allowed')
  await p.cancel()
  assert.equal(p.current, null, 'the retry releases the lock')
})
// PRJ-72: a reload must not drop the lock while Lichess still holds the challenge. Realtime
// challenges without keepAliveStream expire 20 s after creation (Lichess API), so the saved
// request locks again for the rest of that time.
const clocked = (now, extra = {}) => {
  const timers = [], messages = [], cancelled = []
  const p = new PendingChallenge({ cancel: async id => { cancelled.push(id) }, message: t => messages.push(t),
    now: () => now.t, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => {}, ...extra })
  return { p, timers, messages, cancelled }
}
await check('a created challenge is saved with its creation time and dropped once it ends', async () => {
  const now = { t: 1000 }, { p } = clocked(now)
  const created = deferred()
  const start = p.start('Maia 5', () => created.promise)
  assert.deepEqual(p.saved(), { id: null, label: 'Maia 5', at: 1000 }, 'a reload during creation keeps the lock')
  now.t = 1500
  created.resolve({ challenge: { id: 'c2' } })
  await start
  assert.deepEqual(p.saved(), { id: 'c2', label: 'Maia 5', at: 1500 })
  p.ended('c2', 'Challenge declined')
  assert.equal(p.saved(), null)
})
await check('a restored challenge locks until Lichess expires it', () => {
  const now = { t: 10000 }, { p, timers, messages } = clocked(now)
  assert.equal(p.restore({ id: 'c1', label: 'Maia 5', at: 1000 }), true)
  assert.equal(p.current?.id, 'c1', 'starts are blocked again')
  assert.deepEqual(p.saved(), { id: 'c1', label: 'Maia 5', at: 1000 }, 'a second reload keeps the original time')
  assert.equal(timers.at(-1).ms, 16000, '25 s (20 s expiry + 5 s clock margin) after creation')
  timers.at(-1).fn()
  assert.equal(p.current, null)
  assert.match(messages.at(-1), /Maia 5 challenge expired/)
})
await check('an expired, invalid or second restore is ignored', () => {
  const now = { t: 26000 }, { p } = clocked(now)
  assert.equal(p.restore({ id: 'c1', label: 'Maia 5', at: 1000 }), false, 'expired')
  assert.equal(p.restore({ id: 'c1', label: 'Maia 5', at: 'x' }), false, 'no time')
  assert.equal(p.restore({ id: 'c1', label: 'Maia 5', at: '25000' }), false, 'a numeric string is no time')
  assert.equal(p.restore({ id: 'c1', label: 'Maia 5', at: Infinity }), false, 'non-finite')
  assert.equal(p.restore({ id: 'c1', at: 25000 }), false, 'no label')
  assert.equal(p.restore(null), false)
  assert.equal(p.current, null)
  assert.equal(p.restore({ id: 'c3', label: 'Ann', at: 25000 }), true)
  assert.equal(p.restore({ id: 'c4', label: 'Bob', at: 25000 }), false, 'one lock at a time')
  assert.equal(p.current.id, 'c3')
})
await check('a restored challenge can be cancelled or turn into its game', async () => {
  const now = { t: 5000 }, a = clocked(now)
  a.p.restore({ id: 'c1', label: 'Ann', at: 1000 })
  await a.p.cancel()
  assert.deepEqual(a.cancelled, ['c1'])
  assert.equal(a.p.current, null)
  assert.ok(a.p.wasCancelled('c1'), 'a late gameStart for it is ignored')
  const b = clocked(now)
  b.p.restore({ id: 'c1', label: 'Ann', at: 1000 })
  b.p.gameStarted('c1')
  assert.equal(b.p.current, null)
  assert.deepEqual(b.cancelled, [], 'its own game is never cancelled')
  assert.equal(b.p.saved(), null)
})
await check('a challenge stays saved while its cancellation after another game fails', async () => {
  const now = { t: 1000 }
  const p = new PendingChallenge({ cancel: async () => { throw Object.assign(new Error('bad gateway'), { status: 503 }) },
    now: () => now.t, setTimer: () => 0, clearTimer: () => {} })
  await p.start('Ann', async () => ({ challenge: { id: 'c1' } }))
  p.gameStarted('g2')
  await tick()
  assert.ok(p.current && !p.current.cancelling, 'still locked after the failed cancel')
  assert.deepEqual(p.saved(), { id: 'c1', label: 'Ann', at: 1000 }, 'a reload must still know c1')
})
await check('a restored lock always expires: a failed cancel keeps the expiry, a future time is capped', async () => {
  const now = { t: 5000 }, timers = new Map()
  let next = 0
  const p = new PendingChallenge({ cancel: async () => { throw Object.assign(new Error('bad gateway'), { status: 503 }) },
    now: () => now.t, setTimer: (fn, ms) => { timers.set(++next, { fn, ms }); return next }, clearTimer: id => timers.delete(id) })
  p.restore({ id: 'c1', label: 'Ann', at: 1000 })
  await p.cancel()
  assert.ok(p.current, 'the failed cancel keeps the lock')
  const expiry = [...timers.values()].find(t => t.ms === 21000)
  assert.ok(expiry, 'and its expiry timer')
  expiry.fn()
  assert.equal(p.current, null, 'expiry still releases it')
  now.t = 1000
  p.restore({ id: 'c2', label: 'Ann', at: 3600000 })
  assert.ok([...timers.values()].every(t => t.ms <= 25000), 'a clock rollback never locks longer than 25 s')
})
await check('a challenge restored without an id locks until expiry and clears locally', async () => {
  const now = { t: 5000 }, { p, cancelled, messages } = clocked(now)
  assert.equal(p.restore({ id: null, label: 'Ann', at: 1000 }), true)
  assert.ok(p.current)
  await p.cancel()
  assert.equal(p.current, null)
  assert.deepEqual(cancelled, [], 'nothing to cancel on Lichess')
  assert.match(messages.at(-1), /Challenge cleared/)
})
// PRJ-102 (prj-quality LC-3, red test from 6d8202a): Cancel during a creation that never answers.
await check('cancel during a creation that never settles cannot lock challenges for good (sibling of the unknown-status fix)', async () => {
  const live = new Set()
  const p = new PendingChallenge({ cancel: async () => {}, setTimer: fn => { live.add(fn); return fn }, clearTimer: fn => live.delete(fn) })
  void p.start('Stockfish', () => new Promise(() => {})) // POST lost on a half-open connection (headset sleep): never settles
  await p.cancel() // what the 20 s notice asks for: "cancel the challenge before trying again"
  for (const fn of [...live]) fn() // any amount of time passes
  await tick()
  assert.ok(!p.current?.cancelling, 'after the wait the lock is gone or Cancel challenge is usable again: no permanent lock (PRJ-54)')
})
await check('a creation answered after Cancel gave up is cancelled on Lichess and its game ignored', async () => {
  const timers = [], cancelled = [], messages = []
  const p = new PendingChallenge({ cancel: async id => { cancelled.push(id) }, message: t => messages.push(t),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => {} })
  const created = deferred()
  const start = p.start('Maia 5', () => created.promise)
  await p.cancel()
  assert.ok(p.current?.cancelling, 'waits for the response first')
  timers.at(-1).fn()
  assert.equal(timers.at(-1).ms, 20000)
  assert.equal(p.current, null, 'released after 20 s without an answer')
  assert.match(messages.at(-1), /Challenge cleared/)
  created.resolve({ challenge: { id: 'late' } })
  await start; await tick()
  assert.deepEqual(cancelled, ['late'], 'the late challenge is withdrawn')
  assert.ok(p.wasCancelled('late'), 'its gameStart is ignored')
  const answered = deferred(), q = new PendingChallenge({ cancel: async id => { cancelled.push(id) }, setTimer: () => 0, clearTimer: () => {} })
  const second = q.start('Ann', () => answered.promise)
  await q.cancel()
  answered.resolve({ challenge: { id: 'prompt' } })
  await second; await tick()
  assert.equal(q.current, null, 'an answer within the wait still cancels normally')
  assert.deepEqual(cancelled, ['late', 'prompt'])
})
await check('a game arriving during the 20 s wait neither stops the give-up nor gets aborted by the late answer', async () => {
  const timers = new Map(), cancelled = []
  let next = 0
  const p = new PendingChallenge({ cancel: async id => { cancelled.push(id) },
    setTimer: fn => { timers.set(++next, fn); return next }, clearTimer: id => timers.delete(id) })
  const created = deferred()
  const start = p.start('Stockfish', () => created.promise)
  await p.cancel()
  p.gameStarted('g1') // the stream reconnects: Lichess re-sends gameStart for the AI game
  for (const fn of [...timers.values()]) fn()
  assert.equal(p.current, null, 'the give-up still releases the lock')
  created.resolve({ id: 'g1' })
  await start; await tick()
  assert.deepEqual(cancelled, [], 'the game being played is never aborted')
})
console.log(`ACTIONS-OK ${checks} checks`)
