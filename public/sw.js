/*
 * Deliberately does nothing.
 *
 * A service worker with a fetch handler is what makes the app installable; the
 * offline story is Phase 8's job, and a cache written before there is anything
 * worth caching is just a stale-content bug waiting to happen.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Pass through to the network.
})
