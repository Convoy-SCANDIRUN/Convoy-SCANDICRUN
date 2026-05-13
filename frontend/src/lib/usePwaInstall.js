import { useEffect, useState, useCallback } from "react";

function isStandaloneNow() {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;
}

function isIOSNow() {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Hook providing a one-tap PWA install action that works across:
 *  - Android / Chrome / Edge (uses `beforeinstallprompt` deferred event)
 *  - iOS Safari (returns a flag so the UI can show the manual instructions)
 *
 * Returns `{ canInstall, isStandalone, isIOS, promptInstall }`.
 *  - `canInstall`: true when the browser has captured a deferred prompt
 *                  OR we're on iOS (where manual instructions are required).
 *  - `promptInstall()`: resolves to "accepted" | "dismissed" | "ios" | "unsupported".
 */
export default function usePwaInstall() {
    const [deferred, setDeferred] = useState(null);
    const [standalone, setStandalone] = useState(isStandaloneNow());

    useEffect(() => {
        const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
        const onInstalled = () => { setDeferred(null); setStandalone(true); };
        window.addEventListener("beforeinstallprompt", onPrompt);
        window.addEventListener("appinstalled", onInstalled);

        // Re-check standalone whenever display-mode flips (e.g. opened from home screen tab).
        const mq = window.matchMedia("(display-mode: standalone)");
        const onMQ = (e) => setStandalone(e.matches);
        mq.addEventListener?.("change", onMQ);

        return () => {
            window.removeEventListener("beforeinstallprompt", onPrompt);
            window.removeEventListener("appinstalled", onInstalled);
            mq.removeEventListener?.("change", onMQ);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        if (deferred) {
            deferred.prompt();
            const { outcome } = await deferred.userChoice;
            setDeferred(null);
            return outcome; // "accepted" | "dismissed"
        }
        if (isIOSNow()) return "ios";
        return "unsupported";
    }, [deferred]);

    return {
        canInstall: !standalone && (!!deferred || isIOSNow()),
        isStandalone: standalone,
        isIOS: isIOSNow(),
        promptInstall,
    };
}
