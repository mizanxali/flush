// Loads flush with no network once it has been opened online. vite.config.ts fills in the
// build's file list and id. A new build installs beside the old and takes over only once every
// flush tab has closed, so a running page never mixes one build's page with another's worker.
const BUILD = '__BUILD__'
const ASSETS = __ASSETS__
const CACHE = `flush-${BUILD}`

self.addEventListener('install', event => {
  // addAll fails whole if one file fails, so a cache is complete or absent.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('flush-') && k !== CACHE).map(k => caches.delete(k)))))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  // Any navigation (with any ?profile=) is the cached page. ignoreVary: module scripts carry an
  // Origin header and the server's responses vary on it.
  const key = request.mode === 'navigate' ? '/index.html' : request
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(key, { ignoreSearch: request.mode === 'navigate', ignoreVary: true })) ?? fetch(request)))
})
