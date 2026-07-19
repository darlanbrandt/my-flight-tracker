/* Service worker mínimo: network-first para navegação,
   cache-first para assets estáticos do Next. */
const CACHE = 'fpt-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return   // Supabase etc: sempre rede

  // páginas: rede primeiro, cache como fallback offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone()
          caches.open(CACHE).then(c => c.put(request, copy))
          return resp
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // assets com hash do Next: cache primeiro
  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(png|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(hit =>
        hit ?? fetch(request).then(resp => {
          const copy = resp.clone()
          caches.open(CACHE).then(c => c.put(request, copy))
          return resp
        })
      )
    )
  }
})
