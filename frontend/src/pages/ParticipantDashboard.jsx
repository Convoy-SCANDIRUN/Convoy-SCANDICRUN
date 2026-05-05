import { useEffect, useMemo, useState } from "react";
import api, { fileUrl, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Compass, LogOut, Plus, Users, AlertTriangle, AlertOctagon, MapPin, X } from "lucide-react";

function readPendingCode() {
    return sessionStorage.getItem("rt_pending_event_code") || "";
}

function JoinForm({ onJoined, onCancel, hasJoinedEvents = false, prefillCode = "" }) {
    const [code, setCode] = useState(prefillCode);
    const [event, setEvent] = useState(null);
    const [teamNumber, setTeamNumber] = useState("");
    const [teamName, setTeamName] = useState("");
    const [first, setFirst] = useState("");
    const [last, setLast] = useState("");
    const [pic, setPic] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Auto-lookup if a code was prefilled (e.g., via /join/:code)
    useEffect(() => {
        if (prefillCode && !event) {
            (async () => {
                try {
                    const { data } = await api.get(`/events/by-code/${prefillCode.toUpperCase()}`);
                    setEvent(data);
                    sessionStorage.removeItem("rt_pending_event_code");
                } catch (_) {
                    /* fall through to manual entry */
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillCode]);

    const lookup = async () => {
        if (!code) return;
        try {
            const { data } = await api.get(`/events/by-code/${code.toUpperCase()}`);
            setEvent(data);
            toast.success(`Found event: ${data.name}`);
        } catch (err) {
            setEvent(null);
            toast.error(formatApiError(err));
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append("team_number", teamNumber);
            fd.append("team_name", teamName);
            fd.append("first_name", first);
            fd.append("last_name", last);
            if (pic) fd.append("profile_picture", pic);
            await api.post(`/events/by-code/${code.toUpperCase()}/register`, fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success("Registered — locking onto map");
            onJoined();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 tactical-grid">
            <div className="w-full max-w-lg glass p-8 relative" data-testid="join-form-card">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="join-close-button"
                        aria-label="Close"
                        className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
                <div className="flex items-center gap-3 mb-6">
                    <Compass className="w-7 h-7 text-[#007AFF]" />
                    <div>
                        <p className="font-display text-3xl font-black uppercase leading-none">Join Event</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">Enter your event code</p>
                    </div>
                </div>

                {!event ? (
                    <div className="space-y-4">
                        <div>
                            <Label className="text-xs uppercase tracking-[0.2em]">Event code</Label>
                            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                                   placeholder="6-CHAR CODE" data-testid="event-code-input"
                                   className="bg-transparent border-white/20 rounded-none h-12 font-mono tracking-[0.4em] text-center text-lg" />
                        </div>
                        <Button onClick={lookup} data-testid="lookup-event-button"
                                className="w-full rounded-none h-12 bg-[#007AFF] hover:bg-[#005bb5] uppercase tracking-[0.2em] font-bold">
                            Find Event
                        </Button>
                        {onCancel && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={onCancel}
                                data-testid="join-cancel-button"
                                className="w-full rounded-none h-12 border border-white/15 hover:bg-white/5 uppercase tracking-[0.2em] text-xs"
                            >
                                {hasJoinedEvents ? "Cancel" : "Sign out"}
                            </Button>
                        )}
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4" data-testid="register-event-form">
                        <div className="p-3 border border-[#007AFF]/40 bg-[#007AFF]/5">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Event</p>
                            <p className="font-display text-xl font-bold uppercase">{event.name}</p>
                            <p className="text-[11px] text-zinc-500">{event.start_date} → {event.end_date}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs uppercase tracking-[0.2em]">Team #</Label>
                                <Input value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} required
                                       data-testid="team-number-input"
                                       className="bg-transparent border-white/20 rounded-none h-11" />
                            </div>
                            <div>
                                <Label className="text-xs uppercase tracking-[0.2em]">Team name</Label>
                                <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} required
                                       data-testid="team-name-input"
                                       className="bg-transparent border-white/20 rounded-none h-11" />
                            </div>
                            <div>
                                <Label className="text-xs uppercase tracking-[0.2em]">First name</Label>
                                <Input value={first} onChange={(e) => setFirst(e.target.value)} required
                                       data-testid="first-name-input"
                                       className="bg-transparent border-white/20 rounded-none h-11" />
                            </div>
                            <div>
                                <Label className="text-xs uppercase tracking-[0.2em]">Last name</Label>
                                <Input value={last} onChange={(e) => setLast(e.target.value)} required
                                       data-testid="last-name-input"
                                       className="bg-transparent border-white/20 rounded-none h-11" />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-[0.2em]">Profile picture</Label>
                            <Input type="file" accept="image/*" onChange={(e) => setPic(e.target.files?.[0] || null)}
                                   data-testid="profile-picture-input"
                                   className="bg-transparent border-white/20 rounded-none h-11 file:bg-white/10 file:text-white file:border-0 file:px-3 file:mr-3" />
                        </div>
                        <div className="flex gap-3">
                            <Button type="button" variant="ghost" onClick={() => setEvent(null)}
                                    className="rounded-none border border-white/15 uppercase text-xs tracking-[0.2em] h-12">
                                Back
                            </Button>
                            <Button type="submit" disabled={submitting} data-testid="register-event-submit"
                                    className="flex-1 rounded-none h-12 bg-[#007AFF] hover:bg-[#005bb5] uppercase tracking-[0.2em] font-bold">
                                <Plus className="w-4 h-4 mr-2" /> {submitting ? "Joining…" : "Join Convoy"}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default function ParticipantDashboard() {
    const { user, logout } = useAuth();
    const [events, setEvents] = useState([]);
    const [activeEvent, setActiveEvent] = useState(null);
    const [myReg, setMyReg] = useState(null);
    const [registrations, setRegistrations] = useState([]);
    const [showJoin, setShowJoin] = useState(false);

    const loadEvents = async () => {
        const { data } = await api.get("/events");
        setEvents(data);
        if (data.length && !activeEvent) setActiveEvent(data[0]);
    };

    const loadMyReg = async () => {
        if (!activeEvent) return;
        try {
            const { data } = await api.get(`/events/${activeEvent.id}/my-registration`);
            setMyReg(data);
        } catch {
            setMyReg(null);
        }
    };

    const loadRegs = async () => {
        if (!activeEvent) return;
        const { data } = await api.get(`/events/${activeEvent.id}/registrations`);
        setRegistrations(data);
    };

    useEffect(() => { loadEvents(); }, []);
    useEffect(() => { loadMyReg(); loadRegs(); }, [activeEvent]);
    useEffect(() => {
        if (!activeEvent) return;
        const t = setInterval(() => { loadRegs(); loadMyReg(); }, 5000);
        return () => clearInterval(t);
    }, [activeEvent]);

    // Toast notifications when others go SOS/HELP
    const [prevStatuses, setPrevStatuses] = useState({});
    useEffect(() => {
        registrations.forEach((r) => {
            if (myReg && r.id === myReg.id) return;
            const prev = prevStatuses[r.id];
            if (prev !== undefined && prev !== r.help_status && (r.help_status === "help" || r.help_status === "sos")) {
                const label = `Team ${r.team_number} · ${r.team_name}`;
                if (r.help_status === "sos") toast.error(`SOS — ${label}`, { duration: 8000 });
                else toast.warning(`Help requested — ${label}`, { duration: 6000 });
            }
        });
        setPrevStatuses(Object.fromEntries(registrations.map((r) => [r.id, r.help_status])));
    }, [registrations, myReg]);

    // Geolocation streaming
    useEffect(() => {
        if (!myReg || !navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                try {
                    await api.post(`/registrations/${myReg.id}/location`, {
                        lat: pos.coords.latitude, lng: pos.coords.longitude,
                    });
                } catch (_) {}
            },
            (err) => console.warn("Geo error", err),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [myReg?.id]);

    const setStatus = async (status) => {
        if (!myReg) return;
        try {
            await api.post(`/registrations/${myReg.id}/help`, { status });
            const label = status === "sos" ? "SOS broadcast" : status === "help" ? "Help requested" : "Status cleared";
            toast.success(label);
            loadMyReg();
        } catch (err) { toast.error(formatApiError(err)); }
    };

    if (showJoin || (events.length === 0)) {
        const hasJoined = events.length > 0;
        return (
            <JoinForm
                onJoined={() => { setShowJoin(false); loadEvents(); }}
                onCancel={() => { hasJoined ? setShowJoin(false) : logout(); }}
                hasJoinedEvents={hasJoined}
                prefillCode={readPendingCode()}
            />
        );
    }
    if (events.length && !myReg && activeEvent) {
        // user has events but not registered for current — should not normally hit this branch
        return (
            <JoinForm
                onJoined={() => { setShowJoin(false); loadEvents(); loadMyReg(); }}
                onCancel={() => setShowJoin(false)}
                hasJoinedEvents={true}
                prefillCode={readPendingCode()}
            />
        );
    }

    const placedCount = registrations.filter((r) => r.lat != null).length;

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#0A0A0A] text-white relative">
            {/* Topbar */}
            <header className="absolute top-0 left-0 right-0 z-[1100] flex items-center justify-between px-4 sm:px-6 py-3 glass border-b border-white/10">
                <div className="flex items-center gap-3 min-w-0">
                    <Compass className="w-6 h-6 text-[#007AFF] flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="font-display text-base sm:text-xl font-black uppercase leading-none truncate">
                            {activeEvent?.name || "Convoy"}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400 mt-1 truncate">
                            {myReg ? `T${myReg.team_number} · ${myReg.team_name}` : user?.name}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => setShowJoin(true)} data-testid="join-other-event-button"
                            className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-9">
                        <Plus className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Join</span>
                    </Button>
                    <Button variant="ghost" onClick={logout} data-testid="logout-button"
                            className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-9">
                        <LogOut className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Logout</span>
                    </Button>
                </div>
            </header>

            {/* Map */}
            <div className="absolute inset-0 pt-[64px] pb-[140px]">
                <MapView registrations={registrations} />
            </div>

            {/* Stats badge */}
            <div className="absolute top-[80px] left-4 z-[1100] glass px-3 py-2 flex items-center gap-2" data-testid="stats-badge">
                <Users className="w-4 h-4 text-[#007AFF]" />
                <span className="text-xs font-bold">{placedCount}/{registrations.length}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">live</span>
            </div>

            {/* Help / SOS floating buttons */}
            {myReg && (
                <div className="absolute bottom-4 left-4 right-4 z-[1100] flex flex-col items-center gap-3" data-testid="help-controls">
                    {myReg.help_status !== "normal" && (
                        <button
                            onClick={() => setStatus("clear")}
                            data-testid="clear-status-button"
                            className="w-full max-w-md text-xs uppercase tracking-[0.3em] py-2 border border-white/30 bg-black/60 backdrop-blur-xl hover:bg-white/10"
                        >
                            Cancel — I'm okay
                        </button>
                    )}
                    <div className="w-full max-w-md grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setStatus("help")}
                            data-testid="help-button"
                            className={`relative py-5 sm:py-7 font-black text-base sm:text-xl uppercase tracking-[0.15em] text-black transition-all
                                bg-[#FFCC00] hover:bg-[#E6B800] shadow-[0_0_24px_rgba(255,204,0,0.55)]
                                ${myReg.help_status === "help" ? "ring-4 ring-[#FFCC00] animate-pulse" : ""}`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> I Need Help
                            </span>
                        </button>
                        <button
                            onClick={() => setStatus("sos")}
                            data-testid="sos-button"
                            className={`relative py-5 sm:py-7 font-black text-base sm:text-xl uppercase tracking-[0.15em] text-white transition-all
                                bg-[#FF3B30] hover:bg-[#D32F2F] shadow-[0_0_30px_rgba(255,59,48,0.7)]
                                ${myReg.help_status === "sos" ? "ring-4 ring-[#FF3B30] animate-pulse" : ""}`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <AlertOctagon className="w-5 h-5" /> SOS
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* Status indicator */}
            {myReg?.help_status === "help" && (
                <div className="absolute top-[80px] right-4 z-[1100] glass border-l-4 border-[#FFCC00] px-4 py-2"
                     data-testid="my-help-banner">
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#FFCC00]">Help broadcasted</p>
                </div>
            )}
            {myReg?.help_status === "sos" && (
                <div className="absolute top-[80px] right-4 z-[1100] glass border-l-4 border-[#FF3B30] px-4 py-2 animate-pulse"
                     data-testid="my-sos-banner">
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#FF3B30]">SOS broadcasted</p>
                </div>
            )}
        </div>
    );
}
