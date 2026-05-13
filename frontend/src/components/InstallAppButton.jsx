import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import usePwaInstall from "@/lib/usePwaInstall";

function isIOSUA() {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/** Pill-shaped "Install App" button used in profile / settings.
 *  Always visible in browser mode — only hides when running inside the
 *  already-installed PWA. If the browser hasn't fired `beforeinstallprompt`
 *  yet (e.g. user dismissed Chrome's banner or visited via in-app browser),
 *  we still show the button and open a manual instructions modal on tap so
 *  the user is never stranded. */
export default function InstallAppButton({ className = "" }) {
    const { canInstall, isStandalone, promptInstall } = usePwaInstall();
    const [iosOpen, setIosOpen] = useState(false);
    const [genericOpen, setGenericOpen] = useState(false);

    if (isStandalone) return null;

    const onClick = async () => {
        // Try the native prompt first when we have one queued.
        if (canInstall) {
            const result = await promptInstall();
            if (result === "ios") { setIosOpen(true); return; }
            if (result === "accepted") { toast.success("Convoy is being installed…"); return; }
            if (result === "dismissed") { toast.info("Installation cancelled — you can try again any time."); return; }
        }
        // Fall back to manual instructions so the user is never stuck.
        if (isIOSUA()) setIosOpen(true);
        else setGenericOpen(true);
    };

    return (
        <>
            <Button
                type="button"
                onClick={onClick}
                data-testid="install-app-button"
                className={`rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase text-xs tracking-[0.2em] h-11 ${className}`}>
                <Download className="w-4 h-4 mr-2" />
                Install App
            </Button>

            <Dialog open={iosOpen} onOpenChange={setIosOpen}>
                <DialogContent className="bg-[#0A0A0A] border border-[#007AFF]/40 rounded-none text-white max-w-md"
                               data-testid="ios-install-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight">
                            Add Convoy to home screen
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            iPhone / iPad · Safari
                        </DialogDescription>
                    </DialogHeader>
                    <ol className="text-sm text-zinc-200 leading-relaxed space-y-2 list-decimal pl-5">
                        <li>
                            Tap the <span className="inline-flex items-center gap-1 text-[#007AFF] font-bold">
                                <Share className="w-4 h-4" /> Share
                            </span> icon at the bottom of Safari.
                        </li>
                        <li>Scroll down and tap <span className="font-bold">"Add to Home Screen"</span>.</li>
                        <li>Confirm with <span className="font-bold">"Add"</span>.</li>
                        <li>Open Convoy from your home screen for the best tracking experience.</li>
                    </ol>
                    <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed border-t border-white/10 pt-3">
                        Note: on iPhone, installing only works in <span className="text-white font-bold">Safari</span>.
                        If you're using Chrome or another browser, switch to Safari first.
                    </p>
                </DialogContent>
            </Dialog>

            <Dialog open={genericOpen} onOpenChange={setGenericOpen}>
                <DialogContent className="bg-[#0A0A0A] border border-[#007AFF]/40 rounded-none text-white max-w-md"
                               data-testid="generic-install-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight">
                            Install Convoy
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            Android · Chrome / Edge
                        </DialogDescription>
                    </DialogHeader>
                    <ol className="text-sm text-zinc-200 leading-relaxed space-y-2 list-decimal pl-5">
                        <li>Tap the <span className="font-bold">⋮ menu</span> button in the top-right of your browser.</li>
                        <li>Tap <span className="font-bold">"Install app"</span> or <span className="font-bold">"Add to Home screen"</span>.</li>
                        <li>Confirm — Convoy will appear on your home screen.</li>
                    </ol>
                    <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed border-t border-white/10 pt-3">
                        On iPhone use Safari and tap the <span className="text-white font-bold">Share → Add to Home Screen</span> menu.
                        Some in-app browsers (Facebook, Instagram, LinkedIn) cannot install web apps — open the link in your regular browser first.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
