/* Convoy — minimal service worker
 * Goal: provide an installable PWA with reliable offline shell + keep the
 * navigation HTML always fresh. We deliberately do NOT cache /api/* responses
 * so live data (location, help status) is never served from cache.
 */
const CACHE = "convoy-shell-v1";
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    // Never cache API or geolocation traffic — must be live.
    if (url.pathname.startsWith("/api/")) return;

    // HTML navigations: network-first, fall back to cached shell when offline.
    if (req.mode === "navigate") {
        event.respondWith(
            fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => null);
                return res;
            }).catch(() => caches.match("/index.html"))
        );
        return;
    }

    // Static assets: cache-first with network fallback.
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(req).then((cached) =>
                cached || fetch(req).then((res) => {
                    const copy = res.clone();
                    if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
                    return res;
                })
            )
        );
    }
});
