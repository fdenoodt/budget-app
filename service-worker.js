const CACHE_VERSION = '81';
const CACHE_NAME = `budget-app-v${CACHE_VERSION}`;
const PRECACHE_URLS = [
    './',
    './index.html',
    `./style.css?version=${CACHE_VERSION}`,
    `./script.js?version=${CACHE_VERSION}`,
    `./config.js?version=${CACHE_VERSION}`,
    './manifest.json',
    './icon-192x192.png',
    './icon-512x512.png'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('budget-app-') && key !== CACHE_NAME)
                .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const destination = request.destination;
    const networkFirst = destination === 'document' || destination === 'script' || destination === 'style';

    if (networkFirst) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(response => response || fetch(request))
    );
});
