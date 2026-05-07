import { useEffect, useMemo, useState, useRef } from "react";
import api, { fileUrl, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
    Compass, LogOut, Plus, Users, AlertTriangle, AlertOctagon, X, Phone,
    Calendar, ListChecks, ShieldCheck, Crosshair, Trash2,
} from "lucide-react";

const LOCATION_INTERVAL_MS = 60_000;

function readPendingCode() {
    return sessionStorage.getItem("rt_pending_event_code") || "";
}

// Trigger the browser geolocation prompt; returns true if granted.
async function requestGeoPermission() {
    if (!navigator.geolocation) return false;
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
    });
}

function GdprNotice() {
    return (
        <div className="text-[11px] text-zinc-300 leading-relaxed border border-white/15 p-3 bg-white/5"
             data-testid="gdpr-notice">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#007AFF] font-bold mb-2">
                Data protection notice
            </p>
            <p>
                In accordance with the EU General Data Protection Regulation (Regulation (EU) 2016/679,
                "GDPR"), the following personal data will be processed for the sole purpose of running
                this road-trip event:
            </p>
            <ul className="list-disc pl-4 mt-2 space-y-0.5 text-zinc-300">
                <li>your name, team number and team name;</li>
                <li>your profile picture (if uploaded);</li>
                <li>your live location coordinates (latitude/longitude) while you are using the app.</li>
            </ul>
            <p className="mt-2">
                Your location is shared with other participants and the event administrator only while
                the app is open. Data is deleted when you leave the event or your registration is removed.
                You may withdraw your consent at any time by leaving the event in your dashboard.
            </p>
        </div>
    );
}

function JoinForm({ onJoined, onCancel, hasJoinedEvents = false, prefillCode = "" }) {
    const [code, setCode] = useState(prefillCode);
    const [event, setEvent] = useState(null);
    const [teamNumber, setTeamNumber] = useState("");
    const [teamName, setTeamName] = useState("");
    const [first, setFirst] = useState("");
    const [last, setLast] = useState("");
    const [pic, setPic] = useState(null);
    const [gdpr, setGdpr] = useState(false);
    const [locConsent, setLocConsent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (prefillCode && !event) {
            (async () => {
                try {
                    const { data } = await api.get(`/events/by-code/${prefillCode.toUpperCase()}`);
                    setEvent(data);
                    sessionStorage.removeItem("rt_pending_event_code");
                } catch (_) { /* ignore */ }
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

    const requestLocation = async () => {
        const ok = await requestGeoPermission();
        setLocConsent(ok);
        if (ok) toast.success("Location access granted");
        else toast.error("Location access denied — required to join");
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!gdpr) return toast.error("Please confirm the data-protection notice");
        if (!locConsent) return toast.error("Location permission is required");
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
                    <button type="button" onClick={onCancel} data-testid="join-close-button" aria-label="Close"
                            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition">
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
                            <Button type="button" variant="ghost" onClick={onCancel} data-testid="join-cancel-button"
                                    className="w-full rounded-none h-12 border border-white/15 hover:bg-white/5 uppercase tracking-[0.2em] text-xs">
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

                        <GdprNotice />

                        <label className="flex items-start gap-3 cursor-pointer p-3 border border-white/15 hover:bg-white/5"
                               data-testid="gdpr-consent-row">
                            <Checkbox
                                checked={gdpr}
                                onCheckedChange={(v) => setGdpr(!!v)}
                                data-testid="gdpr-consent-checkbox"
                                className="mt-0.5 border-white/40 data-[state=checked]:bg-[#007AFF] data-[state=checked]:border-[#007AFF]"
                            />
                            <span className="text-[11px] text-zinc-300 leading-relaxed">
                                I have read the data-protection notice above and consent to the processing
                                of the listed personal data and my live location for this event, in
                                accordance with GDPR (Regulation (EU) 2016/679).
                            </span>
                        </label>

                        <div className="p-3 border border-white/15 bg-white/5 space-y-2"
                             data-testid="location-consent-row">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className={`w-4 h-4 ${locConsent ? "text-[#34C759]" : "text-zinc-400"}`} />
                                <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-zinc-200">
                                    {locConsent ? "Location access granted" : "Location permission required"}
                                </p>
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                                The app will request continuous access to your device location. Please choose
                                "Allow always / While using the app" in your browser prompt. Tracking only
                                happens while the app is open.
                            </p>
                            {!locConsent && (
                                <Button type="button" onClick={requestLocation} data-testid="request-location-button"
                                        className="w-full rounded-none h-10 bg-white/10 hover:bg-white/20 uppercase tracking-[0.2em] text-[10px]">
                                    Grant location access
                                </Button>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <Button type="button" variant="ghost" onClick={() => setEvent(null)}
                                    className="rounded-none border border-white/15 uppercase text-xs tracking-[0.2em] h-12">
                                Back
                            </Button>
                            <Button type="submit" disabled={submitting || !gdpr || !locConsent}
                                    data-testid="register-event-submit"
                                    className="flex-1 rounded-none h-12 bg-[#007AFF] hover:bg-[#005bb5] uppercase tracking-[0.2em] font-bold disabled:opacity-50">
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
    const { user, logout, deleteAccount } = useAuth();
    const [events, setEvents] = useState([]);
    const [activeEvent, setActiveEvent] = useState(null);
    const [myReg, setMyReg] = useState(null);
    const [registrations, setRegistrations] = useState([]);
    const [showJoin, setShowJoin] = useState(false);
    const [showEventsPanel, setShowEventsPanel] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [helpText, setHelpText] = useState("");
    const [helpAck, setHelpAck] = useState(false);
    const [sosOpen, setSosOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);

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

    // Toast notifications when *other* teams go HELP. SOS is a phone-call workflow
    // that flags status server-side for the crew (admins) only — participants
    // never see SOS toasts or red glow markers.
    const prevStatuses = useRef({});
    useEffect(() => {
        registrations.forEach((r) => {
            if (myReg && r.id === myReg.id) return;
            const prev = prevStatuses.current[r.id];
            if (prev !== undefined && prev !== r.help_status && r.help_status === "help") {
                const label = `Team ${r.team_number} · ${r.team_name}`;
                const message = r.help_message ? `: ${r.help_message}` : "";
                toast.warning(`Help — ${label}${message}`, { duration: 9000 });
            }
        });
        prevStatuses.current = Object.fromEntries(registrations.map((r) => [r.id, r.help_status]));
    }, [registrations, myReg]);

    // Active help requests (visible to all participants)
    const activeHelp = useMemo(
        () => registrations.filter((r) => r.help_status === "help" && (!myReg || r.id !== myReg.id)),
        [registrations, myReg]
    );

    const [geoState, setGeoState] = useState({ status: "idle", error: null, lastAt: null });
    const [permState, setPermState] = useState("unknown"); // 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown'

    // Watch the browser geolocation permission state directly so we don't show
    // a "permission denied" message when the user has actually granted access.
    useEffect(() => {
        if (!navigator.permissions || !navigator.permissions.query) {
            setPermState("unsupported");
            return;
        }
        let perm;
        navigator.permissions.query({ name: "geolocation" }).then((res) => {
            perm = res;
            setPermState(res.state);
            res.onchange = () => setPermState(res.state);
        }).catch(() => setPermState("unsupported"));
        return () => { if (perm) perm.onchange = null; };
    }, []);

    const pushLocation = async (silent = true) => {
        if (!myReg) {
            if (!silent) toast.error("Not registered to an event");
            return;
        }
        if (!navigator.geolocation) {
            setGeoState({ status: "error", error: "Geolocation unsupported", lastAt: null });
            if (!silent) toast.error("Your browser does not support geolocation");
            return;
        }
        setGeoState((s) => ({ ...s, status: "fetching" }));
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    await api.post(`/registrations/${myReg.id}/location`, {
                        lat: pos.coords.latitude, lng: pos.coords.longitude,
                    });
                    setGeoState({ status: "ok", error: null, lastAt: Date.now() });
                    if (!silent) toast.success("Location updated");
                    loadRegs();
                    loadMyReg();
                } catch (e) {
                    setGeoState((s) => ({ ...s, status: "error", error: "Could not save location" }));
                }
            },
            (err) => {
                // Trust the Permissions API over the error code: some browsers report
                // code 1 even when permission is granted but the GPS chip is busy.
                let msg;
                if (err.code === 1 && permState !== "granted") {
                    msg = "Location permission denied — enable it in your browser settings";
                } else if (err.code === 3) {
                    msg = "Still trying to get a fix — tap to retry";
                } else if (err.code === 2) {
                    msg = "Location unavailable — move outdoors or near a window";
                } else {
                    msg = "Location not available right now — tap to retry";
                }
                setGeoState({ status: "error", error: msg, lastAt: null });
                if (!silent) toast.error(msg);
            },
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
        );
    };

    // Geolocation polling — first push immediately, then every 60 seconds
    useEffect(() => {
        if (!myReg) return;
        pushLocation(true);
        const t = setInterval(() => pushLocation(true), LOCATION_INTERVAL_MS);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myReg?.id]);

    const submitHelp = async () => {
        if (!myReg) return;
        if (!helpText.trim()) return toast.error("Please describe what happened");
        if (!helpAck) return toast.error("Please confirm the misuse acknowledgement");
        try {
            await api.post(`/registrations/${myReg.id}/help`, { status: "help", message: helpText.trim() });
            toast.success("Help request broadcast");
            setHelpOpen(false);
            setHelpText("");
            setHelpAck(false);
            loadMyReg();
        } catch (err) { toast.error(formatApiError(err)); }
    };

    const clearStatus = async () => {
        if (!myReg) return;
        try {
            await api.post(`/registrations/${myReg.id}/help`, { status: "clear" });
            toast.success("Status cleared");
            loadMyReg();
        } catch (err) { toast.error(formatApiError(err)); }
    };

    const callEmergency = async () => {
        const phone = activeEvent?.emergency_phone;
        if (!phone) return toast.error("No emergency number configured for this event");
        // Silently flag SOS status so the crew (admins) see a red glow on the map
        if (myReg) {
            try { await api.post(`/registrations/${myReg.id}/help`, { status: "sos" }); }
            catch (_) {}
        }
        window.location.href = `tel:${phone.replace(/\s+/g, "")}`;
    };

    const leaveEvent = (eventToLeave) => {
        setConfirmAction({
            title: "Leave this event?",
            description: `You will be removed from "${eventToLeave.name}" and your location will no longer be shared.`,
            confirmLabel: "Leave event",
            destructive: true,
            run: async () => {
                try {
                    const { data: reg } = await api.get(`/events/${eventToLeave.id}/my-registration`);
                    await api.delete(`/registrations/${reg.id}`);
                    toast.success("You left the event");
                    if (activeEvent?.id === eventToLeave.id) {
                        setActiveEvent(null);
                        setMyReg(null);
                        setRegistrations([]);
                    }
                    loadEvents();
                } catch (err) { toast.error(formatApiError(err)); }
            },
        });
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
                    <Button variant="ghost" onClick={() => setShowEventsPanel(true)} data-testid="my-events-button"
                            className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-9">
                        <ListChecks className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">My Events</span>
                    </Button>
                    <Button variant="ghost" onClick={() => setShowJoin(true)} data-testid="join-other-event-button"
                            className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-9">
                        <Plus className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Join</span>
                    </Button>
                    <Button variant="ghost" onClick={logout} data-testid="logout-button"
                            className="rounded-none border border-white/15 hover:bg-white/5 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-9">
                        <LogOut className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Logout</span>
                    </Button>
                    <Button variant="ghost"
                            onClick={() => setConfirmAction({
                                title: "Delete your account?",
                                description: "Your account, all event registrations and location data will be permanently removed. This cannot be undone.",
                                confirmLabel: "Delete account",
                                destructive: true,
                                run: async () => {
                                    try { await deleteAccount(); toast.success("Account deleted"); }
                                    catch (err) { toast.error(formatApiError(err)); }
                                },
                            })}
                            data-testid="delete-account-button"
                            className="rounded-none border border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/10 uppercase text-[10px] sm:text-xs tracking-[0.2em] h-9">
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            </header>

            {/* Map */}
            <div className="absolute inset-0 pt-[64px] pb-[160px]">
                <MapView registrations={registrations} hideSos={true} selfId={myReg?.id} />
            </div>

            {/* Live count + geolocation status — bottom-left */}
            <div className="absolute bottom-[160px] left-4 z-[1102] flex flex-col gap-2" data-testid="bottom-left-stack">
                <div className="glass px-3 py-2 flex items-center gap-2" data-testid="stats-badge">
                    <Users className="w-4 h-4 text-[#007AFF]" />
                    <span className="text-xs font-bold">{placedCount}/{registrations.length}</span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">live</span>
                </div>
                <button
                    type="button"
                    onClick={() => pushLocation(false)}
                    data-testid="update-location-button"
                    className={`glass px-3 py-2 flex items-center gap-2 hover:bg-white/10 transition text-left ${
                        geoState.status === "error" ? "border-l-2 border-[#FF3B30]" :
                        geoState.status === "ok" ? "border-l-2 border-[#34C759]" :
                        "border-l-2 border-[#007AFF]"
                    }`}
                >
                    <Crosshair className={`w-4 h-4 ${geoState.status === "fetching" ? "animate-spin" : ""}`} />
                    <div className="text-[10px] leading-tight">
                        <div className="uppercase tracking-wider font-bold">
                            {geoState.status === "fetching" ? "Locating…" :
                             geoState.status === "ok" ? "Location live" :
                             geoState.status === "error" ? "No location" :
                             "Update location"}
                        </div>
                        {geoState.status === "ok" && geoState.lastAt && (
                            <div className="text-zinc-400">
                                {Math.max(1, Math.round((Date.now() - geoState.lastAt) / 1000))}s ago
                            </div>
                        )}
                        {geoState.status === "error" && (
                            <div className="text-[#FF3B30] max-w-[180px] truncate" title={geoState.error}>
                                Tap to retry
                            </div>
                        )}
                    </div>
                </button>
            </div>

            {/* Help / SOS floating buttons */}
            {myReg && (
                <div className="absolute bottom-4 left-4 right-4 z-[1100] flex flex-col items-center gap-3" data-testid="help-controls">
                    {myReg.help_status === "help" && (
                        <button onClick={clearStatus} data-testid="clear-status-button"
                                className="w-full max-w-md text-xs uppercase tracking-[0.3em] py-2 border border-white/30 bg-black/60 backdrop-blur-xl hover:bg-white/10">
                            Cancel — I'm okay
                        </button>
                    )}
                    <div className="w-full max-w-md grid grid-cols-2 gap-3">
                        <button onClick={() => setHelpOpen(true)} data-testid="help-button"
                                className={`relative py-5 sm:py-7 font-black text-base sm:text-xl uppercase tracking-[0.15em] text-black transition-all
                                    bg-[#FFCC00] hover:bg-[#E6B800] shadow-[0_0_24px_rgba(255,204,0,0.55)]
                                    ${myReg.help_status === "help" ? "ring-4 ring-[#FFCC00] animate-pulse" : ""}`}>
                            <span className="flex items-center justify-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> I Need Help
                            </span>
                        </button>
                        <button onClick={() => setSosOpen(true)} data-testid="sos-button"
                                className="relative py-5 sm:py-7 font-black text-base sm:text-xl uppercase tracking-[0.15em] text-white transition-all
                                    bg-[#FF3B30] hover:bg-[#D32F2F] shadow-[0_0_30px_rgba(255,59,48,0.7)]">
                            <span className="flex items-center justify-center gap-2">
                                <AlertOctagon className="w-5 h-5" /> SOS
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* Active help-requests panel — visible to all participants */}
            {activeHelp.length > 0 && (
                <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-[1102] glass border-l-4 border-[#FFCC00] px-4 py-3 max-w-[90vw] sm:max-w-md"
                     data-testid="active-help-panel">
                    <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#FFCC00] mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" /> Active help requests ({activeHelp.length})
                    </p>
                    <ul className="space-y-2 max-h-32 overflow-y-auto">
                        {activeHelp.map((r) => (
                            <li key={r.id} className="text-xs" data-testid={`active-help-item-${r.id}`}>
                                <span className="font-bold">T{r.team_number} · {r.team_name}</span>
                                {r.help_message && (
                                    <span className="text-zinc-300 italic"> — {r.help_message}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* My-help banner */}
            {myReg?.help_status === "help" && (
                <div className="absolute top-[80px] right-4 z-[1100] glass border-l-4 border-[#FFCC00] px-4 py-2"
                     data-testid="my-help-banner">
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#FFCC00]">Help broadcasted</p>
                    {myReg.help_message && (
                        <p className="text-[11px] text-zinc-300 mt-1 max-w-[260px] italic">“{myReg.help_message}”</p>
                    )}
                </div>
            )}

            {/* HELP dialog with text + misuse warning */}
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
                <DialogContent className="bg-[#0A0A0A] border border-[#FFCC00]/40 rounded-none text-white max-w-md"
                               data-testid="help-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight text-[#FFCC00]">
                            Request Help
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            Tell other teams what happened
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-xs uppercase tracking-[0.2em]">What happened?</Label>
                            <Textarea
                                value={helpText}
                                onChange={(e) => setHelpText(e.target.value)}
                                rows={4}
                                placeholder="Flat tire, lost the route, need fuel…"
                                data-testid="help-message-input"
                                className="bg-transparent border-white/20 rounded-none mt-1 focus-visible:ring-[#FFCC00]"
                            />
                        </div>
                        <div className="border border-[#FFCC00]/40 bg-[#FFCC00]/5 p-3 text-[11px] text-[#FFCC00]"
                             data-testid="help-misuse-warning">
                            ⚠ Misuse of this feature (false alerts, jokes, irrelevant calls) may lead to
                            immediate exclusion from the event.
                        </div>
                        <label className="flex items-start gap-3 cursor-pointer">
                            <Checkbox
                                checked={helpAck}
                                onCheckedChange={(v) => setHelpAck(!!v)}
                                data-testid="help-ack-checkbox"
                                className="mt-0.5 border-white/40 data-[state=checked]:bg-[#FFCC00] data-[state=checked]:border-[#FFCC00] data-[state=checked]:text-black"
                            />
                            <span className="text-[11px] text-zinc-300 leading-relaxed">
                                I confirm this is a real situation that requires assistance and I understand
                                that misuse may lead to exclusion from the event.
                            </span>
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setHelpOpen(false)} data-testid="help-cancel-button"
                                className="rounded-none border border-white/15 uppercase text-xs tracking-[0.2em]">
                            Cancel
                        </Button>
                        <Button onClick={submitHelp} data-testid="help-confirm-button"
                                disabled={!helpText.trim() || !helpAck}
                                className="rounded-none bg-[#FFCC00] hover:bg-[#E6B800] text-black uppercase text-xs tracking-[0.2em] disabled:opacity-50">
                            Send help request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* SOS dialog — emergency call */}
            <Dialog open={sosOpen} onOpenChange={setSosOpen}>
                <DialogContent className="bg-[#0A0A0A] border border-[#FF3B30]/50 rounded-none text-white max-w-md"
                               data-testid="sos-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-3xl uppercase tracking-tight text-[#FF3B30]">
                            Emergency Call
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            Event hotline
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {activeEvent?.emergency_phone ? (
                            <a href={`tel:${activeEvent.emergency_phone.replace(/\s+/g, "")}`}
                               data-testid="sos-phone-link"
                               className="block border border-[#FF3B30] bg-[#FF3B30]/10 p-4 text-center hover:bg-[#FF3B30]/20 transition">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400 mb-1">Tap to call</p>
                                <p className="font-display text-3xl font-black tracking-tight text-white break-all">
                                    {activeEvent.emergency_phone}
                                </p>
                            </a>
                        ) : (
                            <div className="border border-white/20 p-4 text-sm text-zinc-300" data-testid="sos-no-phone">
                                No emergency number is configured for this event. Please contact the event
                                organiser directly or call your local emergency services.
                            </div>
                        )}
                        <div className="border border-[#FF3B30]/40 bg-[#FF3B30]/5 p-3 text-[11px] text-[#FF3B30]"
                             data-testid="sos-cost-warning">
                            ℹ Calling this number may incur charges according to your mobile-phone tariff.
                            International calls may be especially expensive.
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSosOpen(false)} data-testid="sos-cancel-button"
                                className="rounded-none border border-white/15 uppercase text-xs tracking-[0.2em]">
                            Cancel
                        </Button>
                        {activeEvent?.emergency_phone && (
                            <Button onClick={() => { callEmergency(); setSosOpen(false); }}
                                    data-testid="sos-call-button"
                                    className="rounded-none bg-[#FF3B30] hover:bg-[#D32F2F] text-white uppercase text-xs tracking-[0.2em]">
                                <Phone className="w-3 h-3 mr-2" /> Call now
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* My Events panel */}
            <Dialog open={showEventsPanel} onOpenChange={setShowEventsPanel}>
                <DialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white max-w-lg"
                               data-testid="my-events-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl uppercase tracking-tight">My Events</DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                            Events you are registered to
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1" data-testid="my-events-list">
                        {events.length === 0 && (
                            <p className="text-xs text-zinc-500 italic">You're not registered to any event yet.</p>
                        )}
                        {events.map((e) => (
                            <div key={e.id}
                                 className={`border p-3 ${activeEvent?.id === e.id ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/15"}`}
                                 data-testid={`my-event-row-${e.id}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-display text-lg font-bold uppercase truncate">{e.name}</p>
                                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 flex items-center gap-1 mt-1">
                                            <Calendar className="w-3 h-3" /> {e.start_date} → {e.end_date}
                                        </p>
                                        {e.emergency_phone && (
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-400 flex items-center gap-1 mt-0.5">
                                                <Phone className="w-3 h-3" /> {e.emergency_phone}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2 flex-shrink-0">
                                        {activeEvent?.id !== e.id && (
                                            <Button onClick={() => { setActiveEvent(e); setShowEventsPanel(false); }}
                                                    data-testid={`switch-event-${e.id}`}
                                                    className="h-8 rounded-none bg-[#007AFF] hover:bg-[#005bb5] uppercase text-[10px] tracking-[0.2em]">
                                                Switch
                                            </Button>
                                        )}
                                        <Button onClick={() => leaveEvent(e)} variant="ghost"
                                                data-testid={`leave-event-${e.id}`}
                                                className="h-8 rounded-none border border-[#FF3B30]/50 text-[#FF3B30] hover:bg-[#FF3B30]/10 uppercase text-[10px] tracking-[0.2em]">
                                            Leave
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Confirm-action AlertDialog */}
            <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
                <AlertDialogContent className="bg-[#0A0A0A] border border-white/15 rounded-none text-white"
                                    data-testid="confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-display text-2xl uppercase tracking-tight">
                            {confirmAction?.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-300 text-sm">
                            {confirmAction?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel data-testid="confirm-cancel"
                                           className="rounded-none border border-white/15 bg-transparent hover:bg-white/5 uppercase text-xs tracking-[0.2em] text-white">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction data-testid="confirm-accept"
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
