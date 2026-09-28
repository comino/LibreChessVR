// Parallax service worker. App files: network-first (always the current version when online,
// the cached copy offline) — never mixes old and new modules. Versioned CDN modules and fonts:
// cache-first (their URLs change when their content does). lichess API calls are never cached.
const CACHE = 'parallax-v7'
const CDN = /(^|\.)(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())))

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.search.includes('code=')) return
  if (u.origin === location.origin) e.respondWith(networkFirst(e.request))
  else if (CDN.test(u.host)) e.respondWith(cacheFirst(e.request))
})

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const r = await fetch(req, { cache: 'no-cache' }) // revalidate: no stale HTTP-cache copies
    if (r.ok) cache.put(req, r.clone())
    return r
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error()
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const r = await fetch(req)
  if (r.ok) cache.put(req, r.clone())
  return r
}
