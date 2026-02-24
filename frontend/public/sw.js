// Service Worker für PWA — SPA-Routing auf GitHub Pages
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Nur Navigation-Requests (HTML) auf index.html umleiten
  if (e.request.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    )
  }
})
