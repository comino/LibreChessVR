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
await check('missing response ID cannot be mistaken for a confirmed cancellation', async () => {
  const { pending, cancelled, messages } = fixture()
  await pending.start('Maia 5', async () => ({}))
  await pending.cancel()
  assert.ok(pending.current)
  assert.deepEqual(cancelled, [])
  assert.match(messages.at(-1), /Cannot confirm cancellation/)
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
console.log(`ACTIONS-OK ${checks} checks`)
