from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import json
import asyncio
import logging
import bcrypt
import jwt
import resend
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Set

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


# ----- Setup -----
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Brute force config
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

app = FastAPI(title="Queue Management System")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ----- Helpers -----
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


# ----- WebSocket Manager -----
class WSManager:
    def __init__(self):
        # channel -> set of websockets. channels: "queue:{id}", "user:{id}", "admin"
        self.channels: Dict[str, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, channel: str):
        await ws.accept()
        self.channels.setdefault(channel, set()).add(ws)

    def disconnect(self, ws: WebSocket, channel: str):
        if channel in self.channels:
            self.channels[channel].discard(ws)
            if not self.channels[channel]:
                self.channels.pop(channel, None)

    async def broadcast(self, channel: str, payload: dict):
        if channel not in self.channels:
            return
        message = json.dumps(payload, default=str)
        dead = []
        for ws in list(self.channels[channel]):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.channels[channel].discard(ws)

ws_manager = WSManager()

async def broadcast_queue_update(queue_id: str, event: str, data: dict | None = None):
    payload = {"event": event, "queue_id": queue_id, "data": data or {},
               "ts": datetime.now(timezone.utc).isoformat()}
    await ws_manager.broadcast(f"queue:{queue_id}", payload)
    await ws_manager.broadcast("admin", payload)

async def broadcast_user_update(user_id: str, event: str, data: dict | None = None):
    payload = {"event": event, "data": data or {},
               "ts": datetime.now(timezone.utc).isoformat()}
    await ws_manager.broadcast(f"user:{user_id}", payload)


# ----- Email -----
def _send_email_sync(to: str, subject: str, html: str) -> Optional[str]:
    if not RESEND_API_KEY:
        logger = logging.getLogger("email")
        logger.info(f"[MOCK EMAIL] to={to} subject={subject!r}\n{html[:200]}…")
        return None
    try:
        r = resend.Emails.send({"from": SENDER_EMAIL, "to": [to],
                                "subject": subject, "html": html})
        return r.get("id") if isinstance(r, dict) else None
    except Exception as e:
        logging.getLogger("email").error(f"Resend send failed: {e}")
        return None

async def send_email(to: str, subject: str, html: str):
    if not to:
        return
    await asyncio.to_thread(_send_email_sync, to, subject, html)

def _email_template(title: str, body_html: str, accent: str = "#002FA7") -> str:
    return f"""
    <table style="font-family:'IBM Plex Sans',Arial,sans-serif;max-width:520px;margin:0 auto;
                  background:#fff;border:1px solid #E4E4E7;padding:32px;color:#0A0A0A">
      <tr><td>
        <div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;
                    color:#52525B;font-weight:700;margin-bottom:24px">QueueFlow</div>
        <div style="font-size:32px;font-weight:900;letter-spacing:-0.04em;line-height:1.05;
                    margin-bottom:16px">{title}</div>
        {body_html}
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E4E4E7;
                    font-size:11px;color:#A1A1AA;letter-spacing:0.2em;text-transform:uppercase;
                    font-weight:700">QueueFlow · automated message</div>
      </td></tr>
    </table>
    """


# ----- Brute force -----
async def check_lockout(email: str, ip: str) -> Optional[int]:
    """Return remaining lockout seconds if locked, else None.
    Keyed by email only — robust against IP rotation behind load balancers."""
    key = email
    rec = await db.login_attempts.find_one({"key": key})
    if not rec:
        return None
    locked_until = rec.get("locked_until")
    if locked_until:
        try:
            t = datetime.fromisoformat(locked_until)
            now = datetime.now(timezone.utc)
            if t > now:
                return int((t - now).total_seconds())
        except Exception:
            pass
    return None

async def record_failed_attempt(email: str, ip: str):
    key = email
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"key": key})
    window_start = now - timedelta(minutes=LOCKOUT_MINUTES)
    count = 1
    if rec and rec.get("first_at"):
        first = datetime.fromisoformat(rec["first_at"])
        if first >= window_start:
            count = (rec.get("count", 0) or 0) + 1
        else:
            await db.login_attempts.update_one({"key": key},
                {"$set": {"first_at": now.isoformat(), "count": 1, "locked_until": None}}, upsert=True)
            return
    update = {"key": key, "count": count, "first_at": rec["first_at"] if rec else now.isoformat()}
    if count >= MAX_FAILED_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one({"key": key}, {"$set": update}, upsert=True)

async def clear_attempts(email: str, ip: str):
    await db.login_attempts.delete_one({"key": email})

def create_access_token(uid: str, email: str, role: str) -> str:
    payload = {"sub": uid, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(hours=24), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(uid: str) -> str:
    payload = {"sub": uid, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=86400, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        if user.get("blocked"):
            raise HTTPException(403, "Account blocked")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user


# ----- Models -----
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class QueueIn(BaseModel):
    name: str
    description: Optional[str] = ""
    avg_service_minutes: int = 5
    branch: Optional[str] = "Main"

class ServiceIn(BaseModel):
    name: str
    description: Optional[str] = ""
    avg_service_minutes: int = 5

class CounterIn(BaseModel):
    name: str
    queue_id: str
    service_ids: List[str] = []

class CallActionIn(BaseModel):
    counter_id: Optional[str] = None

class JoinIn(BaseModel):
    service_id: Optional[str] = None


# ----- Auth Endpoints -----
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": email, "name": payload.name.strip(),
        "phone": payload.phone or "",
        "password_hash": hash_password(payload.password),
        "role": "user", "blocked": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(uid, email, "user")
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return {"user": doc, "access_token": access}

@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower().strip()
    ip = (request.client.host if request.client else "0.0.0.0") or "0.0.0.0"
    locked = await check_lockout(email, ip)
    if locked:
        raise HTTPException(429, f"Too many failed attempts. Try again in {locked//60+1} minute(s).")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_attempt(email, ip)
        raise HTTPException(401, "Invalid email or password")
    if user.get("blocked"):
        raise HTTPException(403, "Account blocked. Contact admin.")
    await clear_attempts(email, ip)
    access = create_access_token(user["id"], email, user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----- Queues -----
async def get_rolling_avg_minutes(queue_id: str, default: int) -> float:
    """Average wait minutes from last 20 completed tokens (called_at - created_at)."""
    cursor = db.tokens.find(
        {"queue_id": queue_id, "called_at": {"$ne": None}},
        {"_id": 0, "created_at": 1, "called_at": 1}
    ).sort("called_at", -1).limit(20)
    waits = []
    async for t in cursor:
        try:
            ca = datetime.fromisoformat(t["called_at"])
            cr = datetime.fromisoformat(t["created_at"])
            mins = (ca - cr).total_seconds() / 60
            if mins >= 0:
                waits.append(mins)
        except Exception:
            pass
    if len(waits) < 5:
        return float(default)
    return round(sum(waits) / len(waits), 1)

@api.get("/queues")
async def list_queues(user: dict = Depends(get_current_user)):
    queues = await db.queues.find({"active": True}, {"_id": 0}).to_list(500)
    for q in queues:
        q.setdefault("services", [])
        waiting = await db.tokens.count_documents({"queue_id": q["id"], "status": "waiting"})
        serving = await db.tokens.count_documents({"queue_id": q["id"], "status": "serving"})
        rolling = await get_rolling_avg_minutes(q["id"], q.get("avg_service_minutes", 5))
        q["waiting_count"] = waiting
        q["serving_count"] = serving
        q["predicted_avg_minutes"] = rolling
        q["estimated_wait_minutes"] = round(waiting * rolling, 1)
    return queues

@api.post("/queues")
async def create_queue(payload: QueueIn, admin: dict = Depends(require_admin)):
    qid = str(uuid.uuid4())
    doc = {
        "id": qid, "name": payload.name, "description": payload.description or "",
        "avg_service_minutes": payload.avg_service_minutes,
        "branch": payload.branch or "Main",
        "prefix": "".join([w[0] for w in payload.name.split()[:2]]).upper() or "Q",
        "active": True, "next_number": 1,
        "services": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.queues.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.post("/queues/{queue_id}/services")
async def add_service(queue_id: str, payload: ServiceIn, admin: dict = Depends(require_admin)):
    queue = await db.queues.find_one({"id": queue_id, "active": True})
    if not queue:
        raise HTTPException(404, "Queue not found")
    svc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "description": payload.description or "",
        "avg_service_minutes": payload.avg_service_minutes,
    }
    await db.queues.update_one({"id": queue_id}, {"$push": {"services": svc}})
    await broadcast_queue_update(queue_id, "service_added", {"service": svc})
    return svc

@api.delete("/queues/{queue_id}/services/{service_id}")
async def remove_service(queue_id: str, service_id: str, admin: dict = Depends(require_admin)):
    await db.queues.update_one(
        {"id": queue_id},
        {"$pull": {"services": {"id": service_id}}}
    )
    await broadcast_queue_update(queue_id, "service_removed", {"service_id": service_id})
    return {"ok": True}

@api.put("/queues/{queue_id}")
async def update_queue(queue_id: str, payload: QueueIn, admin: dict = Depends(require_admin)):
    res = await db.queues.update_one({"id": queue_id}, {"$set": {
        "name": payload.name, "description": payload.description or "",
        "avg_service_minutes": payload.avg_service_minutes,
        "branch": payload.branch or "Main",
    }})
    if res.matched_count == 0:
        raise HTTPException(404, "Queue not found")
    q = await db.queues.find_one({"id": queue_id}, {"_id": 0})
    return q

@api.delete("/queues/{queue_id}")
async def delete_queue(queue_id: str, admin: dict = Depends(require_admin)):
    await db.queues.update_one({"id": queue_id}, {"$set": {"active": False}})
    return {"ok": True}


# ----- Counters -----
@api.get("/counters")
async def list_counters(user: dict = Depends(get_current_user)):
    counters = await db.counters.find({}, {"_id": 0}).to_list(500)
    return counters

@api.post("/counters")
async def create_counter(payload: CounterIn, admin: dict = Depends(require_admin)):
    cid = str(uuid.uuid4())
    doc = {
        "id": cid, "name": payload.name, "queue_id": payload.queue_id,
        "service_ids": payload.service_ids or [],
        "current_token_id": None, "status": "idle",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.counters.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/counters/{counter_id}")
async def update_counter(counter_id: str, payload: CounterIn,
                         admin: dict = Depends(require_admin)):
    res = await db.counters.update_one({"id": counter_id}, {"$set": {
        "name": payload.name,
        "queue_id": payload.queue_id,
        "service_ids": payload.service_ids or [],
    }})
    if res.matched_count == 0:
        raise HTTPException(404, "Counter not found")
    return await db.counters.find_one({"id": counter_id}, {"_id": 0})

@api.delete("/counters/{counter_id}")
async def delete_counter(counter_id: str, admin: dict = Depends(require_admin)):
    await db.counters.delete_one({"id": counter_id})
    return {"ok": True}


# ----- Tokens -----
@api.post("/queues/{queue_id}/join")
async def join_queue(queue_id: str, payload: JoinIn | None = None,
                     user: dict = Depends(get_current_user)):
    queue = await db.queues.find_one({"id": queue_id, "active": True})
    if not queue:
        raise HTTPException(404, "Queue not found")
    services = queue.get("services", []) or []
    service = None
    service_id = payload.service_id if payload else None
    if services:
        if not service_id:
            raise HTTPException(400, "Please select a service")
        service = next((s for s in services if s["id"] == service_id), None)
        if not service:
            raise HTTPException(400, "Invalid service selection")
    # prevent duplicate active token in same queue
    existing = await db.tokens.find_one({
        "queue_id": queue_id, "user_id": user["id"],
        "status": {"$in": ["waiting", "serving", "hold"]},
    })
    if existing:
        raise HTTPException(400, "You already have an active token in this queue")
    res = await db.queues.find_one_and_update(
        {"id": queue_id}, {"$inc": {"next_number": 1}}
    )
    number = res["next_number"]
    token_code = f"{queue['prefix']}-{number:03d}"
    tid = str(uuid.uuid4())
    doc = {
        "id": tid, "code": token_code, "number": number,
        "queue_id": queue_id, "queue_name": queue["name"],
        "user_id": user["id"], "user_name": user["name"],
        "service_id": service["id"] if service else None,
        "service_name": service["name"] if service else None,
        "status": "waiting", "counter_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "called_at": None, "completed_at": None,
    }
    await db.tokens.insert_one(doc)
    doc.pop("_id", None)
    await broadcast_queue_update(queue_id, "token_joined", {"token": doc})
    return doc

@api.get("/tokens/my")
async def my_tokens(user: dict = Depends(get_current_user)):
    tokens = await db.tokens.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for t in tokens:
        if t["status"] == "waiting":
            ahead = await db.tokens.count_documents({
                "queue_id": t["queue_id"], "status": "waiting",
                "number": {"$lt": t["number"]}
            })
            t["position"] = ahead + 1
            queue = await db.queues.find_one({"id": t["queue_id"]}, {"_id": 0})
            avg = await get_rolling_avg_minutes(t["queue_id"], queue.get("avg_service_minutes", 5) if queue else 5)
            t["estimated_wait_minutes"] = round(ahead * avg, 1)
            # Trigger position-3 email once
            if t["position"] <= 3 and not t.get("notified_near"):
                await db.tokens.update_one({"id": t["id"]}, {"$set": {"notified_near": True}})
                if user.get("email"):
                    asyncio.create_task(send_email(
                        user["email"],
                        f"You're up next — {t['code']}",
                        _email_template(
                            f"You're #{t['position']} in line.",
                            f"<p style='font-size:15px;line-height:1.6;color:#52525B'>"
                            f"Your token <b style='color:#0A0A0A;font-family:monospace'>{t['code']}</b> "
                            f"for <b>{t['queue_name']}</b> is approaching. Please be ready.</p>"
                            f"<div style='font-family:monospace;font-size:48px;font-weight:900;"
                            f"letter-spacing:-0.04em;color:#002FA7;margin:24px 0'>{t['code']}</div>"
                        )
                    ))
        else:
            t["position"] = 0
            t["estimated_wait_minutes"] = 0
    return tokens

@api.post("/tokens/{token_id}/cancel")
async def cancel_token(token_id: str, user: dict = Depends(get_current_user)):
    token = await db.tokens.find_one({"id": token_id})
    if not token:
        raise HTTPException(404, "Token not found")
    if token["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Not authorized")
    if token["status"] not in ["waiting", "hold"]:
        raise HTTPException(400, "Cannot cancel this token")
    await db.tokens.update_one({"id": token_id}, {"$set": {
        "status": "cancelled",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }})
    await broadcast_queue_update(token["queue_id"], "token_cancelled", {"token_id": token_id})
    return {"ok": True}

@api.get("/tokens")
async def list_tokens(queue_id: Optional[str] = None, status: Optional[str] = None,
                      admin: dict = Depends(require_admin)):
    q = {}
    if queue_id: q["queue_id"] = queue_id
    if status: q["status"] = status
    tokens = await db.tokens.find(q, {"_id": 0}).sort("number", 1).to_list(500)
    return tokens

@api.post("/queues/{queue_id}/call-next")
async def call_next(queue_id: str, payload: CallActionIn, admin: dict = Depends(require_admin)):
    # Build base filter
    token_filter = {"queue_id": queue_id, "status": "waiting"}
    # If counter specified AND counter has service_ids restriction, filter tokens
    if payload.counter_id:
        counter = await db.counters.find_one({"id": payload.counter_id}, {"_id": 0})
        if counter and counter.get("service_ids"):
            token_filter["service_id"] = {"$in": counter["service_ids"]}
    next_token = await db.tokens.find_one(
        token_filter, {"_id": 0}, sort=[("number", 1)]
    )
    if not next_token:
        raise HTTPException(404, "No waiting tokens for this counter's services")
    if payload.counter_id:
        await db.tokens.update_many(
            {"counter_id": payload.counter_id, "status": "serving"},
            {"$set": {"status": "completed",
                      "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
    await db.tokens.update_one(
        {"id": next_token["id"]},
        {"$set": {"status": "serving", "counter_id": payload.counter_id,
                  "called_at": datetime.now(timezone.utc).isoformat()}}
    )
    counter_name = None
    if payload.counter_id:
        await db.counters.update_one(
            {"id": payload.counter_id},
            {"$set": {"current_token_id": next_token["id"], "status": "busy"}}
        )
        c = await db.counters.find_one({"id": payload.counter_id}, {"_id": 0})
        counter_name = c["name"] if c else None
    updated = await db.tokens.find_one({"id": next_token["id"]}, {"_id": 0})
    # Broadcasts
    await broadcast_queue_update(queue_id, "token_called", {"token": updated, "counter_name": counter_name})
    await broadcast_user_update(updated["user_id"], "token_called",
                                {"token": updated, "counter_name": counter_name})
    # Email called notification
    cust = await db.users.find_one({"id": updated["user_id"]})
    if cust and cust.get("email"):
        asyncio.create_task(send_email(
            cust["email"],
            f"It's your turn — {updated['code']}",
            _email_template(
                "Your turn has arrived.",
                f"<p style='font-size:15px;line-height:1.6;color:#52525B'>"
                f"Please proceed to <b style='color:#0A0A0A'>"
                f"{('counter ' + counter_name) if counter_name else 'the service desk'}</b>.</p>"
                f"<div style='font-family:monospace;font-size:48px;font-weight:900;"
                f"letter-spacing:-0.04em;color:#10B981;margin:24px 0'>{updated['code']}</div>"
                f"<p style='font-size:13px;color:#A1A1AA'>Queue: {updated['queue_name']}</p>"
            )
        ))
    return updated

@api.post("/tokens/{token_id}/skip")
async def skip_token(token_id: str, admin: dict = Depends(require_admin)):
    token = await db.tokens.find_one({"id": token_id})
    if not token:
        raise HTTPException(404, "Token not found")
    await db.tokens.update_one({"id": token_id}, {"$set": {
        "status": "skipped",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }})
    await broadcast_queue_update(token["queue_id"], "token_skipped", {"token_id": token_id})
    return {"ok": True}

@api.post("/tokens/{token_id}/hold")
async def hold_token(token_id: str, admin: dict = Depends(require_admin)):
    token = await db.tokens.find_one({"id": token_id})
    if not token:
        raise HTTPException(404, "Token not found")
    await db.tokens.update_one({"id": token_id}, {"$set": {"status": "hold"}})
    await broadcast_queue_update(token["queue_id"], "token_hold", {"token_id": token_id})
    return {"ok": True}

@api.post("/tokens/{token_id}/recall")
async def recall_token(token_id: str, admin: dict = Depends(require_admin)):
    token = await db.tokens.find_one({"id": token_id})
    if not token:
        raise HTTPException(404, "Token not found")
    await db.tokens.update_one({"id": token_id}, {"$set": {"status": "waiting", "notified_near": False}})
    await broadcast_queue_update(token["queue_id"], "token_recalled", {"token_id": token_id})
    return {"ok": True}

@api.post("/tokens/{token_id}/complete")
async def complete_token(token_id: str, admin: dict = Depends(require_admin)):
    await db.tokens.update_one({"id": token_id}, {"$set": {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }})
    token = await db.tokens.find_one({"id": token_id})
    if token and token.get("counter_id"):
        await db.counters.update_one(
            {"id": token["counter_id"]},
            {"$set": {"current_token_id": None, "status": "idle"}}
        )
    if token:
        await broadcast_queue_update(token["queue_id"], "token_completed", {"token_id": token_id})
    return {"ok": True}


# ----- Public Display -----
@api.get("/display/{queue_id}")
async def public_display(queue_id: str):
    queue = await db.queues.find_one({"id": queue_id}, {"_id": 0})
    if not queue:
        raise HTTPException(404, "Queue not found")
    serving = await db.tokens.find(
        {"queue_id": queue_id, "status": "serving"}, {"_id": 0}
    ).sort("called_at", -1).to_list(10)
    waiting = await db.tokens.find(
        {"queue_id": queue_id, "status": "waiting"}, {"_id": 0}
    ).sort("number", 1).limit(8).to_list(8)
    counters = await db.counters.find({"queue_id": queue_id}, {"_id": 0}).to_list(50)
    # attach token to counter
    for c in counters:
        if c.get("current_token_id"):
            t = await db.tokens.find_one({"id": c["current_token_id"]}, {"_id": 0})
            c["current_token"] = t
    return {"queue": queue, "serving": serving, "waiting": waiting, "counters": counters}


# ----- Admin: Users -----
@api.get("/admin/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api.post("/admin/users/{user_id}/block")
async def block_user(user_id: str, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"blocked": True}})
    return {"ok": True}

@api.post("/admin/users/{user_id}/unblock")
async def unblock_user(user_id: str, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"blocked": False}})
    return {"ok": True}


# ----- Admin: Stats -----
@api.get("/admin/stats")
async def stats(admin: dict = Depends(require_admin)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_users = await db.users.count_documents({"role": "user"})
    active_queues = await db.queues.count_documents({"active": True})
    waiting_now = await db.tokens.count_documents({"status": "waiting"})
    serving_now = await db.tokens.count_documents({"status": "serving"})
    completed_today = await db.tokens.count_documents({
        "status": "completed",
        "completed_at": {"$gte": today}
    })
    # avg wait minutes today (called_at - created_at)
    pipeline = [
        {"$match": {"called_at": {"$ne": None}, "completed_at": {"$gte": today}}},
        {"$limit": 500},
    ]
    cursor = db.tokens.aggregate(pipeline)
    waits = []
    async for t in cursor:
        try:
            ca = datetime.fromisoformat(t["called_at"].replace("Z", "+00:00"))
            cr = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
            waits.append((ca - cr).total_seconds() / 60)
        except Exception:
            pass
    avg_wait = round(sum(waits) / len(waits), 1) if waits else 0
    # last 7 days
    daily = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        next_day = (datetime.now(timezone.utc) - timedelta(days=i - 1)).strftime("%Y-%m-%d")
        cnt = await db.tokens.count_documents({
            "status": "completed",
            "completed_at": {"$gte": day, "$lt": next_day}
        })
        daily.append({"date": day[5:], "completed": cnt})
    return {
        "total_users": total_users,
        "active_queues": active_queues,
        "waiting_now": waiting_now,
        "serving_now": serving_now,
        "completed_today": completed_today,
        "avg_wait_minutes": avg_wait,
        "daily": daily,
    }


# ----- Startup -----
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@qms.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "name": "Administrator", "phone": "",
            "password_hash": hash_password(admin_password),
            "role": "admin", "blocked": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}}
        )

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.queues.create_index("id", unique=True)
    await db.tokens.create_index("id", unique=True)
    await db.tokens.create_index([("queue_id", 1), ("status", 1)])
    await db.counters.create_index("id", unique=True)
    await db.login_attempts.create_index("key", unique=True)
    await seed_admin()


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"message": "QMS API", "version": "1.0"}


# ----- WebSockets -----
def _verify_ws_token(token: str) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None

@app.websocket("/api/ws/queue/{queue_id}")
async def ws_queue(websocket: WebSocket, queue_id: str):
    """Public channel — no auth needed (used by Public Display)."""
    channel = f"queue:{queue_id}"
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
    except Exception:
        ws_manager.disconnect(websocket, channel)

@app.websocket("/api/ws/user")
async def ws_user(websocket: WebSocket, token: str = ""):
    """Per-user channel — token in query string."""
    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4401)
        return
    channel = f"user:{payload['sub']}"
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
    except Exception:
        ws_manager.disconnect(websocket, channel)

@app.websocket("/api/ws/admin")
async def ws_admin(websocket: WebSocket, token: str = ""):
    payload = _verify_ws_token(token)
    if not payload or payload.get("role") != "admin":
        await websocket.close(code=4403)
        return
    await ws_manager.connect(websocket, "admin")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "admin")
    except Exception:
        ws_manager.disconnect(websocket, "admin")


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
