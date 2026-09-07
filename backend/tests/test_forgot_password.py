"""Test for FRONTEND_URL fix in POST /api/auth/forgot-password.

Verifies:
1. reset link uses FRONTEND_URL (public host) and NOT the internal cluster host
2. reset link is returned (or logged) starting with https://roadtrip-tracker-2.preview.emergentagent.com
3. Spoofed Origin header is IGNORED
4. End-to-end reset flow works; then admin password is restored to admin123
"""
import os
import re
import subprocess
import time
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PUBLIC = "https://roadtrip-tracker-2.preview.emergentagent.com"
INTERNAL_BAD = "cluster-3.preview.emergentcf.cloud"
ADMIN_EMAIL = "admin@roadtrip.com"
ADMIN_PASS = "admin123"


def _extract_link_from_logs(email: str) -> str | None:
    """Grab the latest reset link for `email` from backend logs."""
    try:
        out = subprocess.check_output(
            ["tail", "-n", "400", "/var/log/supervisor/backend.err.log"],
            stderr=subprocess.STDOUT, text=True,
        )
    except Exception:
        out = ""
    try:
        out2 = subprocess.check_output(
            ["tail", "-n", "400", "/var/log/supervisor/backend.out.log"],
            stderr=subprocess.STDOUT, text=True,
        )
        out = out + "\n" + out2
    except Exception:
        pass
    m = re.findall(
        rf"\[forgot-password\] Reset link for {re.escape(email)}: (\S+)",
        out,
    )
    return m[-1] if m else None


def test_forgot_password_uses_frontend_url():
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": ADMIN_EMAIL}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    time.sleep(0.5)
    link = body.get("reset_link") or _extract_link_from_logs(ADMIN_EMAIL)
    assert link, "No reset link found in response or backend logs"
    print(f"Reset link: {link}")
    assert link.startswith(f"{PUBLIC}/reset-password?token="), (
        f"Link does not start with public FRONTEND_URL: {link}"
    )
    assert INTERNAL_BAD not in link, f"Internal ingress host leaked into link: {link}"


def test_spoofed_origin_is_ignored():
    r = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": ADMIN_EMAIL},
        headers={"Origin": "https://evil.example.com",
                 "Referer": "https://evil.example.com/x"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    time.sleep(0.5)
    link = r.json().get("reset_link") or _extract_link_from_logs(ADMIN_EMAIL)
    assert link, "No reset link recovered"
    print(f"Spoofed-origin reset link: {link}")
    assert link.startswith(f"{PUBLIC}/reset-password?token="), link
    assert "evil.example.com" not in link, link
    assert INTERNAL_BAD not in link, link


def test_reset_link_page_not_403():
    # Trigger to obtain a fresh link
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": ADMIN_EMAIL}, timeout=30)
    assert r.status_code == 200
    time.sleep(0.5)
    link = r.json().get("reset_link") or _extract_link_from_logs(ADMIN_EMAIL)
    assert link
    # GET the public reset-password page — it should load (200), NOT 403.
    page = requests.get(link, timeout=30, allow_redirects=True)
    assert page.status_code == 200, f"Reset page returned {page.status_code}: {page.text[:200]}"


def test_end_to_end_reset_and_restore():
    new_pass = "TempReset_1234!"
    # 1. Request reset
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": ADMIN_EMAIL}, timeout=30)
    assert r.status_code == 200
    time.sleep(0.5)
    link = r.json().get("reset_link") or _extract_link_from_logs(ADMIN_EMAIL)
    assert link
    token = link.split("token=", 1)[1]

    # 2. Reset password
    r2 = requests.post(f"{BASE_URL}/api/auth/reset-password",
                       json={"token": token, "password": new_pass}, timeout=30)
    assert r2.status_code == 200, r2.text

    # 3. Login with new password
    r3 = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": new_pass}, timeout=30)
    assert r3.status_code == 200, r3.text

    # 4. Restore admin password back to admin123
    r4 = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                       json={"email": ADMIN_EMAIL}, timeout=30)
    assert r4.status_code == 200
    time.sleep(0.5)
    link2 = r4.json().get("reset_link") or _extract_link_from_logs(ADMIN_EMAIL)
    assert link2
    token2 = link2.split("token=", 1)[1]
    r5 = requests.post(f"{BASE_URL}/api/auth/reset-password",
                       json={"token": token2, "password": ADMIN_PASS}, timeout=30)
    assert r5.status_code == 200, r5.text

    # 5. Verify admin123 login works again
    r6 = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r6.status_code == 200, f"Failed to restore admin123: {r6.text}"
