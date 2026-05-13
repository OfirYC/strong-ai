from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from services.ai.types import ChatRequest
from dotenv import load_dotenv
from fastapi import Query, WebSocketDisconnect, WebSocket
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from services.ai.store import (
    create_conversation,
    add_message,
    fetch_messages_formatted,
    touch_conversation,
)
from services.ai.chat_name import rename_conversation
from services.ai.ws_ready import get_or_create_event, mark_ws_ready, cleanup
import os
import logging
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Set, Any
from datetime import datetime, timedelta
from bson import ObjectId
from constants import EXERCISE_KIND_RULES
import json
import time
import secrets
import requests
import jwt  # PyJWT
from observable_db import ObservableDB
from services.ai.runner import AIRunner
from services.ai.jobs import create_job
from ws_manager import ws_manager

# Cache for Apple's JWKS (public keys)
_APPLE_JWKS = None
_APPLE_JWKS_FETCHED_AT = 0


def fetch_apple_jwks():
    """Fetch Apple's JWKS and cache for 24 hours."""
    global _APPLE_JWKS, _APPLE_JWKS_FETCHED_AT
    if _APPLE_JWKS and (time.time() - _APPLE_JWKS_FETCHED_AT) < 60 * 60 * 24:
        return _APPLE_JWKS
    resp = requests.get("https://appleid.apple.com/auth/keys", timeout=5)
    resp.raise_for_status()
    _APPLE_JWKS = resp.json()
    _APPLE_JWKS_FETCHED_AT = time.time()
    return _APPLE_JWKS


from models import (
    User,
    UserCreate,
    UserLogin,
    User,
    UserProfile,
    ProfileUpdate,
    UserContext,
    ProfileInsights,
    Exercise,
    ExerciseCreate,
    ExerciseUpdate,
    ExerciseHistoryResponse,
    ExerciseResponse,
    WorkoutTemplate,
    WorkoutTemplateCreate,
    WorkoutTemplateResponse,
    WorkoutSession,
    WorkoutSessionCreate,
    WorkoutSessionUpdate,
    WorkoutSessionResponse,
    WorkoutSummary,
    WorkoutExerciseSummary,
    WorkoutCountResponse,
    PRRecord,
    PRRecordResponse,
    PlannedWorkout,
    PlannedWorkoutCreate,
    PlannedWorkoutUpdate,
    PlannedWorkoutResponse,
    Conversation,
    ConversationListResponse,
    ActiveJobResponse,
    Job,
    NoteEntry,
    NotesResponse,
    NoteCreate,
    NoteUpdate,
    Message,
    MessageResponse,
    MessagesResponse,
    # Enums
    ExerciseKind,
    ExerciseCategory,
    BodyPart,
    SetType,
    PlannedWorkoutStatus,
    PlannedWorkoutType,
    RecurrenceType,
    PRType,
    UserResponse,
    MuscleVolumeResponse,
    MuscleTopExercise,
    MuscleVolumeEntry,
)
from services.ai.profile_insights import generate_profile_insights
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_access_token,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "workout_tracker")]


def get_db(user_id: str):
    return ObservableDB(db, user_id=user_id, emit=ws_manager.send)


# Create the main app without a prefix
app = FastAPI(title="Strong Workout Tracker API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

ai_runner = AIRunner(db, ws_manager)

# Lock to prevent concurrent AI chat requests per user
ai_chat_locks: Dict[str, asyncio.Lock] = {}
ai_chat_active: Set[str] = set()


def get_ai_lock(user_id: str) -> asyncio.Lock:
    """Get or create a lock for the user."""
    if user_id not in ai_chat_locks:
        ai_chat_locks[user_id] = asyncio.Lock()
    return ai_chat_locks[user_id]


# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Dependency to get current user from token
async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")
    payload = decode_access_token(token)

    if not payload or "user_id" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    return payload["user_id"]


async def get_current_user_ws(ws: WebSocket) -> str:
    """
    WS can't use Header() dependency the same way.
    We accept: /ws?token=...
    """
    token = ws.query_params.get("token")

    if not token:
        await ws.close(code=1008)
        raise WebSocketDisconnect(code=1008)

    payload = decode_access_token(token)

    if not payload or "user_id" not in payload:
        await ws.close(code=1008)
        raise WebSocketDisconnect(code=1008)

    return payload["user_id"]


# ============= AUTH ROUTES =============
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    password_hash = get_password_hash(user_data.password)
    user = User(email=user_data.email, password_hash=password_hash)

    result = await db.users.insert_one(user.dict(by_alias=True, exclude={"id"}))
    user_id = str(result.inserted_id)

    token = create_access_token({"user_id": user_id})
    return UserResponse(id=user_id, email=user.email, token=token, is_pro=False)


@api_router.post("/auth/login", response_model=UserResponse)
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(credentials.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user_doc["_id"])
    token = create_access_token({"user_id": user_id})
    return UserResponse(id=user_id, email=user_doc["email"], token=token, is_pro=user_doc.get("is_pro", False))


@api_router.post("/auth/refresh", response_model=UserResponse)
async def refresh_token(current_user: str = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = current_user
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    new_token = create_access_token({"user_id": user_id})
    return UserResponse(id=user_id, email=user_doc.get("email"), token=new_token, is_pro=user_doc.get("is_pro", False))


@api_router.post("/auth/apple", response_model=UserResponse)
async def apple_signin(payload: dict):
    """
    Verify Apple's identity token (JWT) using Apple's JWKS,
    find or create a user (store `apple_sub` on user document),
    and return our app access token.
    Expects payload: { apple_token: str, client_id?: str, email?: str }
    """
    apple_token = payload.get("apple_token") or payload.get("identity_token")
    if not apple_token:
        raise HTTPException(
            status_code=400, detail="apple_token (identity token) is required"
        )

    expected_aud = os.environ.get("APPLE_CLIENT_ID") or payload.get("client_id")
    if not expected_aud:
        raise HTTPException(
            status_code=500, detail="Server missing APPLE_CLIENT_ID env"
        )

    try:
        jwks = fetch_apple_jwks()
        unverified_header = jwt.get_unverified_header(apple_token)
        kid = unverified_header.get("kid")
        if not kid:
            raise ValueError("Missing kid in token header")
        jwk = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not jwk:
            raise ValueError("No matching Apple JWK found")

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        decoded = jwt.decode(
            apple_token,
            public_key,
            algorithms=["RS256"],
            audience=expected_aud,
            issuer="https://appleid.apple.com",
        )
    except Exception as e:
        raise HTTPException(
            status_code=401, detail=f"Invalid Apple identity token: {str(e)}"
        )

    apple_sub = decoded.get("sub")
    email_from_token = decoded.get("email")
    email = email_from_token or payload.get("email")

    user_doc = None
    if apple_sub:
        user_doc = await db.users.find_one({"apple_sub": apple_sub})
    if not user_doc and email:
        user_doc = await db.users.find_one({"email": email})

    if not user_doc:
        random_pw = secrets.token_urlsafe(32)
        password_hash = get_password_hash(random_pw)
        new_user = {
            "email": email,
            "password_hash": password_hash,
            "apple_sub": apple_sub,
            "created_at": datetime.utcnow(),
        }
        result = await db.users.insert_one(new_user)
        user_id = str(result.inserted_id)
    else:
        user_id = str(user_doc["_id"])
        if apple_sub and not user_doc.get("apple_sub"):
            await db.users.update_one(
                {"_id": ObjectId(user_doc["_id"])}, {"$set": {"apple_sub": apple_sub}}
            )

    token = create_access_token({"user_id": user_id})
    apple_user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    is_pro = apple_user_doc.get("is_pro", False) if apple_user_doc else False
    return UserResponse(id=user_id, email=email, token=token, is_pro=is_pro)


# ============= WEBSOCKET =============
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    user_id = await get_current_user_ws(ws)
    await ws_manager.connect(user_id, ws)

    try:
        while True:
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id, ws)
    except Exception:
        await ws_manager.disconnect(user_id, ws)


@app.websocket("/ws/ai/jobs/{job_id}")
@api_router.websocket("/ws/ai/jobs/{job_id}")
async def ai_job_ws(websocket: WebSocket, job_id: str):
    user_id = await get_current_user_ws(websocket)
    print(f"WebSocket connection for job {job_id} by user {user_id}")
    job = await db.ai_jobs.find_one({"_id": ObjectId(job_id)})
    print(f"Job found: {bool(job)} for job_id {job_id} and user_id {user_id}")
    if not job:
        await websocket.close(code=4004)
        return
    if str(job["user_id"]) != str(user_id):
        await websocket.close(code=4003)
        return

    print(f"WebSocket connecting for job {job_id}")
    await ws_manager.connect_job(job_id, websocket)
    print(
        f"WebSocket connected for job {job_id}, waiting for runner to signal ready..."
    )

    mark_ws_ready(job_id)
    print(f"WebSocket for job {job_id} is ready, runner can start streaming results")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for job {job_id}")
        await ws_manager.disconnect_job(job_id, websocket)
    except Exception:
        print(f"WebSocket error for job {job_id}")
        await ws_manager.disconnect_job(job_id, websocket)
        await websocket.close(code=1011)


# ============= AI ROUTES =============
@api_router.get("/ai/conversations", response_model=ConversationListResponse)
async def get_conversations(user_id=Depends(get_current_user)):
    conversations = (
        await db.conversations.find({"user_id": ObjectId(user_id)})
        .sort("created_at", 1)
        .to_list(length=None)
    )
    return ConversationListResponse(
        conversations=[
            Conversation(
                id=str(c["_id"]),
                user_id=str(c["user_id"]),
                title=c["title"],
                created_at=c["created_at"],
                updated_at=c["updated_at"],
                last_message_at=c["last_message_at"],
                active_job_id=(
                    str(c["active_job_id"]) if c.get("active_job_id") else None
                ),
            )
            for c in conversations
        ]
    )


@api_router.get(
    "/ai/conversations/{conversation_id}/active-job", response_model=ActiveJobResponse
)
async def get_active_job(conversation_id: str, user_id=Depends(get_current_user)):
    job = await db.ai_jobs.find_one(
        {
            "conversation_id": ObjectId(conversation_id),
            "user_id": ObjectId(user_id),
            "status": "running",
        },
        sort=[("created_at", -1)],
    )

    if not job:
        return ActiveJobResponse(job=None)

    return ActiveJobResponse(
        job=Job(
            _id=str(job["_id"]),
            status=job["status"],
            kind=job.get("kind", "chat"),
            created_at=job["created_at"],
            completed_at=job.get("completed_at"),
            conversation_id=(
                str(job["conversation_id"]) if job.get("conversation_id") else None
            ),
        )
    )


class StartChatResponse(BaseModel):
    job_id: str
    conversation_id: str


@api_router.post("/ai/chat/start", response_model=StartChatResponse)
async def start_ai_chat(payload: dict, user_id=Depends(get_current_user)):
    conversation_id = payload.get("conversation_id")
    is_new_conversation = False
    if not conversation_id:
        conversation_id = await create_conversation(db, user_id)
        payload["conversation_id"] = conversation_id
        is_new_conversation = True

    convo = await db.conversations.find_one(
        {"_id": ObjectId(conversation_id), "user_id": ObjectId(user_id)}
    )
    if not convo:
        raise HTTPException(status_code=403, detail="Invalid conversation_id")

    user_message = payload.get("user_message")
    if user_message and user_message.get("role") == "user":
        if is_new_conversation:
            asyncio.create_task(
                rename_conversation(
                    get_db(user_id),
                    conversation_id,
                    user_message.get("content", ""),
                )
            )

        await add_message(
            db, user_id, conversation_id, "user", user_message.get("content", "")
        )
        await touch_conversation(db, conversation_id)

    job_id = await create_job(db, user_id, payload, kind="chat")
    await touch_conversation(db, conversation_id, job_id)

    get_or_create_event(job_id)

    asyncio.create_task(
        ai_runner.run_chat(
            job_id=job_id, user_id=user_id, input_payload=payload, db=get_db(user_id)
        )
    )
    return StartChatResponse(job_id=str(job_id), conversation_id=conversation_id)


@api_router.get(
    "/ai/conversations/{conversation_id}/messages", response_model=MessagesResponse
)
async def get_messages(conversation_id: str, user_id: str = Depends(get_current_user)):
    msgs = await fetch_messages_formatted(db, user_id, conversation_id, limit=500)
    return MessagesResponse(messages=msgs)


# ============= NOTES ROUTES ============== #


def _serialize_note(doc: dict) -> NoteEntry:
    return NoteEntry(
        id=str(doc["_id"]),
        content=doc.get("content", ""),
        writer=doc.get("writer", "user"),
        tag=doc.get("tag"),
        created_at=(
            doc.get("created_at", datetime.utcnow()).isoformat()
            if isinstance(doc.get("created_at"), datetime)
            else str(doc.get("created_at", ""))
        ),
        updated_at=(
            doc.get("updated_at", datetime.utcnow()).isoformat()
            if isinstance(doc.get("updated_at"), datetime)
            else str(doc.get("updated_at", ""))
        ),
    )


@api_router.get("/notes", response_model=NotesResponse)
async def get_notes(user_id: str = Depends(get_current_user)):
    """Fetch all notes for the user, sorted newest first."""
    docs = (
        await db.notes.find({"user_id": user_id})
        .sort("created_at", -1)
        .to_list(length=None)
    )

    return NotesResponse(notes=[_serialize_note(d) for d in docs])


@api_router.post("/notes", response_model=NoteEntry)
async def create_note(
    payload: NoteCreate,
    user_id: str = Depends(get_current_user),
):
    """Create a new note. writer='user' for user-written, writer='ai' for AI-written."""
    now = datetime.utcnow()
    doc = {
        "user_id": user_id,
        "content": payload.content.strip(),
        "writer": payload.writer if payload.writer in ("user", "ai") else "user",
        "tag": payload.tag,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.notes.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_note(doc)


@api_router.patch("/notes/{note_id}", response_model=NoteEntry)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    user_id: str = Depends(get_current_user),
):
    if not ObjectId.is_valid(note_id):
        raise HTTPException(status_code=400, detail="Invalid note ID")

    doc = await db.notes.find_one({"_id": ObjectId(note_id), "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Note not found")

    updates: dict = {"updated_at": datetime.utcnow()}
    if payload.content is not None:
        updates["content"] = payload.content.strip()
    if payload.tag is not None:
        updates["tag"] = payload.tag

    await db.notes.update_one({"_id": ObjectId(note_id)}, {"$set": updates})
    updated = await db.notes.find_one({"_id": ObjectId(note_id)})
    return _serialize_note(updated)


@api_router.delete("/notes/{note_id}")
async def delete_note(
    note_id: str,
    user_id: str = Depends(get_current_user),
):
    if not ObjectId.is_valid(note_id):
        raise HTTPException(status_code=400, detail="Invalid note ID")

    result = await db.notes.delete_one({"_id": ObjectId(note_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")

    return {"deleted": note_id}


# ── Context builder (call this from AIRunner / system prompt builder) ─────────
# Import and call build_notes_context(db, user_id) to get a compact string
# to inject into the AI system prompt.


async def build_notes_context(db, user_id: str, max_chars: int = 1200) -> str:
    """
    Returns a compact notes block for injection into the AI system prompt.

    Strategy:
    - AI notes first (they contain the AI's own observations — highest signal)
    - User notes second
    - Within each group: newest first
    - Hard cap at max_chars to avoid blowing context
    - Each note truncated at 300 chars individually
    - Tagged notes get the tag prepended for quick scanning

    Returns empty string if no notes exist.
    """
    docs = (
        await db.notes.find({"user_id": user_id})
        .sort("created_at", -1)
        .to_list(length=100)
    )

    if not docs:
        return ""

    ai_notes = [d for d in docs if d.get("writer") == "ai"]
    user_notes = [d for d in docs if d.get("writer") == "user"]

    lines = []

    def fmt(doc: dict) -> str:
        tag = f"[{doc['tag']}] " if doc.get("tag") else ""
        content = doc.get("content", "").strip()
        if len(content) > 300:
            content = content[:297] + "…"
        return f"• {tag}{content}"

    if ai_notes:
        lines.append("AI observations:")
        for d in ai_notes:
            lines.append(fmt(d))

    if user_notes:
        lines.append("User notes:")
        for d in user_notes:
            lines.append(fmt(d))

    block = "\n".join(lines)

    # Hard cap
    if len(block) > max_chars:
        block = block[: max_chars - 3] + "…"

    return f"<user_notes>\n{block}\n</user_notes>"


# ============= PROFILE ROUTES =============


@api_router.get("/profile", response_model=UserProfile)
async def get_profile(user_id: str = Depends(get_current_user)):
    """Get user profile"""
    user_doc = await get_db(user_id).users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    profile_data = user_doc.get("profile", {})
    return UserProfile(**profile_data)


@api_router.put("/profile", response_model=UserProfile)
async def update_profile(
    profile_data: ProfileUpdate, user_id: str = Depends(get_current_user)
):
    """Update user profile and auto-generate insights"""
    update_dict = {}
    for field, value in profile_data.dict(exclude_unset=True).items():
        if value is not None:
            update_dict[f"profile.{field}"] = value

    if update_dict:
        await get_db(user_id).users.update_one(
            {"_id": ObjectId(user_id)}, {"$set": update_dict}
        )

    user_doc = await get_db(user_id).users.find_one({"_id": ObjectId(user_id)})
    profile_dict = user_doc.get("profile", {})
    profile = UserProfile(**profile_dict)

    try:
        insights = await generate_profile_insights(profile)
        await get_db(user_id).users.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"profile.insights": insights.dict()}}
        )
        profile.insights = insights
    except ValueError:
        pass
    except Exception as e:
        print(f"Failed to auto-generate insights: {e}")

    return profile


@api_router.get("/profile/context", response_model=UserContext)
async def get_user_context(user_id: str = Depends(get_current_user)):
    """Get aggregated user context for AI and UI logic"""
    user_doc = await get_db(user_id).users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    profile = user_doc.get("profile", {})

    age = None
    if profile.get("date_of_birth"):
        dob = profile["date_of_birth"]
        if isinstance(dob, str):
            dob = datetime.fromisoformat(dob.replace("Z", "+00:00"))
        age = (datetime.utcnow() - dob).days // 365

    basic_info = {
        "sex": profile.get("sex"),
        "age": age,
        "height_cm": profile.get("height_cm"),
        "weight_kg": profile.get("weight_kg"),
    }

    training_context = {
        "training_age": profile.get("training_age"),
        "goals": profile.get("goals"),
    }

    physiology = {
        "injury_history": profile.get("injury_history"),
        "weaknesses": profile.get("weaknesses"),
        "strengths": profile.get("strengths"),
    }

    is_complete = all(
        [
            profile.get("sex"),
            profile.get("date_of_birth"),
            profile.get("height_cm"),
            profile.get("weight_kg"),
        ]
    )

    insights_data = profile.get("insights")
    insights = ProfileInsights(**insights_data) if insights_data else None

    return UserContext(
        basic_info=basic_info,
        training_context=training_context,
        physiology=physiology,
        background_story=profile.get("background_story"),
        is_profile_complete=is_complete,
        insights=insights,
    )


class InsightsResponse(BaseModel):
    insights: dict


@api_router.post("/profile/insights/generate", response_model=InsightsResponse)
async def generate_insights(user_id: str = Depends(get_current_user)):
    """Generate AI-powered insights from user's profile"""
    user_doc = await get_db(user_id).users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    profile_data = user_doc.get("profile", {})
    profile = UserProfile(**profile_data)

    try:
        insights = await generate_profile_insights(profile)
        await get_db(user_id).users.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"profile.insights": insights.dict()}}
        )
        return InsightsResponse(insights=insights.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate insights: {str(e)}"
        )


# ============= EXERCISE ROUTES =============


@api_router.get("/exercises", response_model=List[ExerciseResponse])
async def get_exercises(
    user_id: str = Depends(get_current_user),
    body_part: Optional[str] = None,
    exercise_kind: Optional[ExerciseKind] = None,
    search: Optional[str] = None,
):
    query = {}

    if body_part:
        query["$or"] = [
            {"primary_body_parts": body_part},
            {"secondary_body_parts": body_part},
        ]

    if exercise_kind:
        query["exercise_kind"] = exercise_kind.value

    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    exercises = await get_db(user_id).exercises.find(query).to_list(1000)

    result = []
    for ex in exercises:
        ex_dict = dict(ex)
        ex_dict["id"] = str(ex_dict.pop("_id"))
        result.append(ex_dict)

    return result


@api_router.post("/exercises", response_model=ExerciseResponse)
async def create_exercise(
    exercise_data: ExerciseCreate, user_id: str = Depends(get_current_user)
):
    exercise_dict = exercise_data.dict()
    exercise_dict["is_custom"] = True
    exercise_dict["user_id"] = user_id

    exercise = Exercise(**exercise_dict)

    result = await get_db(user_id).exercises.insert_one(
        exercise.dict(by_alias=True, exclude={"id"})
    )
    exercise.id = str(result.inserted_id)
    return exercise


@api_router.get("/exercises/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(exercise_id: str, user_id: str = Depends(get_current_user)):
    exercise = await get_db(user_id).exercises.find_one({"_id": ObjectId(exercise_id)})
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    return Exercise(**{**exercise, "id": str(exercise["_id"])})


@api_router.patch("/exercises/{exercise_id}", response_model=ExerciseResponse)
async def update_exercise(
    exercise_id: str,
    update_data: ExerciseUpdate,
    user_id: str = Depends(get_current_user),
):
    exercise = await get_db(user_id).exercises.find_one({"_id": ObjectId(exercise_id)})
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    update_dict = {}
    if update_data.instructions is not None:
        update_dict["instructions"] = update_data.instructions
    if update_data.image is not None:
        update_dict["image"] = update_data.image

    if update_dict:
        await get_db(user_id).exercises.update_one(
            {"_id": ObjectId(exercise_id)}, {"$set": update_dict}
        )

    updated_exercise = await get_db(user_id).exercises.find_one(
        {"_id": ObjectId(exercise_id)}
    )
    return Exercise(**{**updated_exercise, "id": str(updated_exercise["_id"])})


# ============= TEMPLATE ROUTES =============


@api_router.get("/templates", response_model=List[WorkoutTemplateResponse])
async def get_templates(user_id: str = Depends(get_current_user)):
    templates = await get_db(user_id).templates.find({"user_id": user_id}).to_list(1000)
    return [WorkoutTemplate(**{**t, "id": str(t["_id"])}) for t in templates]


@api_router.post("/templates", response_model=WorkoutTemplateResponse)
async def create_template(
    template_data: WorkoutTemplateCreate, user_id: str = Depends(get_current_user)
):
    template = WorkoutTemplate(**template_data.dict(), user_id=user_id)

    result = await get_db(user_id).templates.insert_one(
        template.dict(by_alias=True, exclude={"id"})
    )
    template.id = str(result.inserted_id)
    return template


@api_router.get("/templates/{template_id}", response_model=WorkoutTemplateResponse)
async def get_template(template_id: str, user_id: str = Depends(get_current_user)):
    template = await get_db(user_id).templates.find_one(
        {"_id": ObjectId(template_id), "user_id": user_id}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return WorkoutTemplate(**{**template, "id": str(template["_id"])})


@api_router.put("/templates/{template_id}", response_model=WorkoutTemplateResponse)
async def update_template(
    template_id: str,
    template_data: WorkoutTemplateCreate,
    user_id: str = Depends(get_current_user),
):
    result = await get_db(user_id).templates.update_one(
        {"_id": ObjectId(template_id), "user_id": user_id},
        {"$set": {**template_data.dict(), "updated_at": datetime.utcnow()}},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")

    template = await get_db(user_id).templates.find_one({"_id": ObjectId(template_id)})
    return WorkoutTemplate(**{**template, "id": str(template["_id"])})


@api_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user_id: str = Depends(get_current_user)):
    result = await get_db(user_id).templates.delete_one(
        {"_id": ObjectId(template_id), "user_id": user_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")

    return {"message": "Template deleted"}


# ============= WORKOUT SESSION ROUTES =============


@api_router.post("/workouts", response_model=WorkoutSessionResponse)
async def start_workout(
    workout_data: WorkoutSessionCreate, user_id: str = Depends(get_current_user)
):
    exercises = workout_data.exercises or []
    name = workout_data.name
    notes = workout_data.notes

    if workout_data.template_id:
        template = await get_db(user_id).templates.find_one(
            {"_id": ObjectId(workout_data.template_id), "user_id": user_id}
        )
        if template:
            name = name or template.get("name")
            notes = notes or template.get("notes")
            for tmpl_ex in template.get("exercises", []):
                tmpl_sets = tmpl_ex.get("sets", [])
                if tmpl_sets:
                    sets = []
                    for tmpl_set in tmpl_sets:
                        set_item = {
                            "set_type": tmpl_set.get("set_type", "normal"),
                            "weight": tmpl_set.get("weight"),
                            "reps": tmpl_set.get("reps"),
                            "duration": tmpl_set.get("duration"),
                            "distance": tmpl_set.get("distance"),
                            "rest_timer": tmpl_set.get("rest_timer", None),
                        }

                        set_item = {
                            k: v
                            for k, v in set_item.items()
                            if (v is not None) or (k in ("set_type", "rest_timer"))
                        }

                        set_item.setdefault("set_type", "normal")
                        if "rest_timer" not in set_item:
                            set_item["rest_timer"] = None

                        sets.append(set_item)
                else:
                    sets = []
                    num_sets = tmpl_ex.get("default_sets", 3)
                    for _ in range(num_sets):
                        set_item = {
                            "set_type": "normal",
                            "rest_timer": None,
                        }
                        if tmpl_ex.get("default_weight") is not None:
                            set_item["weight"] = tmpl_ex["default_weight"]
                        if tmpl_ex.get("default_reps") is not None:
                            set_item["reps"] = tmpl_ex["default_reps"]
                        if tmpl_ex.get("default_duration") is not None:
                            set_item["duration"] = tmpl_ex["default_duration"]
                        if tmpl_ex.get("default_distance") is not None:
                            set_item["distance"] = tmpl_ex["default_distance"]
                        sets.append(set_item)

                exercises.append(
                    {
                        "exercise_id": tmpl_ex["exercise_id"],
                        "order": tmpl_ex["order"],
                        "sets": sets,
                        "notes": tmpl_ex.get("notes"),
                    }
                )

    workout = WorkoutSession(
        user_id=user_id,
        template_id=workout_data.template_id,
        planned_workout_id=workout_data.planned_workout_id,
        name=name,
        notes=notes,
        exercises=exercises,
    )

    result = await get_db(user_id).workouts.insert_one(
        workout.dict(by_alias=True, exclude={"id"})
    )
    workout.id = str(result.inserted_id)

    if workout_data.planned_workout_id:
        if ObjectId.is_valid(workout_data.planned_workout_id):
            await get_db(user_id).planned_workouts.update_one(
                {"_id": ObjectId(workout_data.planned_workout_id), "user_id": user_id},
                {
                    "$set": {
                        "status": "in_progress",
                        "workout_session_id": str(result.inserted_id),
                    }
                },
            )

    return workout


@api_router.put("/workouts/{workout_id}", response_model=WorkoutSessionResponse)
async def update_workout(
    workout_id: str,
    workout_data: WorkoutSessionUpdate,
    user_id: str = Depends(get_current_user),
):
    update_dict = workout_data.dict(exclude_unset=True)
    result = await get_db(user_id).workouts.update_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}, {"$set": update_dict}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")

    if workout_data.ended_at:
        await check_and_create_prs(user_id, workout_id)

    workout = await get_db(user_id).workouts.find_one({"_id": ObjectId(workout_id)})

    if workout_data.skipped and workout.get("planned_workout_id"):
        planned_id = workout["planned_workout_id"]
        if ObjectId.is_valid(planned_id):
            await get_db(user_id).planned_workouts.update_one(
                {"_id": ObjectId(planned_id), "user_id": user_id},
                {"$set": {"status": "skipped"}},
            )

    if workout_data.ended_at and workout.get("planned_workout_id"):
        planned_id = workout["planned_workout_id"]
        if ObjectId.is_valid(planned_id):
            await get_db(user_id).planned_workouts.update_one(
                {"_id": ObjectId(planned_id), "user_id": user_id},
                {"$set": {"status": "completed"}},
            )

    return WorkoutSession(**{**workout, "id": str(workout["_id"])})


@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, user_id: str = Depends(get_current_user)):
    """Delete a workout session"""
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(status_code=400, detail="Invalid workout ID")

    result = await get_db(user_id).workouts.delete_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")

    return {"message": "Workout deleted successfully"}


@api_router.get("/workouts/count", response_model=WorkoutCountResponse)
async def get_workout_count_all(user_id: str = Depends(get_current_user)):
    count = await db.workouts.count_documents({"user_id": user_id})
    return WorkoutCountResponse(count=count)


@api_router.get("/workouts", response_model=List[WorkoutSessionResponse])
async def get_workouts(
    user_id: str = Depends(get_current_user),
    limit: int = 50,
    start: int = 0,
):
    start = max(0, int(start))
    limit = max(1, min(int(limit), 200))

    workouts = (
        await get_db(user_id)
        .workouts.find({"user_id": user_id})
        .sort([("started_at", -1), ("_id", -1)])
        .skip(start)
        .limit(limit)
        .to_list(limit)
    )

    return [WorkoutSession(**{**w, "id": str(w["_id"])}) for w in workouts]


@api_router.get("/workouts/history/by-exercise", response_model=ExerciseHistoryResponse)
async def get_workout_history_by_exercise(
    exercise_id: str,
    days_back: int = 120,
    limit_workouts: int = 60,
    user_id: str = Depends(get_current_user),
):
    """
    Return FULL workout history for a specific exercise,
    grouped by workout, preserving sets and workout metadata.
    """
    if not exercise_id:
        raise HTTPException(status_code=400, detail="exercise_id is required")

    days_back = max(1, min(int(days_back), 730))
    limit_workouts = max(1, min(int(limit_workouts), 300))

    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)

    EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())

    DEFAULT_EXERCISE_KIND = (
        "Machine/Other"
        if "Machine/Other" in EXERCISE_KIND_RULES
        else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
    )

    ex_kind = DEFAULT_EXERCISE_KIND
    if ObjectId.is_valid(exercise_id):
        ex_doc = await get_db(user_id).exercises.find_one(
            {"_id": ObjectId(exercise_id)}
        )
        if ex_doc and ex_doc.get("exercise_kind"):
            ex_kind = ex_doc["exercise_kind"]
    if ex_kind not in EXERCISE_KIND_RULES:
        ex_kind = DEFAULT_EXERCISE_KIND

    allowed = set((EXERCISE_KIND_RULES.get(ex_kind) or {}).get("fields", []) or [])

    workouts = (
        await get_db(user_id)
        .workouts.find(
            {
                "user_id": user_id,
                "ended_at": {"$ne": None},
                "started_at": {"$gte": start_date, "$lte": end_date},
                "exercises.exercise_id": exercise_id,
            }
        )
        .sort("started_at", -1)
        .limit(limit_workouts)
        .to_list(limit_workouts)
    )

    history = []
    max_weight = 0
    max_reps = 0
    best_e1rm = 0

    def epley_1rm(wt: float, reps_i: int) -> float:
        return wt * (1.0 + reps_i / 30.0)

    for w in workouts:
        w_date = w.get("started_at") or w.get("ended_at")
        entry_sets = []
        for ex in w.get("exercises") or []:
            if str(ex.get("exercise_id")) != exercise_id:
                continue
            for s in ex.get("sets") or []:
                reps = s.get("reps") or 0
                weight = s.get("weight") or 0

                if "reps" in allowed:
                    if reps > max_reps:
                        max_reps = reps
                if "weight" in allowed and weight > max_weight:
                    max_weight = weight
                if weight > 0 and reps > 0:
                    e = epley_1rm(weight, reps)
                    if e > best_e1rm:
                        best_e1rm = e

                entry_sets.append(
                    {
                        "reps": reps,
                        "weight": weight,
                        "duration": s.get("duration"),
                        "distance": s.get("distance"),
                        "set_type": s.get("set_type", "normal"),
                        "rest_timer": s.get("rest_timer", None),
                    }
                )

        if entry_sets:
            history.append(
                {
                    "workout_id": str(w["_id"]),
                    "workout_name": w.get("name") or "Workout",
                    "date": w_date.isoformat() if w_date else None,
                    "sets": entry_sets,
                }
            )

    history.sort(key=lambda x: x["date"] or "", reverse=True)

    return ExerciseHistoryResponse(
        exercise_id=exercise_id,
        exercise_kind=ex_kind,
        window_days=days_back,
        workouts_scanned=len(workouts),
        history=history,
        max_weight=max_weight or None,
        max_reps=max_reps or None,
        best_e1rm=round(best_e1rm, 2) if best_e1rm > 0 else None,
    )


from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import HTTPException, Depends, Query


def _parse_yyyy_mm_dd(s: str, field: str) -> datetime:
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD")


def _day_bounds_utc(
    date_yyyy_mm_dd: str, tz_offset_minutes: int
) -> tuple[datetime, datetime]:
    local_start = _parse_yyyy_mm_dd(date_yyyy_mm_dd, "date")
    offset = timedelta(minutes=int(tz_offset_minutes))
    start_utc = (local_start - offset).replace(tzinfo=timezone.utc)
    end_utc = (local_start + timedelta(days=1) - offset).replace(tzinfo=timezone.utc)
    return start_utc, end_utc


@api_router.get("/workouts/by-date", response_model=List[WorkoutSessionResponse])
async def get_workouts_by_date(
    date: str = Query(..., description="YYYY-MM-DD in user's local date"),
    tz_offset_minutes: int = Query(
        0,
        description="User timezone offset in minutes, e.g. Israel winter=120, summer=180",
    ),
    include_incomplete: bool = Query(
        True, description="If false, only workouts with ended_at != None"
    ),
    user_id: str = Depends(get_current_user),
    limit: int = 200,
    start: int = 0,
):
    start = max(0, int(start))
    limit = max(1, min(int(limit), 200))

    start_utc, end_utc = _day_bounds_utc(date, tz_offset_minutes)

    q = {
        "user_id": user_id,
        "started_at": {"$gte": start_utc, "$lt": end_utc},
    }
    if not include_incomplete:
        q["ended_at"] = {"$ne": None}

    workouts = (
        await get_db(user_id)
        .workouts.find(q)
        .sort([("started_at", -1), ("_id", -1)])
        .skip(start)
        .limit(limit)
        .to_list(limit)
    )

    return [WorkoutSession(**{**w, "id": str(w["_id"])}) for w in workouts]


@api_router.get("/workouts/by-date-range", response_model=List[WorkoutSessionResponse])
async def get_workouts_by_date_range(
    start_date: str = Query(..., description="YYYY-MM-DD (local)"),
    end_date: str = Query(..., description="YYYY-MM-DD (local), inclusive"),
    tz_offset_minutes: int = Query(0, description="User timezone offset in minutes"),
    include_incomplete: bool = Query(
        True, description="If false, only workouts with ended_at != None"
    ),
    user_id: str = Depends(get_current_user),
    limit: int = 200,
    start: int = 0,
):
    start = max(0, int(start))
    limit = max(1, min(int(limit), 200))

    start_local = _parse_yyyy_mm_dd(start_date, "start_date")
    end_local = _parse_yyyy_mm_dd(end_date, "end_date")

    if end_local < start_local:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    offset = timedelta(minutes=int(tz_offset_minutes))

    start_utc = (start_local - offset).replace(tzinfo=timezone.utc)
    end_utc = (end_local + timedelta(days=1) - offset).replace(tzinfo=timezone.utc)

    q = {
        "user_id": user_id,
        "started_at": {"$gte": start_utc, "$lt": end_utc},
    }
    if not include_incomplete:
        q["ended_at"] = {"$ne": None}

    workouts = (
        await get_db(user_id)
        .workouts.find(q)
        .sort([("started_at", -1), ("_id", -1)])
        .skip(start)
        .limit(limit)
        .to_list(limit)
    )

    return [WorkoutSession(**{**w, "id": str(w["_id"])}) for w in workouts]


@api_router.get("/workouts/{workout_id}", response_model=WorkoutSessionResponse)
async def get_workout(workout_id: str, user_id: str = Depends(get_current_user)):
    workout = await get_db(user_id).workouts.find_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}
    )
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    return WorkoutSession(**{**workout, "id": str(workout["_id"])})


@api_router.get(
    "/workouts/batch/{workout_ids}", response_model=List[WorkoutSessionResponse]
)
async def get_workouts_batch(
    workout_ids: str, user_id: str = Depends(get_current_user)
):
    workout_id_list = workout_ids.split(",")

    workouts = []
    if workout_id_list:
        workouts = (
            await get_db(user_id)
            .workouts.find(
                {
                    "_id": {
                        "$in": [
                            ObjectId(wid)
                            for wid in workout_id_list
                            if ObjectId.is_valid(wid)
                        ]
                    },
                    "user_id": user_id,
                }
            )
            .to_list(len(workout_id_list))
        )
        workouts = [WorkoutSession(**{**w, "id": str(w["_id"])}) for w in workouts]

    return workouts


@api_router.get("/workouts/{workout_id}/detail", response_model=WorkoutSummary)
async def get_workout_detail(workout_id: str, user_id: str = Depends(get_current_user)):
    """Get detailed workout summary with exercise breakdown"""
    workout = await get_db(user_id).workouts.find_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}
    )
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    exercise_ids = [ex["exercise_id"] for ex in workout.get("exercises", [])]
    exercises_map = {}
    if exercise_ids:
        exercises = (
            await get_db(user_id)
            .exercises.find(
                {
                    "_id": {
                        "$in": [
                            ObjectId(eid)
                            for eid in exercise_ids
                            if ObjectId.is_valid(eid)
                        ]
                    }
                }
            )
            .to_list(len(exercise_ids))
        )
        for ex in exercises:
            exercises_map[str(ex["_id"])] = ex

    prs = await get_db(user_id).prs.find({"workout_id": workout_id}).to_list(100)
    pr_count = len(prs)

    started_at = workout.get("started_at", datetime.utcnow())
    ended_at = workout.get("ended_at")

    duration_seconds = 0
    if ended_at and started_at:
        duration_seconds = int((ended_at - started_at).total_seconds())

    exercise_count = len(workout.get("exercises", []))
    set_count = 0
    total_volume_kg = 0.0
    exercise_summaries = []

    for ex_item in workout.get("exercises", []):
        exercise_id = ex_item["exercise_id"]
        sets = ex_item.get("sets", [])
        set_count += len(sets)

        ex_data = exercises_map.get(exercise_id, {})
        ex_name = ex_data.get("name", "Unknown Exercise")
        ex_kind = ex_data.get("exercise_kind", "Barbell")

        best_weight = 0
        best_reps = 0
        best_duration = 0
        estimated_1rm = None

        for s in sets:
            set_type = s.get("set_type", "normal")
            if set_type in ("warmup", "cooldown"):
                continue

            weight = s.get("weight") or 0
            reps = s.get("reps") or 0
            duration = s.get("duration") or 0

            if weight > 0 and reps > 0:
                total_volume_kg += weight * reps
                set_1rm = weight * (36 / (37 - reps)) if reps < 37 else weight
                if set_1rm > (estimated_1rm or 0):
                    estimated_1rm = set_1rm
                    best_weight = weight
                    best_reps = reps

            if duration > best_duration:
                best_duration = duration

        if ex_kind in ["Cardio", "Duration"]:
            if best_duration > 0:
                total_centis = int(round(best_duration * 100))
                mins = total_centis // 6000
                secs = (total_centis % 6000) // 100
                centis = total_centis % 100
                if centis > 0:
                    best_set_display = f"{mins}:{secs:02d}.{centis:02d}"
                else:
                    best_set_display = f"{mins}:{secs:02d}"
            else:
                best_set_display = "0:00"
        elif ex_kind == "Reps Only":
            best_set_display = f"{best_reps} reps" if best_reps > 0 else "-"
        else:
            if best_weight > 0 and best_reps > 0:
                best_set_display = f"{best_weight}kg × {best_reps}"
            elif best_reps > 0:
                best_set_display = f"{best_reps} reps"
            else:
                best_set_display = "-"

        exercise_summaries.append(
            WorkoutExerciseSummary(
                exercise_id=exercise_id,
                name=ex_name,
                exercise_kind=ex_kind,
                set_count=len(sets),
                best_set_display=best_set_display,
                estimated_1rm=estimated_1rm,
            )
        )

    return WorkoutSummary(
        id=str(workout["_id"]),
        name=workout.get("name"),
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=duration_seconds,
        exercise_count=exercise_count,
        set_count=set_count,
        total_volume_kg=total_volume_kg,
        pr_count=pr_count,
        exercises=exercise_summaries,
    )


# ============= PR/STATISTIC ROUTES =============

# ── Kind classification ───────────────────────────────────────────────────────

EMOM_KINDS = {
    "EMOM (Every Minute On The Minute)",
    "ETOT (Every Thirty Seconds on Thirty Seconds)",
}
CARDIO_KINDS = {"Cardio", "Weighted Cardio"}
DURATION_KINDS = {"Duration", "Weighted Duration"}


# ── Scoring functions ─────────────────────────────────────────────────────────


def _hyp_score(kind: str, reps, weight, duration, load_pct: float) -> float:
    """
    Effective hypertrophy sets (0.0–1.0+ per working set).
    Hard sets 5–30 rep range = full credit, peaked at 8–12.
    EMOM/ETOT = (total_reps / 10) * 0.4  (sub-failure discount).
    Duration / Cardio = 0.
    """
    load = load_pct / 100.0

    if kind in CARDIO_KINDS or kind in DURATION_KINDS:
        return 0.0

    if kind in EMOM_KINDS:
        if not reps:
            return 0.0
        return (reps / 10.0) * 0.4 * load

    if reps is None:
        return 0.0

    if 8 <= reps <= 12:
        factor = 1.0
    elif 5 <= reps < 8:
        factor = 0.7 + (reps - 5) / 3.0 * 0.3
    elif 13 <= reps <= 30:
        factor = max(0.4, 1.0 - (reps - 12) / 18.0 * 0.6)
    else:
        return 0.0  # <5 or >30: negligible hyp signal

    return factor * load


def _str_score(kind: str, reps, weight, e1rm, load_pct: float) -> float:
    """
    Strength score in kg·intensity units.
    Needs weight + e1RM. Zero below 75% 1RM, ramps to full at 100%.
    EMOM heavy work gets 60% credit (sub-maximal by design).
    """
    if not weight or weight <= 0:
        return 0.0

    load = load_pct / 100.0

    if not e1rm or e1rm <= 0:
        # No e1RM known: credit raw tonnage only for low-rep sets (≤6)
        if reps and reps <= 6 and kind not in (CARDIO_KINDS | DURATION_KINDS):
            return reps * weight * 0.3 * load
        return 0.0

    intensity = min(weight / e1rm, 1.0)
    if intensity < 0.75:
        return 0.0
    intensity_factor = (intensity - 0.75) / 0.25

    if not reps:
        return 0.0

    multiplier = 0.6 if kind in EMOM_KINDS else 1.0
    return reps * weight * intensity_factor * multiplier * load


def _end_score(kind: str, reps, weight, duration, distance, load_pct: float) -> float:
    """
    Effective endurance reps.
    EMOM/ETOT: full total_reps credit (primary endurance modality).
    Cardio: duration/3 + distance_km*1000/1.5.
    Duration: duration/3.
    Reps ≥15: full credit. Reps 10–14: 30% credit. <10: 0.
    """
    load = load_pct / 100.0

    if kind in EMOM_KINDS:
        return (reps or 0) * load

    if kind in CARDIO_KINDS:
        eff = 0.0
        if duration:
            eff += duration / 3.0
        if distance:
            eff += (distance * 1000.0) / 1.5
        return eff * load

    if kind in DURATION_KINDS:
        return ((duration or 0) / 3.0) * load

    if reps is None:
        return 0.0
    if reps >= 15:
        return reps * load
    if reps >= 10:
        return reps * 0.3 * load
    return 0.0


@api_router.get("/analytics/muscle-volume", response_model=MuscleVolumeResponse)
async def get_muscle_volume(
    days: int = Query(28, ge=1, le=730),
    user_id: str = Depends(get_current_user),
):
    from body_parts import get_ancestors, MUSCLE_MAP

    end_dt = datetime.utcnow()
    start_dt = end_dt - timedelta(days=days)
    weeks = days / 7.0

    # ── 1. Workouts ──────────────────────────────────────────────────────────
    workouts = await db.workouts.find(
        {
            "user_id": user_id,
            "ended_at": {"$ne": None},
            "started_at": {"$gte": start_dt, "$lte": end_dt},
        }
    ).to_list(length=None)

    if not workouts:
        return MuscleVolumeResponse(
            days=days,
            weeks=round(weeks, 2),
            start_date=start_dt.date().isoformat(),
            end_date=end_dt.date().isoformat(),
            workout_count=0,
            muscles=[],
        )

    # ── 2. Bulk fetch exercises ──────────────────────────────────────────────
    ex_ids = {
        ex.get("exercise_id")
        for w in workouts
        for ex in (w.get("exercises") or [])
        if ex.get("exercise_id")
    }
    valid_ids = [ObjectId(i) for i in ex_ids if ObjectId.is_valid(i)]
    ex_docs = await db.exercises.find({"_id": {"$in": valid_ids}}).to_list(length=None)
    ex_info: Dict[str, dict] = {
        str(d["_id"]): {
            "name": d.get("name", ""),
            "kind": d.get("kind", "Barbell"),
            "muscle_loads": d.get("muscle_loads") or [],
        }
        for d in ex_docs
    }

    # ── 3. Accumulators ──────────────────────────────────────────────────────
    slug_data: Dict[str, dict] = {}

    def ensure(slug: str):
        if slug not in slug_data:
            node = MUSCLE_MAP.get(slug, {})
            slug_data[slug] = {
                "slug": slug,
                "name": node.get("name", slug),
                "level": node.get("level", 0),
                "hyp_primary": 0.0,
                "hyp_secondary": 0.0,
                "hyp_stabilizer": 0.0,
                "strength": 0.0,
                "endurance": 0.0,
                "best_e1rm": None,
                "exercises": {},
            }

    def credit(slug, role, hyp, strength, endurance, e1rm, ex_name):
        ensure(slug)
        d = slug_data[slug]
        if role == "primary":
            d["hyp_primary"] += hyp
        elif role == "secondary":
            d["hyp_secondary"] += hyp * 0.4
        else:
            d["hyp_stabilizer"] += hyp * 0.15
        d["strength"] += strength
        d["endurance"] += endurance
        if e1rm and (d["best_e1rm"] is None or e1rm > d["best_e1rm"]):
            d["best_e1rm"] = e1rm
        if ex_name:
            ex = d["exercises"].setdefault(
                ex_name, {"hyp": 0.0, "str": 0.0, "end": 0.0}
            )
            ex["hyp"] += hyp
            ex["str"] += strength
            ex["end"] += endurance

    # ── 4. Walk all sets ─────────────────────────────────────────────────────
    for workout in workouts:
        for ex_item in workout.get("exercises") or []:
            ex_id = ex_item.get("exercise_id")
            if not ex_id or ex_id not in ex_info:
                continue

            info = ex_info[ex_id]
            muscle_loads = info["muscle_loads"]
            if not muscle_loads:
                continue

            kind = info["kind"] or "Barbell"
            ex_name = info["name"]

            for s in ex_item.get("sets") or []:
                if s.get("set_type", "normal") in ("warmup", "cooldown"):
                    continue

                reps = s.get("reps")
                weight = s.get("weight")
                duration = s.get("duration")
                distance = s.get("distance")

                # Epley e1RM
                e1rm = None
                if weight and weight > 0 and reps and 0 < reps < 37:
                    e1rm = round(weight * (1 + reps / 30.0), 2)

                for ml in muscle_loads:
                    slug = ml.get("slug")
                    role = ml.get("role", "primary")
                    load_pct = float(ml.get("load_pct") or 100.0)

                    if not slug or slug not in MUSCLE_MAP:
                        continue

                    hyp = _hyp_score(kind, reps, weight, duration, load_pct)
                    st = _str_score(kind, reps, weight, e1rm, load_pct)
                    end = _end_score(kind, reps, weight, duration, distance, load_pct)

                    credit(slug, role, hyp, st, end, e1rm, ex_name)
                    for ancestor in get_ancestors(slug):
                        credit(ancestor, role, hyp, st, end, e1rm, ex_name)

    # ── 5. Build response ─────────────────────────────────────────────────────
    muscles = []
    for d in slug_data.values():
        top_exs = sorted(
            d["exercises"].items(), key=lambda x: x[1]["hyp"], reverse=True
        )[:5]
        muscles.append(
            MuscleVolumeEntry(
                slug=d["slug"],
                name=d["name"],
                level=d["level"],
                hypertrophy_sets=round(d["hyp_primary"] / weeks, 3),
                hypertrophy_sets_secondary=round(d["hyp_secondary"] / weeks, 3),
                hypertrophy_sets_stabilizer=round(d["hyp_stabilizer"] / weeks, 3),
                strength_score=round(d["strength"] / weeks, 1),
                endurance_reps=round(d["endurance"] / weeks, 1),
                best_e1rm=round(d["best_e1rm"], 2) if d["best_e1rm"] else None,
                top_exercises=[
                    MuscleTopExercise(
                        name=n,
                        hypertrophy_sets=round(v["hyp"] / weeks, 2),
                        strength_score=round(v["str"] / weeks, 1),
                        endurance_reps=round(v["end"] / weeks, 1),
                    )
                    for n, v in top_exs
                ],
            )
        )

    muscles.sort(key=lambda m: m.hypertrophy_sets, reverse=True)

    return MuscleVolumeResponse(
        days=days,
        weeks=round(weeks, 2),
        start_date=start_dt.date().isoformat(),
        end_date=end_dt.date().isoformat(),
        workout_count=len(workouts),
        muscles=muscles,
    )


@api_router.get("/prs", response_model=List[PRRecordResponse])
async def get_prs(
    user_id: str = Depends(get_current_user), exercise_id: Optional[str] = None
):
    query = {"user_id": user_id}
    if exercise_id:
        query["exercise_id"] = exercise_id

    prs = await get_db(user_id).prs.find(query).sort("date", -1).to_list(100)
    return [PRRecord(**{**pr, "id": str(pr["_id"])}) for pr in prs]


async def check_and_create_prs(user_id: str, workout_id: str):
    """Check workout for PRs and create PR records with detailed PR types"""
    workout = await get_db(user_id).workouts.find_one({"_id": ObjectId(workout_id)})
    if not workout:
        return

    pr_flags_updates = []

    for ex_idx, exercise in enumerate(workout.get("exercises", [])):
        exercise_id = exercise["exercise_id"]

        ex_data = (
            await get_db(user_id).exercises.find_one({"_id": ObjectId(exercise_id)})
            if ObjectId.is_valid(exercise_id)
            else None
        )
        ex_kind = ex_data.get("exercise_kind", "Barbell") if ex_data else "Barbell"
        is_duration_based = ex_kind in ["Cardio", "Duration"]

        existing_prs = (
            await get_db(user_id)
            .prs.find({"user_id": user_id, "exercise_id": exercise_id})
            .to_list(100)
        )

        max_weight = max([pr.get("weight") or 0 for pr in existing_prs], default=0) or 0
        max_reps = max([pr.get("reps") or 0 for pr in existing_prs], default=0) or 0
        max_volume = max([pr.get("volume") or 0 for pr in existing_prs], default=0) or 0
        max_duration = (
            max([pr.get("duration") or 0 for pr in existing_prs], default=0) or 0
        )
        max_1rm = (
            max([pr.get("estimated_1rm") or 0 for pr in existing_prs], default=0) or 0
        )

        for set_idx, set_data in enumerate(exercise.get("sets", [])):
            set_type = set_data.get("set_type", "normal")
            if set_type in ("warmup", "cooldown"):
                continue

            weight = set_data.get("weight") or 0
            reps = set_data.get("reps") or 0
            duration = set_data.get("duration") or 0
            volume = weight * reps if weight > 0 and reps > 0 else 0

            estimated_1rm = (
                weight * (36 / (37 - reps))
                if reps > 0 and reps < 37 and weight > 0
                else weight
            )

            is_weight_pr = False
            is_reps_pr = False
            is_volume_pr = False
            is_duration_pr = False
            is_1rm_pr = False

            if not is_duration_based:
                if weight > max_weight and weight > 0:
                    is_weight_pr = True
                    max_weight = weight

                if reps > max_reps and reps > 0:
                    is_reps_pr = True
                    max_reps = reps

                if volume > max_volume and volume > 0:
                    is_volume_pr = True
                    max_volume = volume

                if estimated_1rm > max_1rm and estimated_1rm > 0:
                    is_1rm_pr = True
                    max_1rm = estimated_1rm
            else:
                if duration > max_duration and duration > 0:
                    is_duration_pr = True
                    max_duration = duration

            if is_weight_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type=PRType.WEIGHT,
                    weight=weight,
                    reps=reps,
                )
                await get_db(user_id).prs.insert_one(
                    pr.dict(by_alias=True, exclude={"id"})
                )

            if is_reps_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type=PRType.REPS,
                    weight=weight,
                    reps=reps,
                )
                await get_db(user_id).prs.insert_one(
                    pr.dict(by_alias=True, exclude={"id"})
                )

            if is_volume_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type=PRType.VOLUME,
                    weight=weight,
                    reps=reps,
                    volume=volume,
                )
                await get_db(user_id).prs.insert_one(
                    pr.dict(by_alias=True, exclude={"id"})
                )

            if is_1rm_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type=PRType.ONE_RM,
                    weight=weight,
                    reps=reps,
                    estimated_1rm=estimated_1rm,
                )
                await get_db(user_id).prs.insert_one(
                    pr.dict(by_alias=True, exclude={"id"})
                )

            if is_duration_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type=PRType.DURATION,
                    duration=duration,
                )
                await get_db(user_id).prs.insert_one(
                    pr.dict(by_alias=True, exclude={"id"})
                )

            if is_weight_pr or is_reps_pr or is_volume_pr or is_duration_pr:
                pr_flags_updates.append(
                    {
                        "ex_idx": ex_idx,
                        "set_idx": set_idx,
                        "is_weight_pr": is_weight_pr,
                        "is_reps_pr": is_reps_pr,
                        "is_volume_pr": is_volume_pr,
                        "is_duration_pr": is_duration_pr,
                    }
                )

    if pr_flags_updates:
        for update in pr_flags_updates:
            await get_db(user_id).workouts.update_one(
                {"_id": ObjectId(workout_id)},
                {
                    "$set": {
                        f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_weight_pr": update[
                            "is_weight_pr"
                        ],
                        f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_reps_pr": update[
                            "is_reps_pr"
                        ],
                        f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_volume_pr": update[
                            "is_volume_pr"
                        ],
                        f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_duration_pr": update[
                            "is_duration_pr"
                        ],
                    }
                },
            )


# ============= PLANNED WORKOUT HELPER FUNCTIONS =============


def expand_recurring_workouts(
    planned_workouts: List[dict], start_date: str, end_date: str
) -> List[dict]:
    from datetime import date

    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    expanded = []

    for pw in planned_workouts:
        if not pw.get("is_recurring", False):
            pw_date = date.fromisoformat(pw["date"])
            if start <= pw_date <= end:
                expanded.append(pw)
        else:
            recurrence_type = pw.get("recurrence_type")
            recurrence_end_str = pw.get("recurrence_end_date")

            actual_end = end
            if recurrence_end_str:
                recurrence_end = date.fromisoformat(recurrence_end_str)
                actual_end = min(end, recurrence_end)

            pw_start_date = date.fromisoformat(pw["date"])
            current_date = max(start, pw_start_date)

            if recurrence_type == "daily":
                while current_date <= actual_end:
                    instance = pw.copy()
                    instance["date"] = current_date.isoformat()
                    instance["recurrence_parent_id"] = str(pw["_id"])
                    instance["status"] = "planned"
                    instance["workout_session_id"] = None
                    expanded.append(instance)
                    current_date += timedelta(days=1)

            elif recurrence_type == "weekly":
                recurrence_days = pw.get("recurrence_days", [])
                if not recurrence_days:
                    continue

                while current_date <= actual_end:
                    if current_date.weekday() in recurrence_days:
                        instance = pw.copy()
                        instance["date"] = current_date.isoformat()
                        instance["recurrence_parent_id"] = str(pw["_id"])
                        instance["status"] = "planned"
                        instance["workout_session_id"] = None
                        expanded.append(instance)
                    current_date += timedelta(days=1)

            elif recurrence_type == "monthly":
                original_day = pw_start_date.day
                current_date = max(start, pw_start_date)

                while current_date <= actual_end:
                    try:
                        occurrence_date = date(
                            current_date.year, current_date.month, original_day
                        )
                        if start <= occurrence_date <= actual_end:
                            instance = pw.copy()
                            instance["date"] = occurrence_date.isoformat()
                            instance["recurrence_parent_id"] = str(pw["_id"])
                            instance["status"] = "planned"
                            instance["workout_session_id"] = None
                            expanded.append(instance)
                    except ValueError:
                        pass

                    if current_date.month == 12:
                        current_date = date(current_date.year + 1, 1, 1)
                    else:
                        current_date = date(
                            current_date.year, current_date.month + 1, 1
                        )

    expanded.sort(key=lambda x: (x["date"], x.get("order", 0)))
    return expanded


async def enrich_planned_workouts_with_sessions(
    planned_workouts: List[dict], user_id: str
) -> List[dict]:
    from datetime import datetime as dt

    if not planned_workouts:
        return planned_workouts

    date_windows = {}
    id_candidates = set()

    for pw in planned_workouts:
        date_str = pw.get("date")
        if date_str:
            start = dt.fromisoformat(date_str + "T00:00:00")
            end = dt.fromisoformat(date_str + "T23:59:59")
            date_windows[pw.get("id") or pw.get("_id")] = (start, end)

        if pw.get("id"):
            id_candidates.add(str(pw["id"]))
        if pw.get("_id") and isinstance(pw["_id"], ObjectId):
            id_candidates.add(str(pw["_id"]))
        if pw.get("recurrence_parent_id"):
            id_candidates.add(str(pw["recurrence_parent_id"]))

    id_candidates = list(id_candidates)
    if not id_candidates:
        return planned_workouts

    sessions_cursor = get_db(user_id).workouts.find(
        {"user_id": user_id, "planned_workout_id": {"$in": id_candidates}}
    )
    sessions = await sessions_cursor.to_list(200)

    sessions_by_planned: dict[str, list] = {}
    for s in sessions:
        pid = str(s.get("planned_workout_id"))
        sessions_by_planned.setdefault(pid, []).append(s)

    enriched = []

    for pw in planned_workouts:
        pw = dict(pw)
        if pw.get("status") == "skipped":
            enriched.append(pw)
            continue

        candidates = []
        if pw.get("id"):
            candidates.append(str(pw["id"]))
        if pw.get("_id"):
            candidates.append(str(pw["_id"]))
        if pw.get("recurrence_parent_id"):
            candidates.append(str(pw["recurrence_parent_id"]))

        matching = []
        for cid in candidates:
            matching.extend(sessions_by_planned.get(cid, []))

        date_str = pw.get("date")
        if matching and date_str:
            start, end = dt.fromisoformat(date_str + "T00:00:00"), dt.fromisoformat(
                date_str + "T23:59:59"
            )
            matching = [
                s
                for s in matching
                if s.get("started_at") and start <= s["started_at"] <= end
            ]

        if matching:
            session = max(
                matching, key=lambda s: s.get("created_at", s.get("started_at"))
            )
            started, ended, skipped = (
                session.get("started_at"),
                session.get("ended_at"),
                session.get("skipped"),
            )

            if ended:
                pw["status"] = "completed"
            elif skipped:
                pw["status"] = "skipped"
            elif started:
                pw["status"] = "in_progress"
            else:
                pw["status"] = "planned"

            pw["workout_session_id"] = str(session["_id"])
            if session.get("name"):
                pw["name"] = session["name"]
            if session.get("notes"):
                pw["notes"] = session["notes"]
        else:
            pw.setdefault("status", "planned")

        enriched.append(pw)

    return enriched


# ============= PLANNED WORKOUT ROUTES =============


@api_router.post("/planned-workouts", response_model=PlannedWorkoutResponse)
async def create_planned_workout(
    workout_data: PlannedWorkoutCreate, user_id: str = Depends(get_current_user)
):
    """Create a new planned workout (one-time or recurring)"""
    planned_workout = PlannedWorkout(user_id=user_id, **workout_data.dict())

    result = await get_db(user_id).planned_workouts.insert_one(
        planned_workout.dict(by_alias=True, exclude={"id"})
    )

    planned_workout_dict = await get_db(user_id).planned_workouts.find_one(
        {"_id": result.inserted_id}
    )
    return PlannedWorkout(
        **{**planned_workout_dict, "id": str(planned_workout_dict["_id"])}
    )


def _is_yyyy_mm_dd(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except Exception:
        return False


@api_router.get("/planned-workouts", response_model=List[PlannedWorkoutResponse])
async def get_planned_workouts(
    user_id: str = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,
):
    """
    Get planned workouts for a user, including unscheduled workouts that happened on the date.
    - If 'date' is provided, returns workouts for that specific day (expanded if recurring + actual sessions)
    - If 'start_date' and 'end_date' are provided, returns workouts in that range (expanded + actual sessions)
    - Otherwise, returns all planned workouts (not expanded)
    """
    if date and (start_date or end_date):
        raise HTTPException(
            status_code=400,
            detail="Provide either 'date' or ('start_date' and 'end_date'), not both.",
        )

    if date:
        if not _is_yyyy_mm_dd(date):
            raise HTTPException(
                status_code=400, detail="Invalid 'date' format (YYYY-MM-DD)."
            )
        start_date = date
        end_date = date

    if (start_date and not end_date) or (end_date and not start_date):
        raise HTTPException(
            status_code=400, detail="Provide both 'start_date' and 'end_date'."
        )

    if start_date and end_date:
        if not _is_yyyy_mm_dd(start_date) or not _is_yyyy_mm_dd(end_date):
            raise HTTPException(
                status_code=400, detail="Invalid date format (YYYY-MM-DD)."
            )
        if start_date > end_date:
            raise HTTPException(
                status_code=400, detail="'start_date' must be <= 'end_date'."
            )

    base_query = {"user_id": user_id}

    if not start_date and not end_date:
        workouts = await get_db(user_id).planned_workouts.find(base_query).to_list(1000)
        for w in workouts:
            w["id"] = str(w["_id"])
        return [PlannedWorkout(**w) for w in workouts]

    range_query = {
        **base_query,
        "$or": [
            {
                "is_recurring": {"$ne": True},
                "date": {"$gte": start_date, "$lte": end_date},
            },
            {
                "is_recurring": True,
                "date": {"$lte": end_date},
                "$or": [
                    {"recurrence_end_date": {"$exists": False}},
                    {"recurrence_end_date": None},
                    {"recurrence_end_date": ""},
                    {"recurrence_end_date": {"$gte": start_date}},
                ],
            },
        ],
    }

    workouts = await get_db(user_id).planned_workouts.find(range_query).to_list(2000)

    for w in workouts:
        w["id"] = str(w["_id"])

    enriched = await enrich_planned_workouts_with_sessions(workouts, user_id)

    return [PlannedWorkout(**w) for w in enriched]


@api_router.get("/planned-workouts/{workout_id}", response_model=PlannedWorkoutResponse)
async def get_planned_workout(
    workout_id: str, user_id: str = Depends(get_current_user)
):
    """Get a specific planned workout"""
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(status_code=400, detail="Invalid workout ID")

    workout = await get_db(user_id).planned_workouts.find_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}
    )

    if not workout:
        raise HTTPException(status_code=404, detail="Planned workout not found")

    return PlannedWorkout(**{**workout, "id": str(workout["_id"])})


@api_router.put("/planned-workouts/{workout_id}", response_model=PlannedWorkoutResponse)
async def update_planned_workout(
    workout_id: str,
    workout_data: PlannedWorkoutUpdate,
    user_id: str = Depends(get_current_user),
):
    """Update a planned workout"""
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(status_code=400, detail="Invalid workout ID")

    existing = await get_db(user_id).planned_workouts.find_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Planned workout not found")

    update_data = {
        k: v for k, v in workout_data.dict(exclude_unset=True).items() if v is not None
    }

    if update_data:
        await get_db(user_id).planned_workouts.update_one(
            {"_id": ObjectId(workout_id)}, {"$set": update_data}
        )

    updated = await get_db(user_id).planned_workouts.find_one(
        {"_id": ObjectId(workout_id)}
    )
    return PlannedWorkout(**{**updated, "id": str(updated["_id"])})


@api_router.delete("/planned-workouts/{workout_id}")
async def delete_planned_workout(
    workout_id: str, user_id: str = Depends(get_current_user)
):
    """Delete a planned workout"""
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(status_code=400, detail="Invalid workout ID")

    result = await get_db(user_id).planned_workouts.delete_one(
        {"_id": ObjectId(workout_id), "user_id": user_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Planned workout not found")

    return {"message": "Planned workout deleted"}


# ============= REVENUECAT WEBHOOK =============

REVENUECAT_WEBHOOK_SECRET = os.getenv("REVENUECAT_WEBHOOK_SECRET", "")

_RC_GRANT_EVENTS = {"INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED"}
_RC_REVOKE_EVENTS = {"EXPIRATION", "BILLING_ISSUE"}


@api_router.post("/webhooks/revenuecat")
async def revenuecat_webhook(
    request_body: dict,
    authorization: Optional[str] = Header(None),
):
    if REVENUECAT_WEBHOOK_SECRET:
        expected = f"Bearer {REVENUECAT_WEBHOOK_SECRET}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

    event = request_body.get("event", {})
    event_type = event.get("type", "")
    app_user_id = event.get("app_user_id", "")

    if not app_user_id:
        return {"ok": True}

    try:
        user_filter = {"_id": ObjectId(app_user_id)}
    except Exception:
        return {"ok": True}

    if event_type in _RC_GRANT_EVENTS:
        await db.users.update_one(user_filter, {"$set": {"is_pro": True}})
    elif event_type in _RC_REVOKE_EVENTS:
        await db.users.update_one(user_filter, {"$set": {"is_pro": False}})

    return {"ok": True}


# ============= ROOT =============


@api_router.get("/")
async def root():
    return {"message": "Strong Workout Tracker API", "version": "1.0.0"}


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_policy():
    return """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy – Stronger</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1c1c1e;line-height:1.7}h1{font-size:28px;margin-bottom:4px}h2{font-size:18px;margin-top:32px}p,li{font-size:15px;color:#3a3a3c}ul{padding-left:20px}a{color:#007aff}</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p><em>Last updated: May 2026</em></p>
<p>Stronger ("we", "our", or "us") is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights.</p>

<h2>1. Data We Collect</h2>
<ul>
<li><strong>Account data:</strong> Email address and name (or Apple ID token for Sign in with Apple users).</li>
<li><strong>Workout data:</strong> Exercises, sets, reps, weights, and workout sessions you log.</li>
<li><strong>AI conversations:</strong> Messages you send to the AI coach and responses generated.</li>
<li><strong>Notes:</strong> Any notes saved by you or the AI during sessions.</li>
<li><strong>Device data:</strong> Basic device identifiers used by RevenueCat for purchase validation.</li>
</ul>

<h2>2. How We Use Your Data</h2>
<ul>
<li>To provide and improve the app experience.</li>
<li>To power AI coaching responses personalized to your history.</li>
<li>To validate in-app subscriptions via RevenueCat.</li>
<li>We do not sell your data to third parties.</li>
</ul>

<h2>3. Third-Party Services</h2>
<ul>
<li><strong>RevenueCat:</strong> Handles subscription and purchase management.</li>
<li><strong>OpenRouter / OpenAI:</strong> Powers AI coaching responses. Conversation content may be processed on their servers.</li>
<li><strong>Apple Sign In:</strong> Used for authentication. We receive only a user token and email.</li>
</ul>

<h2>4. Data Storage</h2>
<p>Your data is stored in MongoDB Atlas on servers in the United States. We retain your data as long as your account is active.</p>

<h2>5. Your Rights</h2>
<p>You may request deletion of your account and all associated data by emailing us. Once deleted, data cannot be recovered.</p>

<h2>6. Children</h2>
<p>Stronger is not directed at children under 13. We do not knowingly collect data from children.</p>

<h2>7. Contact</h2>
<p>Questions? Email us at <a href="mailto:ofiryieldchain@gmail.com">ofiryieldchain@gmail.com</a></p>
</body>
</html>"""


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
