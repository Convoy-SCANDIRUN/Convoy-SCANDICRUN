"""Iteration 4 tests: 5-point sliding-window max speed + Web Push fan-out.

Covers:
  • _stats_from_points sliding-window max_kmh (glitch resistance)
  • GET  /api/push/public-key  (anonymous)
  • POST /api/push/subscribe   (auth + upsert)
  • POST /api/push/unsubscribe (auth + delete)
  • POST /api/registrations/{id}/help dispatches push as a background task
    (endpoint returns promptly, no errors with zero subs, pruning of 410)

Tracks are injected directly into Mongo so we can backdate timestamps and
control the per-leg distance/duration precisely.
"""
import os
import re
import time
import uuid
import base64
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta, date as date_cls

from dotenv import load_dotenv
from pathlib import Path

# Load envs so we get MONGO_URL / DB_NAME and REACT_APP_BACKEND_URL
load_dotenv(Path("/app/backend/.env"))
load_dotenv(Path("/app/frontend/.env"))

from pymongo import MongoClient  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@roadtrip.com"
ADMIN_PASSWORD = "admin123"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _png_bytes():
    return (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?"
            b"\x00\x05\xfe\x02\xfe\xa3\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")


# ---------- Shared fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def participant_token():
    email = f"TEST_push_part_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "test1234",
                            "role": "participant", "name": "Push P"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME]


def _run(coro):
    """Helper to run an async coroutine inside a sync pytest test."""
    return asyncio.run(coro)


# ---------- 1. Sliding-window max speed ----------
class TestSlidingWindowMaxSpeed:
    @pytest.fixture(scope="class")
    def speed_ctx(self, admin_token, mongo):
        """Create an event whose window covers TODAY (UTC) and register a
        participant in it. Track points are inserted directly into Mongo."""
        today = date_cls.today().isoformat()
        tomorrow = (date_cls.today() + timedelta(days=1)).isoformat()

        files = {"image": ("e.png", _png_bytes(), "image/png")}
        data = {"name": f"TEST_speed_{uuid.uuid4().hex[:6]}",
                "start_date": today, "end_date": tomorrow,
                "emergency_phone": "+10000000000"}
        r = requests.post(f"{API}/events",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        evt = r.json()

        # participant
        email = f"TEST_speed_p_{uuid.uuid4().hex[:6]}@test.com"
        rr = requests.post(f"{API}/auth/register",
                           json={"email": email, "password": "test1234",
                                 "role": "participant", "name": "Speed P"}, timeout=30)
        assert rr.status_code == 200, rr.text
        ptok = rr.json()["token"]
        puser = rr.json()["user"]

        rdata = {"team_number": "9", "team_name": "Sliders",
                 "first_name": "Slide", "last_name": "Win"}
        rfiles = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
        rs = requests.post(f"{API}/events/by-code/{evt['code']}/register",
                           headers={"Authorization": f"Bearer {ptok}"},
                           data=rdata, files=rfiles, timeout=120)
        assert rs.status_code == 200, rs.text
        reg = rs.json()

        ctx = {"event": evt, "reg": reg, "ptok": ptok, "puser": puser}
        yield ctx
        # cleanup
        requests.delete(f"{API}/events/{evt['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)

    @staticmethod
    def _seed_tracks(mongo, reg, points):
        """Insert track docs at exact ISO timestamps."""
        docs = []
        for lat, lng, ts in points:
            docs.append({
                "id": str(uuid.uuid4()),
                "registration_id": reg["id"],
                "event_id": reg["event_id"],
                "user_id": reg["user_id"],
                "lat": lat, "lng": lng, "ts": ts,
            })
        if docs:
            mongo.tracks.insert_many(docs)

    @staticmethod
    def _clear_tracks(mongo, reg):
        mongo.tracks.delete_many({"registration_id": reg["id"]})

    def test_max_kmh_steady_50_no_glitch(self, speed_ctx, mongo):
        """6 points spaced 5 s apart, each leg ~70 m → ~50 km/h.
        avg_kmh and max_kmh should both be ~50 (window of 4 legs)."""
        reg = speed_ctx["reg"]
        ptok = speed_ctx["ptok"]

        self._clear_tracks(mongo, reg)

        # 1 deg lat ≈ 111.32 km → 70 m ≈ 0.000629 deg
        lat0 = 52.5200
        lng0 = 13.4050
        step = 0.000629   # ~70 m per leg
        base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=10)
        pts = []
        for i in range(6):
            pts.append((lat0 + step * i, lng0, (base + timedelta(seconds=5 * i)).isoformat()))
        self._seed_tracks(mongo, reg, pts)

        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {ptok}"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        total = body["total"]
        # 5 legs of ~0.07 km each → ~0.35 km total
        assert total["points"] == 6
        assert 0.30 <= total["distance_km"] <= 0.42, total
        # avg should be ~50 km/h
        assert 40.0 <= total["avg_kmh"] <= 60.0, f"avg_kmh out of band: {total['avg_kmh']}"
        # max via 4-leg sliding window should also be ~50, NOT a single-leg spike
        assert 40.0 <= total["max_kmh"] <= 60.0, f"max_kmh out of band: {total['max_kmh']}"

    def test_max_kmh_resists_single_glitch(self, speed_ctx, mongo):
        """Add one bad fix that would create a ~800 km/h single-leg jump.
        4-leg sliding window must keep max_kmh bounded near real speed."""
        reg = speed_ctx["reg"]
        ptok = speed_ctx["ptok"]

        self._clear_tracks(mongo, reg)

        lat0 = 52.5200
        lng0 = 13.4050
        step = 0.000629   # ~70 m / 5 s ≈ 50 km/h
        base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=20)
        pts = []
        for i in range(6):
            pts.append((lat0 + step * i, lng0, (base + timedelta(seconds=5 * i)).isoformat()))

        # Insert a glitch point between p2 and p3: jump ~1.1 km in 5 s → ~800 km/h
        # but distance < 5 km so the >250 km/h && <5 km filter will drop the
        # short leg entirely. That alone proves the glitch filter works.
        # To exercise the SLIDING WINDOW (not the glitch filter), use a leg
        # that DOES exceed 5 km but only briefly — pick ~6 km in 5 s = 4320 km/h.
        # That bypasses the < 5 km drop, lands in the 4-leg window, and lets
        # the window average dilute it.
        # 6 km north ≈ 0.0539 deg lat
        glitch_lat = lat0 + step * 2 + 0.0539
        glitch_ts = (base + timedelta(seconds=5 * 2 + 5)).isoformat()  # between p2 & p3 conceptually
        # Insert it as a 7th point with timestamp between p2 and p3, then a
        # return-to-normal point right after to make a clear single-leg spike.
        pts.append((glitch_lat, lng0, glitch_ts))

        self._seed_tracks(mongo, reg, pts)

        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {ptok}"}, timeout=30)
        assert r.status_code == 200
        total = r.json()["total"]
        # The single 4320 km/h leg, averaged with 3 neighbouring ~50 km/h legs
        # over the 4-leg window, gives at most ~(6 km + 0.21 km)/(20s/3600) ≈ 1117 km/h
        # but the window MAX will still be far below the raw single-leg 4320.
        # Critically it must NOT just be the single-leg figure.
        assert total["max_kmh"] < 1500, \
            f"max_kmh {total['max_kmh']} suggests no sliding window dilution"
        # And it must be > 50 because of the spike contribution
        assert total["max_kmh"] > 60, \
            f"max_kmh {total['max_kmh']} — spike should still raise the window above steady 50"

    def test_max_kmh_drops_short_glitch(self, speed_ctx, mongo):
        """Glitch shorter than 5 km AND >250 km/h is fully dropped, so steady
        traffic max stays ~50 km/h even with one wild fix inside."""
        reg = speed_ctx["reg"]
        ptok = speed_ctx["ptok"]

        self._clear_tracks(mongo, reg)

        lat0 = 52.5200
        lng0 = 13.4050
        step = 0.000629
        base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=30)
        pts = []
        for i in range(6):
            pts.append((lat0 + step * i, lng0, (base + timedelta(seconds=5 * i)).isoformat()))
        # Glitch: 1.1 km jump in 5 s → 792 km/h, < 5 km → DROPPED by filter
        glitch_lat = lat0 + step * 2 + 0.01   # ~1.1 km
        glitch_ts = (base + timedelta(seconds=5 * 2 + 2)).isoformat()
        pts.append((glitch_lat, lng0, glitch_ts))
        self._seed_tracks(mongo, reg, pts)

        r = requests.get(f"{API}/registrations/{reg['id']}/summary",
                         headers={"Authorization": f"Bearer {ptok}"}, timeout=30)
        assert r.status_code == 200
        total = r.json()["total"]
        # With the wild leg dropped, max should remain in steady-state band.
        # Allow up to 120 km/h because the glitch fix becomes an out-of-order
        # point that may chain with neighbours.
        assert total["max_kmh"] < 120, \
            f"single-leg glitch under 5 km should be dropped, got max_kmh={total['max_kmh']}"


# ---------- 2. Push public key ----------
class TestPushPublicKey:
    def test_public_key_no_auth(self):
        r = requests.get(f"{API}/push/public-key", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "publicKey" in body
        pk = body["publicKey"]
        assert isinstance(pk, str) and len(pk) > 0
        # base64url charset (A-Z a-z 0-9 - _ optional padding)
        assert re.fullmatch(r"[A-Za-z0-9_\-=]+", pk), f"not base64url: {pk!r}"
        # VAPID public keys decode to 65 bytes (uncompressed P-256 point)
        try:
            raw = base64.urlsafe_b64decode(pk + "=" * (-len(pk) % 4))
            assert len(raw) == 65, f"expected 65 bytes, got {len(raw)}"
        except Exception as e:
            pytest.fail(f"publicKey not decodable base64url: {e}")


# ---------- 3. Subscribe / unsubscribe ----------
class TestPushSubscribe:
    @pytest.fixture
    def sub_payload(self):
        # Unique endpoint per test run
        return {
            "endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}",
            "keys": {
                "auth": base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("="),
                "p256dh": base64.urlsafe_b64encode(os.urandom(65)).decode().rstrip("="),
            },
        }

    def test_subscribe_requires_auth(self, sub_payload):
        r = requests.post(f"{API}/push/subscribe", json=sub_payload, timeout=15)
        assert r.status_code == 401, r.text

    def test_subscribe_ok_and_upsert(self, participant_token, sub_payload, mongo):
        h = {"Authorization": f"Bearer {participant_token}"}
        r1 = requests.post(f"{API}/push/subscribe", headers=h, json=sub_payload, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json() == {"ok": True}

        # Doc exists
        n = mongo.push_subscriptions.count_documents({"endpoint": sub_payload["endpoint"]})
        doc = mongo.push_subscriptions.find_one({"endpoint": sub_payload["endpoint"]})
        assert n == 1, f"expected 1 doc, got {n}"
        assert doc["endpoint"] == sub_payload["endpoint"]
        assert "user_id" in doc and doc["user_id"]
        assert doc["keys"]["auth"] == sub_payload["keys"]["auth"]

        # Calling again must upsert (still 1 doc)
        r2 = requests.post(f"{API}/push/subscribe", headers=h, json=sub_payload, timeout=15)
        assert r2.status_code == 200
        n2 = mongo.push_subscriptions.count_documents({"endpoint": sub_payload["endpoint"]})
        assert n2 == 1, f"duplicate after second subscribe: {n2}"

    def test_unsubscribe_deletes_doc(self, participant_token, mongo):
        h = {"Authorization": f"Bearer {participant_token}"}
        ep = f"https://fcm.googleapis.com/fcm/send/TEST_unsub_{uuid.uuid4().hex}"
        payload = {"endpoint": ep,
                   "keys": {"auth": "AAAA", "p256dh": "BBBB"}}
        r = requests.post(f"{API}/push/subscribe", headers=h, json=payload, timeout=15)
        assert r.status_code == 200

        ru = requests.post(f"{API}/push/unsubscribe", headers=h, json=payload, timeout=15)
        assert ru.status_code == 200
        assert ru.json() == {"ok": True}

        async def _count():
            return mongo.push_subscriptions.count_documents({"endpoint": ep})
        assert mongo.push_subscriptions.count_documents({"endpoint": ep}) == 0


# ---------- 4. Help dispatch as background task ----------
class TestHelpPushDispatch:
    @pytest.fixture(scope="class")
    def help_ctx(self, admin_token):
        """Spin up a small event with two participants so the help-fan-out has targets."""
        today = date_cls.today().isoformat()
        tomorrow = (date_cls.today() + timedelta(days=1)).isoformat()
        files = {"image": ("e.png", _png_bytes(), "image/png")}
        data = {"name": f"TEST_help_{uuid.uuid4().hex[:6]}",
                "start_date": today, "end_date": tomorrow,
                "emergency_phone": "+10000000000"}
        r = requests.post(f"{API}/events",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          data=data, files=files, timeout=120)
        assert r.status_code == 200, r.text
        evt = r.json()

        def _mk(label):
            email = f"TEST_help_{label}_{uuid.uuid4().hex[:6]}@test.com"
            rr = requests.post(f"{API}/auth/register",
                               json={"email": email, "password": "test1234",
                                     "role": "participant", "name": label}, timeout=30)
            assert rr.status_code == 200, rr.text
            return rr.json()["token"], rr.json()["user"]

        owner_tok, owner_user = _mk("owner")
        peer_tok, peer_user = _mk("peer")

        def _reg(tok, n, name):
            rdata = {"team_number": str(n), "team_name": name,
                     "first_name": name, "last_name": "X"}
            rfiles = {"profile_picture": ("p.png", _png_bytes(), "image/png")}
            rr = requests.post(f"{API}/events/by-code/{evt['code']}/register",
                               headers={"Authorization": f"Bearer {tok}"},
                               data=rdata, files=rfiles, timeout=120)
            assert rr.status_code == 200, rr.text
            return rr.json()

        owner_reg = _reg(owner_tok, 1, "Owner")
        _reg(peer_tok, 2, "Peer")

        ctx = {"event": evt, "owner_tok": owner_tok, "owner_reg": owner_reg,
               "owner_user": owner_user, "peer_user": peer_user}
        yield ctx
        requests.delete(f"{API}/events/{evt['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)

    def test_help_with_no_subs_returns_promptly(self, help_ctx):
        """With zero subscriptions, /help must still return quickly and report
        the new status. No exceptions in the dispatch path."""
        reg = help_ctx["owner_reg"]
        tok = help_ctx["owner_tok"]
        t0 = time.time()
        r = requests.post(f"{API}/registrations/{reg['id']}/help",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"status": "help", "message": "Flat tyre"}, timeout=15)
        dt = time.time() - t0
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"ok": True, "status": "help"}
        # background dispatch must not block — under 5 s on a healthy box
        assert dt < 5.0, f"help endpoint blocked for {dt:.2f}s"

        # clear so subsequent tests start from normal
        rc = requests.post(f"{API}/registrations/{reg['id']}/help",
                           headers={"Authorization": f"Bearer {tok}"},
                           json={"status": "clear"}, timeout=15)
        assert rc.status_code == 200
        assert rc.json()["status"] == "normal"

    def test_help_prunes_410_endpoint(self, help_ctx, admin_token, mongo):
        """Insert a sub pointing at an httpbin 410 endpoint targeted at the
        admin user. Trigger SOS (admins-only fan-out). After dispatch settles,
        the sub row should be pruned."""
        # Find admin user id
        admin_doc = mongo.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "id": 1})
        admin_id = admin_doc["id"]

        endpoint = "https://httpbin.org/status/410"

        # pywebpush requires a real P-256 public key (p256dh) to encrypt the
        # payload. Generate a valid uncompressed-point public key so the call
        # reaches the HTTP layer and we exercise the real 410-pruning branch.
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        priv = ec.generate_private_key(ec.SECP256R1())
        raw_pub = priv.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )  # 65 bytes, starts with 0x04
        p256dh = base64.urlsafe_b64encode(raw_pub).decode().rstrip("=")
        auth = base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("=")

        mongo.push_subscriptions.delete_many({"endpoint": endpoint})
        mongo.push_subscriptions.insert_one({
            "user_id": admin_id,
            "endpoint": endpoint,
            "keys": {"p256dh": p256dh, "auth": auth},
            "role": "admin",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        reg = help_ctx["owner_reg"]
        tok = help_ctx["owner_tok"]
        r = requests.post(f"{API}/registrations/{reg['id']}/help",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"status": "sos"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "sos"

        # Wait for background task to finish dispatching to httpbin
        pruned = False
        for _ in range(40):
            n = mongo.push_subscriptions.count_documents({"endpoint": endpoint})
            if n == 0:
                pruned = True
                break
            time.sleep(0.5)

        # Clear back to normal so we don't pollute fixture teardown
        requests.post(f"{API}/registrations/{reg['id']}/help",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"status": "clear"}, timeout=15)

        assert pruned, "410 endpoint was not pruned from push_subscriptions"

    def test_invalid_help_status_400(self, help_ctx):
        reg = help_ctx["owner_reg"]
        tok = help_ctx["owner_tok"]
        r = requests.post(f"{API}/registrations/{reg['id']}/help",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"status": "bogus"}, timeout=15)
        assert r.status_code == 400
