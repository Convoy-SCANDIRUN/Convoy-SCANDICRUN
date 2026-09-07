"""Create an active event, register a participant, push location — for the offline/online marker glow test."""
import os, requests, sys
from datetime import date, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://roadtrip-tracker-2.preview.emergentagent.com").rstrip("/")
s = requests.Session()

# Admin login
r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@roadtrip.com", "password": "admin123"})
print("admin login:", r.status_code)
admin_token = r.json().get("access_token")
admin_headers = {"Authorization": f"Bearer {admin_token}"}

# Create active event (multipart form)
today = date.today().isoformat()
tomorrow = (date.today() + timedelta(days=1)).isoformat()
form = {
    "name": "TEST_offline_event",
    "start_date": today,
    "end_date": tomorrow,
    "emergency_phone": "+490",
}
r = s.post(f"{BASE}/api/events", data=form, headers=admin_headers)
print("create event:", r.status_code, r.text[:300])
event = r.json()
event_id = event.get("id")
event_code = event.get("code")
print("event id/code:", event_id, event_code)

# Participant login
r = s.post(f"{BASE}/api/auth/login", json={"email": "test-share-window@rt.com", "password": "test1234"})
print("part login:", r.status_code)
part_token = r.json().get("access_token")
part_headers = {"Authorization": f"Bearer {part_token}"}

# Register participant to event (by code)
reg_form = {
    "team_number": "999",
    "team_name": "TEST_online_team",
    "first_name": "Test",
    "last_name": "Online",
}
r = s.post(f"{BASE}/api/events/by-code/{event_code}/register", data=reg_form, headers=part_headers)
print("register:", r.status_code, r.text[:400])
reg = r.json()
reg_id = reg.get("id")
print("reg id:", reg_id)

# Push location
r = s.post(f"{BASE}/api/registrations/{reg_id}/location", json={"lat": 52.5, "lng": 13.4}, headers=part_headers)
print("location:", r.status_code, r.text[:300])

print("\nSAVE:", event_id, event_code, reg_id)
with open("/tmp/test_ids.txt", "w") as f:
    f.write(f"{event_id}\n{event_code}\n{reg_id}\n")
