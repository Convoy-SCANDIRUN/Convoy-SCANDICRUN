from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import secrets
import string
import requests
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta, date as date_cls
from math import radians, sin, cos, atan2, sqrt
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Form, Depends, Query, Header
from fastapi.responses import Response as FastAPIResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ---------- Setup ----------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
APP_NAME = os.environ.get("APP_NAME", "roadtrip-tracker")

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
storage_key: Optional[str] = None

# ---------- Auth helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ---------- Object storage ----------
def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    last_err = None
    # Retry transient upstream object-store errors (5xx) up to 3 times
    for attempt in range(3):
        try:
            resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                                headers={"X-Storage-Key": key, "Content-Type": content_type},
                                data=data, timeout=120)
            if resp.status_code >= 500 and attempt < 2:
                last_err = f"upstream {resp.status_code}"
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_err = str(e)
            if attempt == 2:
                raise
    raise HTTPException(status_code=502, detail=f"Storage upload failed: {last_err}")

def get_object(path: str) -> tuple:
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

def upload_file(file_bytes: bytes, content_type: str, ext: str, owner_id: str) -> str:
    path = f"{APP_NAME}/uploads/{owner_id}/{uuid.uuid4()}.{ext}"
    result = put_object(path, file_bytes, content_type or "application/octet-stream")
    return result["path"]

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    role: str = "participant"  # "admin" or "participant"
    name: Optional[str] = None
    admin_code: Optional[str] = None  # required when role == "admin"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class LocationIn(BaseModel):
    lat: float
    lng: float

class HelpIn(BaseModel):
    status: str  # "help", "sos", "clear"
    message: Optional[str] = None

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str
    password: str

# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True,
                        secure=True, samesite="none", max_age=7 * 24 * 3600, path="/")

def gen_event_code() -> str:
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))

# ---------- Auth routes ----------
@api_router.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.role not in ("admin", "participant"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if body.role == "admin":
        expected = os.environ.get("ADMIN_REGISTRATION_PASSWORD")
        if not expected or body.admin_code != expected:
            raise HTTPException(status_code=403, detail="Invalid administrator code")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name or email.split("@")[0],
        "role": body.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "token": token}

@api_router.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "token": token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api_router.delete("/auth/me")
async def delete_me(response: Response, user: dict = Depends(get_current_user)):
    """Delete the current user's account, all their registrations and any
    pending password-reset tokens. Irreversible."""
    await db.registrations.delete_many({"user_id": user["id"]})
    await db.password_reset_tokens.delete_many({"user_id": user["id"]})
    await db.users.delete_one({"id": user["id"]})
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

# ---------- Password Reset ----------
@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn, request: Request):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    # Always return ok (don't leak which emails are registered)
    if not user:
        logger.info(f"[forgot-password] No account found for {email}")
        return {"ok": True}

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "email": email,
        "expires_at": expires_at,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Build a frontend reset link based on the request origin
    origin = request.headers.get("origin") or request.headers.get("referer", "").rstrip("/")
    reset_link = f"{origin}/reset-password?token={token}" if origin else f"/reset-password?token={token}"
    logger.info(f"[forgot-password] Reset link for {email}: {reset_link}")

    # NOTE: No email provider wired yet — return the link directly so users
    # can complete reset during MVP/testing. Replace this with email sending
    # once an email integration (Resend/SendGrid) is added.
    return {"ok": True, "reset_link": reset_link}

@api_router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    record = await db.password_reset_tokens.find_one({"token": body.token})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if record.get("used"):
        raise HTTPException(status_code=400, detail="This reset link has already been used")
    expires_at = record["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link has expired")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": hash_password(body.password)}},
    )
    await db.password_reset_tokens.update_one(
        {"token": body.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}

# ---------- Events ----------
@api_router.post("/events")
async def create_event(
    name: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    emergency_phone: str = Form(""),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(require_admin),
):
    image_path = None
    if image:
        data = await image.read()
        ext = (image.filename or "img.jpg").split(".")[-1].lower()
        image_path = upload_file(data, image.content_type or "image/jpeg", ext, user["id"])
    event = {
        "id": str(uuid.uuid4()),
        "name": name,
        "code": gen_event_code(),
        "start_date": start_date,
        "end_date": end_date,
        "emergency_phone": emergency_phone or "",
        "image_path": image_path,
        "admin_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.events.insert_one(event)
    event.pop("_id", None)
    return event

@api_router.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        # All admins have full access to all events
        events = await db.events.find({}, {"_id": 0}).to_list(1000)
    else:
        regs = await db.registrations.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
        event_ids = [r["event_id"] for r in regs]
        events = await db.events.find({"id": {"$in": event_ids}}, {"_id": 0}).to_list(1000)
    return events

@api_router.get("/events/{event_id}")
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(require_admin)):
    event = await db.events.find_one({"id": event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.events.delete_one({"id": event_id})
    await db.registrations.delete_many({"event_id": event_id})
    return {"ok": True}

@api_router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    name: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    emergency_phone: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(require_admin),
):
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    update: dict = {}
    if name is not None:
        update["name"] = name
    if start_date is not None:
        update["start_date"] = start_date
    if end_date is not None:
        update["end_date"] = end_date
    if emergency_phone is not None:
        update["emergency_phone"] = emergency_phone
    if image is not None and image.filename:
        data = await image.read()
        ext = (image.filename or "img.jpg").split(".")[-1].lower()
        update["image_path"] = upload_file(data, image.content_type or "image/jpeg", ext, user["id"])
    if not update:
        return event
    await db.events.update_one({"id": event_id}, {"$set": update})
    fresh = await db.events.find_one({"id": event_id}, {"_id": 0})
    return fresh

@api_router.get("/events/by-code/{code}")
async def event_by_code(code: str, user: dict = Depends(get_current_user)):
    event = await db.events.find_one({"code": code.upper()}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event code not found")
    return event

# ---------- Registrations ----------
@api_router.post("/events/by-code/{code}/register")
async def register_participant(
    code: str,
    team_number: str = Form(...),
    team_name: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    profile_picture: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    event = await db.events.find_one({"code": code.upper()})
    if not event:
        raise HTTPException(status_code=404, detail="Event code not found")
    existing = await db.registrations.find_one({"event_id": event["id"], "user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered for this event")

    pic_path = None
    if profile_picture:
        data = await profile_picture.read()
        ext = (profile_picture.filename or "img.jpg").split(".")[-1].lower()
        pic_path = upload_file(data, profile_picture.content_type or "image/jpeg", ext, user["id"])

    reg = {
        "id": str(uuid.uuid4()),
        "event_id": event["id"],
        "user_id": user["id"],
        "team_number": team_number,
        "team_name": team_name,
        "first_name": first_name,
        "last_name": last_name,
        "profile_picture_path": pic_path,
        "lat": None,
        "lng": None,
        "help_status": "normal",  # normal / help / sos
        "last_update": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.registrations.insert_one(reg)
    reg.pop("_id", None)
    return reg

@api_router.get("/events/{event_id}/registrations")
async def list_registrations(event_id: str, user: dict = Depends(get_current_user)):
    regs = await db.registrations.find({"event_id": event_id}, {"_id": 0}).to_list(2000)
    return regs

@api_router.get("/events/{event_id}/my-registration")
async def my_registration(event_id: str, user: dict = Depends(get_current_user)):
    reg = await db.registrations.find_one(
        {"event_id": event_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not reg:
        raise HTTPException(status_code=404, detail="Not registered")
    return reg

@api_router.delete("/registrations/{reg_id}")
async def delete_registration(reg_id: str, user: dict = Depends(get_current_user)):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    is_owner = reg["user_id"] == user["id"]
    is_admin = user.get("role") == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.registrations.delete_one({"id": reg_id})
    return {"ok": True}

@api_router.patch("/registrations/{reg_id}")
async def update_registration(
    reg_id: str,
    team_number: Optional[str] = Form(None),
    team_name: Optional[str] = Form(None),
    first_name: Optional[str] = Form(None),
    last_name: Optional[str] = Form(None),
    profile_picture: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    reg = await db.registrations.find_one({"id": reg_id}, {"_id": 0})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    is_owner = reg["user_id"] == user["id"]
    is_admin = user.get("role") == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    update: dict = {}
    if team_number is not None:
        update["team_number"] = team_number
    if team_name is not None:
        update["team_name"] = team_name
    if first_name is not None:
        update["first_name"] = first_name
    if last_name is not None:
        update["last_name"] = last_name
    if profile_picture is not None and profile_picture.filename:
        data = await profile_picture.read()
        ext = (profile_picture.filename or "img.jpg").split(".")[-1].lower()
        update["profile_picture_path"] = upload_file(data, profile_picture.content_type or "image/jpeg", ext, user["id"])
    if not update:
        return reg
    await db.registrations.update_one({"id": reg_id}, {"$set": update})
    fresh = await db.registrations.find_one({"id": reg_id}, {"_id": 0})
    return fresh

@api_router.post("/registrations/{reg_id}/location")
async def update_location(reg_id: str, body: LocationIn, user: dict = Depends(get_current_user)):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg or reg["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Registration not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.registrations.update_one(
        {"id": reg_id},
        {"$set": {"lat": body.lat, "lng": body.lng, "last_update": now_iso}},
    )
    # Append a track point so we can compute distance / duration / avg speed
    # for the daily and event summaries. _id excluded everywhere on read.
    await db.tracks.insert_one({
        "id": str(uuid.uuid4()),
        "registration_id": reg_id,
        "event_id": reg["event_id"],
        "user_id": reg["user_id"],
        "lat": body.lat,
        "lng": body.lng,
        "ts": now_iso,
    })
    return {"ok": True}

@api_router.post("/registrations/{reg_id}/help")
async def update_help(reg_id: str, body: HelpIn, user: dict = Depends(get_current_user)):
    if body.status not in ("normal", "help", "sos", "clear"):
        raise HTTPException(status_code=400, detail="Invalid status")
    new_status = "normal" if body.status == "clear" else body.status
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    is_owner = reg["user_id"] == user["id"]
    is_admin = user.get("role") == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {
        "help_status": new_status,
        "help_message": body.message or "" if new_status != "normal" else "",
        "last_update": datetime.now(timezone.utc).isoformat(),
    }
    await db.registrations.update_one({"id": reg_id}, {"$set": update})
    return {"ok": True, "status": new_status}

# ---------- Summaries / reports ----------

def _haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Great-circle distance between two lat/lng pairs, in kilometres."""
    R = 6371.0088
    phi1 = radians(a_lat)
    phi2 = radians(b_lat)
    d_phi = radians(b_lat - a_lat)
    d_lam = radians(b_lng - a_lng)
    h = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lam / 2) ** 2
    return 2 * R * atan2(sqrt(h), sqrt(1 - h))


def _stats_from_points(points: list) -> dict:
    """Compute distance/duration/speed metrics from a list of track points.

    A point is `{lat, lng, ts}` with `ts` as an ISO-8601 string. Implausible
    GPS glitches (segments faster than 250 km/h AND shorter than 5 km) are
    dropped so a single bad fix can't dominate the totals.
    """
    pts = [p for p in points if p.get("lat") is not None and p.get("lng") is not None and p.get("ts")]
    pts.sort(key=lambda p: p["ts"])
    if len(pts) < 2:
        return {
            "points": len(pts),
            "distance_km": 0.0,
            "duration_min": 0.0,
            "moving_min": 0.0,
            "stopped_min": 0.0,
            "avg_kmh": 0.0,
            "max_kmh": 0.0,
            "first_ts": pts[0]["ts"] if pts else None,
            "last_ts": pts[-1]["ts"] if pts else None,
            "route": [[p["lat"], p["lng"]] for p in pts],
        }

    distance_km = 0.0
    moving_sec = 0.0
    stopped_sec = 0.0
    max_kmh = 0.0
    for a, b in zip(pts, pts[1:]):
        try:
            ta = datetime.fromisoformat(a["ts"].replace("Z", "+00:00"))
            tb = datetime.fromisoformat(b["ts"].replace("Z", "+00:00"))
        except ValueError:
            continue
        dt_sec = max(0.0, (tb - ta).total_seconds())
        if dt_sec <= 0:
            continue
        leg_km = _haversine_km(a["lat"], a["lng"], b["lat"], b["lng"])
        kmh = (leg_km / (dt_sec / 3600.0)) if dt_sec > 0 else 0.0
        # Drop clear GPS glitches
        if kmh > 250 and leg_km < 5:
            continue
        distance_km += leg_km
        if kmh < 3.0 or leg_km < 0.01:
            stopped_sec += dt_sec
        else:
            moving_sec += dt_sec
            if kmh > max_kmh:
                max_kmh = kmh

    duration_sec = (
        datetime.fromisoformat(pts[-1]["ts"].replace("Z", "+00:00"))
        - datetime.fromisoformat(pts[0]["ts"].replace("Z", "+00:00"))
    ).total_seconds()
    avg_kmh = (distance_km / (moving_sec / 3600.0)) if moving_sec > 0 else 0.0
    return {
        "points": len(pts),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_sec / 60.0, 1),
        "moving_min": round(moving_sec / 60.0, 1),
        "stopped_min": round(stopped_sec / 60.0, 1),
        "avg_kmh": round(avg_kmh, 1),
        "max_kmh": round(max_kmh, 1),
        "first_ts": pts[0]["ts"],
        "last_ts": pts[-1]["ts"],
        "route": [[p["lat"], p["lng"]] for p in pts],
    }


async def _load_tracks(registration_id: str, day: Optional[str] = None) -> list:
    """Fetch ordered track points for a registration, optionally restricted to a single UTC day."""
    q = {"registration_id": registration_id}
    if day:
        q["ts"] = {"$gte": f"{day}T00:00:00", "$lt": f"{day}T23:59:59.999999"}
    cur = db.tracks.find(q, {"_id": 0, "lat": 1, "lng": 1, "ts": 1}).sort("ts", 1)
    return [p async for p in cur]


def _event_day_range(event: dict) -> list:
    """List of ISO-date strings between event.start_date and event.end_date inclusive."""
    try:
        s = date_cls.fromisoformat(event["start_date"])
        e = date_cls.fromisoformat(event["end_date"])
    except (KeyError, ValueError):
        return []
    if e < s:
        return []
    out = []
    d = s
    while d <= e:
        out.append(d.isoformat())
        d = d + timedelta(days=1)
    return out


@api_router.get("/registrations/{reg_id}/summary")
async def registration_summary(reg_id: str, user: dict = Depends(get_current_user)):
    """Per-participant report: total + per-day stats restricted to the event window.

    Accessible by the owning participant and by admins.
    """
    reg = await db.registrations.find_one({"id": reg_id}, {"_id": 0})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    is_owner = reg["user_id"] == user["id"]
    is_admin = user.get("role") == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")
    event = await db.events.find_one({"id": reg["event_id"]}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    days = _event_day_range(event)

    all_pts = await _load_tracks(reg_id)
    total = _stats_from_points(all_pts)

    daily = []
    for d in days:
        pts = await _load_tracks(reg_id, d)
        daily.append({"date": d, **_stats_from_points(pts)})

    return {
        "registration": {
            "id": reg["id"],
            "team_number": reg.get("team_number"),
            "team_name": reg.get("team_name"),
            "first_name": reg.get("first_name"),
            "last_name": reg.get("last_name"),
        },
        "event": {
            "id": event["id"],
            "name": event.get("name"),
            "start_date": event.get("start_date"),
            "end_date": event.get("end_date"),
        },
        "total": total,
        "daily": daily,
    }


@api_router.get("/events/{event_id}/summary")
async def event_summary(event_id: str, user: dict = Depends(get_current_user)):
    """Admin-only event-wide leaderboard with total + per-day per-team stats."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    regs = [r async for r in db.registrations.find({"event_id": event_id}, {"_id": 0})]
    days = _event_day_range(event)

    teams = []
    for r in regs:
        rid = r["id"]
        all_pts = await _load_tracks(rid)
        total = _stats_from_points(all_pts)
        daily = []
        for d in days:
            pts = await _load_tracks(rid, d)
            daily.append({"date": d, **_stats_from_points(pts)})
        teams.append({
            "registration_id": rid,
            "team_number": r.get("team_number"),
            "team_name": r.get("team_name"),
            "first_name": r.get("first_name"),
            "last_name": r.get("last_name"),
            "total": total,
            "daily": daily,
        })
    # Leaderboard sort: most distance first
    teams.sort(key=lambda t: t["total"]["distance_km"], reverse=True)
    return {
        "event": {
            "id": event["id"],
            "name": event.get("name"),
            "start_date": event.get("start_date"),
            "end_date": event.get("end_date"),
        },
        "days": days,
        "teams": teams,
    }


# ---------- Files ----------
@api_router.get("/files/{path:path}")
async def download_file(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return FastAPIResponse(content=data, media_type=content_type)

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.events.create_index("id", unique=True)
    await db.events.create_index("code", unique=True)
    await db.registrations.create_index("id", unique=True)
    await db.registrations.create_index([("event_id", 1), ("user_id", 1)], unique=True)
    await db.password_reset_tokens.create_index("token", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@roadtrip.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@api_router.get("/")
async def root():
    return {"message": "Road Trip Tracker API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
