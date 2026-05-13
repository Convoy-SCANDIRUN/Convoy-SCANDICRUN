import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ---------- helpers ---------- */
const FONT_SANS = "helvetica";
const C_PRIMARY = "#007AFF";
const C_TEXT = "#0A0A0A";
const C_MUTED = "#6B7280";

function fmtKm(v) {
    if (v == null || isNaN(v)) return "—";
    return `${Number(v).toFixed(2)} km`;
}
function fmtKmh(v) {
    if (v == null || isNaN(v)) return "—";
    return `${Number(v).toFixed(1)} km/h`;
}
function fmtMin(v) {
    if (v == null || isNaN(v)) return "—";
    const m = Math.max(0, Number(v));
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return h > 0 ? `${h} h ${r} min` : `${r} min`;
}
function fmtTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return "—"; }
}

/** Render a list of [lat, lng] points to a PNG data URL using a plain canvas.
 *  No external map service needed — keeps the report self-contained. */
function routePreviewPng(route, width = 720, height = 360) {
    if (!route || route.length < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    // light blueprint-style background to match the app palette
    ctx.fillStyle = "#F3F6FB";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#DCE3ED";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    // Project lat/lng to canvas with a small padding
    const lats = route.map((p) => p[0]);
    const lngs = route.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 30;
    const rangeLat = Math.max(1e-6, maxLat - minLat);
    const rangeLng = Math.max(1e-6, maxLng - minLng);
    const sx = (width - pad * 2) / rangeLng;
    const sy = (height - pad * 2) / rangeLat;
    const s = Math.min(sx, sy);
    const offX = (width - rangeLng * s) / 2;
    const offY = (height - rangeLat * s) / 2;
    const project = ([lat, lng]) => [
        offX + (lng - minLng) * s,
        height - (offY + (lat - minLat) * s),
    ];
    // Route polyline
    ctx.strokeStyle = C_PRIMARY;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    route.forEach((pt, i) => {
        const [x, y] = project(pt);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Start / end markers
    const [sx0, sy0] = project(route[0]);
    const [ex, ey] = project(route[route.length - 1]);
    ctx.fillStyle = "#34C759";
    ctx.beginPath(); ctx.arc(sx0, sy0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FF3B30";
    ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("S", sx0, sy0 + 4);
    ctx.fillText("E", ex, ey + 4);
    return canvas.toDataURL("image/png");
}

/* ---------- PDF header / footer ---------- */
function header(doc, title, subtitle) {
    doc.setFillColor(C_PRIMARY);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 18, "F");
    doc.setTextColor("#fff");
    doc.setFont(FONT_SANS, "bold");
    doc.setFontSize(14);
    doc.text(title, 14, 12);
    if (subtitle) {
        doc.setFont(FONT_SANS, "normal");
        doc.setFontSize(9);
        doc.text(subtitle, doc.internal.pageSize.getWidth() - 14, 12, { align: "right" });
    }
    doc.setTextColor(C_TEXT);
}
function footer(doc) {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFont(FONT_SANS, "normal");
        doc.setFontSize(8);
        doc.setTextColor(C_MUTED);
        doc.text(
            `Convoy report · generated ${new Date().toLocaleString()}`,
            14, doc.internal.pageSize.getHeight() - 8
        );
        doc.text(
            `Page ${i} of ${total}`,
            doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8,
            { align: "right" }
        );
    }
}

/* ---------- Participant summary PDF ---------- */
export function buildParticipantPdf(summary) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const { registration: r, event, total, daily } = summary;
    const title = `${event.name} — Team ${r.team_number} · ${r.team_name}`;
    const sub = `${event.start_date} → ${event.end_date}`;
    header(doc, title, sub);

    let y = 26;
    doc.setFont(FONT_SANS, "bold");
    doc.setFontSize(18);
    doc.text("Event summary", 14, y);
    y += 6;
    doc.setFont(FONT_SANS, "normal");
    doc.setFontSize(10);
    doc.setTextColor(C_MUTED);
    doc.text(`${r.first_name || ""} ${r.last_name || ""}`.trim(), 14, y);
    doc.setTextColor(C_TEXT);
    y += 8;

    // Total stats card
    autoTable(doc, {
        startY: y,
        head: [["Total distance", "Duration", "Moving", "Avg speed", "Max speed", "Points logged"]],
        body: [[
            fmtKm(total.distance_km),
            fmtMin(total.duration_min),
            fmtMin(total.moving_min),
            fmtKmh(total.avg_kmh),
            fmtKmh(total.max_kmh),
            String(total.points),
        ]],
        theme: "grid",
        headStyles: { fillColor: C_PRIMARY, textColor: "#fff", fontStyle: "bold" },
        styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Per-day breakdown
    doc.setFont(FONT_SANS, "bold");
    doc.setFontSize(13);
    doc.text("Daily breakdown", 14, y);
    y += 4;
    autoTable(doc, {
        startY: y,
        head: [["Date", "Distance", "Duration", "Avg km/h", "Max km/h", "First", "Last"]],
        body: daily.map((d) => [
            d.date,
            fmtKm(d.distance_km),
            fmtMin(d.duration_min),
            fmtKmh(d.avg_kmh),
            fmtKmh(d.max_kmh),
            fmtTime(d.first_ts),
            fmtTime(d.last_ts),
        ]),
        theme: "striped",
        headStyles: { fillColor: "#111", textColor: "#fff" },
        styles: { fontSize: 9 },
    });

    // One page per day with a route preview, only if there were points
    daily.forEach((d) => {
        if (!d.route || d.route.length < 2) return;
        doc.addPage();
        header(doc, `Day ${d.date}`, `${r.team_name} · T${r.team_number}`);
        const png = routePreviewPng(d.route, 1200, 600);
        if (png) doc.addImage(png, "PNG", 14, 26, W - 28, (W - 28) / 2);
        let y2 = 26 + (W - 28) / 2 + 6;
        autoTable(doc, {
            startY: y2,
            head: [["Distance", "Duration", "Moving", "Stopped", "Avg km/h", "Max km/h"]],
            body: [[
                fmtKm(d.distance_km), fmtMin(d.duration_min), fmtMin(d.moving_min),
                fmtMin(d.stopped_min), fmtKmh(d.avg_kmh), fmtKmh(d.max_kmh),
            ]],
            theme: "grid",
            headStyles: { fillColor: C_PRIMARY, textColor: "#fff", fontStyle: "bold" },
            styles: { fontSize: 9 },
        });
    });

    footer(doc);
    const slug = `${event.name}-T${r.team_number}-${r.team_name}`.replace(/[^\w-]+/g, "_");
    doc.save(`${slug}.pdf`);
}

/* ---------- Admin (event-wide) summary PDF ---------- */
export function buildEventPdf(summary) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const { event, days, teams } = summary;
    header(doc, `${event.name} — Admin report`, `${event.start_date} → ${event.end_date}`);

    let y = 26;
    doc.setFont(FONT_SANS, "bold");
    doc.setFontSize(18);
    doc.text("Leaderboard", 14, y);
    y += 6;
    doc.setFont(FONT_SANS, "normal");
    doc.setFontSize(10);
    doc.setTextColor(C_MUTED);
    doc.text(`${teams.length} team${teams.length === 1 ? "" : "s"} · ${days.length} day${days.length === 1 ? "" : "s"}`, 14, y);
    doc.setTextColor(C_TEXT);
    y += 6;

    // Total leaderboard
    autoTable(doc, {
        startY: y,
        head: [["#", "Team", "Driver", "Distance", "Duration", "Moving", "Avg km/h", "Max km/h"]],
        body: teams.map((t, i) => [
            String(i + 1),
            `T${t.team_number} · ${t.team_name}`,
            `${t.first_name || ""} ${t.last_name || ""}`.trim(),
            fmtKm(t.total.distance_km),
            fmtMin(t.total.duration_min),
            fmtMin(t.total.moving_min),
            fmtKmh(t.total.avg_kmh),
            fmtKmh(t.total.max_kmh),
        ]),
        theme: "striped",
        headStyles: { fillColor: C_PRIMARY, textColor: "#fff", fontStyle: "bold" },
        styles: { fontSize: 9 },
    });

    // One page per day with all teams' stats for that day
    days.forEach((day) => {
        doc.addPage();
        header(doc, `Day ${day}`, event.name);
        autoTable(doc, {
            startY: 26,
            head: [["Team", "Driver", "Distance", "Duration", "Avg km/h", "Max km/h"]],
            body: teams.map((t) => {
                const d = t.daily.find((x) => x.date === day) || {};
                return [
                    `T${t.team_number} · ${t.team_name}`,
                    `${t.first_name || ""} ${t.last_name || ""}`.trim(),
                    fmtKm(d.distance_km),
                    fmtMin(d.duration_min),
                    fmtKmh(d.avg_kmh),
                    fmtKmh(d.max_kmh),
                ];
            }),
            theme: "striped",
            headStyles: { fillColor: "#111", textColor: "#fff" },
            styles: { fontSize: 9 },
        });
    });

    footer(doc);
    const slug = `${event.name}-admin-report`.replace(/[^\w-]+/g, "_");
    doc.save(`${slug}.pdf`);
}
