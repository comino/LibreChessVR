// LibreChessVR service worker. App files: network-first (current version when online,
// the cached copy offline) — never mixes old and new modules. Versioned CDN modules and fonts:
// cache-first (their URLs change when their content does). lichess API calls are never cached.
const CACHE_PREFIX = 'parallax-v'
const CACHE = CACHE_PREFIX + '27'
const CDN = /(^|\.)(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/

self.addEventListener('install', e => e.waitUntil(self.skipWaiting()))
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())))

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || e.request.headers.has('Authorization') ||
      u.searchParams.has('code') || u.searchParams.has('error')) return
  if (u.origin === location.origin) e.respondWith(networkFirst(e.request))
  else if (CDN.test(u.host)) e.respondWith(cacheFirst(e.request))
})

async function networkFirst(req) {
  const cache = await caches.open(CACHE).catch(() => null)
  try {
    const r = await fetch(req, { cache: 'no-cache' }) // revalidate: no stale HTTP-cache copies
    await save(cache, req, r)
    return r
  } catch {
    return (await cache?.match(req, { ignoreSearch: true }).catch(() => null)) || Response.error()
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE).catch(() => null)
  const hit = await cache?.match(req).catch(() => null)
  if (hit) return hit
  const r = await fetch(req)
  await save(cache, req, r)
  return r
}

async function save(cache, req, response) {
  // Keep writes alive until the fetch event settles. A full/unavailable cache must
  // not hide a successful network response or create an unhandled rejection.
  if (cache && response.ok) await cache.put(req, response.clone()).catch(() => {})
}
