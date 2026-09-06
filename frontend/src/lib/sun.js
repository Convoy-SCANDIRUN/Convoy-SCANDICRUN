/**
 * Sunrise / sunset helper — wraps the `suncalc` library to expose a single
 * "phase" plus the next upcoming transition. Used by MapView to tint the
 * map based on the driver's current daylight conditions.
 */
import * as SunCalc from "suncalc";

/** Ordered list of sun-position keys that suncalc.getTimes() returns.
 *  We look at *today's* and *tomorrow's* times to always find a future edge. */
const TRANSITION_ORDER = [
    "nightEnd",       // astro dawn (sun -18°)
    "nauticalDawn",   // nautical dawn (sun -12°)
    "dawn",           // civil dawn (sun -6°)
    "sunrise",        // sun crosses horizon
    "sunriseEnd",     // sun disc fully up
    "goldenHourEnd",  // end of morning golden hour
    "solarNoon",      // sun peak
    "goldenHour",     // start of evening golden hour
    "sunsetStart",    // sun disc begins to set
    "sunset",         // sun crosses horizon
    "dusk",           // civil dusk (sun -6°)
    "nauticalDusk",   // nautical dusk (sun -12°)
    "night",          // astro dusk (sun -18°)
];

/** Human-friendly label for each transition (keys map 1:1 to i18n strings). */
export const TRANSITION_KEYS = {
    nightEnd:      "sun.transitionNightEnd",
    nauticalDawn:  "sun.transitionDawn",
    dawn:          "sun.transitionDawn",
    sunrise:       "sun.transitionSunrise",
    sunriseEnd:    "sun.transitionSunriseEnd",
    goldenHourEnd: "sun.transitionMorningGoldenEnd",
    solarNoon:     "sun.transitionSolarNoon",
    goldenHour:    "sun.transitionEveningGolden",
    sunsetStart:   "sun.transitionSunsetStart",
    sunset:        "sun.transitionSunset",
    dusk:          "sun.transitionDusk",
    nauticalDusk:  "sun.transitionNauticalDusk",
    night:         "sun.transitionNight",
};

/** Classify the current moment into one of five phases used by the tint. */
function phaseFor(t, times) {
    if (t < times.nightEnd)      return "night";
    if (t < times.dawn)          return "twilight";   // astro/nautical morning
    if (t < times.sunrise)       return "dawn";
    if (t < times.goldenHourEnd) return "goldenMorning";
    if (t < times.goldenHour)    return "day";
    if (t < times.sunsetStart)   return "goldenEvening";
    if (t < times.dusk)          return "dusk";
    if (t < times.night)         return "twilight";   // astro/nautical evening
    return "night";
}

/**
 * Compute the current sun phase + next transition at (lat, lng) on now().
 * Returns null when no location is provided so callers can skip the overlay.
 */
export function sunStateAt(lat, lng, now = new Date()) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
    const today = SunCalc.getTimes(now, lat, lng);
    const tomorrow = SunCalc.getTimes(new Date(now.getTime() + 24 * 3600 * 1000), lat, lng);
    const phase = phaseFor(now, today);

    // Find next upcoming transition (today or tomorrow) so we can show a
    // "Sunset in 1h 12m" style hint.
    let nextKey = null;
    let nextAt = null;
    for (const key of TRANSITION_ORDER) {
        const at = today[key];
        if (at instanceof Date && !isNaN(at) && at > now) { nextKey = key; nextAt = at; break; }
    }
    if (!nextAt) {
        for (const key of TRANSITION_ORDER) {
            const at = tomorrow[key];
            if (at instanceof Date && !isNaN(at) && at > now) { nextKey = key; nextAt = at; break; }
        }
    }

    return {
        phase,
        sunrise: today.sunrise,
        sunset: today.sunset,
        nextKey,
        nextAt,
        nextInMs: nextAt ? nextAt.getTime() - now.getTime() : null,
    };
}

/**
 * Tint colors + labels for each phase. Overlay is applied as a semi-transparent
 * layer on top of the map tiles so the map remains readable. Colors are chosen
 * to evoke the corresponding light conditions.
 */
export const PHASE_STYLE = {
    day:            { bg: "transparent",               labelKey: "sun.phaseDay",            accent: "#34C759" },
    goldenMorning:  { bg: "rgba(255, 170,  60, 0.20)", labelKey: "sun.phaseGoldenMorning", accent: "#FF9500" },
    dawn:           { bg: "rgba(255, 120,  40, 0.28)", labelKey: "sun.phaseDawn",           accent: "#FF9500" },
    goldenEvening:  { bg: "rgba(255, 140,  60, 0.24)", labelKey: "sun.phaseGoldenEvening",  accent: "#FF9500" },
    dusk:           { bg: "rgba(255,  90,  40, 0.30)", labelKey: "sun.phaseDusk",           accent: "#FF3B30" },
    twilight:       { bg: "rgba( 30,  40,  90, 0.40)", labelKey: "sun.phaseTwilight",       accent: "#5AC8FA" },
    night:          { bg: "rgba(  5,  10,  35, 0.55)", labelKey: "sun.phaseNight",          accent: "#5AC8FA" },
};
