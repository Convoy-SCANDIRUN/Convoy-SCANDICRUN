import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import LanguagePicker from "@/components/LanguagePicker";
import InstallAppButton from "@/components/InstallAppButton";
import NotificationsToggle from "@/components/NotificationsToggle";

/** Consolidated admin settings dialog — same shape as the participant
 *  profile dialog, minus the team/photo editing. Gives admins access to
 *  install prompt, notifications toggle and language picker. */
export default function AdminSettingsDialog({ open, onOpenChange }) {
    const { t } = useTranslation();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white max-w-md max-h-[90vh] overflow-y-auto"
                           data-testid="admin-settings-dialog">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl uppercase tracking-tight">
                        {t("common.settings")}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-5">
                    <div className="space-y-2" data-testid="admin-install-section">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-bold">
                            {t("profile.installAppHeader")}
                        </p>
                        <InstallAppButton className="w-full" />
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {t("profile.installAppHint")}
                        </p>
                    </div>

                    <div className="border-t border-white/10 pt-4 space-y-2" data-testid="admin-notifications-section">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-bold">
                            {t("profile.pushHeader")}
                        </p>
                        <NotificationsToggle />
                    </div>

                    <div className="border-t border-white/10 pt-4" data-testid="admin-language-section">
                        <LanguagePicker />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
