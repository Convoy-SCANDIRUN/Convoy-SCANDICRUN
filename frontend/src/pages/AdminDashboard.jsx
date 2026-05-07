import { useEffect, useState, useMemo } from "react";
import api, { fileUrl, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, LogOut, Trash2, Map as MapIcon, Calendar, Users, Compass, ShieldAlert, Share2, Copy, Printer, Phone } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

export default function AdminDashboard() {
    const { user, logout } = useAuth();
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
    const shareUrl = shareEvent ? `${window.location.origin}/join/${shareEvent.code}` : "";

    const copyShareUrl = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast.success("Link copied");
        } catch {
            toast.error("Could not copy");
        }
    };

    const printPoster = () => {
        const w = window.open("", "_blank", "width=800,height=900");
        if (!w) return;
        const canvas = document.querySelector("canvas[data-qr='share']");
        const dataUrl = canvas ? canvas.toDataURL("image/png") : "";
        w.document.write(`
            <html><head><title>${shareEvent.name} — Join Poster</title>
            <style>
                @page { margin: 24mm; }
                body { font-family: 'Helvetica Neue', sans-serif; text-align: center; color: #000; padding: 40px; }
                h1 { font-size: 48px; letter-spacing: -1px; margin: 0 0 8px; text-transform: uppercase; }
                .sub { letter-spacing: 0.4em; font-size: 12px; color: #666; text-transform: uppercase; }
                .code { font-size: 72px; font-weight: 900; letter-spacing: 12px; margin: 24px 0 8px; }
                img { width: 360px; height: 360px; margin-top: 24px; }
                .url { margin-top: 16px; font-size: 14px; color: #333; word-break: break-all; }
                .foot { margin-top: 40px; font-size: 11px; letter-spacing: 0.3em; color: #999; text-transform: uppercase; }
            </style></head><body>
                <div class="sub">Convoy · Tactical Tracker</div>
                <h1>${shareEvent.name}</h1>
                <div class="sub">Scan or enter code to join</div>
                <div class="code">${shareEvent.code}</div>
                <img src="${dataUrl}" alt="QR" />
                <div class="url">${shareUrl}</div>
                <div class="foot">${shareEvent.start_date} → ${shareEvent.end_date}</div>
                <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
            </body></html>`);
        w.document.close();
    };

    const loadEvents = async () => {
        const { data } = await api.get("/events");
        setEvents(data);
        if (!activeId && data.length) setActiveId(data[0].id);
    };

    const loadRegs = async () => {
        if (!activeId) return setRegistrations([]);
        const { data } = await api.get(`/events/${activeId}/registrations`);
        setRegistrations(data);
    };

    useEffect(() => { loadEvents(); }, []);
    useEffect(() => { loadRegs(); }, [activeId]);
    useEffect(() => {
        if (!activeId) return;
        const t = setInterval(loadRegs, 5000);
        return () => clearInterval(t);
    }, [activeId]);

    // alerts on status change
    const [prevStatuses, setPrevStatuses] = useState({});
    useEffect(() => {
        registrations.forEach((r) => {
            const prev = prevStatuses[r.id];
            if (prev !== undefined && prev !== r.help_status && (r.help_status === "help" || r.help_status === "sos")) {
                const label = `Team ${r.team_number} · ${r.team_name}`;
                if (r.help_status === "sos") toast.error(`SOS — ${label}`, { duration: 8000 });
                else toast.warning(`Help requested — ${label}`, { duration: 6000 });
            }
        });
        setPrevStatuses(Object.fromEntries(registrations.map((r) => [r.id, r.help_status])));
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

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#0A0A0A] text-white relative">
            {/* Topbar */}
            <header className="absolute top-0 left-0 right-0 z-[1100] flex items-center justify-between px-6 py-4 glass border-b border-white/10">
                <div className="flex items-center gap-3">
                    <Compass className="w-6 h-6 text-[#007AFF]" />
                    <div>
                        <p className="font-display text-xl font-black uppercase leading-none">Command Center</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400 mt-1">Admin · {user?.name}</p>
                    </div>
                </div>
                <Button onClick={logout} variant="ghost" data-testid="logout-button"
                        className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-xs tracking-[0.2em]">
                    <LogOut className="w-4 h-4 mr-2" /> Logout
                </Button>
            </header>

            {/* Map fills viewport */}
            <div className="absolute inset-0 pt-[72px]">
                <MapView registrations={registrations} />
            </div>

            {/* Sidebar */}
            <aside className="absolute top-[88px] bottom-4 left-4 w-[360px] z-[1100] flex flex-col gap-3 overflow-hidden">
                {/* Events panel */}
                <div className="glass p-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-[0.25em] font-bold text-zinc-300 flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Events
                        </p>
                        <Dialog open={open} onOpenChange={setOpen}>
                            <DialogTrigger asChild>
                                <Button data-testid="create-event-button"
                                        className="h-8 rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase text-[10px] tracking-[0.2em]">
                                    <Plus className="w-3 h-3 mr-1" /> New
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white">
                                <DialogHeader>
                                    <DialogTitle className="font-display text-2xl uppercase tracking-tight">Create Event</DialogTitle>
                                    <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                                        Set up a new road trip and share its code.
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={submitEvent} className="space-y-4" data-testid="create-event-form">
                                    <div>
                                        <Label className="text-xs uppercase tracking-[0.2em]">Name</Label>
                                        <Input value={name} onChange={(e) => setName(e.target.value)} required
                                               data-testid="event-name-input"
                                               className="bg-transparent rounded-none border-white/20 h-11" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs uppercase tracking-[0.2em]">Start</Label>
                                            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required
                                                   data-testid="event-start-input"
                                                   className="bg-transparent rounded-none border-white/20 h-11" />
                                        </div>
                                        <div>
                                            <Label className="text-xs uppercase tracking-[0.2em]">End</Label>
                                            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required
                                                   data-testid="event-end-input"
                                                   className="bg-transparent rounded-none border-white/20 h-11" />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs uppercase tracking-[0.2em]">Emergency phone</Label>
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
                                            Shown on participant SOS screen — must be reachable during the event.
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-xs uppercase tracking-[0.2em]">Cover image</Label>
                                        <Input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)}
                                               data-testid="event-image-input"
                                               className="bg-transparent rounded-none border-white/20 h-11 file:bg-white/10 file:text-white file:border-0 file:px-3 file:mr-3 file:rounded-none" />
                                    </div>
                                    <Button disabled={creating} type="submit" data-testid="event-submit-button"
                                            className="w-full rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase tracking-[0.2em] h-12">
                                        {creating ? "Creating…" : "Create"}
                                    </Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1" data-testid="events-list">
                        {events.length === 0 && (
                            <p className="text-xs text-zinc-500 italic">No events yet — create one to get started.</p>
                        )}
                        {events.map((e) => (
                            <div key={e.id}
                                 onClick={() => setActiveId(e.id)}
                                 data-testid={`event-card-${e.id}`}
                                 className={`p-3 border cursor-pointer transition ${activeId === e.id ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/10 hover:bg-white/5"}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-display text-base font-bold uppercase truncate">{e.name}</p>
                                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 mt-1">
                                            Code · <span className="text-[#007AFF] font-bold">{e.code}</span>
                                        </p>
                                        <p className="text-[10px] text-zinc-500 mt-0.5">{e.start_date} → {e.end_date}</p>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <button onClick={(ev) => { ev.stopPropagation(); setShareEvent(e); }}
                                                data-testid={`share-event-${e.id}`}
                                                title="Share / QR"
                                                className="text-zinc-500 hover:text-[#007AFF] transition">
                                            <Share2 className="w-4 h-4" />
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
                </div>

                {/* Participants panel */}
                {active && (
                    <div className="glass p-4 flex-1 min-h-0 flex flex-col">
                        <p className="text-xs uppercase tracking-[0.25em] font-bold text-zinc-300 flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4" /> Participants ({registrations.length})
                        </p>
                        <div className="space-y-2 overflow-y-auto pr-1 flex-1" data-testid="participants-list">
                            {registrations.length === 0 && (
                                <p className="text-xs text-zinc-500 italic">No participants yet. Share code <span className="text-[#007AFF]">{active.code}</span></p>
                            )}
                            {registrations.map((r) => (
                                <div key={r.id} data-testid={`participant-row-${r.id}`}
                                     className={`p-3 border ${r.help_status === "sos" ? "border-[#FF3B30] bg-[#FF3B30]/10" : r.help_status === "help" ? "border-[#FFCC00] bg-[#FFCC00]/10" : "border-white/10"}`}>
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={r.profile_picture_path ? fileUrl(r.profile_picture_path) : "https://images.unsplash.com/photo-1702482527875-e16d07f0d91b?crop=entropy&cs=srgb&fm=jpg&w=80&q=60"}
                                            alt=""
                                            className="w-10 h-10 rounded-full object-cover border border-white/20"
                                            onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1702482527875-e16d07f0d91b?crop=entropy&cs=srgb&fm=jpg&w=80&q=60"; }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate">T{r.team_number} · {r.team_name}</p>
                                            <p className="text-[11px] text-zinc-400 truncate">{r.first_name} {r.last_name}</p>
                                        </div>
                                        {(r.help_status === "help" || r.help_status === "sos") && (
                                            <button onClick={() => clearStatus(r.id)}
                                                    data-testid={`clear-status-${r.id}`}
                                                    className="text-[10px] uppercase tracking-wider px-2 py-1 border border-white/20 hover:bg-white/10">
                                                Clear
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
                            ))}
                        </div>
                    </div>
                )}
            </aside>

            {/* Distress badge */}
            {registrations.some((r) => r.help_status === "sos") && (
                <div className="absolute top-[88px] right-4 z-[1100] glass border-l-4 border-[#FF3B30] px-4 py-3 flex items-center gap-3"
                     data-testid="active-sos-banner">
                    <ShieldAlert className="w-5 h-5 text-[#FF3B30]" />
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#FF3B30]">SOS Active</p>
                        <p className="text-[11px] text-zinc-300">Check team status</p>
                    </div>
                </div>
            )}

            {!active && events.length === 0 && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[1100] glass p-6 max-w-sm" data-testid="empty-state">
                    <MapIcon className="w-8 h-8 text-[#007AFF] mb-2" />
                    <p className="font-display text-2xl font-black uppercase">Empty Map</p>
                    <p className="text-xs text-zinc-400 mt-2">Create an event to start tracking your convoy.</p>
                </div>
            )}

            <Dialog open={!!shareEvent} onOpenChange={(o) => !o && setShareEvent(null)}>
                <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white max-w-md" data-testid="share-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight">Share Event</DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            Teams scan the code or open the link to join.
                        </DialogDescription>
                    </DialogHeader>
                    {shareEvent && (
                        <div className="space-y-5">
                            <div className="text-center">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-1">Event Code</p>
                                <p className="font-display text-5xl font-black tracking-[0.3em] text-[#007AFF]" data-testid="share-event-code">
                                    {shareEvent.code}
                                </p>
                            </div>
                            <div className="flex justify-center bg-white p-4">
                                <QRCodeCanvas
                                    value={shareUrl}
                                    size={220}
                                    level="M"
                                    includeMargin={false}
                                    data-qr="share"
                                />
                            </div>
                            <div className="flex items-center gap-2 border border-white/15 px-3 py-2">
                                <code className="text-xs text-zinc-300 truncate flex-1" data-testid="share-url">{shareUrl}</code>
                                <button onClick={copyShareUrl} data-testid="copy-share-url"
                                        className="text-zinc-400 hover:text-white p-1">
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Button onClick={copyShareUrl} variant="ghost" data-testid="copy-link-button"
                                        className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-xs tracking-[0.2em] h-11">
                                    <Copy className="w-3 h-3 mr-2" /> Copy Link
                                </Button>
                                <Button onClick={printPoster} data-testid="print-poster-button"
                                        className="rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase text-xs tracking-[0.2em] h-11">
                                    <Printer className="w-3 h-3 mr-2" /> Print Poster
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

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
        </div>
    );
}
