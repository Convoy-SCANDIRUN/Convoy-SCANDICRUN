import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import usePush from "@/lib/usePush";

/** UI control to enable/disable Web Push notifications for the current user.
 *  Shows browser support state honestly — on unsupported browsers (e.g. iOS
 *  Safari outside a PWA install) it displays an inline explanation. */
export default function NotificationsToggle() {
    const { isSupported, permission, isSubscribed, busy, subscribe, unsubscribe } = usePush();

    if (!isSupported) {
        return (
            <p className="text-[11px] text-zinc-500 leading-relaxed" data-testid="push-unsupported">
                Push notifications aren't supported by this browser. On iPhone, install Convoy to
                your home screen and open it from there — iOS 16.4+ then supports notifications.
            </p>
        );
    }

    const handle = async () => {
        if (isSubscribed) {
            await unsubscribe();
            toast.info("Notifications turned off");
            return;
        }
        const res = await subscribe();
        if (res.ok) toast.success("Notifications enabled");
        else if (res.reason === "denied") toast.error("Notifications were blocked in your browser settings.");
        else toast.error("Couldn't enable notifications");
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
                {isSubscribed ? "Turn off notifications" : "Enable notifications"}
            </Button>
            {permission === "denied" && (
                <p className="text-[11px] text-[#FF3B30]">
                    Notifications are blocked. Allow them in your browser site settings, then reload.
                </p>
            )}
            <p className="text-[11px] text-zinc-500 leading-relaxed">
                Get alerted when any team raises a help request, and (admins) when a team triggers SOS —
                even when Convoy is in the background.
            </p>
        </div>
    );
}
