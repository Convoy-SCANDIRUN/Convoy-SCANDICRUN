import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { fileUrl } from "@/lib/api";

const DEFAULT_CENTER = [48.8566, 2.3522]; // Paris fallback
const DEFAULT_ZOOM = 5;

function buildIcon(reg, opts = {}) {
    const { hideSos = false, isSelf = false } = opts;
    let status = reg.help_status || "normal";
    if (status === "sos" && hideSos) status = "normal"; // crew-only red glow
    const pic = reg.profile_picture_path
        ? fileUrl(reg.profile_picture_path)
        : "https://images.unsplash.com/photo-1702482527875-e16d07f0d91b?crop=entropy&cs=srgb&fm=jpg&w=80&q=60";
    const labelText = `T${reg.team_number} · ${reg.team_name}`;
    const showSelf = isSelf && status === "normal"; // help/sos visualisation wins over green self ring
    const label = isSelf ? `${labelText} · YOU` : labelText;
    const glow = status === "sos" ? '<div class="marker-glow-sos"></div>'
               : status === "help" ? '<div class="marker-glow-help"></div>'
               : "";
    const extraClass = showSelf ? " self" : "";
    const html = `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        ${glow}
        <img src="${pic}" class="marker-pic ${status}${extraClass}" onerror="this.src='https://images.unsplash.com/photo-1702482527875-e16d07f0d91b?crop=entropy&cs=srgb&fm=jpg&w=80&q=60'" />
        <div class="marker-label${showSelf ? ' self' : ''}">${label}</div>
      </div>`;
    return L.divIcon({
        html,
        className: "participant-marker",
        iconSize: [120, 80],
        iconAnchor: [60, 40],
    });
}

function FitBounds({ points }) {
    const map = useMap();
    useEffect(() => {
        if (!points.length) return;
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13 });
    }, [points, map]);
    return null;
}

export default function MapView({ registrations = [], height = "100%", hideSos = false, selfId = null }) {
    const placed = useMemo(
        () => registrations.filter((r) => r.lat != null && r.lng != null),
        [registrations]
    );

    return (
        <div style={{ height, width: "100%" }} data-testid="overview-map">
            <MapContainer
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
                <FitBounds points={placed} />
            </MapContainer>
        </div>
    );
}
