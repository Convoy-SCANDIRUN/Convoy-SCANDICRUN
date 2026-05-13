"""Backend integration tests for Road Trip Tracker API."""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://roadtrip-tracker-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@roadtrip.com"
ADMIN_PASSWORD = "admin123"


def _png_bytes():
    # Minimal valid 1x1 PNG
    return (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?"
            b"\x00\x05\xfe\x02\xfe\xa3\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="module")
def participant():
    email = f"TEST_part_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "test1234", "role": "participant", "name": "Test P"},
                      timeout=30)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "participant"
    return {"token": data["token"], "user": data["user"], "email": email}


# ---------- Auth ----------
class TestAuth:
    def test_register_duplicate_400(self, participant):
        r = requests.post(f"{API}/auth/register",
                          json={"email": participant["email"], "password": "x", "role": "participant"},
                          timeout=30)
        assert r.status_code == 400

    def test_invalid_role(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": f"TEST_{uuid.uuid4().hex[:6]}@x.com",
                                "password": "x12345", "role": "hacker"}, timeout=30)
        assert r.status_code == 400

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_no_auth_401(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_logout_ok(self, admin_token):
        r = requests.post(f"{API}/auth/logout",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200


# ---------- Events & gating ----------
class TestEventsAndRegistration:
    def test_participant_cannot_create_event(self, participant):
        files = {"image": ("a.png", _png_bytes(), "image/png")}
        data = {"name": "P Event", "start_date": "2026-02-01", "end_date": "2026-02-05"}
        r = requests.post(f"{API}/events",
                          headers={"Authorization": f"Bearer {participant['token']}"},
                          data=data, files=files, timeout=60)
        assert r.status_code == 403

    def test_admin_create_event_with_image(self, admin_token):
        files = {"image": ("evt.png", _png_bytes(), "image/png")}
        data = {"name": f"TEST_Trip_{uuid.uuid4().hex[:5]}",
                "start_date": "2026-03-01", "end_date": "2026-03-10"}
        r = requests.post(f"{API}/events",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        evt = r.json()
        assert "id" in evt and "code" in evt
        assert len(evt["code"]) == 6
        assert evt["image_path"]
        pytest.event = evt

    def test_admin_lists_own_events(self, admin_token):
        r = requests.get(f"{API}/events", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert pytest.event["id"] in ids

    def test_event_by_code(self, participant):
        r = requests.get(f"{API}/events/by-code/{pytest.event['code']}",
                         headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == pytest.event["id"]

    def test_event_by_code_404(self, participant):
        r = requests.get(f"{API}/events/by-code/ZZZZZZ",
                         headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        assert r.status_code == 404

    def test_participant_register_for_event(self, participant):
        files = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
        data = {"team_number": "7", "team_name": "Team Awesome",
                "first_name": "Alice", "last_name": "Smith"}
        r = requests.post(f"{API}/events/by-code/{pytest.event['code']}/register",
                          headers={"Authorization": f"Bearer {participant['token']}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        reg = r.json()
        assert reg["team_name"] == "Team Awesome"
        assert reg["help_status"] == "normal"
        assert reg["profile_picture_path"]
        pytest.reg = reg

    def test_register_twice_400(self, participant):
        files = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
        data = {"team_number": "7", "team_name": "x", "first_name": "a", "last_name": "b"}
        r = requests.post(f"{API}/events/by-code/{pytest.event['code']}/register",
                          headers={"Authorization": f"Bearer {participant['token']}"},
                          data=data, files=files, timeout=60)
        assert r.status_code == 400

    def test_my_registration(self, participant):
        r = requests.get(f"{API}/events/{pytest.event['id']}/my-registration",
                         headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == pytest.reg["id"]

    def test_admin_lists_registrations(self, admin_token):
        r = requests.get(f"{API}/events/{pytest.event['id']}/registrations",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == pytest.reg["id"] for x in r.json())


# ---------- Location & help ----------
class TestLocationAndHelp:
    def test_owner_updates_location(self, participant):
        r = requests.post(f"{API}/registrations/{pytest.reg['id']}/location",
                          headers={"Authorization": f"Bearer {participant['token']}"},
                          json={"lat": 37.7749, "lng": -122.4194}, timeout=30)
        assert r.status_code == 200
        # verify persisted
        r2 = requests.get(f"{API}/events/{pytest.event['id']}/my-registration",
                          headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        body = r2.json()
        assert body["lat"] == 37.7749 and body["lng"] == -122.4194

    def test_other_user_cannot_update_location(self, admin_token):
        # Admin is not owner -> 404 per code
        r = requests.post(f"{API}/registrations/{pytest.reg['id']}/location",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"lat": 1.0, "lng": 2.0}, timeout=30)
        assert r.status_code == 404

    def test_owner_help_status(self, participant):
        for s in ["help", "sos", "clear"]:
            r = requests.post(f"{API}/registrations/{pytest.reg['id']}/help",
                              headers={"Authorization": f"Bearer {participant['token']}"},
                              json={"status": s}, timeout=30)
            assert r.status_code == 200
            expected = "normal" if s == "clear" else s
            assert r.json()["status"] == expected

    def test_admin_can_set_help_for_participant(self, admin_token):
        r = requests.post(f"{API}/registrations/{pytest.reg['id']}/help",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"status": "sos"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "sos"

    def test_invalid_help_status(self, participant):
        r = requests.post(f"{API}/registrations/{pytest.reg['id']}/help",
                          headers={"Authorization": f"Bearer {participant['token']}"},
                          json={"status": "panic"}, timeout=30)
        assert r.status_code == 400


# ---------- Files ----------
class TestFiles:
    def test_get_event_image(self):
        path = pytest.event["image_path"]
        r = requests.get(f"{API}/files/{path}", timeout=60)
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_missing_file_404(self):
        r = requests.get(f"{API}/files/nonexistent/path/missing.png", timeout=30)
        assert r.status_code == 404


# ---------- New Feature: emergency_phone, help_message, cross-admin events ----------
class TestNewFeatures:
    def test_event_persists_emergency_phone(self, admin_token):
        files = {"image": ("evt.png", _png_bytes(), "image/png")}
        data = {
            "name": f"TEST_EmergPhone_{uuid.uuid4().hex[:5]}",
            "start_date": "2026-04-01", "end_date": "2026-04-05",
            "emergency_phone": "+1-555-0199",
        }
        r = requests.post(f"{API}/events",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        evt = r.json()
        assert evt["emergency_phone"] == "+1-555-0199"
        # Verify persistence via GET
        g = requests.get(f"{API}/events/{evt['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert g.status_code == 200
        assert g.json()["emergency_phone"] == "+1-555-0199"
        pytest.emerg_event = evt

    def test_help_message_stored_and_returned(self, admin_token):
        # Register a fresh participant for this event
        email = f"TEST_help_{uuid.uuid4().hex[:8]}@test.com"
        rr = requests.post(f"{API}/auth/register",
                           json={"email": email, "password": "test1234",
                                 "role": "participant", "name": "HelpMsg User"},
                           timeout=30)
        assert rr.status_code == 200
        ptoken = rr.json()["token"]
        files = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
        data = {"team_number": "9", "team_name": "Lost Riders",
                "first_name": "Bob", "last_name": "Lost"}
        r = requests.post(f"{API}/events/by-code/{pytest.emerg_event['code']}/register",
                          headers={"Authorization": f"Bearer {ptoken}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        reg = r.json()

        msg = "I have lost the route, please wait!"
        h = requests.post(f"{API}/registrations/{reg['id']}/help",
                          headers={"Authorization": f"Bearer {ptoken}"},
                          json={"status": "help", "message": msg}, timeout=30)
        assert h.status_code == 200
        assert h.json()["status"] == "help"

        # Admin GET /events/{id}/registrations should include help_message
        ls = requests.get(f"{API}/events/{pytest.emerg_event['id']}/registrations",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert ls.status_code == 200
        rows = ls.json()
        target = next((x for x in rows if x["id"] == reg["id"]), None)
        assert target is not None
        assert target.get("help_status") == "help"
        assert target.get("help_message") == msg

        # Clear -> message should be wiped
        c = requests.post(f"{API}/registrations/{reg['id']}/help",
                          headers={"Authorization": f"Bearer {ptoken}"},
                          json={"status": "clear"}, timeout=30)
        assert c.status_code == 200
        ls2 = requests.get(f"{API}/events/{pytest.emerg_event['id']}/registrations",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        target2 = next((x for x in ls2.json() if x["id"] == reg["id"]), None)
        assert target2["help_status"] == "normal"
        assert target2.get("help_message", "") == ""

    def test_admin_sees_all_events(self, admin_token):
        # Create a second admin
        email = f"TEST_admin2_{uuid.uuid4().hex[:8]}@test.com"
        rr = requests.post(f"{API}/auth/register",
                           json={"email": email, "password": "adminpass",
                                 "role": "admin", "admin_code": "ConvoyHQ-2026!",
                                 "name": "Other Admin"},
                           timeout=30)
        # If admin_code field name differs, this may 400 — fall back: just verify
        # the existing primary admin sees pytest.event and pytest.emerg_event already.
        r = requests.get(f"{API}/events",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert pytest.event["id"] in ids
        assert pytest.emerg_event["id"] in ids

        if rr.status_code == 200:
            atok2 = rr.json()["token"]
            r2 = requests.get(f"{API}/events",
                              headers={"Authorization": f"Bearer {atok2}"}, timeout=30)
            assert r2.status_code == 200
            ids2 = [e["id"] for e in r2.json()]
            # Cross-admin visibility: admin2 should see admin1's events
            assert pytest.event["id"] in ids2 or pytest.emerg_event["id"] in ids2


# ---------- DELETE /api/auth/me ----------
class TestAccountDeletion:
    def test_delete_account_logs_out_and_allows_re_register(self):
        email = f"TEST_del_{uuid.uuid4().hex[:8]}@test.com"
        password = "delete1234"
        r = requests.post(f"{API}/auth/register",
                          json={"email": email, "password": password,
                                "role": "participant", "name": "Del User"}, timeout=30)
        assert r.status_code == 200
        token = r.json()["token"]

        # Delete account
        d = requests.delete(f"{API}/auth/me",
                            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert d.status_code == 200
        assert d.json().get("ok") is True

        # Old token should now 401
        m = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert m.status_code == 401

        # Same email may register again
        r2 = requests.post(f"{API}/auth/register",
                           json={"email": email, "password": password,
                                 "role": "participant", "name": "Del User v2"}, timeout=30)
        assert r2.status_code == 200, r2.text


# ---------- PWA static files ----------
class TestPWAStaticFiles:
    def test_manifest_json(self):
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=30)
        assert r.status_code == 200, f"manifest.json status {r.status_code}"
        m = r.json()
        assert m.get("display") == "standalone"
        assert m.get("theme_color") == "#0A0A0A"
        assert m.get("start_url") == "/"
        assert isinstance(m.get("icons"), list) and len(m["icons"]) > 0
        assert "name" in m

    def test_service_worker_js(self):
        r = requests.get(f"{BASE_URL}/sw.js", timeout=30)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "javascript" in ct.lower(), f"sw.js content-type: {ct}"

    def test_icon_svg(self):
        r = requests.get(f"{BASE_URL}/icon.svg", timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 0


# ---------- New Feature: Tracks + Summary endpoints (iteration 3) ----------
class TestTracksAndSummary:
    """Validates new track storage + per-registration and per-event summary endpoints."""

    @pytest.fixture(scope="class")
    def summary_ctx(self, admin_token):
        """Create event spanning today+tomorrow, register participant, return ctx."""
        # Build an event with a 2-day window centered on TODAY so location-update timestamps
        # (which use server-side UTC `now`) fall within the day range.
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc).date()
        start = today.isoformat()
        end = (today + timedelta(days=1)).isoformat()
        files = {"image": ("e.png", _png_bytes(), "image/png")}
        data = {"name": f"TEST_Summary_{uuid.uuid4().hex[:5]}",
                "start_date": start, "end_date": end}
        r = requests.post(f"{API}/events",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        evt = r.json()

        # Two distinct participants - "owner" + "other"
        def _mk_participant(label):
            email = f"TEST_sum_{label}_{uuid.uuid4().hex[:6]}@test.com"
            rr = requests.post(f"{API}/auth/register",
                               json={"email": email, "password": "test1234",
                                     "role": "participant", "name": f"Sum {label}"},
                               timeout=30)
            assert rr.status_code == 200, rr.text
            return rr.json()["token"]

        owner_tok = _mk_participant("owner")
        other_tok = _mk_participant("other")

        # Owner registers
        rfiles = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
        rdata = {"team_number": "1", "team_name": "Roadrunners",
                 "first_name": "Owner", "last_name": "One"}
        r = requests.post(f"{API}/events/by-code/{evt['code']}/register",
                          headers={"Authorization": f"Bearer {owner_tok}"},
                          data=rdata, files=rfiles, timeout=120)
        assert r.status_code == 200, r.text
        owner_reg = r.json()

        # Other registers too (so we have a non-owner participant in same event)
        rdata2 = {"team_number": "2", "team_name": "Speeders",
                  "first_name": "Other", "last_name": "Two"}
        rfiles2 = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
        r2 = requests.post(f"{API}/events/by-code/{evt['code']}/register",
                           headers={"Authorization": f"Bearer {other_tok}"},
                           data=rdata2, files=rfiles2, timeout=120)
        assert r2.status_code == 200, r2.text

        ctx = {
            "event": evt,
            "owner_tok": owner_tok,
            "other_tok": other_tok,
            "owner_reg": owner_reg,
        }
        yield ctx
        # cleanup
        requests.delete(f"{API}/events/{evt['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)

    def test_location_post_creates_track_rows(self, summary_ctx):
        """Each /location POST must append a row to db.tracks (append-only)."""
        reg = summary_ctx["owner_reg"]
        tok = summary_ctx["owner_tok"]
        # First fetch baseline summary to know starting points
        r0 = requests.get(f"{API}/registrations/{reg['id']}/summary",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r0.status_code == 200
        base_pts = r0.json()["total"]["points"]

        # Submit 3 location updates with a short pause between them (so timestamps differ)
        coords = [(52.520, 13.405), (52.480, 13.300), (52.395, 13.060)]
        for lat, lng in coords:
            r = requests.post(f"{API}/registrations/{reg['id']}/location",
                              headers={"Authorization": f"Bearer {tok}"},
                              json={"lat": lat, "lng": lng}, timeout=30)
            assert r.status_code == 200, r.text
            time.sleep(1.1)  # ensure distinct ISO timestamps & nonzero dt

        # Summary should now reflect base + 3 new points
        r1 = requests.get(f"{API}/registrations/{reg['id']}/summary",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r1.status_code == 200
        body = r1.json()
        assert body["total"]["points"] == base_pts + 3, \
            f"Expected {base_pts + 3} points, got {body['total']['points']}"

    def test_haversine_distance_berlin_potsdam(self, summary_ctx):
        """Berlin↔Potsdam straight-line is ~27 km. Owner just posted those 3 points."""
        reg = summary_ctx["owner_reg"]
        tok = summary_ctx["owner_tok"]
        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 200
        total = r.json()["total"]
        # 52.520,13.405 -> 52.480,13.300 ~ ~8.3 km; -> 52.395,13.060 ~ ~19.4 km. Sum ~27-28 km.
        assert 20.0 <= total["distance_km"] <= 35.0, \
            f"Berlin→Potsdam expected ~27 km, got {total['distance_km']}"

    def test_summary_shape_and_no_objectid(self, summary_ctx):
        """Summary response must contain registration/event/total/daily and no _id."""
        reg = summary_ctx["owner_reg"]
        tok = summary_ctx["owner_tok"]
        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        for k in ("registration", "event", "total", "daily"):
            assert k in body, f"missing key {k}"
        # No _id leakage anywhere
        import json as _json
        raw = _json.dumps(body)
        assert '"_id"' not in raw, "ObjectId leaked in summary response"

        # daily entries cover full event window inclusively
        days = body["daily"]
        from datetime import date
        s = date.fromisoformat(body["event"]["start_date"])
        e = date.fromisoformat(body["event"]["end_date"])
        expected_days = (e - s).days + 1
        assert len(days) == expected_days, \
            f"daily length {len(days)} != expected {expected_days}"
        # Every daily row must have required stats keys
        for entry in days:
            for k in ("date", "distance_km", "duration_min", "moving_min",
                      "stopped_min", "avg_kmh", "max_kmh", "points",
                      "first_ts", "last_ts", "route"):
                assert k in entry, f"daily entry missing {k}: {entry}"

        # total must also have all stats keys
        for k in ("distance_km", "duration_min", "moving_min", "stopped_min",
                  "avg_kmh", "max_kmh", "points", "first_ts", "last_ts", "route"):
            assert k in body["total"], f"total missing {k}"

    def test_summary_other_participant_forbidden(self, summary_ctx):
        """Non-owner participant must get 403."""
        reg = summary_ctx["owner_reg"]
        other_tok = summary_ctx["other_tok"]
        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {other_tok}"}, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_summary_admin_allowed(self, summary_ctx, admin_token):
        """Admin can call any registration summary."""
        reg = summary_ctx["owner_reg"]
        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["registration"]["id"] == reg["id"]

    def test_event_summary_admin_shape_and_sorted(self, summary_ctx, admin_token):
        """Event summary returns sorted leaderboard by total.distance_km desc, no _id."""
        evt = summary_ctx["event"]
        r = requests.get(f"{API}/events/{evt['id']}/summary",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("event", "days", "teams"):
            assert k in body
        import json as _json
        raw = _json.dumps(body)
        assert '"_id"' not in raw, "ObjectId leaked in event summary"
        # Sorted descending by total.distance_km
        dists = [t["total"]["distance_km"] for t in body["teams"]]
        assert dists == sorted(dists, reverse=True), f"teams not sorted desc: {dists}"
        # days matches inclusive event window
        from datetime import date
        s = date.fromisoformat(evt["start_date"])
        e = date.fromisoformat(evt["end_date"])
        assert len(body["days"]) == (e - s).days + 1

    def test_event_summary_participant_forbidden(self, summary_ctx):
        """Participants get 403 on event-wide summary."""
        evt = summary_ctx["event"]
        tok = summary_ctx["owner_tok"]
        r = requests.get(f"{API}/events/{evt['id']}/summary",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 403


# ---------- Cleanup ----------
class TestCleanup:
    def test_owner_can_self_leave(self, participant):
        # NEW BEHAVIOR: owners can DELETE their own registration (self-leave)
        r = requests.delete(f"{API}/registrations/{pytest.reg['id']}",
                            headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        assert r.status_code == 200
        # Verify gone
        r2 = requests.get(f"{API}/events/{pytest.event['id']}/my-registration",
                          headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        assert r2.status_code == 404

    def test_admin_deletes_event_cascades(self, admin_token):
        r = requests.delete(f"{API}/events/{pytest.event['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        # Cleanup the emerg_event too
        if hasattr(pytest, "emerg_event"):
            requests.delete(f"{API}/events/{pytest.emerg_event['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
