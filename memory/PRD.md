# Convoy — Road Trip Tracker · PRD

## Original problem
Track participants on a road trip. Admins create events; participants register via event code with team number, team name, first name, last name, profile picture. Both roles see an overview map with each participant's profile picture + team number/name. Two distress buttons: "I need help" (yellow) and "SOS" (red) — pressing them notifies all participants and marks the team with a glowing yellow/red circle. Admins manage and delete registered participants.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth (cookies + Bearer), Emergent Object Storage
- Frontend: React + Tailwind + Shadcn UI + Sonner, react-leaflet (CartoDB Dark Matter)
- Auth: Custom email/password JWT, bcrypt hashing, admin seeded at startup

## User personas
1. **Administrator** — creates events, watches the convoy from a command-center map, manages participants.
2. **Participant** — registers for an event with a team, broadcasts location, taps Help/SOS when in distress.

## Core requirements (static)
- Two roles with separate dashboards
- Event has: name, start/end date, image, auto 6-char code
- Registration fields: team number, team name, first name, last name, profile picture
- Live map: profile picture + team label markers, glowing yellow (help) / red (sos) circles
- Distress notifications: toast + glow on map
- Admin can manage and delete events and registrations
- Browser geolocation for live tracking

## Recently shipped (Feb 2026)
- **Sun-phase overlay on the map** — Uses `suncalc` to compute the driver's current daylight phase from their location. Renders a live badge (top-left) showing current phase + time-to-next-transition (Sunrise, Golden hour, Sunset, Dusk, Night, etc.) with a matching icon, and a subtle full-map tint (warm at dawn/dusk, deep blue at night). Localised in EN/DE/NL.
- **Team-number prefix** — Replaced the `T` marker prefix with `#` everywhere (map labels, popups, lists, PDF reports, fallback avatars).
- **Event Details modal + share-window opt-ins** — Tap the event name in the topbar to open a details modal showing start/end dates, participant count, emergency phone, live share-status banner, opt-in toggles for sharing location up to 24h before / after the event, and a Leave-event button (moved from the My Events list per user request). Backend `PATCH /api/registrations/{id}/share-window` persists the toggles; `POST /api/registrations/{id}/location` now rejects updates outside the allowed window with `403 outside_share_window`. Frontend gates `pushLocation` + `watchPosition` on the same rules so nothing leaks.
- **Countdown watermark on map** — Semi-transparent overlay ("EVENT STARTS IN Xd Yh Zm Ws") rendered on the participant map while the event hasn't started yet; ticks every second, hides once the event goes live.
- **Web Push notifications** — VAPID-based push for installed PWAs. Backend (FastAPI + pywebpush) endpoints `/api/push/{public-key,subscribe,unsubscribe}`; help fan-out to all event participants + admins, SOS fan-out to admins only. Dead endpoints (HTTP 404/410) auto-pruned. Service worker v5 handles `push` + `notificationclick`. iOS only works in installed PWAs (16.4+) — documented honestly. **48/48 backend tests pass** (iteration_4.json).
- **Tap-to-navigate help notifications** — Each row in the "Active help requests" panel is now a button; tapping flies the map to that team AND opens a navigation dialog with approximate distance (Haversine) and drive-time estimate (60 km/h heuristic, labelled "approx") plus Google/Apple Maps deep links.
- **Real OSM map in PDFs** — Daily route pages in the participant PDF now render the polyline on real CartoDB Voyager tiles (same style as the live map) with letterbox-fit cropping and start/end markers; falls back to the blueprint preview if tile fetches fail.
- **5-point sliding max speed** — `_stats_from_points` now computes max km·h over a 4-leg sliding window (~60 s of motion) instead of a single leg, dropping GPS-glitch spikes to realistic values.
- **PDF reports** — `tracks` collection captures every location ping; `/api/registrations/:id/summary` and `/api/events/:id/summary` compute Haversine distance, duration, moving time, avg + max km·h.
- **Background location (best-effort PWA)** — SW v4 with `periodicsync` + `sync` handlers; page registers a 60s background sync.
- **Install App button in profile** — Always visible in browser, hides only when standalone. Permanent fallback instructions for iOS Safari and Android Chrome.
- **PWA auto-update flow** — `index.js` auto-reloads exactly once when a new SW takes control.

## What's been implemented (2026-02)
- JWT auth (register/login/me/logout), admin seed (admin@roadtrip.com / admin123)
- Event CRUD (admin) with image upload to Emergent Object Storage
- Participant registration via event code with profile picture
- Per-registration location updates and help/sos status
- File serving via /api/files/{path}
- Polling-based map sync (5s) with toast + glowing markers (Sonner + Leaflet divIcon)
- Admin Command Center: event list, participants panel, distress banner, delete actions
- Participant dashboard: JoinForm, full-screen map, geolocation streaming, Help/SOS floating buttons, status banners
- 25/25 backend tests passing; admin UI flow verified

## Backlog
### P1
- WebSocket live updates (replace polling)
- Map clustering + popups for marker details (name, last update time)
- Multiple-event navigation for participants (UI to switch between joined events)
- Participant route history / breadcrumbs

### P2
- Push notifications (PWA)
- Offline-first map tiles
- Email/SMS alerts on SOS to admin
- Team chat or quick-reply during distress
- Custom event branding (color theme per event)
