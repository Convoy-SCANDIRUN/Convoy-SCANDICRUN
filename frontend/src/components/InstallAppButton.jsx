import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import usePwaInstall from "@/lib/usePwaInstall";

/** Pill-shaped "Install App" button used in profile / settings. Hides itself
 *  once the app is already running in standalone (installed) mode. */
export default function InstallAppButton({ className = "" }) {
    const { canInstall, isStandalone, promptInstall } = usePwaInstall();
    const [iosOpen, setIosOpen] = useState(false);

    if (isStandalone) return null;

    const onClick = async () => {
        const result = await promptInstall();
        if (result === "ios") {
            setIosOpen(true);
        } else if (result === "accepted") {
            toast.success("Convoy is being installed…");
        } else if (result === "unsupported") {
            toast.info("Your browser doesn't support installing this app — try Chrome on Android or Safari on iPhone.");
        }
    };

    if (!canInstall) return null;

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
                        Once installed, the app keeps tracking longer in the background and gets push-style updates.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
