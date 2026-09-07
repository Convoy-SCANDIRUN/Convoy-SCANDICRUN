/** Shared offline check — a participant is offline once we haven't received
 *  a location update from them in the last N seconds. Duplicated logic used
 *  to live inline in MapView; extracted here so the sidebar list and other
 *  surfaces stay consistent. */
export const OFFLINE_AFTER_S = 180;

export function isRegOffline(reg) {
    if (!reg || !reg.last_update) return true;
    try {
        const last = new Date(reg.last_update).getTime();
        if (isNaN(last)) return true;
        return (Date.now() - last) / 1000 > OFFLINE_AFTER_S;
    } catch { return true; }
}
