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
- **Circular fallback avatars everywhere** — `lib/avatar.js` generates deterministic colored SVG avatars with team initials. Used in map markers (`MapView`), admin participant list + SOS dispatch dialog (`AdminDashboard`), and participants overview (`ParticipantDashboard`). Replaces the generic Unsplash placeholder so every team always shows a clean circular avatar even without an uploaded photo.

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
