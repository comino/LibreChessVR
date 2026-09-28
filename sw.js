// Parallax service worker: stale-while-revalidate for the app shell, CDN modules and fonts, so
// the installed app starts instantly and works offline; lichess API calls are never cached.
const CACHE = 'parallax-v2'
const CACHEABLE = u => u.origin === location.origin || /(^|\.)(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.host)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())))

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || !CACHEABLE(u) || u.search.includes('code=')) return
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: u.origin === location.origin })
    const net = fetch(e.request).then(r => {
      if (r.ok) cache.put(e.request, r.clone())
      return r
    }).catch(() => hit)
    return hit || net
  }))
})
