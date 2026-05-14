import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

/** Convert a base64url-encoded VAPID public key into the Uint8Array
 *  that the browser's `pushManager.subscribe` expects. */
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
}

const STORAGE_KEY = "rt_push_state"; // "granted" | "denied" | "dismissed"

/**
 * Manages the Web Push lifecycle for the current user.
 *  - Fetches the VAPID public key once
 *  - Reads the browser's current permission + existing subscription
 *  - Exposes `subscribe()` / `unsubscribe()` for UI controls
 *  - Re-syncs the subscription to the backend on every load so the server
 *    always knows where to deliver pushes for this user
 */
export default function usePush() {
    const isSupported = typeof window !== "undefined"
        && "serviceWorker" in navigator
        && "PushManager" in window
        && "Notification" in window;
    const [permission, setPermission] = useState(
        isSupported ? Notification.permission : "default"
    );
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);

    /** Ensure the existing subscription (if any) is registered server-side
     *  and reflect it in local state. Idempotent — safe to call on every mount. */
    const refresh = useCallback(async () => {
        if (!isSupported) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                setIsSubscribed(true);
                // Re-register with backend so we don't lose the link on cache wipes.
                await api.post("/push/subscribe", sub.toJSON()).catch(() => null);
            } else {
                setIsSubscribed(false);
            }
        } catch (_) { /* ignore */ }
    }, [isSupported]);

    useEffect(() => { refresh(); }, [refresh]);

    const subscribe = useCallback(async () => {
        if (!isSupported) return { ok: false, reason: "unsupported" };
        setBusy(true);
        try {
            const perm = await Notification.requestPermission();
            setPermission(perm);
            try { localStorage.setItem(STORAGE_KEY, perm); } catch {}
            if (perm !== "granted") return { ok: false, reason: perm };

            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                const { data } = await api.get("/push/public-key");
                if (!data?.publicKey) return { ok: false, reason: "no-key" };
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
                });
            }
            await api.post("/push/subscribe", sub.toJSON());
            setIsSubscribed(true);
            return { ok: true };
        } catch (err) {
            return { ok: false, reason: err?.message || "error" };
        } finally {
            setBusy(false);
        }
    }, [isSupported]);

    const unsubscribe = useCallback(async () => {
        if (!isSupported) return;
        setBusy(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await api.post("/push/unsubscribe", sub.toJSON()).catch(() => null);
                await sub.unsubscribe();
            }
            setIsSubscribed(false);
        } finally {
            setBusy(false);
        }
    }, [isSupported]);

    return { isSupported, permission, isSubscribed, busy, subscribe, unsubscribe };
}
