from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")


# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TrainingPhase(BaseModel):
    """A phase in the user's training history"""
    label: str  # e.g. "Room lifting phase"
    description: str  # e.g. "Dec 2020–2022: lifting in room, calisthenics, building base"


class ProfileInsights(BaseModel):
    """AI-generated insights from user's freeform profile text"""
    injury_tags: List[str] = []  # e.g. ["shin stress fractures", "posterior tibial irritation"]
    current_issues: List[str] = []  # e.g. ["posterior tib discomfort", "hip flexor tightness"]
    strength_tags: List[str] = []  # e.g. ["high work capacity", "EMOM resilience"]
    weak_point_tags: List[str] = []  # e.g. ["tends to overload shins", "barefoot overuse risk"]
    training_phases: List[TrainingPhase] = []
    psych_profile: Optional[str] = None  # e.g. "high grit, tends to overdo volume"


class UserProfile(BaseModel):
    """User profile information"""
    # Basic info
    sex: Optional[str] = None  # "male", "female", "other", null
    date_of_birth: Optional[datetime] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    
    # Training context
    training_age: Optional[str] = None  # "new", "1-2y", "2-5y", "5y+"
    goals: Optional[str] = None
    
    # Physiology / constraints
    injury_history: Optional[str] = None
    weaknesses: Optional[str] = None
    strengths: Optional[str] = None
    
    # Background
    background_story: Optional[str] = None
    
    # AI-generated insights
    insights: Optional[ProfileInsights] = None


class User(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    email: EmailStr
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Profile fields
    profile: UserProfile = Field(default_factory=UserProfile)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class UserResponse(BaseModel):
    id: str
    email: str
    token: str


class ProfileUpdate(BaseModel):
    """Update user profile"""
    sex: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    training_age: Optional[str] = None
    goals: Optional[str] = None
    injury_history: Optional[str] = None
    weaknesses: Optional[str] = None
    strengths: Optional[str] = None
    background_story: Optional[str] = None


class UserContext(BaseModel):
    """Aggregated user context for AI and UI logic"""
    basic_info: dict = {}
    training_context: dict = {}
    physiology: dict = {}
    background_story: Optional[str] = None
    is_profile_complete: bool = False
    insights: Optional[ProfileInsights] = None


# Exercise Models
class ExerciseCreate(BaseModel):
    name: str
    exercise_kind: str  # Barbell, Dumbbell, Machine/Other, Weighted Bodyweight, Assisted Bodyweight, Reps Only, Cardio, Duration
    primary_body_parts: List[str]
    secondary_body_parts: Optional[List[str]] = []
    category: Optional[str] = "Strength"
    is_custom: bool = False
    instructions: Optional[str] = None
    image: Optional[str] = None  # URL to exercise image


class Exercise(BaseModel):
    id: Optional[str] = Field(default=None)
    name: str
    exercise_kind: str
    primary_body_parts: List[str]
    secondary_body_parts: Optional[List[str]] = []
    category: Optional[str] = "Strength"
    is_custom: bool = False
    user_id: Optional[str] = None
    instructions: Optional[str] = None
    image: Optional[str] = None  # URL to exercise image
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class ExerciseUpdate(BaseModel):
    instructions: Optional[str] = None
    image: Optional[str] = None


# Workout Template Models
class TemplateSetItem(BaseModel):
    """A single set in a template exercise with default values"""
    weight: Optional[float] = None
    reps: Optional[int] = None
    duration: Optional[float] = None  # in seconds (supports decimals for centiseconds)
    distance: Optional[float] = None  # in km
    is_warmup: bool = False


class TemplateExerciseItem(BaseModel):
    exercise_id: str
    order: int
    sets: List[TemplateSetItem] = []  # Actual sets with values
    notes: Optional[str] = None
    # Legacy fields for backward compatibility
    default_sets: int = 3
    default_reps: Optional[int] = 10
    default_weight: Optional[float] = None
    default_duration: Optional[float] = None
    default_distance: Optional[float] = None


class WorkoutTemplateCreate(BaseModel):
    name: str
    notes: Optional[str] = None
    exercises: List[TemplateExerciseItem] = []


class WorkoutTemplate(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    name: str
    notes: Optional[str] = None
    exercises: List[TemplateExerciseItem] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# Workout Session Models
class WorkoutSetItem(BaseModel):
    # Common fields
    is_warmup: bool = False
    completed_at: Optional[datetime] = None
    completed: Optional[bool] = False
    
    # Weight + Reps (Barbell, Dumbbell, Machine, Weighted Bodyweight, Assisted Bodyweight, Reps Only)
    reps: Optional[int] = None
    weight: Optional[float] = None
    
    # Cardio fields
    distance: Optional[float] = None  # in km or miles
    duration: Optional[float] = None  # in seconds (supports decimals for centiseconds)
    calories: Optional[int] = None
    
    # PR flags (computed when workout is completed)
    is_volume_pr: bool = False
    is_weight_pr: bool = False
    is_reps_pr: bool = False
    is_duration_pr: bool = False


class WorkoutExerciseItem(BaseModel):
    exercise_id: str
    order: int
    sets: List[WorkoutSetItem] = []
    notes: Optional[str] = None


class WorkoutSessionCreate(BaseModel):
    template_id: Optional[str] = None
    notes: Optional[str] = None
    name: Optional[str] = None  # Allow custom workout name


class WorkoutSessionUpdate(BaseModel):
    exercises: List[WorkoutExerciseItem]
    notes: Optional[str] = None
    ended_at: Optional[datetime] = None
    name: Optional[str] = None


class WorkoutSession(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    template_id: Optional[str] = None
    planned_workout_id: Optional[str] = None  # Link to planned workout if started from schedule
    name: Optional[str] = None  # Workout name
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    exercises: List[WorkoutExerciseItem] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# Workout Summary DTOs (for history view)
class WorkoutExerciseSummary(BaseModel):
    exercise_id: str
    name: str
    exercise_kind: str
    set_count: int
    best_set_display: str  # e.g. "60kg × 10" or "0:30"
    estimated_1rm: Optional[float] = None


class WorkoutSummary(BaseModel):
    id: str
    name: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0
    exercise_count: int = 0
    set_count: int = 0
    total_volume_kg: float = 0.0
    pr_count: int = 0
    exercises: List[WorkoutExerciseSummary] = []


# PR Record Models
class PRRecord(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    exercise_id: str
    workout_id: Optional[str] = None
    pr_type: str = "1rm"  # "1rm", "weight", "reps", "volume", "duration"
    weight: Optional[float] = None
    reps: Optional[int] = None
    duration: Optional[int] = None  # in seconds
    volume: Optional[float] = None  # weight * reps
    estimated_1rm: Optional[float] = None
    date: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# Planned Workout Models
class PlannedWorkoutCreate(BaseModel):
    """Create a planned workout"""
    date: str  # YYYY-MM-DD format
    name: str
    template_id: Optional[str] = None
    type: Optional[str] = None  # e.g. "strength", "run", "mobility"
    notes: Optional[str] = None
    order: int = 0
    
    # Recurring schedule fields
    is_recurring: bool = False
    recurrence_type: Optional[str] = None  # "daily", "weekly", "monthly"
    recurrence_days: Optional[List[int]] = None  # For weekly: [0=Monday, 1=Tuesday, ..., 6=Sunday]
    recurrence_end_date: Optional[str] = None  # YYYY-MM-DD format or None for indefinite


class PlannedWorkoutUpdate(BaseModel):
    """Update a planned workout"""
    date: Optional[str] = None
    name: Optional[str] = None
    template_id: Optional[str] = None
    type: Optional[str] = None
    notes: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None  # "planned", "in_progress", "completed", "skipped"


class PlannedWorkout(BaseModel):
    """Planned workout for a specific date"""
    id: Optional[str] = Field(default=None)
    user_id: str
    date: str  # YYYY-MM-DD format
    name: str
    template_id: Optional[str] = None
    type: Optional[str] = None
    notes: Optional[str] = None
    status: str = "planned"  # "planned", "in_progress", "completed", "skipped"
    workout_session_id: Optional[str] = None
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Recurring schedule fields
    is_recurring: bool = False
    recurrence_type: Optional[str] = None  # "daily", "weekly", "monthly"
    recurrence_days: Optional[List[int]] = None  # For weekly: [0=Monday, 1=Tuesday, ..., 6=Sunday]
    recurrence_end_date: Optional[str] = None  # YYYY-MM-DD format
    recurrence_parent_id: Optional[str] = None  # Links instance to parent recurring workout

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
