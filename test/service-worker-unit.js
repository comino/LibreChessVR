import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8')
const origin = 'https://chess.test'
const request = (path, options) => new Request(new URL(path, origin), options)

function worker({ fetch: fetcher = async () => new Response('online'), putError = false, openError = false } = {}) {
  const handlers = {}, stores = new Map(), calls = [], deleted = []
  let claimed = false, skipped = false
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map())
    const data = stores.get(name)
    return {
      async match(req, options = {}) {
        const key = typeof req === 'string' ? req : req.url
        const normalize = value => options.ignoreSearch ? value.split('?')[0] : value
        const entry = [...data].find(([url]) => normalize(url) === normalize(key))
        return entry?.[1].clone()
      },
      async put(req, response) {
        if (putError) throw new Error('storage quota exceeded')
        // A real asynchronous write: returning the network response must not abandon it.
        await new Promise(resolve => setTimeout(resolve, 0))
        data.set(typeof req === 'string' ? req : req.url, response.clone())
      }
    }
  }
  vm.runInNewContext(source, {
    URL, Response, location: { origin },
    self: {
      addEventListener: (type, handler) => { handlers[type] = handler },
      skipWaiting: async () => { skipped = true },
      clients: { claim: async () => { claimed = true } }
    },
    caches: {
      keys: async () => [...stores.keys()],
      open: async name => { if (openError) throw new Error('cache unavailable'); return cache(name) },
      delete: async name => { deleted.push(name); return stores.delete(name) }
    },
    fetch: async (req, options) => { calls.push({ url: req.url, options }); return fetcher(req, options) }
  })
  return {
    stores, calls, deleted, cache,
    async lifecycle(type) {
      const waits = []
      handlers[type]({ waitUntil: promise => waits.push(promise) })
      assert.ok(waits.length, `${type} must keep its asynchronous work alive`)
      await Promise.all(waits)
    },
    fetch(req) {
      let response
      handlers.fetch({ request: req, respondWith: promise => { response = promise } })
      return response
    },
    get claimed() { return claimed }, get skipped() { return skipped }
  }
}

// Installation/activation owns only this app's caches, including on a shared origin.
{
  const w = worker()
  w.cache('parallax-v0')
  w.cache('another-app-v1')
  await w.lifecycle('install')
  await w.lifecycle('activate')
  assert.ok(w.skipped && w.claimed)
  assert.deepEqual(w.deleted, ['parallax-v0'])
  assert.ok(w.stores.has('another-app-v1'))
}

// Online app files always revalidate and complete their cache writes before settling.
{
  let online = true, version = 'one'
  const w = worker({ fetch: async () => { if (!online) throw new TypeError('offline'); return new Response(version) } })
  const req = request('/src/main.js')
  assert.equal(await (await w.fetch(req)).text(), 'one')
  version = 'two'
  assert.equal(await (await w.fetch(req)).text(), 'two')
  assert.equal(w.calls.length, 2)
  assert.equal(w.calls[1].options.cache, 'no-cache')
  online = false
  assert.equal(await (await w.fetch(request('/src/main.js?view=free'))).text(), 'two')
  assert.equal((await w.fetch(request('/never-visited.js'))).type, 'error')
}

// Versioned CDN assets use their cached response without a second request.
{
  const w = worker()
  const req = request('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js')
  await w.fetch(req)
  await w.fetch(req)
  assert.equal(w.calls.length, 1)
}

// Storage failures must not turn a successful online fetch into a broken page.
for (const options of [{ putError: true }, { openError: true }]) {
  const w = worker(options)
  assert.equal(await (await w.fetch(request('/index.html'))).text(), 'online')
  assert.equal(await (await w.fetch(request('https://fonts.googleapis.com/css2?family=Inter'))).text(), 'online')
}

// Never persist OAuth callbacks, private requests or external API responses.
{
  const w = worker()
  for (const req of [
    request('/?code=secret&state=state'), request('/?error=access_denied&state=state'),
    request('/private', { headers: { Authorization: 'Bearer test-only' } }),
    request('/index.html', { method: 'POST' }),
    request('https://lichess.org/api/account'),
    request('https://cdn.jsdelivr.net.evil.test/script.js')
  ]) assert.equal(w.fetch(req), undefined, req.url)
  await w.fetch(request('/?barcode=123')) // not an OAuth callback
  assert.equal(w.calls.length, 1)
}

// An HTTP error is returned as such and cannot overwrite a good offline copy.
{
  let mode = 'good'
  const w = worker({ fetch: async () => {
    if (mode === 'offline') throw new TypeError('offline')
    return new Response(mode, { status: mode === 'good' ? 200 : 503 })
  } })
  const req = request('/index.html')
  await w.fetch(req)
  mode = 'bad'
  assert.equal((await w.fetch(req)).status, 503)
  mode = 'offline'
  assert.equal(await (await w.fetch(req)).text(), 'good')
}
console.log('SERVICE-WORKER-UNIT-OK')
