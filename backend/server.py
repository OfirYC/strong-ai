from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime
from bson import ObjectId

from models import (
    User, UserCreate, UserLogin, UserResponse,
    Exercise, ExerciseCreate, ExerciseUpdate,
    WorkoutTemplate, WorkoutTemplateCreate,
    WorkoutSession, WorkoutSessionCreate, WorkoutSessionUpdate,
    PRRecord, WorkoutSummary, WorkoutExerciseSummary
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
@api_router.get("/exercises")
async def get_exercises(
    user_id: str = Depends(get_current_user),
    body_part: Optional[str] = None,
    exercise_kind: Optional[str] = None,
    search: Optional[str] = None
):
    # Build query - show all exercises (default + custom from all users)
    query = {}
    
    if body_part:
        query["$or"] = [
            {"primary_body_parts": body_part},
            {"secondary_body_parts": body_part}
        ]
    
    if exercise_kind:
        query["exercise_kind"] = exercise_kind
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    exercises = await db.exercises.find(query).to_list(1000)
    
    # Convert _id to id for frontend
    result = []
    for ex in exercises:
        ex_dict = dict(ex)
        ex_dict['id'] = str(ex_dict.pop('_id'))
        result.append(ex_dict)
    
    return result


@api_router.post("/exercises", response_model=Exercise)
async def create_exercise(
    exercise_data: ExerciseCreate,
    user_id: str = Depends(get_current_user)
):
    exercise_dict = exercise_data.dict()
    exercise_dict['is_custom'] = True  # Always mark user-created exercises as custom
    exercise_dict['user_id'] = user_id
    
    exercise = Exercise(**exercise_dict)
    
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
    
    return Exercise(**{**exercise, "id": str(exercise["_id"])})


@api_router.patch("/exercises/{exercise_id}", response_model=Exercise)
async def update_exercise(
    exercise_id: str,
    update_data: ExerciseUpdate,
    user_id: str = Depends(get_current_user)
):
    exercise = await db.exercises.find_one({"_id": ObjectId(exercise_id)})
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    # Build update dict with only provided fields
    update_dict = {}
    if update_data.instructions is not None:
        update_dict["instructions"] = update_data.instructions
    if update_data.image is not None:
        update_dict["image"] = update_data.image
    
    if update_dict:
        await db.exercises.update_one(
            {"_id": ObjectId(exercise_id)},
            {"$set": update_dict}
        )
    
    updated_exercise = await db.exercises.find_one({"_id": ObjectId(exercise_id)})
    return Exercise(**{**updated_exercise, "id": str(updated_exercise["_id"])})


# ============= TEMPLATE ROUTES =============
@api_router.get("/templates", response_model=List[WorkoutTemplate])
async def get_templates(user_id: str = Depends(get_current_user)):
    templates = await db.templates.find({"user_id": user_id}).to_list(1000)
    return [WorkoutTemplate(**{**t, "id": str(t["_id"])}) for t in templates]


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
    
    return WorkoutTemplate(**{**template, "id": str(template["_id"])})


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
    return WorkoutTemplate(**{**template, "id": str(template["_id"])})


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
    # If template_id is provided, load the template and pre-populate exercises
    exercises = []
    name = workout_data.name
    notes = workout_data.notes
    
    if workout_data.template_id:
        template = await db.templates.find_one({
            "_id": ObjectId(workout_data.template_id),
            "user_id": user_id
        })
        if template:
            name = name or template.get("name")
            notes = notes or template.get("notes")
            # Convert template exercises to workout exercises with pre-populated sets
            for tmpl_ex in template.get("exercises", []):
                # Check if new format (has 'sets' array) or legacy format
                tmpl_sets = tmpl_ex.get("sets", [])
                if tmpl_sets:
                    # New format: use the sets directly
                    sets = []
                    for tmpl_set in tmpl_sets:
                        set_item = {
                            "is_warmup": tmpl_set.get("is_warmup", False),
                            "weight": tmpl_set.get("weight"),
                            "reps": tmpl_set.get("reps"),
                            "duration": tmpl_set.get("duration"),
                            "distance": tmpl_set.get("distance"),
                        }
                        # Remove None values
                        set_item = {k: v for k, v in set_item.items() if v is not None}
                        set_item["is_warmup"] = tmpl_set.get("is_warmup", False)
                        sets.append(set_item)
                else:
                    # Legacy format: create default sets
                    sets = []
                    num_sets = tmpl_ex.get("default_sets", 3)
                    for _ in range(num_sets):
                        set_item = {"is_warmup": False}
                        if tmpl_ex.get("default_weight") is not None:
                            set_item["weight"] = tmpl_ex["default_weight"]
                        if tmpl_ex.get("default_reps") is not None:
                            set_item["reps"] = tmpl_ex["default_reps"]
                        if tmpl_ex.get("default_duration") is not None:
                            set_item["duration"] = tmpl_ex["default_duration"]
                        if tmpl_ex.get("default_distance") is not None:
                            set_item["distance"] = tmpl_ex["default_distance"]
                        sets.append(set_item)
                
                exercises.append({
                    "exercise_id": tmpl_ex["exercise_id"],
                    "order": tmpl_ex["order"],
                    "sets": sets,
                    "notes": tmpl_ex.get("notes")
                })
    
    workout = WorkoutSession(
        user_id=user_id,
        template_id=workout_data.template_id,
        name=name,
        notes=notes,
        exercises=exercises
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
    return [WorkoutSession(**{**w, "id": str(w["_id"])}) for w in workouts]


# Get completed workout count for user
@api_router.get("/workouts/count")
async def get_workout_count(
    user_id: str = Depends(get_current_user)
):
    """Get the total number of completed workouts for the user"""
    count = await db.workouts.count_documents({"user_id": user_id, "ended_at": {"$ne": None}})
    return {"count": count}


# IMPORTANT: This route MUST come before /workouts/{workout_id} to avoid "history" being treated as a workout_id
@api_router.get("/workouts/history", response_model=List[WorkoutSummary])
async def get_workout_history(
    user_id: str = Depends(get_current_user),
    limit: int = 50
):
    """Get workout history with computed summary statistics"""
    workouts = await db.workouts.find({"user_id": user_id, "ended_at": {"$ne": None}}).sort("started_at", -1).limit(limit).to_list(limit)
    
    # Get all exercise IDs we need
    exercise_ids = set()
    for workout in workouts:
        for ex in workout.get("exercises", []):
            exercise_ids.add(ex["exercise_id"])
    
    # Fetch all exercises in one query
    exercises_map = {}
    if exercise_ids:
        exercises = await db.exercises.find({"_id": {"$in": [ObjectId(eid) for eid in exercise_ids if ObjectId.is_valid(eid)]}}).to_list(len(exercise_ids))
        for ex in exercises:
            exercises_map[str(ex["_id"])] = ex
    
    # Count PRs per workout
    workout_ids = [str(w["_id"]) for w in workouts]
    pr_counts = {}
    if workout_ids:
        prs = await db.prs.find({"workout_id": {"$in": workout_ids}}).to_list(1000)
        for pr in prs:
            wid = pr.get("workout_id")
            if wid:
                pr_counts[wid] = pr_counts.get(wid, 0) + 1
    
    summaries = []
    for workout in workouts:
        workout_id = str(workout["_id"])
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
            
            # Calculate best set and volume
            best_weight = 0
            best_reps = 0
            best_duration = 0
            best_set_display = ""
            estimated_1rm = None
            
            for s in sets:
                if s.get("is_warmup", False):
                    continue
                    
                weight = s.get("weight") or 0
                reps = s.get("reps") or 0
                duration = s.get("duration") or 0
                
                # Calculate volume for weight-based exercises
                if weight > 0 and reps > 0:
                    total_volume_kg += weight * reps
                    
                    # Calculate 1RM for comparison
                    set_1rm = weight * (36 / (37 - reps)) if reps < 37 else weight
                    
                    if set_1rm > (estimated_1rm or 0):
                        estimated_1rm = set_1rm
                        best_weight = weight
                        best_reps = reps
                
                # Track best duration for duration-based exercises
                if duration > best_duration:
                    best_duration = duration
                
                # Track best reps
                if reps > best_reps:
                    best_reps = reps
            
            # Format best set display based on exercise kind
            if ex_kind in ['Cardio', 'Duration']:
                if best_duration > 0:
                    mins = best_duration // 60
                    secs = best_duration % 60
                    best_set_display = f"{mins}:{secs:02d}"
                else:
                    best_set_display = "0:00"
            elif ex_kind == 'Reps Only':
                best_set_display = f"{best_reps} reps" if best_reps > 0 else "-"
            else:
                if best_weight > 0 and best_reps > 0:
                    best_set_display = f"{best_weight}kg × {best_reps}"
                elif best_reps > 0:
                    best_set_display = f"{best_reps} reps"
                else:
                    best_set_display = "-"
            
            exercise_summaries.append(WorkoutExerciseSummary(
                exercise_id=exercise_id,
                name=ex_name,
                exercise_kind=ex_kind,
                set_count=len(sets),
                best_set_display=best_set_display,
                estimated_1rm=estimated_1rm
            ))
        
        summaries.append(WorkoutSummary(
            id=workout_id,
            name=workout.get("name"),
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
            exercise_count=exercise_count,
            set_count=set_count,
            total_volume_kg=total_volume_kg,
            pr_count=pr_counts.get(workout_id, 0),
            exercises=exercise_summaries
        ))
    
    return summaries


@api_router.get("/workouts/{workout_id}", response_model=WorkoutSession)
async def get_workout(
    workout_id: str,
    user_id: str = Depends(get_current_user)
):
    workout = await db.workouts.find_one({"_id": ObjectId(workout_id), "user_id": user_id})
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    return WorkoutSession(**{**workout, "id": str(workout["_id"])})


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
    return WorkoutSession(**{**workout, "id": str(workout["_id"])})


@api_router.get("/workouts/{workout_id}/detail", response_model=WorkoutSummary)
async def get_workout_detail(
    workout_id: str,
    user_id: str = Depends(get_current_user)
):
    """Get detailed workout summary with exercise breakdown"""
    workout = await db.workouts.find_one({"_id": ObjectId(workout_id), "user_id": user_id})
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    # Get all exercise details
    exercise_ids = [ex["exercise_id"] for ex in workout.get("exercises", [])]
    exercises_map = {}
    if exercise_ids:
        exercises = await db.exercises.find({"_id": {"$in": [ObjectId(eid) for eid in exercise_ids if ObjectId.is_valid(eid)]}}).to_list(len(exercise_ids))
        for ex in exercises:
            exercises_map[str(ex["_id"])] = ex
    
    # Count PRs for this workout
    prs = await db.prs.find({"workout_id": workout_id}).to_list(100)
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
        
        # Calculate best set and volume
        best_weight = 0
        best_reps = 0
        best_duration = 0
        estimated_1rm = None
        
        for s in sets:
            if s.get("is_warmup", False):
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
        
        # Format best set display
        if ex_kind in ['Cardio', 'Duration']:
            mins = best_duration // 60
            secs = best_duration % 60
            best_set_display = f"{mins}:{secs:02d}" if best_duration > 0 else "0:00"
        elif ex_kind == 'Reps Only':
            best_set_display = f"{best_reps} reps" if best_reps > 0 else "-"
        else:
            if best_weight > 0 and best_reps > 0:
                best_set_display = f"{best_weight}kg × {best_reps}"
            elif best_reps > 0:
                best_set_display = f"{best_reps} reps"
            else:
                best_set_display = "-"
        
        exercise_summaries.append(WorkoutExerciseSummary(
            exercise_id=exercise_id,
            name=ex_name,
            exercise_kind=ex_kind,
            set_count=len(sets),
            best_set_display=best_set_display,
            estimated_1rm=estimated_1rm
        ))
    
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
        exercises=exercise_summaries
    )


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
    return [PRRecord(**{**pr, "id": str(pr["_id"])}) for pr in prs]


async def check_and_create_prs(user_id: str, workout_id: str):
    """Check workout for PRs and create PR records with detailed PR types"""
    workout = await db.workouts.find_one({"_id": ObjectId(workout_id)})
    if not workout:
        return
    
    pr_flags_updates = []
    
    for ex_idx, exercise in enumerate(workout.get("exercises", [])):
        exercise_id = exercise["exercise_id"]
        
        # Get exercise details to determine type
        ex_data = await db.exercises.find_one({"_id": ObjectId(exercise_id)}) if ObjectId.is_valid(exercise_id) else None
        ex_kind = ex_data.get("exercise_kind", "Barbell") if ex_data else "Barbell"
        is_duration_based = ex_kind in ['Cardio', 'Duration']
        
        # Get all previous PRs for this exercise
        existing_prs = await db.prs.find({
            "user_id": user_id,
            "exercise_id": exercise_id
        }).to_list(100)
        
        # Extract max values from existing PRs (handle None values)
        max_weight = max([pr.get("weight") or 0 for pr in existing_prs], default=0) or 0
        max_reps = max([pr.get("reps") or 0 for pr in existing_prs], default=0) or 0
        max_volume = max([pr.get("volume") or 0 for pr in existing_prs], default=0) or 0
        max_duration = max([pr.get("duration") or 0 for pr in existing_prs], default=0) or 0
        max_1rm = max([pr.get("estimated_1rm") or 0 for pr in existing_prs], default=0) or 0
        
        for set_idx, set_data in enumerate(exercise.get("sets", [])):
            if set_data.get("is_warmup", False):
                continue
            
            weight = set_data.get("weight") or 0
            reps = set_data.get("reps") or 0
            duration = set_data.get("duration") or 0
            volume = weight * reps if weight > 0 and reps > 0 else 0
            
            # Calculate estimated 1RM using Brzycki formula
            estimated_1rm = weight * (36 / (37 - reps)) if reps > 0 and reps < 37 and weight > 0 else weight
            
            # Initialize PR flags
            is_weight_pr = False
            is_reps_pr = False
            is_volume_pr = False
            is_duration_pr = False
            is_1rm_pr = False
            
            # Check for various PR types
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
            
            # Create PR records for each type of PR
            if is_weight_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type="weight",
                    weight=weight,
                    reps=reps
                )
                await db.prs.insert_one(pr.dict(by_alias=True, exclude={"id"}))
            
            if is_reps_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type="reps",
                    weight=weight,
                    reps=reps
                )
                await db.prs.insert_one(pr.dict(by_alias=True, exclude={"id"}))
            
            if is_volume_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type="volume",
                    weight=weight,
                    reps=reps,
                    volume=volume
                )
                await db.prs.insert_one(pr.dict(by_alias=True, exclude={"id"}))
            
            if is_1rm_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type="1rm",
                    weight=weight,
                    reps=reps,
                    estimated_1rm=estimated_1rm
                )
                await db.prs.insert_one(pr.dict(by_alias=True, exclude={"id"}))
            
            if is_duration_pr:
                pr = PRRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    workout_id=workout_id,
                    pr_type="duration",
                    duration=duration
                )
                await db.prs.insert_one(pr.dict(by_alias=True, exclude={"id"}))
            
            # Update set with PR flags in the workout document
            if is_weight_pr or is_reps_pr or is_volume_pr or is_duration_pr:
                pr_flags_updates.append({
                    "ex_idx": ex_idx,
                    "set_idx": set_idx,
                    "is_weight_pr": is_weight_pr,
                    "is_reps_pr": is_reps_pr,
                    "is_volume_pr": is_volume_pr,
                    "is_duration_pr": is_duration_pr
                })
    
    # Update workout with PR flags
    if pr_flags_updates:
        for update in pr_flags_updates:
            await db.workouts.update_one(
                {"_id": ObjectId(workout_id)},
                {"$set": {
                    f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_weight_pr": update['is_weight_pr'],
                    f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_reps_pr": update['is_reps_pr'],
                    f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_volume_pr": update['is_volume_pr'],
                    f"exercises.{update['ex_idx']}.sets.{update['set_idx']}.is_duration_pr": update['is_duration_pr']
                }}
            )


# ============= SEED DATA =============
@api_router.post("/seed")
async def seed_exercises(force: bool = False):
    """Seed the database with default exercises"""
    count = await db.exercises.count_documents({"is_custom": False})
    
    if count > 0 and not force:
        return {"message": f"Database already has {count} exercises. Use force=true to reseed"}
    
    # Delete existing non-custom exercises if force
    if force:
        await db.exercises.delete_many({"is_custom": False})
    
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
