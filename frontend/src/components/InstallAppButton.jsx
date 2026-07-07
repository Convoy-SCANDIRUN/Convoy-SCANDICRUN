import { useState } from "react";
import { Download, Share } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
    const { canInstall, isStandalone, promptInstall } = usePwaInstall();
    const [iosOpen, setIosOpen] = useState(false);
    const [genericOpen, setGenericOpen] = useState(false);

    if (isStandalone) return null;

    const onClick = async () => {
        if (canInstall) {
            const result = await promptInstall();
            if (result === "ios") { setIosOpen(true); return; }
            if (result === "accepted") { toast.success(t("install.installing")); return; }
            if (result === "dismissed") { toast.info(t("install.cancelled")); return; }
        }
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
                {t("install.button")}
            </Button>

            <Dialog open={iosOpen} onOpenChange={setIosOpen}>
                <DialogContent className="bg-[#0A0A0A] border border-[#007AFF]/40 rounded-none text-white max-w-md"
                               data-testid="ios-install-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight">
                            {t("install.iosTitle")}
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            {t("install.iosPlatform")}
                        </DialogDescription>
                    </DialogHeader>
                    <ol className="text-sm text-zinc-200 leading-relaxed space-y-2 list-decimal pl-5">
                        <li className="flex items-start gap-1">
                            <span className="inline-flex items-center gap-1 mr-1"><Share className="w-4 h-4 text-[#007AFF] inline" /></span>
                            <span>{t("install.iosStep1")}</span>
                        </li>
                        <li>{t("install.iosStep2")}</li>
                        <li>{t("install.iosStep3")}</li>
                        <li>{t("install.iosStep4")}</li>
                    </ol>
                    <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed border-t border-white/10 pt-3">
                        {t("install.iosNote")}
                    </p>
                </DialogContent>
            </Dialog>

            <Dialog open={genericOpen} onOpenChange={setGenericOpen}>
                <DialogContent className="bg-[#0A0A0A] border border-[#007AFF]/40 rounded-none text-white max-w-md"
                               data-testid="generic-install-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight">
                            {t("install.androidTitle")}
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            {t("install.androidPlatform")}
                        </DialogDescription>
                    </DialogHeader>
                    <ol className="text-sm text-zinc-200 leading-relaxed space-y-2 list-decimal pl-5">
                        <li>{t("install.androidStep1")}</li>
                        <li>{t("install.androidStep2")}</li>
                        <li>{t("install.androidStep3")}</li>
                    </ol>
                    <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed border-t border-white/10 pt-3">
                        {t("install.androidNote")}
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
