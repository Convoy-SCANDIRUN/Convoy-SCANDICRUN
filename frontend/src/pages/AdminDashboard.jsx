import { useEffect, useRef, useState, useMemo } from "react";
import api, { fileUrl, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import InstallAppButton from "@/components/InstallAppButton";
import AdminSettingsDialog from "@/components/AdminSettingsDialog";
import BrandLogo from "@/components/BrandLogo";
import usePush from "@/lib/usePush";
import { useTranslation } from "react-i18next";
import { avatarUrl, fallbackAvatar } from "@/lib/avatar";
import { buildEventPdf } from "@/lib/reports";
import { isRegOffline } from "@/lib/registration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, LogOut, Trash2, Map as MapIcon, Calendar, Users, Compass, ShieldAlert, Share2, Copy, Printer, Phone, Pencil, FileDown, Bell, BellOff, BellRing, ChevronDown, ChevronUp, Archive, ArchiveRestore, Settings, Menu, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

function EditEventDialog({ event, onClose, onSaved }) {
    const { t } = useTranslation();
    const [name, setName] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [emergencyPhone, setEmergencyPhone] = useState("");
    const [image, setImage] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (event) {
            setName(event.name || "");
            setStart(event.start_date || "");
            setEnd(event.end_date || "");
            setEmergencyPhone(event.emergency_phone || "");
            setImage(null);
        }
    }, [event]);

    const submit = async (e) => {
        e.preventDefault();
        if (!event) return;
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append("name", name);
            fd.append("start_date", start);
            fd.append("end_date", end);
            fd.append("emergency_phone", emergencyPhone);
            if (image) fd.append("image", image);
            const { data } = await api.put(`/events/${event.id}`, fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success("Event updated");
            onSaved && onSaved(data);
            onClose();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white" data-testid="edit-event-dialog">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl uppercase tracking-tight">{t("admin.editEvent")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4" data-testid="edit-event-form">
                    <div>
                        <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.eventName")}</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} required
                               data-testid="edit-event-name-input"
                               className="bg-transparent rounded-none border-white/20 h-11" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.startDate")}</Label>
                            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required
                                   data-testid="edit-event-start-input"
                                   className="bg-transparent rounded-none border-white/20 h-11" />
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.endDate")}</Label>
                            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required
                                   data-testid="edit-event-end-input"
                                   className="bg-transparent rounded-none border-white/20 h-11" />
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.emergencyPhone")}</Label>
                        <Input type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)}
                               data-testid="edit-event-emergency-phone-input"
                               className="bg-transparent rounded-none border-white/20 h-11" />
                    </div>
                    <div>
                        <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.eventCoverImage")}</Label>
                        <Input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)}
                               data-testid="edit-event-image-input"
                               className="bg-transparent rounded-none border-white/20 h-11 file:bg-white/10 file:text-white file:border-0 file:px-3 file:mr-3" />
                        {event?.image_path && !image && (
                            <div className="mt-2 flex items-center gap-2">
                                <img src={fileUrl(event.image_path)} alt="" className="w-12 h-12 rounded object-cover border border-white/20" />
                                <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{t("profile.currentPhoto")}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" onClick={onClose}
                                className="rounded-none border border-white/15 uppercase text-xs tracking-[0.2em]">
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={submitting} data-testid="edit-event-save"
                                className="rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase text-xs tracking-[0.2em]">
                            {submitting ? t("common.saving") : t("admin.saveEventSubmit")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminDashboard() {
    const { user, logout, deleteAccount } = useAuth();
    const [events, setEvents] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [registrations, setRegistrations] = useState([]);
    const [open, setOpen] = useState(false);

    // create event form
    const [name, setName] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [emergencyPhone, setEmergencyPhone] = useState("");
    const [image, setImage] = useState(null);
    const [creating, setCreating] = useState(false);

    // confirm-delete state (replaces native window.confirm which is blocked in some sandboxed/iframe environments)
    const [confirmAction, setConfirmAction] = useState(null);

    const active = useMemo(() => events.find((e) => e.id === activeId), [events, activeId]);
    const [shareEvent, setShareEvent] = useState(null);
    const [editEvent, setEditEvent] = useState(null);
    const [sosAlert, setSosAlert] = useState(null); // { reg, openedAt }
    const [focusTarget, setFocusTarget] = useState(null);
    // Collapsible sidebar panels for the admin command-centre. Persisted in
    // localStorage so each admin gets the layout they prefer across sessions.
    const [eventsCollapsed, setEventsCollapsed] = useState(() => {
        try { return localStorage.getItem("rt_admin_events_collapsed") === "1"; } catch { return false; }
    });
    const [participantsCollapsed, setParticipantsCollapsed] = useState(() => {
        try { return localStorage.getItem("rt_admin_participants_collapsed") === "1"; } catch { return false; }
    });
    const [showArchived, setShowArchived] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Sidebar drawer state — only used on mobile viewports (< sm). On desktop
    // the sidebar is always visible. Closed by default so the map fills the
    // mobile screen and users can pinch-zoom it freely.
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { t } = useTranslation();
    useEffect(() => { try { localStorage.setItem("rt_admin_events_collapsed", eventsCollapsed ? "1" : "0"); } catch {} }, [eventsCollapsed]);
    useEffect(() => { try { localStorage.setItem("rt_admin_participants_collapsed", participantsCollapsed ? "1" : "0"); } catch {} }, [participantsCollapsed]);
    const prevStatusesRef = useRef({});
    const shareUrl = shareEvent ? `${window.location.origin}/join/${shareEvent.code}` : "";

    const focusOnTeam = (r) => {
        if (r.lat == null || r.lng == null) {
            toast.info(`Team ${r.team_number} · ${r.team_name} hasn't shared a location yet`);
            return;
        }
        setFocusTarget({ id: r.id, lat: r.lat, lng: r.lng, nonce: Date.now() });
    };

    const copyShareUrl = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast.success("Link copied");
        } catch {
            toast.error("Could not copy");
        }
    };

    const printPoster = () => {
        if (!shareEvent) return;
        const w = window.open("", "_blank", "width=900,height=1200");
        if (!w) return;
        const canvas = document.querySelector("canvas[data-qr='share']");
        const qrDataUrl = canvas ? canvas.toDataURL("image/png") : "";
        // Format the event window in a friendly "13 Jun 2026 → 14 Jun 2026" style.
        const fmt = (iso) => {
            try {
                const d = new Date(`${iso}T00:00:00Z`);
                return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
            } catch { return iso; }
        };
        const eventImg = shareEvent.image_path ? fileUrl(shareEvent.image_path) : "";
        const logoUrl = `${window.location.origin}/scandic-logo.png`;
        const dateRange = `${fmt(shareEvent.start_date)} → ${fmt(shareEvent.end_date)}`;
        // Scandic Run brand palette: cyan #31A9E1 accents on a snow-white
        // background, with Viking-inspired display typography (Norse-like).
        w.document.write(`<!DOCTYPE html>
            <html><head><meta charset="utf-8" /><title>${shareEvent.name} — Join Poster</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
            <style>
                @font-face {
                    font-family: 'Scandic Run';
                    src: url('${window.location.origin}/fonts/ScandicRun-Regular.otf') format('opentype');
                    font-weight: 100 900; font-style: normal;
                }
                @page { size: A4 portrait; margin: 0; }
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; background: #fff; }
                body { font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif; color: #0e1a24; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .poster {
                    width: 210mm; min-height: 297mm; margin: 0 auto;
                    background:
                        radial-gradient(120% 60% at 50% 0%, rgba(49, 169, 225, 0.10) 0%, transparent 60%),
                        radial-gradient(80% 40% at 50% 100%, rgba(49, 169, 225, 0.08) 0%, transparent 60%),
                        #ffffff;
                    position: relative; overflow: hidden;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 18mm 16mm 16mm; text-align: center;
                }
                /* Top brand row: Viking logo + wordmark */
                .brand-row {
                    display: flex; align-items: center; justify-content: center; gap: 8mm;
                    margin-bottom: 10mm;
                }
                .brand-logo { width: 22mm; height: 22mm; object-fit: contain; }
                .brand-name {
                    font-family: 'Scandic Run', 'Helvetica Neue', sans-serif; font-weight: 400;
                    font-size: 26pt; letter-spacing: 0.06em;
                    color: #0e1a24; text-transform: uppercase;
                }
                .divider { width: 40mm; height: 1.2mm; background: #31A9E1; margin: 0 auto 8mm; }
                .kicker { font-size: 9pt; letter-spacing: 0.45em; color: #31A9E1; font-weight: 700; text-transform: uppercase; margin-bottom: 4mm; }
                .event-image { width: 36mm; height: 36mm; border-radius: 50%; object-fit: cover; border: 3px solid #31A9E1; margin-bottom: 6mm; }
                h1 {
                    font-family: 'Scandic Run', 'Helvetica Neue', sans-serif; font-weight: 400;
                    font-size: 42pt; letter-spacing: 0.03em;
                    margin: 0 0 4mm; text-transform: uppercase; line-height: 1.0;
                    max-width: 170mm; color: #0e1a24;
                }
                .dates {
                    display: inline-block; font-size: 11pt; letter-spacing: 0.3em;
                    color: #0e1a24; text-transform: uppercase; margin-bottom: 10mm;
                    font-weight: 700; padding: 3mm 8mm;
                    border-top: 0.4mm solid #31A9E1; border-bottom: 0.4mm solid #31A9E1;
                }
                .cta { font-size: 9pt; letter-spacing: 0.4em; color: #6b7c8a; text-transform: uppercase; margin-bottom: 4mm; font-weight: 600; }
                .code-pill {
                    display: inline-block; background: #31A9E1; color: #ffffff;
                    padding: 5mm 12mm; border-radius: 999px; margin-bottom: 10mm;
                    font-family: 'Scandic Run', 'Inter', sans-serif; font-weight: 400;
                    font-size: 38pt; letter-spacing: 0.18em;
                    box-shadow: 0 0.6mm 0 rgba(0,0,0,0.05);
                }
                .qr-frame {
                    padding: 5mm; background: #ffffff;
                    border: 0.6mm solid #d7e6ef; border-radius: 4mm;
                    box-shadow: 0 4mm 12mm rgba(14, 26, 36, 0.08);
                    margin-bottom: 8mm;
                }
                .qr-frame img { display: block; width: 68mm; height: 68mm; }
                .url {
                    font-size: 9.5pt; color: #6b7c8a; word-break: break-all;
                    max-width: 160mm; margin-top: 6mm; font-weight: 500;
                }
                .footer-strip {
                    position: absolute; left: 0; right: 0; bottom: 0;
                    background: #31A9E1; color: #ffffff;
                    padding: 5mm 0; text-align: center;
                    font-size: 8.5pt; letter-spacing: 0.4em; text-transform: uppercase; font-weight: 700;
                }
                @media print { .poster { min-height: 297mm; height: 297mm; } }
            </style></head><body>
                <div class="poster">
                    <div class="brand-row">
                        <img class="brand-logo" src="${logoUrl}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />
                        <span class="brand-name">Scandic Run</span>
                    </div>
                    <div class="divider"></div>
                    <div class="kicker">You're invited</div>
                    ${eventImg ? `<img class="event-image" src="${eventImg}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />` : ""}
                    <h1>${shareEvent.name}</h1>
                    <div class="dates">${dateRange}</div>
                    <div class="cta">Scan the QR or enter the code</div>
                    <div class="code-pill">${shareEvent.code}</div>
                    <div class="qr-frame"><img src="${qrDataUrl}" alt="QR" /></div>
                    <div class="url">${shareUrl}</div>
                    <div class="footer-strip">Scandic Run · Convoy Tracker · scandicrun.com</div>
                </div>
                <script>
                    // Wait for event image + brand logo so nothing prints half-loaded.
                    const imgs = Array.from(document.querySelectorAll('img'));
                    let pending = imgs.filter(i => !i.complete).length;
                    const go = () => setTimeout(() => window.print(), 300);
                    if (!pending) go();
                    else imgs.forEach(i => {
                        if (i.complete) return;
                        const done = () => { if (--pending <= 0) go(); };
                        i.addEventListener('load', done);
                        i.addEventListener('error', done);
                    });
                </script>
            </body></html>`);
        w.document.close();
    };

    const loadEvents = async () => {
        const { data } = await api.get("/events", { params: { include_archived: showArchived } });
        setEvents(data);
        if (!activeId && data.length) setActiveId(data[0].id);
    };

    const loadRegs = async () => {
        if (!activeId) return setRegistrations([]);
        const { data } = await api.get(`/events/${activeId}/registrations`);
        setRegistrations(data);
    };

    useEffect(() => { loadEvents(); }, [showArchived]);
    useEffect(() => { loadRegs(); }, [activeId]);
    useEffect(() => {
        if (!activeId) return;
        const t = setInterval(loadRegs, 5000);
        return () => clearInterval(t);
    }, [activeId]);

    // Alerts on status change — auto-open the SOS dispatch modal so the
    // crew can see team info, last position and one-tap navigation.
    useEffect(() => {
        registrations.forEach((r) => {
            const prev = prevStatusesRef.current[r.id];
            if (prev !== undefined && prev !== r.help_status && (r.help_status === "help" || r.help_status === "sos")) {
                const label = `Team ${r.team_number} · ${r.team_name}`;
                if (r.help_status === "sos") {
                    toast.error(`SOS — ${label}`, { duration: 10000 });
                    setSosAlert({ reg: r, openedAt: Date.now() });
                } else {
                    toast.warning(`Help requested — ${label}`, { duration: 6000 });
                }
            }
            // Keep the dialog's data in sync with the latest poll if it's open
            if (r.help_status === "sos" && sosAlert?.reg?.id === r.id) {
                setSosAlert((s) => s ? { ...s, reg: r } : s);
            }
        });
        prevStatusesRef.current = Object.fromEntries(registrations.map((r) => [r.id, r.help_status]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registrations]);

    const submitEvent = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const fd = new FormData();
            fd.append("name", name);
            fd.append("start_date", start);
            fd.append("end_date", end);
            fd.append("emergency_phone", emergencyPhone);
            if (image) fd.append("image", image);
            await api.post("/events", fd, { headers: { "Content-Type": "multipart/form-data" } });
            toast.success("Event created");
            setName(""); setStart(""); setEnd(""); setEmergencyPhone(""); setImage(null);
            setOpen(false);
            loadEvents();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setCreating(false);
        }
    };

    const askDeleteEvent = (e) => {
        setConfirmAction({
            title: "Delete event?",
            description: `"${e.name}" and all its registrations will be permanently removed. This cannot be undone.`,
            confirmLabel: "Delete event",
            destructive: true,
            run: async () => {
                try {
                    await api.delete(`/events/${e.id}`);
                    toast.success("Event deleted");
                    const remaining = events.filter((x) => x.id !== e.id);
                    setEvents(remaining);
                    setActiveId(remaining[0]?.id || null);
                } catch (err) { toast.error(formatApiError(err)); }
            },
        });
    };

    const askDeleteReg = (r) => {
        setConfirmAction({
            title: "Remove participant?",
            description: `Team ${r.team_number} · ${r.team_name} (${r.first_name} ${r.last_name}) will be removed from this event.`,
            confirmLabel: "Remove",
            destructive: true,
            run: async () => {
                try {
                    await api.delete(`/registrations/${r.id}`);
                    toast.success("Participant removed");
                    loadRegs();
                } catch (err) { toast.error(formatApiError(err)); }
            },
        });
    };

    const clearStatus = async (id) => {
        try {
            await api.post(`/registrations/${id}/help`, { status: "clear" });
            loadRegs();
        } catch (err) { toast.error(formatApiError(err)); }
    };

    const { isSubscribed: pushOn, isSupported: pushSupported, subscribe: pushSub, unsubscribe: pushUnsub } = usePush();
    const togglePush = async () => {
        if (!pushSupported) { toast.error("Push not supported by this browser"); return; }
        if (pushOn) { await pushUnsub(); toast.info("Notifications off"); return; }
        const r = await pushSub();
        if (r.ok) toast.success("Notifications enabled");
        else if (r.reason === "denied") toast.error("Notifications are blocked. Allow them in browser settings.");
        else toast.error("Couldn't enable notifications");
    };

    return (
        <div className="h-[100dvh] w-screen overflow-hidden bg-[#0A0A0A] text-white relative">
            {/* Topbar — responsive to match the participant dashboard. */}
            <header className="fixed top-0 left-0 right-0 z-[1100] flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 glass border-b border-white/10 safe-top">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {/* Mobile drawer toggle */}
                    <button type="button" onClick={() => setSidebarOpen((v) => !v)}
                            data-testid="admin-sidebar-toggle"
                            className="sm:hidden w-8 h-8 flex items-center justify-center border border-white/15 hover:bg-white/5 text-zinc-300 transition flex-shrink-0"
                            title="Toggle panels">
                        {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                    </button>
                    {active?.image_path ? (
                        <img src={fileUrl(active.image_path)} alt=""
                             className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-[#007AFF]/40 flex-shrink-0"
                             data-testid="topbar-event-image"
                             onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                        <BrandLogo className="w-8 h-8 sm:w-10 sm:h-10" />
                    )}
                    <div className="min-w-0">
                        <p className="font-display text-sm sm:text-xl font-black uppercase leading-none truncate">
                            {active?.name || "Command Center"}
                        </p>
                        <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.3em] text-zinc-400 mt-0.5 sm:mt-1 truncate">Admin · {user?.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    <button onClick={() => setSettingsOpen(true)}
                            type="button"
                            title={t("common.settings")}
                            data-testid="admin-settings-button"
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border border-white/15 hover:bg-white/5 text-zinc-300 transition">
                        <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button onClick={togglePush}
                            type="button"
                            title={pushOn ? "Notifications on — click to turn off" : "Enable push notifications"}
                            data-testid="admin-notifications-toggle"
                            className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border transition ${
                                pushOn ? "border-[#34C759]/50 bg-[#34C759]/10 text-[#34C759]" :
                                "border-white/15 hover:bg-white/5 text-zinc-300"
                            }`}>
                        {pushOn ? <BellRing className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </button>
                    <InstallAppButton className="hidden sm:inline-flex" />
                    <Button onClick={logout} variant="ghost" data-testid="logout-button"
                            className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-8 sm:h-9 px-2 sm:px-3">
                        <LogOut className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" /> <span className="hidden sm:inline">{t("nav.logout")}</span>
                    </Button>
                    <Button variant="ghost"
                            onClick={() => setConfirmAction({
                                title: "Delete your admin account?",
                                description: "Your account and any pending password-reset tokens will be permanently removed. Events you created will remain (other admins keep access).",
                                confirmLabel: "Delete account",
                                destructive: true,
                                run: async () => {
                                    try { await deleteAccount(); toast.success("Account deleted"); }
                                    catch (err) { toast.error(formatApiError(err)); }
                                },
                            })}
                            data-testid="delete-account-button"
                            className="rounded-none border border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/10 uppercase text-xs tracking-[0.2em] h-8 sm:h-9 px-2 sm:px-3">
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </Button>
                </div>
            </header>

            {/* Map fills viewport */}
            <div className="absolute inset-0 pt-[60px] sm:pt-[72px]">
                <MapView registrations={registrations} focusTarget={focusTarget} />
            </div>

            {/* Sidebar — persistent on desktop (sm+); slide-out drawer on mobile.
                On mobile the sidebar sits on top of the map, but only when
                the toggle is opened, so the map is fully interactive by
                default (no more sidebar blocking the map). */}
            {sidebarOpen && (
                <div className="sm:hidden fixed inset-0 top-[60px] z-[1090] bg-black/50 backdrop-blur-sm"
                     data-testid="admin-sidebar-scrim"
                     onClick={() => setSidebarOpen(false)} />
            )}
            <aside className={`fixed sm:absolute top-[60px] sm:top-[88px] bottom-0 sm:bottom-4 left-0 sm:left-4 w-[90vw] max-w-[360px] sm:w-[360px] z-[1100] flex flex-col gap-3 overflow-y-auto sm:overflow-hidden p-3 sm:p-0 transition-transform duration-300 ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } sm:translate-x-0`}
                   data-testid="admin-sidebar">
                {/* Events panel */}
                <div className={`glass p-4 ${eventsCollapsed ? "flex-shrink-0" : "flex-shrink-0"}`} data-testid="events-panel">
                    <div className="flex items-center justify-between mb-3">
                        <button type="button" onClick={() => setEventsCollapsed((v) => !v)}
                                data-testid="events-collapse-toggle"
                                className="text-xs uppercase tracking-[0.25em] font-bold text-zinc-300 flex items-center gap-2 hover:text-white transition">
                            {eventsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            <Calendar className="w-4 h-4" /> {t("admin.eventsHeader", { count: events.length })}
                        </button>
                        <div className="flex items-center gap-2">
                            <button type="button"
                                    onClick={() => setShowArchived((v) => !v)}
                                    data-testid="toggle-archived-events"
                                    title={showArchived ? "Hide archived events" : "Show archived events"}
                                    className={`h-8 w-8 flex items-center justify-center border transition ${
                                        showArchived ? "border-[#FFCC00]/60 text-[#FFCC00] bg-[#FFCC00]/10"
                                                     : "border-white/15 text-zinc-400 hover:text-white"
                                    }`}>
                                <Archive className="w-3.5 h-3.5" />
                            </button>
                            <Dialog open={open} onOpenChange={setOpen}>
                            <DialogTrigger asChild>
                                <Button data-testid="create-event-button"
                                        className="h-8 rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase text-[10px] tracking-[0.2em]">
                                    <Plus className="w-3 h-3 mr-1" /> {t("admin.newEvent")}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white">
                                <DialogHeader>
                                    <DialogTitle className="font-display text-2xl uppercase tracking-tight">{t("admin.newEvent")}</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={submitEvent} className="space-y-4" data-testid="create-event-form">
                                    <div>
                                        <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.eventName")}</Label>
                                        <Input value={name} onChange={(e) => setName(e.target.value)} required
                                               data-testid="event-name-input"
                                               className="bg-transparent rounded-none border-white/20 h-11" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.startDate")}</Label>
                                            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required
                                                   data-testid="event-start-input"
                                                   className="bg-transparent rounded-none border-white/20 h-11" />
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.endDate")}</Label>
                                            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required
                                                   data-testid="event-end-input"
                                                   className="bg-transparent rounded-none border-white/20 h-11" />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.emergencyPhone")}</Label>
                                        <Input
                                            type="tel"
                                            value={emergencyPhone}
                                            onChange={(ev) => setEmergencyPhone(ev.target.value)}
                                            required
                                            placeholder="+49 30 12345678"
                                            data-testid="event-emergency-phone-input"
                                            className="bg-transparent rounded-none border-white/20 h-11"
                                        />
                                        <p className="text-[10px] text-zinc-500 mt-1">
                                            {t("admin.emergencyPhoneHint")}
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-xs uppercase tracking-[0.2em]">{t("admin.eventCoverImage")}</Label>
                                        <Input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)}
                                               data-testid="event-image-input"
                                               className="bg-transparent rounded-none border-white/20 h-11 file:bg-white/10 file:text-white file:border-0 file:px-3 file:mr-3 file:rounded-none" />
                                    </div>
                                    <Button disabled={creating} type="submit" data-testid="event-submit-button"
                                            className="w-full rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase tracking-[0.2em] h-12">
                                        {creating ? t("common.loading") : t("admin.createEventSubmit")}
                                    </Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                        </div>
                    </div>

                    {!eventsCollapsed && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1" data-testid="events-list">
                        {events.length === 0 && (
                            <p className="text-xs text-zinc-500 italic">No events yet — create one to get started.</p>
                        )}
                        {events.map((e) => (
                            <div key={e.id}
                                 onClick={() => setActiveId(e.id)}
                                 data-testid={`event-card-${e.id}`}
                                 className={`p-3 border cursor-pointer transition ${
                                     e.archived ? "opacity-60" : ""
                                 } ${activeId === e.id ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/10 hover:bg-white/5"}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-display text-base font-bold uppercase truncate">
                                            {e.name}
                                            {e.archived && <span className="ml-2 text-[9px] uppercase tracking-wider text-[#FFCC00] font-normal">[archived]</span>}
                                        </p>
                                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 mt-1">
                                            Code · <span className="text-[#007AFF] font-bold">{e.code}</span>
                                        </p>
                                        <p className="text-[10px] text-zinc-500 mt-0.5">{e.start_date} → {e.end_date}</p>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <button onClick={(ev) => { ev.stopPropagation(); setEditEvent(e); }}
                                                data-testid={`edit-event-${e.id}`}
                                                title="Edit event"
                                                className="text-zinc-500 hover:text-[#007AFF] transition">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={async (ev) => {
                                                    ev.stopPropagation();
                                                    const toastId = toast.loading("Building event report…");
                                                    try {
                                                        const { data } = await api.get(`/events/${e.id}/summary`);
                                                        await buildEventPdf(data);
                                                        toast.success("Report downloaded", { id: toastId });
                                                    } catch (err) {
                                                        toast.error(formatApiError(err), { id: toastId });
                                                    }
                                                }}
                                                data-testid={`download-event-report-${e.id}`}
                                                title="Download event report (PDF)"
                                                className="text-zinc-500 hover:text-[#34C759] transition">
                                            <FileDown className="w-4 h-4" />
                                        </button>
                                        <button onClick={(ev) => { ev.stopPropagation(); setShareEvent(e); }}
                                                data-testid={`share-event-${e.id}`}
                                                title="Share / QR"
                                                className="text-zinc-500 hover:text-[#007AFF] transition">
                                            <Share2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={async (ev) => {
                                                    ev.stopPropagation();
                                                    const action = e.archived ? "unarchive" : "archive";
                                                    try {
                                                        await api.post(`/events/${e.id}/${action}`);
                                                        toast.success(e.archived ? "Event restored" : "Event archived");
                                                        loadEvents();
                                                    } catch (err) { toast.error(formatApiError(err)); }
                                                }}
                                                data-testid={`archive-event-${e.id}`}
                                                title={e.archived ? "Restore event" : "Archive event"}
                                                className="text-zinc-500 hover:text-[#FFCC00] transition">
                                            {e.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                                        </button>
                                        <button onClick={(ev) => { ev.stopPropagation(); askDeleteEvent(e); }}
                                                data-testid={`delete-event-${e.id}`}
                                                className="text-zinc-500 hover:text-[#FF3B30] transition">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    )}
                </div>

                {/* Participants panel */}
                {active && (
                    <div className={`glass p-4 flex flex-col ${participantsCollapsed ? "flex-shrink-0" : "flex-1 min-h-0"}`}
                         data-testid="participants-panel">
                        <button type="button" onClick={() => setParticipantsCollapsed((v) => !v)}
                                data-testid="participants-collapse-toggle"
                                className={`text-xs uppercase tracking-[0.25em] font-bold text-zinc-300 flex items-center gap-2 hover:text-white transition ${
                                    participantsCollapsed ? "mb-0" : "mb-3"
                                }`}>
                            {participantsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            <Users className="w-4 h-4" /> {t("admin.participantsHeader", { count: registrations.length })}
                        </button>
                        {!participantsCollapsed && (
                        <div className="space-y-2 overflow-y-auto pr-1 flex-1" data-testid="participants-list">
                            {registrations.length === 0 && (
                                <p className="text-xs text-zinc-500 italic">No participants yet. Share code <span className="text-[#007AFF]">{active.code}</span></p>
                            )}
                            {registrations.map((r) => {
                                const offline = isRegOffline(r);
                                return (
                                <div key={r.id} data-testid={`participant-row-${r.id}`}
                                     className={`p-3 border transition ${
                                         r.help_status === "sos"
                                             ? "border-[#FF3B30] bg-[#FF3B30]/15 ring-1 ring-[#FF3B30] animate-pulse"
                                             : r.help_status === "help"
                                                 ? "border-[#FFCC00] bg-[#FFCC00]/10"
                                                 : "border-white/10"
                                     } ${offline ? "opacity-60" : ""}`}>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={() => focusOnTeam(r)}
                                                data-testid={`focus-participant-${r.id}`}
                                                title={r.lat != null ? "Focus map on this team" : "No location yet"}
                                                className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition">
                                            <img
                                                src={avatarUrl(r)}
                                                alt=""
                                                className={`w-10 h-10 rounded-full object-cover border ${
                                                    offline ? "border-zinc-500 grayscale" :
                                                    r.help_status === "sos" ? "border-[#FF3B30] shadow-[0_0_10px_rgba(255,59,48,0.6)]" :
                                                    r.help_status === "help" ? "border-[#FFCC00]" :
                                                    "border-[#31A9E1] shadow-[0_0_10px_rgba(49,169,225,0.5)]"
                                                }`}
                                                data-testid={`participant-avatar-${r.id}`}
                                                onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(r); }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold truncate ${
                                                    r.help_status === "sos" ? "text-[#FF3B30]" : offline ? "text-zinc-400" : ""
                                                }`}>
                                                    {r.help_status === "sos" && <span className="mr-1">🚨</span>}
                                                    #{r.team_number} · {r.team_name}
                                                </p>
                                                <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
                                                    {offline && (
                                                        <span data-testid={`offline-badge-${r.id}`}
                                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-zinc-500 text-[9px] uppercase tracking-[0.15em] text-zinc-300 font-bold">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />
                                                            {t("nav.offline", "Offline")}
                                                        </span>
                                                    )}
                                                    <span className="truncate">{r.first_name} {r.last_name}</span>
                                                </p>
                                            </div>
                                        </button>
                                        {r.help_status === "sos" && (
                                            <button onClick={() => setSosAlert({ reg: r, openedAt: Date.now() })}
                                                    data-testid={`open-sos-${r.id}`}
                                                    className="text-[10px] uppercase tracking-wider px-2 py-1 bg-[#FF3B30] text-white font-bold">
                                                Dispatch
                                            </button>
                                        )}
                                        {(r.help_status === "help" || r.help_status === "sos") && (
                                            <button onClick={() => clearStatus(r.id)}
                                                    data-testid={`clear-status-${r.id}`}
                                                    className={
                                                        r.help_status === "help"
                                                            ? "text-[10px] uppercase tracking-wider px-2 py-1 bg-[#34C759] hover:bg-[#2BA64B] text-white font-bold border border-[#34C759]"
                                                            : "text-[10px] uppercase tracking-wider px-2 py-1 border border-white/20 hover:bg-white/10"
                                                    }>
                                                {r.help_status === "help" ? t("admin.cancelHelpRequest") : t("common.clear", "Clear")}
                                            </button>
                                        )}
                                        <button onClick={() => askDeleteReg(r)}
                                                data-testid={`delete-reg-${r.id}`}
                                                className="text-zinc-500 hover:text-[#FF3B30]">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {r.help_message && (r.help_status === "help" || r.help_status === "sos") && (
                                        <p className="mt-2 text-[11px] text-zinc-300 italic border-l-2 border-[#FFCC00] pl-2 break-words"
                                           data-testid={`help-message-${r.id}`}>
                                            “{r.help_message}”
                                        </p>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                        )}
                    </div>
                )}
            </aside>

            {/* Distress badge — clickable to re-open the dispatch dialog */}
            {registrations.some((r) => r.help_status === "sos") && (
                <button onClick={() => {
                    const sos = registrations.find((r) => r.help_status === "sos");
                    if (sos) setSosAlert({ reg: sos, openedAt: Date.now() });
                }}
                        data-testid="active-sos-banner"
                        className="absolute top-[88px] right-4 z-[1100] glass border-l-4 border-[#FF3B30] px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition animate-pulse">
                    <ShieldAlert className="w-5 h-5 text-[#FF3B30]" />
                    <div className="text-left">
                        <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#FF3B30]">SOS Active</p>
                        <p className="text-[11px] text-zinc-300">Tap to dispatch</p>
                    </div>
                </button>
            )}

            {!active && events.length === 0 && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[1100] glass p-6 max-w-sm" data-testid="empty-state">
                    <MapIcon className="w-8 h-8 text-[#007AFF] mb-2" />
                    <p className="font-display text-2xl font-black uppercase">Empty Map</p>
                    <p className="text-xs text-zinc-400 mt-2">Create an event to start tracking your convoy.</p>
                </div>
            )}

            <Dialog open={!!shareEvent} onOpenChange={(o) => !o && setShareEvent(null)}>
                <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white max-w-md p-5" data-testid="share-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight text-center">{t("admin.shareTitle")}</DialogTitle>
                    </DialogHeader>
                    {shareEvent && (
                        <div className="flex flex-col items-stretch gap-5 pt-2 w-full min-w-0">
                            {/* Event identity — image + name + dates */}
                            <div className="flex flex-col items-center gap-2 w-full min-w-0">
                                {shareEvent.image_path ? (
                                    <img src={fileUrl(shareEvent.image_path)} alt=""
                                         className="w-16 h-16 rounded-full object-cover border border-white/15"
                                         onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                ) : (
                                    <BrandLogo className="w-14 h-14" />
                                )}
                                <p className="font-display text-xl font-black uppercase tracking-tight text-center leading-tight px-2 break-words">
                                    {shareEvent.name}
                                </p>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[#31A9E1] font-bold">
                                    {shareEvent.start_date} → {shareEvent.end_date}
                                </p>
                            </div>

                            {/* Join code */}
                            <div className="flex flex-col items-center w-full min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-1">{t("admin.shareCode")}</p>
                                <p className="font-display text-4xl sm:text-5xl font-black tracking-[0.2em] text-[#31A9E1] text-center break-all" data-testid="share-event-code">
                                    {shareEvent.code}
                                </p>
                            </div>

                            {/* QR code */}
                            <div className="flex items-center justify-center bg-white p-4 mx-auto">
                                <QRCodeCanvas
                                    value={shareUrl}
                                    size={200}
                                    level="M"
                                    includeMargin={false}
                                    data-qr="share"
                                />
                            </div>

                            {/* Join URL with copy — min-w-0 lets truncate shrink inside flex */}
                            <div className="flex items-center gap-2 border border-white/15 px-3 py-2 w-full min-w-0">
                                <code className="text-xs text-zinc-300 truncate flex-1 min-w-0" data-testid="share-url">{shareUrl}</code>
                                <button onClick={copyShareUrl} data-testid="copy-share-url"
                                        className="text-zinc-400 hover:text-white p-1 flex-shrink-0"
                                        title={t("admin.shareUrl")}>
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 w-full min-w-0">
                                <Button onClick={copyShareUrl} variant="ghost" data-testid="copy-link-button"
                                        className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] tracking-[0.1em] h-11 px-2 min-w-0">
                                    <Copy className="w-3 h-3 mr-1.5 flex-shrink-0" /> <span className="truncate">{t("admin.shareUrl")}</span>
                                </Button>
                                <Button onClick={printPoster} data-testid="print-poster-button"
                                        className="rounded-none bg-[#31A9E1] hover:bg-[#2793c6] uppercase text-[10px] tracking-[0.1em] h-11 px-2 min-w-0 text-white">
                                    <Printer className="w-3 h-3 mr-1.5 flex-shrink-0" /> <span className="truncate">{t("admin.sharePrint")}</span>
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* SOS dispatch dialog — auto-opens for admins when a team triggers SOS */}
            <Dialog open={!!sosAlert} onOpenChange={(o) => !o && setSosAlert(null)}>
                <DialogContent className="bg-[#0A0A0A] border border-[#FF3B30]/60 rounded-none text-white max-w-md"
                               data-testid="sos-dispatch-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-3xl uppercase tracking-tight text-[#FF3B30] flex items-center gap-2">
                            <ShieldAlert className="w-7 h-7 animate-pulse" /> {t("admin.dispatchTitle")}
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            {t("admin.dispatchSubtitle")}
                        </DialogDescription>
                    </DialogHeader>
                    {sosAlert?.reg && (() => {
                        const r = sosAlert.reg;
                        const hasPos = r.lat != null && r.lng != null;
                        const lat = hasPos ? Number(r.lat).toFixed(5) : null;
                        const lng = hasPos ? Number(r.lng).toFixed(5) : null;
                        const gmaps = hasPos ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}` : null;
                        const amaps = hasPos ? `https://maps.apple.com/?daddr=${r.lat},${r.lng}` : null;
                        return (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 border border-[#FF3B30]/40 bg-[#FF3B30]/10 p-3"
                                     data-testid="sos-team-info">
                                    <img
                                        src={avatarUrl(r)}
                                        alt=""
                                        className="w-14 h-14 rounded-full object-cover border-2 border-[#FF3B30] shadow-[0_0_18px_rgba(255,59,48,0.6)]"
                                        onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(r); }}
                                    />
                                    <div className="min-w-0">
                                        <p className="font-display text-xl font-black uppercase">
                                            #{r.team_number} · {r.team_name}
                                        </p>
                                        <p className="text-xs text-zinc-300">{r.first_name} {r.last_name}</p>
                                    </div>
                                </div>

                                <div className="border border-white/15 p-3 space-y-1.5" data-testid="sos-position-info">
                                    <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-zinc-400">
                                        {t("admin.dispatchLastPosition")}
                                    </p>
                                    {hasPos ? (
                                        <>
                                            <p className="font-mono text-sm text-white">
                                                {lat}, {lng}
                                            </p>
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                                                Updated {r.last_update ? new Date(r.last_update).toLocaleTimeString() : "—"}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-xs text-[#FFCC00]">
                                            ⚠ No location reported yet — call the team to confirm whereabouts.
                                        </p>
                                    )}
                                </div>

                                {r.help_message && (
                                    <div className="border-l-2 border-[#FF3B30] pl-3" data-testid="sos-message">
                                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-400 mb-1">
                                            {t("participant.helpNavTeamNote")}
                                        </p>
                                        <p className="text-sm text-zinc-200 italic">“{r.help_message}”</p>
                                    </div>
                                )}

                                {hasPos && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <a href={gmaps} target="_blank" rel="noreferrer"
                                           data-testid={`sos-navigate-google-${r.id}`}
                                           className="text-center py-3 bg-[#007AFF] hover:bg-[#005bb5] text-white text-[11px] uppercase tracking-[0.2em] font-bold transition">
                                            Google Maps
                                        </a>
                                        <a href={amaps} target="_blank" rel="noreferrer"
                                           data-testid={`sos-navigate-apple-${r.id}`}
                                           className="text-center py-3 border border-white/20 hover:bg-white/5 text-white text-[11px] uppercase tracking-[0.2em] font-bold transition">
                                            Apple Maps
                                        </a>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <Button onClick={() => {
                                        clearStatus(r.id);
                                        setSosAlert(null);
                                    }} data-testid="sos-mark-resolved"
                                            className="flex-1 rounded-none bg-[#34C759] hover:bg-[#2BA64B] text-white uppercase text-[11px] tracking-[0.2em]">
                                        {t("admin.dispatchClear")}
                                    </Button>
                                    <Button variant="ghost" onClick={() => setSosAlert(null)}
                                            data-testid="sos-dismiss"
                                            className="rounded-none border border-white/15 uppercase text-[11px] tracking-[0.2em]">
                                        {t("admin.dispatchDismiss")}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Edit event dialog */}
            <EditEventDialog
                event={editEvent}
                onClose={() => setEditEvent(null)}
                onSaved={(updated) => {
                    setEvents((evs) => evs.map((e) => (e.id === updated.id ? updated : e)));
                }}
            />

            {/* Confirm-delete AlertDialog (replaces native confirm which is blocked in iframe) */}
            <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
                <AlertDialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white" data-testid="confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-display text-2xl uppercase tracking-tight">
                            {confirmAction?.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-300 text-sm">
                            {confirmAction?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            data-testid="confirm-cancel"
                            className="rounded-none border border-white/15 bg-transparent hover:bg-white/5 uppercase text-xs tracking-[0.2em] text-white">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="confirm-accept"
                            onClick={async () => {
                                const action = confirmAction;
                                setConfirmAction(null);
                                if (action?.run) await action.run();
                            }}
                            className={`rounded-none uppercase text-xs tracking-[0.2em] ${
                                confirmAction?.destructive
                                    ? "bg-[#FF3B30] hover:bg-[#D32F2F] text-white"
                                    : "bg-[#007AFF] hover:bg-[#005bb5] text-white"
                            }`}>
                            {confirmAction?.confirmLabel || "Confirm"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AdminSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
    );
}
