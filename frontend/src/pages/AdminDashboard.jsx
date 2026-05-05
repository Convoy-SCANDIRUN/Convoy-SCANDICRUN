import { useEffect, useState, useMemo } from "react";
import api, { fileUrl, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, LogOut, Trash2, Map as MapIcon, Calendar, Users, Compass, ShieldAlert } from "lucide-react";

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
    const [image, setImage] = useState(null);
    const [creating, setCreating] = useState(false);

    const active = useMemo(() => events.find((e) => e.id === activeId), [events, activeId]);

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
            if (image) fd.append("image", image);
            await api.post("/events", fd, { headers: { "Content-Type": "multipart/form-data" } });
            toast.success("Event created");
            setName(""); setStart(""); setEnd(""); setImage(null);
            setOpen(false);
            loadEvents();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setCreating(false);
        }
    };

    const deleteEvent = async (id) => {
        if (!window.confirm("Delete this event and all its registrations?")) return;
        try {
            await api.delete(`/events/${id}`);
            toast.success("Event deleted");
            const remaining = events.filter((e) => e.id !== id);
            setEvents(remaining);
            setActiveId(remaining[0]?.id || null);
        } catch (err) { toast.error(formatApiError(err)); }
    };

    const deleteReg = async (id) => {
        if (!window.confirm("Remove this participant from the event?")) return;
        try {
            await api.delete(`/registrations/${id}`);
            toast.success("Participant removed");
            loadRegs();
        } catch (err) { toast.error(formatApiError(err)); }
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
                                    <button onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }}
                                            data-testid={`delete-event-${e.id}`}
                                            className="text-zinc-500 hover:text-[#FF3B30] transition">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
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
                                     className={`p-3 border flex items-center gap-3 ${r.help_status === "sos" ? "border-[#FF3B30] bg-[#FF3B30]/10" : r.help_status === "help" ? "border-[#FFCC00] bg-[#FFCC00]/10" : "border-white/10"}`}>
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
                                    <button onClick={() => deleteReg(r.id)}
                                            data-testid={`delete-reg-${r.id}`}
                                            className="text-zinc-500 hover:text-[#FF3B30]">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
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
        </div>
    );
}
