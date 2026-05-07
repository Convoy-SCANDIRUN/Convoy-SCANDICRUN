import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

const DISMISS_KEY = "rt_pwa_dismissed";
const DISMISS_TTL_DAYS = 14;

function isStandalone() {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;
}

function isIOS() {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function recentlyDismissed() {
    try {
        const ts = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
        return ts && (Date.now() - ts) < DISMISS_TTL_DAYS * 86_400_000;
    } catch { return false; }
}

/**
 * Floating banner that prompts users to install the PWA.
 * - Android / Chrome / Edge: uses the `beforeinstallprompt` event.
 * - iOS Safari: shows manual "Share → Add to Home Screen" instructions.
 */
export default function InstallPrompt() {
    const [deferred, setDeferred] = useState(null);
    const [show, setShow] = useState(false);
    const [showIosHelp, setShowIosHelp] = useState(false);

    useEffect(() => {
        if (isStandalone() || recentlyDismissed()) return;

        const onPrompt = (e) => {
            e.preventDefault();
            setDeferred(e);
            setShow(true);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);

        // iOS Safari does not fire beforeinstallprompt — show our own banner
        // after a short delay so it doesn't feel pushy on first paint.
        let timer;
        if (isIOS()) {
            timer = setTimeout(() => setShow(true), 4000);
        }

        return () => {
            window.removeEventListener("beforeinstallprompt", onPrompt);
            if (timer) clearTimeout(timer);
        };
    }, []);

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
        setShow(false);
        setShowIosHelp(false);
    };

    const install = async () => {
        if (deferred) {
            deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === "accepted" || outcome === "dismissed") dismiss();
        } else if (isIOS()) {
            setShowIosHelp(true);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-[170px] sm:bottom-[180px] right-3 sm:right-4 z-[1103] max-w-xs"
             data-testid="pwa-install-prompt">
            {!showIosHelp ? (
                <div className="glass border border-[#007AFF]/40 px-3 py-2 flex items-center gap-2">
                    <Download className="w-4 h-4 text-[#007AFF] flex-shrink-0" />
                    <div className="text-[11px] leading-tight flex-1 min-w-0">
                        <p className="font-bold uppercase tracking-wider">Install Convoy</p>
                        <p className="text-zinc-400 text-[10px]">Faster + better tracking</p>
                    </div>
                    <button onClick={install} data-testid="pwa-install-button"
                            className="bg-[#007AFF] hover:bg-[#005bb5] text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1">
                        Install
                    </button>
                    <button onClick={dismiss} aria-label="Dismiss" data-testid="pwa-dismiss-button"
                            className="text-zinc-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <div className="glass border border-[#007AFF]/40 p-3" data-testid="pwa-ios-instructions">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-bold uppercase tracking-wider text-xs">Add to home screen</p>
                        <button onClick={dismiss} className="text-zinc-400 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <ol className="text-[11px] text-zinc-300 leading-relaxed space-y-1 list-decimal pl-4">
                        <li>Tap the <span className="inline-flex items-center gap-1 text-[#007AFF] font-bold"><Share className="w-3 h-3" /> Share</span> icon in Safari.</li>
                        <li>Scroll down and tap <span className="font-bold">"Add to Home Screen"</span>.</li>
                        <li>Open Convoy from your home screen for the best tracking experience.</li>
                    </ol>
                </div>
            )}
        </div>
    );
}
