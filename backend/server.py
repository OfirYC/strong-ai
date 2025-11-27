from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

from models import (
    User, UserCreate, UserLogin, UserResponse,
    Exercise, ExerciseCreate,
    WorkoutTemplate, WorkoutTemplateCreate,
    WorkoutSession, WorkoutSessionCreate, WorkoutSessionUpdate,
    PRRecord
)
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
from seed_exercises_new import EXERCISES

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'workout_tracker')]

# Create the main app without a prefix
app = FastAPI(title="Strong Workout Tracker API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
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


# ============= AUTH ROUTES =============
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    password_hash = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        password_hash=password_hash
    )
    
    result = await db.users.insert_one(user.dict(by_alias=True, exclude={"id"}))
    user_id = str(result.inserted_id)
    
    # Create token
    token = create_access_token({"user_id": user_id})
    
    return UserResponse(id=user_id, email=user.email, token=token)


@api_router.post("/auth/login", response_model=UserResponse)
async def login(credentials: UserLogin):
    # Find user
    user_doc = await db.users.find_one({"email": credentials.email})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password
    if not verify_password(credentials.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id = str(user_doc["_id"])
    
    # Create token
    token = create_access_token({"user_id": user_id})
    
    return UserResponse(id=user_id, email=user_doc["email"], token=token)


# ============= EXERCISE ROUTES =============
@api_router.get("/exercises", response_model=List[Exercise])
async def get_exercises(
    user_id: str = Depends(get_current_user),
    muscle_group: Optional[str] = None,
    search: Optional[str] = None
):
    # Build query
    query = {"$or": [{"is_custom": False}, {"user_id": user_id}]}
    
    if muscle_group:
        query["muscle_group"] = muscle_group
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    exercises = await db.exercises.find(query).to_list(1000)
    
    return [Exercise(**{**ex, "_id": str(ex["_id"])}) for ex in exercises]


@api_router.post("/exercises", response_model=Exercise)
async def create_exercise(
    exercise_data: ExerciseCreate,
    user_id: str = Depends(get_current_user)
):
    exercise = Exercise(
        **exercise_data.dict(),
        user_id=user_id,
        is_custom=True
    )
    
    result = await db.exercises.insert_one(exercise.dict(by_alias=True, exclude={"id"}))
    exercise.id = str(result.inserted_id)
    
    return exercise


@api_router.get("/exercises/{exercise_id}", response_model=Exercise)
async def get_exercise(
    exercise_id: str,
    user_id: str = Depends(get_current_user)
):
    exercise = await db.exercises.find_one({"_id": ObjectId(exercise_id)})
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    return Exercise(**{**exercise, "_id": str(exercise["_id"])})


# ============= TEMPLATE ROUTES =============
@api_router.get("/templates", response_model=List[WorkoutTemplate])
async def get_templates(user_id: str = Depends(get_current_user)):
    templates = await db.templates.find({"user_id": user_id}).to_list(1000)
    return [WorkoutTemplate(**{**t, "_id": str(t["_id"])}) for t in templates]


@api_router.post("/templates", response_model=WorkoutTemplate)
async def create_template(
    template_data: WorkoutTemplateCreate,
    user_id: str = Depends(get_current_user)
):
    template = WorkoutTemplate(
        **template_data.dict(),
        user_id=user_id
    )
    
    result = await db.templates.insert_one(template.dict(by_alias=True, exclude={"id"}))
    template.id = str(result.inserted_id)
    
    return template


@api_router.get("/templates/{template_id}", response_model=WorkoutTemplate)
async def get_template(
    template_id: str,
    user_id: str = Depends(get_current_user)
):
    template = await db.templates.find_one({"_id": ObjectId(template_id), "user_id": user_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return WorkoutTemplate(**{**template, "_id": str(template["_id"])})


@api_router.put("/templates/{template_id}", response_model=WorkoutTemplate)
async def update_template(
    template_id: str,
    template_data: WorkoutTemplateCreate,
    user_id: str = Depends(get_current_user)
):
    result = await db.templates.update_one(
        {"_id": ObjectId(template_id), "user_id": user_id},
        {"$set": {**template_data.dict(), "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    template = await db.templates.find_one({"_id": ObjectId(template_id)})
    return WorkoutTemplate(**{**template, "_id": str(template["_id"])})


@api_router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    user_id: str = Depends(get_current_user)
):
    result = await db.templates.delete_one({"_id": ObjectId(template_id), "user_id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template deleted"}


# ============= WORKOUT SESSION ROUTES =============
@api_router.post("/workouts", response_model=WorkoutSession)
async def start_workout(
    workout_data: WorkoutSessionCreate,
    user_id: str = Depends(get_current_user)
):
    workout = WorkoutSession(
        **workout_data.dict(),
        user_id=user_id
    )
    
    result = await db.workouts.insert_one(workout.dict(by_alias=True, exclude={"id"}))
    workout.id = str(result.inserted_id)
    
    return workout


@api_router.get("/workouts", response_model=List[WorkoutSession])
async def get_workouts(
    user_id: str = Depends(get_current_user),
    limit: int = 50
):
    workouts = await db.workouts.find({"user_id": user_id}).sort("started_at", -1).limit(limit).to_list(limit)
    return [WorkoutSession(**{**w, "_id": str(w["_id"])}) for w in workouts]


@api_router.get("/workouts/{workout_id}", response_model=WorkoutSession)
async def get_workout(
    workout_id: str,
    user_id: str = Depends(get_current_user)
):
    workout = await db.workouts.find_one({"_id": ObjectId(workout_id), "user_id": user_id})
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    return WorkoutSession(**{**workout, "_id": str(workout["_id"])})


@api_router.put("/workouts/{workout_id}", response_model=WorkoutSession)
async def update_workout(
    workout_id: str,
    workout_data: WorkoutSessionUpdate,
    user_id: str = Depends(get_current_user)
):
    update_dict = workout_data.dict(exclude_unset=True)
    
    result = await db.workouts.update_one(
        {"_id": ObjectId(workout_id), "user_id": user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    # Check for PRs if workout is completed
    if workout_data.ended_at:
        await check_and_create_prs(user_id, workout_id)
    
    workout = await db.workouts.find_one({"_id": ObjectId(workout_id)})
    return WorkoutSession(**{**workout, "_id": str(workout["_id"])})


# ============= PR ROUTES =============
@api_router.get("/prs", response_model=List[PRRecord])
async def get_prs(
    user_id: str = Depends(get_current_user),
    exercise_id: Optional[str] = None
):
    query = {"user_id": user_id}
    if exercise_id:
        query["exercise_id"] = exercise_id
    
    prs = await db.prs.find(query).sort("date", -1).to_list(100)
    return [PRRecord(**{**pr, "_id": str(pr["_id"])}) for pr in prs]


async def check_and_create_prs(user_id: str, workout_id: str):
    """Check workout for PRs and create PR records"""
    workout = await db.workouts.find_one({"_id": ObjectId(workout_id)})
    if not workout:
        return
    
    for exercise in workout.get("exercises", []):
        exercise_id = exercise["exercise_id"]
        
        for set_data in exercise.get("sets", []):
            if set_data.get("is_warmup", False):
                continue
            
            weight = set_data.get("weight", 0)
            reps = set_data.get("reps", 0)
            
            if weight <= 0 or reps <= 0:
                continue
            
            # Calculate estimated 1RM using Brzycki formula
            estimated_1rm = weight * (36 / (37 - reps)) if reps < 37 else weight
            
            # Check if this is a PR
            existing_pr = await db.prs.find_one({
                "user_id": user_id,
                "exercise_id": exercise_id,
                "estimated_1rm": {"$gte": estimated_1rm}
            })
            
            if not existing_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    weight=weight,
                    reps=reps,
                    estimated_1rm=estimated_1rm
                )
                await db.prs.insert_one(pr.dict(by_alias=True, exclude={"id"}))


# ============= SEED DATA =============
@api_router.post("/seed")
async def seed_exercises():
    """Seed the database with default exercises"""
    count = await db.exercises.count_documents({"is_custom": False})
    
    if count > 0:
        return {"message": f"Database already has {count} exercises"}
    
    exercises = []
    for ex_data in EXERCISES:
        exercise = Exercise(
            **ex_data,
            is_custom=False,
            user_id=None
        )
        exercises.append(exercise.dict(by_alias=True, exclude={"id"}))
    
    result = await db.exercises.insert_many(exercises)
    
    return {"message": f"Seeded {len(result.inserted_ids)} exercises"}


@api_router.get("/")
async def root():
    return {"message": "Strong Workout Tracker API", "version": "1.0.0"}


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
