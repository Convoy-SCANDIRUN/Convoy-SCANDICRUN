import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";
import usePwaInstall from "@/lib/usePwaInstall";

const DISMISS_KEY = "rt_pwa_dismissed";
const DISMISS_TTL_DAYS = 14;

function recentlyDismissed() {
    try {
        const ts = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
        return ts && (Date.now() - ts) < DISMISS_TTL_DAYS * 86_400_000;
    } catch { return false; }
}

/**
 * Floating banner that prompts users to install the PWA on first visit.
 * Uses the shared `usePwaInstall` hook so logic stays in sync with the
 * profile-settings "Install App" button.
 */
export default function InstallPrompt() {
    const { canInstall, isStandalone, isIOS, promptInstall } = usePwaInstall();
    const [show, setShow] = useState(false);
    const [showIosHelp, setShowIosHelp] = useState(false);

    useEffect(() => {
        if (isStandalone || recentlyDismissed()) return;
        if (!canInstall) return;
        // Slight delay on iOS so the banner doesn't feel pushy on first paint.
        const timer = setTimeout(() => setShow(true), isIOS ? 4000 : 0);
        return () => clearTimeout(timer);
    }, [canInstall, isStandalone, isIOS]);

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
        setShow(false);
        setShowIosHelp(false);
    };

    const install = async () => {
        const result = await promptInstall();
        if (result === "ios") setShowIosHelp(true);
        else if (result === "accepted" || result === "dismissed") dismiss();
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-[230px] sm:bottom-[230px] right-3 sm:right-4 z-[1103] max-w-xs"
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
