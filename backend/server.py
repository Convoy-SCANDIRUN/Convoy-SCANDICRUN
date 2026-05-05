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
from datetime import datetime, timezone, timedelta
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
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

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

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class LocationIn(BaseModel):
    lat: float
    lng: float

class HelpIn(BaseModel):
    status: str  # "help", "sos", "clear"

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

# ---------- Events ----------
@api_router.post("/events")
async def create_event(
    name: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
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
        events = await db.events.find({"admin_id": user["id"]}, {"_id": 0}).to_list(1000)
    else:
        # participant: events they're registered for
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
    if not event or event["admin_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.events.delete_one({"id": event_id})
    await db.registrations.delete_many({"event_id": event_id})
    return {"ok": True}

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
async def delete_registration(reg_id: str, user: dict = Depends(require_admin)):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    event = await db.events.find_one({"id": reg["event_id"]})
    if not event or event["admin_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your event")
    await db.registrations.delete_one({"id": reg_id})
    return {"ok": True}

@api_router.post("/registrations/{reg_id}/location")
async def update_location(reg_id: str, body: LocationIn, user: dict = Depends(get_current_user)):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg or reg["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Registration not found")
    await db.registrations.update_one(
        {"id": reg_id},
        {"$set": {"lat": body.lat, "lng": body.lng,
                  "last_update": datetime.now(timezone.utc).isoformat()}},
    )
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
    is_admin_of_event = False
    if user["role"] == "admin":
        event = await db.events.find_one({"id": reg["event_id"]})
        is_admin_of_event = event and event["admin_id"] == user["id"]
    if not (is_owner or is_admin_of_event):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.registrations.update_one(
        {"id": reg_id},
        {"$set": {"help_status": new_status,
                  "last_update": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "status": new_status}

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
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
