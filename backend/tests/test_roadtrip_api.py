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


# ---------- Cleanup ----------
class TestCleanup:
    def test_participant_cannot_delete_registration(self, participant):
        r = requests.delete(f"{API}/registrations/{pytest.reg['id']}",
                            headers={"Authorization": f"Bearer {participant['token']}"}, timeout=30)
        assert r.status_code == 403

    def test_admin_deletes_registration(self, admin_token):
        r = requests.delete(f"{API}/registrations/{pytest.reg['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200

    def test_admin_deletes_event_cascades(self, admin_token):
        r = requests.delete(f"{API}/events/{pytest.event['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
