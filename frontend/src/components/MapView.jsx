import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { fileUrl } from "@/lib/api";

const DEFAULT_CENTER = [48.8566, 2.3522]; // Paris fallback
const DEFAULT_ZOOM = 5;

function buildIcon(reg) {
    const status = reg.help_status || "normal";
    const pic = reg.profile_picture_path
        ? fileUrl(reg.profile_picture_path)
        : "https://images.unsplash.com/photo-1702482527875-e16d07f0d91b?crop=entropy&cs=srgb&fm=jpg&w=80&q=60";
    const label = `T${reg.team_number} · ${reg.team_name}`;
    const glow = status === "sos" ? '<div class="marker-glow-sos"></div>'
               : status === "help" ? '<div class="marker-glow-help"></div>'
               : "";
    const html = `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        ${glow}
        <img src="${pic}" class="marker-pic ${status}" onerror="this.src='https://images.unsplash.com/photo-1702482527875-e16d07f0d91b?crop=entropy&cs=srgb&fm=jpg&w=80&q=60'" />
        <div class="marker-label">${label}</div>
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

export default function MapView({ registrations = [], height = "100%" }) {
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
                {placed.map((r) => (
                    <Marker
                        key={r.id}
                        position={[r.lat, r.lng]}
                        icon={buildIcon(r)}
                        data-testid={`participant-marker-${r.help_status}`}
                    />
                ))}
                <FitBounds points={placed} />
            </MapContainer>
        </div>
    );
}
