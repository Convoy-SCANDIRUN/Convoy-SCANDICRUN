import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { avatarUrl, fallbackAvatar } from "@/lib/avatar";
import { Crosshair, Locate, Plus, Minus } from "lucide-react";

const DEFAULT_CENTER = [48.8566, 2.3522]; // Paris fallback
const DEFAULT_ZOOM = 5;
const FOCUS_ZOOM = 14;

function buildIcon(reg, opts = {}) {
    const { hideSos = false, isSelf = false } = opts;
    let status = reg.help_status || "normal";
    if (status === "sos" && hideSos) status = "normal"; // crew-only red glow
    const pic = avatarUrl(reg);
    const fallback = fallbackAvatar(reg);
    const labelText = `T${reg.team_number} · ${reg.team_name}`;
    const showSelf = isSelf && status === "normal";
    const label = isSelf ? `${labelText} · YOU` : labelText;
    const glow = status === "sos" ? '<div class="marker-glow-sos"></div>'
               : status === "help" ? '<div class="marker-glow-help"></div>'
               : "";
    const extraClass = showSelf ? " self" : "";
    const html = `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        ${glow}
        <img src="${pic}" width="48" height="48" class="marker-pic ${status}${extraClass}" onerror="this.onerror=null;this.src='${fallback}'" />
        <div class="marker-label${showSelf ? ' self' : ''}">${label}</div>
      </div>`;
    return L.divIcon({
        html,
        className: "participant-marker",
        iconSize: [120, 80],
        iconAnchor: [60, 40],
    });
}

/** Centers the map on `selfPosition` once on first mount, refits / re-centres
 *  whenever `fitNonce` changes (the parent's "Reset view" button). */
function MapController({ selfPosition, allPoints, fitNonce, defaultMode = "self" }) {
    const map = useMap();
    const initialised = useRef(false);

    useEffect(() => {
        if (initialised.current) return;
        if (selfPosition) {
            map.setView(selfPosition, FOCUS_ZOOM, { animate: false });
            initialised.current = true;
        } else if (allPoints.length) {
            const bounds = L.latLngBounds(allPoints);
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [60, 60], maxZoom: FOCUS_ZOOM });
                initialised.current = true;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selfPosition, allPoints]);

    // Re-fit only when the user clicks "Reset view"
    useEffect(() => {
        if (fitNonce === 0) return; // initial render
        if (defaultMode === "self" && selfPosition) {
            map.setView(selfPosition, FOCUS_ZOOM, { animate: true });
        } else if (allPoints.length) {
            const bounds = L.latLngBounds(allPoints);
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: FOCUS_ZOOM });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitNonce]);

    return null;
}

export default function MapView({ registrations = [], height = "100%", hideSos = false, selfId = null }) {
    const placed = useMemo(
        () => registrations.filter((r) => r.lat != null && r.lng != null),
        [registrations]
    );
    const selfReg = useMemo(
        () => placed.find((r) => r.id === selfId),
        [placed, selfId]
    );
    const selfPosition = selfReg ? [selfReg.lat, selfReg.lng] : null;
    const allPoints = useMemo(() => placed.map((r) => [r.lat, r.lng]), [placed]);

    const [fitNonce, setFitNonce] = useState(0);
    const [resetMode, setResetMode] = useState("self"); // "self" | "all"
    const mapRef = useRef(null);

    const recenterOnSelf = () => { setResetMode("self"); setFitNonce((n) => n + 1); };
    const fitAll = () => { setResetMode("all"); setFitNonce((n) => n + 1); };
    const zoomIn = () => mapRef.current?.zoomIn();
    const zoomOut = () => mapRef.current?.zoomOut();

    return (
        <div style={{ height, width: "100%", position: "relative" }} data-testid="overview-map">
            <MapContainer
                center={selfPosition || DEFAULT_CENTER}
                zoom={selfPosition ? FOCUS_ZOOM : DEFAULT_ZOOM}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={true}
                zoomControl={false}
                dragging={true}
                doubleClickZoom={true}
                touchZoom={true}
                ref={mapRef}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
                <MapController
                    selfPosition={selfPosition}
                    allPoints={allPoints}
                    fitNonce={fitNonce}
                    defaultMode={resetMode}
                />
                {placed.map((r) => {
                    const isSelf = r.id === selfId;
                    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
                    const amapsUrl = `https://maps.apple.com/?daddr=${r.lat},${r.lng}`;
                    return (
                        <Marker
                            key={r.id}
                            position={[r.lat, r.lng]}
                            icon={buildIcon(r, { hideSos, isSelf })}
                            data-testid={`participant-marker-${r.help_status}`}
                        >
                            <Popup className="rt-popup" maxWidth={260}>
                                <div className="rt-popup-inner" data-testid={`marker-popup-${r.id}`}>
                                    <p className="rt-popup-title">T{r.team_number} · {r.team_name}</p>
                                    <p className="rt-popup-sub">{r.first_name} {r.last_name}{isSelf ? " (you)" : ""}</p>
                                    {r.help_status === "help" && r.help_message && (
                                        <p className="rt-popup-help">⚠ {r.help_message}</p>
                                    )}
                                    {!isSelf && (
                                        <div className="rt-popup-actions">
                                            <a href={gmapsUrl} target="_blank" rel="noreferrer"
                                               data-testid={`navigate-google-${r.id}`}
                                               className="rt-popup-btn rt-popup-btn-primary">
                                                Google Maps
                                            </a>
                                            <a href={amapsUrl} target="_blank" rel="noreferrer"
                                               data-testid={`navigate-apple-${r.id}`}
                                               className="rt-popup-btn">
                                                Apple Maps
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Map control overlay — Zoom in/out + Center on me + Fit all,
                stacked together on the right edge so all four buttons share the
                same vertical column. Positioned below the topbar event title. */}
            <div className="absolute right-3 top-14 z-[400] flex flex-col gap-1" data-testid="map-controls">
                <button
                    onClick={zoomIn}
                    type="button"
                    data-testid="map-zoom-in-button"
                    title="Zoom in"
                    className="glass border border-white/15 px-2 py-1.5 flex items-center justify-center hover:bg-white/10 transition text-white w-[60px]"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={zoomOut}
                    type="button"
                    data-testid="map-zoom-out-button"
                    title="Zoom out"
                    className="glass border border-white/15 px-2 py-1.5 flex items-center justify-center hover:bg-white/10 transition text-white w-[60px]"
                >
                    <Minus className="w-3.5 h-3.5" />
                </button>
                {selfPosition && (
                    <button
                        onClick={recenterOnSelf}
                        type="button"
                        data-testid="map-center-self-button"
                        title="Center on me"
                        className="glass border border-[#34C759]/40 px-2 py-1.5 flex items-center gap-1.5 hover:bg-white/10 transition text-white w-[60px]"
                    >
                        <Locate className="w-3.5 h-3.5 text-[#34C759]" />
                        <span className="text-[10px] uppercase tracking-wider font-bold">Me</span>
                    </button>
                )}
                <button
                    onClick={fitAll}
                    type="button"
                    data-testid="map-reset-button"
                    title="Reset view (fit all participants)"
                    className="glass border border-white/15 px-2 py-1.5 flex items-center gap-1.5 hover:bg-white/10 transition text-white w-[60px]"
                >
                    <Crosshair className="w-3.5 h-3.5 text-[#007AFF]" />
                    <span className="text-[10px] uppercase tracking-wider font-bold">All</span>
                </button>
            </div>
        </div>
    );
}
