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
- **PDF reports** — Backend stores every location ping in a new `tracks` collection; new endpoints `GET /api/registrations/:id/summary` (participant own + admin) and `GET /api/events/:id/summary` (admin) compute daily + total distance (Haversine), duration, moving time, avg/max km·h, route polyline. Frontend renders self-contained PDFs via jsPDF + jspdf-autotable with a canvas-rendered route preview per day. Buttons: profile dialog → "Download my report" / events list → file-down icon per event. 38/38 backend tests pass.
- **Background location (best-effort PWA)** — Service worker v4 with `periodicsync` + `sync` handlers; page registers `periodicsync` tag every 60s and listens for `BG_PUSH_LOCATION` messages from the SW. Works on Android Chrome installed PWAs; gracefully no-op on iOS Safari (documented honestly).
- **Install App button in profile** — Reusable `usePwaInstall` hook + `InstallAppButton`. Wired into participant profile dialog and admin topbar. iOS users get a step-by-step "Add to Home Screen" modal.
- **PWA auto-update flow** — `sw.js` v3 with stale-while-revalidate; `index.js` auto-reloads exactly once when a new SW takes control.
- **Round map markers fix** — Tailwind preflight was deforming marker imgs to ovals.
- **Tap-to-focus on map** — Tapping a team in either dashboard sidebar/overview flies the map to that team and opens their popup.
- **Circular fallback avatars** — `lib/avatar.js` everywhere.

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
