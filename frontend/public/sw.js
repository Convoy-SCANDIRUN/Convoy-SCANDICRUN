/* Convoy — service worker
 * - Network-first for HTML navigations: keeps the app shell fresh.
 * - Stale-while-revalidate for same-origin static assets: instant load
 *   while the new bundle is fetched in the background, so the *next*
 *   visit picks up the latest code automatically.
 * - Never caches /api/*: live data must always hit the network.
 *
 * Bump CACHE_VERSION whenever the caching strategy itself changes; old
 * caches are pruned in the activate handler.
 */
const CACHE_VERSION = "v3";
const CACHE = `convoy-shell-${CACHE_VERSION}`;
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
    // Activate the new worker as soon as it finishes installing so users
    // never get stuck on a previous version.
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

// Allow the page to force the waiting worker to take over immediately.
self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
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

    // Same-origin static assets: stale-while-revalidate so users get an
    // instant load AND the freshest copy on the next visit.
    if (url.origin === self.location.origin) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const cached = await cache.match(req);
            const network = fetch(req).then((res) => {
                if (res.ok) cache.put(req, res.clone()).catch(() => null);
                return res;
            }).catch(() => null);
            return cached || network || fetch(req);
        })());
    }
});
