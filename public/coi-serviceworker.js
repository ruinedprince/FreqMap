// Minimal COOP/COEP service worker for cross-origin isolation
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const request = event.request
  const newHeaders = new Headers(request.headers)
  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      const modified = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
      const headers = new Headers(modified.headers)
      headers.set('Cross-Origin-Opener-Policy', 'same-origin')
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
      return new Response(modified.body, { status: modified.status, statusText: modified.statusText, headers })
    } catch (e) {
      return fetch(request)
    }
  })())
})


