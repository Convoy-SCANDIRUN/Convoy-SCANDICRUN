import { fileUrl } from "@/lib/api";

const PALETTE = ["#007AFF", "#FF3B30", "#FFCC00", "#34C759", "#AF52DE", "#FF9500", "#5AC8FA", "#FF2D55"];

function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return Math.abs(h);
}

function initialsOf(reg) {
    const a = (reg?.first_name || "").trim().charAt(0);
    const b = (reg?.last_name || "").trim().charAt(0);
    const combined = `${a}${b}`.toUpperCase();
    if (combined) return combined;
    if (reg?.team_number) return `T${reg.team_number}`.slice(0, 3);
    return "?";
}

/** Deterministic colored SVG avatar (data URI) showing the participant's
 *  initials. Used wherever a profile picture is missing or fails to load,
 *  so map markers and lists always display a clean circular avatar. */
export function fallbackAvatar(reg) {
    const seed = `${reg?.team_number || ""}${reg?.team_name || ""}${reg?.id || ""}` || "x";
    const bg = PALETTE[hashCode(seed) % PALETTE.length];
    const initials = initialsOf(reg);
    const fontSize = initials.length > 2 ? 26 : 34;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <rect width="80" height="80" fill="${bg}"/>
        <text x="50%" y="50%" font-family="'Barlow Condensed',Arial,sans-serif"
              font-size="${fontSize}" font-weight="900" fill="#fff"
              text-anchor="middle" dominant-baseline="central">${initials}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Returns the URL to display for a participant's avatar — either the
 *  uploaded profile picture or a generated initials fallback. */
export function avatarUrl(reg) {
    if (reg?.profile_picture_path) return fileUrl(reg.profile_picture_path);
    return fallbackAvatar(reg);
}
