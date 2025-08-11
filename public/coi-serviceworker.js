/* Minimal COOP/COEP service worker to enable WASM threads/SIMD */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const req = event.request
  const headers = new Headers(req.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  event.respondWith(
    fetch(req, { mode: 'no-cors' }).then((res) => {
      const newHeaders = new Headers(res.headers)
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin')
      newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: newHeaders })
    })
  )
})


