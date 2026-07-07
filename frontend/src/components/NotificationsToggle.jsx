import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import usePush from "@/lib/usePush";

/** UI control to enable/disable Web Push notifications for the current user.
 *  Shows browser support state honestly — on unsupported browsers (e.g. iOS
 *  Safari outside a PWA install) it displays an inline explanation. */
export default function NotificationsToggle() {
    const { t } = useTranslation();
    const { isSupported, permission, isSubscribed, busy, subscribe, unsubscribe } = usePush();

    if (!isSupported) {
        return (
            <p className="text-[11px] text-zinc-500 leading-relaxed" data-testid="push-unsupported">
                {t("profile.pushUnsupported")}
            </p>
        );
    }

    const handle = async () => {
        if (isSubscribed) {
            await unsubscribe();
            toast.info(t("auth.notificationsBlocked"));
            return;
        }
        const res = await subscribe();
        if (res.ok) toast.success(t("auth.notificationsEnabled"));
        else if (res.reason === "denied") toast.error(t("profile.pushBlocked"));
        else toast.error(t("errors.generic"));
    };

    return (
        <div className="space-y-2" data-testid="notifications-toggle">
            <Button type="button"
                    onClick={handle}
                    disabled={busy || permission === "denied"}
                    data-testid="notifications-toggle-button"
                    className={`w-full rounded-none uppercase text-xs tracking-[0.2em] h-11 ${
                        isSubscribed
                            ? "bg-white/10 hover:bg-white/20 border border-white/20"
                            : "bg-[#007AFF] hover:bg-[#005bb5]"
                    }`}>
                {isSubscribed ? <BellOff className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                {isSubscribed ? t("profile.pushDisable") : t("profile.pushEnable")}
            </Button>
            {permission === "denied" && (
                <p className="text-[11px] text-[#FF3B30]">{t("profile.pushBlocked")}</p>
            )}
            <p className="text-[11px] text-zinc-500 leading-relaxed">{t("profile.pushHint")}</p>
        </div>
    );
}
