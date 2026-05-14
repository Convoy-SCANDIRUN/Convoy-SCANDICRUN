/* Convoy — service worker
 * - Network-first for HTML navigations: keeps the app shell fresh.
 * - Stale-while-revalidate for same-origin static assets: instant load
 *   while the new bundle is fetched in the background, so the *next*
 *   visit picks up the latest code automatically.
 * - Never caches /api/*: live data must always hit the network.
 * - Periodic Background Sync: where supported (Android Chrome, installed PWA),
 *   wakes any open client every minute and asks them to push their location.
 *   On iOS this falls back gracefully — the OS simply never schedules the sync.
 *
 * Bump CACHE_VERSION whenever the caching strategy itself changes; old
 * caches are pruned in the activate handler.
 */
const CACHE_VERSION = "v5";
const CACHE = `convoy-shell-${CACHE_VERSION}`;
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) return;

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

/* ---- Periodic background sync: nudge open clients to refresh location ---- */
self.addEventListener("periodicsync", (event) => {
    if (event.tag !== "convoy-location-ping") return;
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        for (const c of clients) {
            c.postMessage({ type: "BG_PUSH_LOCATION" });
        }
    })());
});

/* ---- One-shot sync: replay any pending requests after we come back online ---- */
self.addEventListener("sync", (event) => {
    if (event.tag !== "convoy-location-ping") return;
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        for (const c of clients) {
            c.postMessage({ type: "BG_PUSH_LOCATION" });
        }
    })());
});

/* ---- Web Push: show notifications even when the app is closed ---- */
self.addEventListener("push", (event) => {
    let data = { title: "Convoy", body: "New activity" };
    if (event.data) {
        try { data = event.data.json(); }
        catch (_) { data = { title: "Convoy", body: event.data.text() }; }
    }
    const isSos = data?.data?.type === "sos";
    const isHelp = data?.data?.type === "help";
    const options = {
        body: data.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: data.data?.registration_id ? `convoy-${data.data.type}-${data.data.registration_id}` : "convoy",
        renotify: true,
        requireInteraction: isSos || isHelp,
        vibrate: isSos ? [300, 100, 300, 100, 300] : [200, 100, 200],
        data: data.data || {},
    };
    event.waitUntil(self.registration.showNotification(data.title || "Convoy", options));
});

/* ---- Notification click: focus or open the app and notify the page ---- */
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.click_url) || "/";
    event.waitUntil((async () => {
        const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of allClients) {
            if ("focus" in c) {
                c.postMessage({ type: "NOTIFICATION_CLICK", data: event.notification.data || {} });
                return c.focus();
            }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
    })());
});

