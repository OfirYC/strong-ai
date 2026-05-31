from pydantic import (
    BaseModel,
    Field,
    EmailStr,
    model_validator,
    ConfigDict,
    field_validator,
)
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from bson import ObjectId
from enum import Enum
from body_parts import ALL_SLUGS


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


# ============= ENUMS =============


class ExerciseKind(str, Enum):
    BARBELL = "Barbell"
    DUMBBELL = "Dumbbell"
    MACHINE_OTHER = "Machine/Other"
    WEIGHTED_BODYWEIGHT = "Weighted Bodyweight"
    ASSISTED_BODYWEIGHT = "Assisted Bodyweight"
    REPS_ONLY = "Reps Only"
    DURATION = "Duration"
    CARDIO = "Cardio"
    WEIGHTED_CARDIO = "Weighted Cardio"
    WEIGHTED_DURATION = "Weighted Duration"
    BAND = "Band"
    CABLE = "Cable"
    KETTLEBELL = "Kettlebell"
    EMOM = "EMOM (Every Minute On The Minute)"
    ETOT = "ETOT (Every Thirty Seconds on Thirty Seconds)"


class ExerciseCategory(str, Enum):
    STRENGTH = "Strength"
    CARDIO = "Cardio"
    MOBILITY = "Mobility"
    PLYOMETRIC = "Plyometric"
    ISOMETRIC = "Isometric Strength"
    STABILITY = "Stability"
    RECOVERY = "Recovery"
    CONTROL = "Control"


class MuscleLoad(BaseModel):
    """
    A single muscle's involvement in an exercise.
    slug references the in-code MUSCLE_TREE — no DB collection needed.

    Tagging convention:
      - Tag at the most specific level you know (head > muscle > group)
      - role="primary"    → main movers, load_pct sums to ~100 across all primaries
      - role="secondary"  → meaningfully loaded, no sum constraint
      - role="stabilizer" → isometric/bracing, no sum constraint

    Examples:
      Barbell Curl:
        {"slug": "biceps-long-head",   "role": "primary",    "load_pct": 60}
        {"slug": "biceps-short-head",  "role": "primary",    "load_pct": 40}
        {"slug": "brachialis",         "role": "secondary",  "load_pct": 50}
        {"slug": "forearms-flexors",   "role": "stabilizer", "load_pct": 20}

      Posterior Tibialis Cable Raise:
        {"slug": "tibialis-posterior", "role": "primary",    "load_pct": 100}

      Short Foot / Arch Raise:
        {"slug": "abductor-hallucis",  "role": "primary",    "load_pct": 60}
        {"slug": "flexor-digitorum-brevis", "role": "primary", "load_pct": 40}
        {"slug": "plantar-fascia",     "role": "secondary",  "load_pct": 30}
    """

    slug: str
    role: Literal["primary", "secondary", "stabilizer"]
    load_pct: float = Field(ge=0, le=100)

    @field_validator("slug")
    @classmethod
    def slug_must_exist(cls, v: str) -> str:
        if v not in ALL_SLUGS:
            raise ValueError(
                f"Unknown muscle slug: '{v}'. Check body_parts.MUSCLE_TREE."
            )
        return v


class BodyPart(str, Enum):
    CHEST = "Chest"
    BACK = "Back"
    SHOULDERS = "Shoulders"
    BICEPS = "Biceps"
    TRICEPS = "Triceps"
    FOREARMS = "Forearms"
    CORE = "Core"
    ABS = "Abs"
    OBLIQUES = "Obliques"
    LEGS = "Legs"
    QUADS = "Quads"
    HAMSTRINGS = "Hamstrings"
    GLUTES = "Glutes"
    GLUTE_MEDIUS = "Glute Medius"
    CALVES = "Calves"
    HIPS = "Hips"
    TRAPS = "Traps"
    FULL_BODY = "Full Body"
    FEET = "Feet"
    ANKLES = "Ankles"
    SHINS = "Shins"
    OTHER = "Other"


# ---------------------------------------------------------------------------
# ExerciseCategory normalization
# ---------------------------------------------------------------------------

_CATEGORY_VALUES: set[str] = {c.value for c in ExerciseCategory} if False else set()  # filled below
_CATEGORY_ALIASES: dict[str, str] = {
    "balance": "Stability",
    "flexibility": "Mobility",
    "stretch": "Mobility",
    "stretching": "Mobility",
    "yoga": "Mobility",
    "pilates": "Mobility",
    "rehab": "Recovery",
    "rehabilitation": "Recovery",
    "warm-up": "Mobility",
    "warmup": "Mobility",
    "cool-down": "Recovery",
    "cooldown": "Recovery",
    "endurance": "Cardio",
    "aerobic": "Cardio",
    "hiit": "Cardio",
    "circuit": "Strength",
    "powerlifting": "Strength",
    "olympic lifting": "Strength",
    "crossfit": "Strength",
    "calisthenics": "Strength",
    "bodyweight": "Strength",
    "functional": "Control",
    "coordination": "Control",
    "agility": "Control",
    "plyometrics": "Plyometric",
    "jumping": "Plyometric",
    "explosive": "Plyometric",
    "isometric": "Isometric Strength",
}


def normalize_exercise_category(value: str) -> str:
    """Coerce an arbitrary category string to a valid ExerciseCategory value."""
    global _CATEGORY_VALUES
    if not _CATEGORY_VALUES:
        _CATEGORY_VALUES = {c.value for c in ExerciseCategory}
    if value in _CATEGORY_VALUES:
        return value
    lower = value.lower().strip()
    for cv in _CATEGORY_VALUES:
        if cv.lower() == lower:
            return cv
    alias = _CATEGORY_ALIASES.get(lower)
    if alias:
        return alias
    return "Strength"


# ---------------------------------------------------------------------------
# PlannedWorkoutType normalization
# ---------------------------------------------------------------------------

_PLANNED_TYPE_VALUES: set[str] = set()
_PLANNED_TYPE_ALIASES: dict[str, str] = {
    "recovery": "other",
    "rest": "other",
    "yoga": "mobility",
    "stretching": "mobility",
    "flexibility": "mobility",
    "rehab": "mobility",
    "swim": "cardio",
    "swimming": "cardio",
    "bike": "cardio",
    "cycling": "cardio",
    "rowing": "cardio",
    "walk": "cardio",
    "walking": "cardio",
    "ruck": "cardio",
    "hike": "cardio",
    "hiking": "cardio",
    "run": "run",
    "running": "run",
    "sprint": "run",
    "intervals": "hiit",
    "circuit": "hiit",
    "lift": "strength",
    "lifting": "strength",
    "weights": "strength",
    "powerlifting": "strength",
    "crossfit": "hiit",
}


def normalize_planned_workout_type(value: str) -> str:
    """Coerce an arbitrary planned workout type string to a valid PlannedWorkoutType value."""
    global _PLANNED_TYPE_VALUES
    if not _PLANNED_TYPE_VALUES:
        _PLANNED_TYPE_VALUES = {t.value for t in PlannedWorkoutType}
    if value in _PLANNED_TYPE_VALUES:
        return value
    lower = value.lower().strip()
    for tv in _PLANNED_TYPE_VALUES:
        if tv.lower() == lower:
            return tv
    alias = _PLANNED_TYPE_ALIASES.get(lower)
    if alias:
        return alias
    return "other"


class SetType(str, Enum):
    NORMAL = "normal"
    WARMUP = "warmup"
    COOLDOWN = "cooldown"
    FAILURE = "failure"


class PlannedWorkoutStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class PlannedWorkoutType(str, Enum):
    STRENGTH = "strength"
    RUN = "run"
    MOBILITY = "mobility"
    CARDIO = "cardio"
    HIIT = "hiit"
    OTHER = "other"


class RecurrenceType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class PRType(str, Enum):
    ONE_RM = "1rm"
    WEIGHT = "weight"
    REPS = "reps"
    VOLUME = "volume"
    DURATION = "duration"


class TrainingAge(str, Enum):
    NEW = "new"
    ONE_TO_TWO = "1-2y"
    TWO_TO_FIVE = "2-5y"
    FIVE_PLUS = "5y+"


class Sex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


# ============= USER MODELS =============


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TrainingPhase(BaseModel):
    """A phase in the user's training history"""

    label: str
    description: str


class ProfileInsights(BaseModel):
    """AI-generated insights from user's freeform profile text"""

    injury_tags: List[str] = []
    current_issues: List[str] = []
    strength_tags: List[str] = []
    weak_point_tags: List[str] = []
    training_phases: List[TrainingPhase] = []
    psych_profile: Optional[str] = None


class UserProfile(BaseModel):
    """User profile information"""

    sex: Optional[Sex] = None
    date_of_birth: Optional[datetime] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    training_age: Optional[TrainingAge] = None
    goals: Optional[str] = None
    injury_history: Optional[str] = None
    weaknesses: Optional[str] = None
    strengths: Optional[str] = None
    background_story: Optional[str] = None
    insights: Optional[ProfileInsights] = None


class User(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    email: EmailStr
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    profile: UserProfile = Field(default_factory=UserProfile)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class UserResponse(BaseModel):
    id: str
    email: str
    token: str
    is_pro: bool = False


class ProfileUpdate(BaseModel):
    """Update user profile"""

    sex: Optional[Sex] = None
    date_of_birth: Optional[datetime] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    training_age: Optional[TrainingAge] = None
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


# ============= EXERCISE MODELS =============
class MuscleTopExercise(BaseModel):
    name: str
    hypertrophy_sets: float  # weekly avg hard sets
    strength_score: float  # weekly avg kg·intensity
    endurance_reps: float  # weekly avg effective reps


class MuscleVolumeEntry(BaseModel):
    slug: str
    name: str
    level: int  # 0=group 1=muscle 2=head

    # Hypertrophy: hard sets/week in 5–30 rep range, load_pct weighted
    hypertrophy_sets: float  # primary role
    hypertrophy_sets_secondary: float
    hypertrophy_sets_stabilizer: float

    # Strength: intensity-weighted tonnage/week
    # sum(reps × weight × intensity_factor), intensity_factor=max(0,(pct1rm−0.75)/0.25)
    strength_score: float

    # Endurance: effective reps/week
    # EMOM total_reps, duration/3, distance*1000/1.5, high-rep (≥15) sets
    endurance_reps: float

    best_e1rm: Optional[float]
    top_exercises: List[MuscleTopExercise]


class ExerciseCreate(BaseModel):
    name: str
    exercise_kind: ExerciseKind
    muscle_loads: List[MuscleLoad] = []
    category: ExerciseCategory = ExerciseCategory.STRENGTH
    is_custom: bool = False
    instructions: Optional[str] = None
    image: Optional[str] = None

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, v: Any) -> Any:
        if isinstance(v, str):
            return normalize_exercise_category(v)
        return v


class Exercise(BaseModel):
    id: Optional[str] = Field(default=None)
    name: str
    exercise_kind: ExerciseKind
    muscle_loads: List[MuscleLoad] = []

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, v: Any) -> Any:
        if isinstance(v, str):
            return normalize_exercise_category(v)
        return v

    @property
    def is_tagged(self) -> bool:
        return len(self.muscle_loads) > 0

    category: ExerciseCategory = ExerciseCategory.STRENGTH
    is_custom: bool = False
    user_id: Optional[str] = None
    instructions: Optional[str] = None
    image: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class ExerciseUpdate(BaseModel):
    muscle_loads: Optional[List[MuscleLoad]] = None
    instructions: Optional[str] = None
    image: Optional[str] = None


# ============= WORKOUT TEMPLATE MODELS =============


class TemplateSetItem(BaseModel):
    """A single set in a template exercise with default values"""

    weight: Optional[float] = None
    reps: Optional[int] = None
    duration: Optional[float] = None
    distance: Optional[float] = None
    set_type: SetType = SetType.NORMAL
    rest_timer: Optional[int] = None


class TemplateExerciseItem(BaseModel):
    model_config = ConfigDict(json_schema_mode_override="serialization")

    exercise_id: str
    order: int
    sets: List[TemplateSetItem] = []
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


# ============= WORKOUT SESSION MODELS =============


class WorkoutSetItem(BaseModel):
    set_type: SetType = SetType.NORMAL
    completed_at: Optional[datetime] = None
    completed: Optional[bool] = False
    reps: Optional[int] = None
    weight: Optional[float] = None
    distance: Optional[float] = None
    duration: Optional[float] = None
    calories: Optional[int] = None
    rest_timer: Optional[int] = None
    is_volume_pr: bool = False
    is_weight_pr: bool = False
    is_reps_pr: bool = False
    is_duration_pr: bool = False


class WorkoutExerciseItem(BaseModel):
    model_config = ConfigDict(json_schema_mode_override="serialization")

    exercise_id: str
    order: int
    sets: List[WorkoutSetItem] = []
    notes: Optional[str] = None


class WorkoutSessionCreate(BaseModel):
    template_id: Optional[str] = None
    planned_workout_id: Optional[str] = None
    notes: Optional[str] = None
    name: Optional[str] = None
    exercises: Optional[List[WorkoutExerciseItem]] = None


class WorkoutSessionUpdate(BaseModel):
    exercises: Optional[List[WorkoutExerciseItem]] = None
    notes: Optional[str] = None
    ended_at: Optional[datetime] = None
    name: Optional[str] = None
    skipped: Optional[bool] = Field(
        default=None, description="Whether the workout was skipped"
    )


class WorkoutSession(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    template_id: Optional[str] = None
    planned_workout_id: Optional[str] = None
    name: Optional[str] = None
    started_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    skipped: bool = False
    notes: Optional[str] = None
    exercises: List[WorkoutExerciseItem] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# ============= WORKOUT SUMMARY DTOs =============


class WorkoutExerciseSummary(BaseModel):
    exercise_id: str
    name: str
    exercise_kind: ExerciseKind
    set_count: int
    best_set_display: str
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
    template_id: Optional[str] = None


class WorkoutCountResponse(BaseModel):
    count: int


# ============= EXERCISE HISTORY DTOs =============


class ExerciseHistorySet(BaseModel):
    reps: Optional[int] = None
    weight: Optional[float] = None
    duration: Optional[float] = None
    distance: Optional[float] = None
    set_type: SetType = SetType.NORMAL
    rest_timer: Optional[int] = None


class ExerciseHistoryEntry(BaseModel):
    workout_id: str
    workout_name: str
    date: str = ""
    sets: List[ExerciseHistorySet] = []


class ExerciseHistoryResponse(BaseModel):
    exercise_id: str
    exercise_kind: ExerciseKind
    window_days: int
    workouts_scanned: int
    history: List[ExerciseHistoryEntry]
    max_weight: Optional[float] = None
    max_reps: Optional[int] = None
    best_e1rm: Optional[float] = None


# ============= PR RECORD MODELS =============


class PRRecord(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    exercise_id: str
    workout_id: Optional[str] = None
    pr_type: PRType = PRType.ONE_RM
    weight: Optional[float] = None
    reps: Optional[int] = None
    duration: Optional[int] = None
    volume: Optional[float] = None
    estimated_1rm: Optional[float] = None
    date: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# ============= PLANNED WORKOUT MODELS =============


class PlannedWorkoutCreate(BaseModel):
    """Create a planned workout"""

    date: str  # YYYY-MM-DD format
    name: str
    template_id: Optional[str] = None
    type: Optional[PlannedWorkoutType] = None
    notes: Optional[str] = None
    order: int = 0
    inline_exercises: Optional[List[TemplateExerciseItem]] = None
    is_recurring: bool = False
    recurrence_type: Optional[RecurrenceType] = None
    recurrence_days: Optional[List[int]] = None
    recurrence_end_date: Optional[str] = None


class PlannedWorkoutUpdate(BaseModel):
    """Update a planned workout"""

    date: Optional[str] = None
    name: Optional[str] = None
    template_id: Optional[str] = None
    type: Optional[PlannedWorkoutType] = None
    notes: Optional[str] = None
    order: Optional[int] = None
    status: Optional[PlannedWorkoutStatus] = None
    inline_exercises: Optional[List[TemplateExerciseItem]] = None
    is_recurring: Optional[bool] = None
    recurrence_type: Optional[RecurrenceType] = None
    recurrence_days: Optional[List[int]] = None
    recurrence_end_date: Optional[str] = None


class PlannedWorkout(BaseModel):
    """Planned workout for a specific date"""

    id: Optional[str] = Field(default=None)
    user_id: str
    date: str  # YYYY-MM-DD format
    name: str
    template_id: Optional[str] = None
    inline_exercises: Optional[List[TemplateExerciseItem]] = None
    type: Optional[PlannedWorkoutType] = None
    notes: Optional[str] = None
    status: PlannedWorkoutStatus = PlannedWorkoutStatus.PLANNED

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: Any) -> Any:
        if isinstance(v, str):
            return normalize_planned_workout_type(v)
        return v
    workout_session_id: Optional[str] = None
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_recurring: bool = False
    recurrence_type: Optional[RecurrenceType] = None
    recurrence_days: Optional[List[int]] = None
    recurrence_end_date: Optional[str] = None
    recurrence_parent_id: Optional[str] = None
    is_override: bool = False
    original_date: Optional[str] = None

    @model_validator(mode="after")
    def validate_override_structure(self):
        if self.is_override:
            if self.is_recurring:
                raise ValueError("Override cannot be recurring")
            if not self.recurrence_parent_id:
                raise ValueError("Override must have recurrence_parent_id")
            if not self.original_date:
                raise ValueError("Override must have original_date")
        return self


# ============= RESPONSE MODELS (id always present) =============§
class MuscleVolumeResponse(BaseModel):
    days: int
    weeks: float
    start_date: str
    end_date: str
    workout_count: int
    muscles: List[MuscleVolumeEntry]


class ExerciseResponse(Exercise):
    id: str


class WorkoutSessionResponse(WorkoutSession):
    id: str
    started_at: datetime


class WorkoutTemplateResponse(WorkoutTemplate):
    id: str
    notes: Optional[str] = None


class PlannedWorkoutResponse(PlannedWorkout):
    id: str
    template_id: Optional[str] = None
    notes: Optional[str] = None
    workout_session_id: Optional[str] = None
    recurrence_parent_id: Optional[str] = None
    original_date: Optional[str] = None


class PRRecordResponse(PRRecord):
    id: str


# ============= AI JOB MODELS =============


class Job(BaseModel):
    id: str = Field(alias="_id")
    status: str
    kind: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    conversation_id: Optional[str] = None

    class Config:
        populate_by_name = True


class ActiveJobResponse(BaseModel):
    job: Optional[Job] = None


# ============= AI / CONVERSATION MODELS =============


class Conversation(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    active_job_id: Optional[str] = None


class ConversationListResponse(BaseModel):
    conversations: List[Conversation]


class Message(BaseModel):
    id: Optional[str] = None
    conversation_id: str
    role: Literal["user", "assistant", "tool"]
    content: str
    created_at: datetime


class MessageResponse(Message):
    id: str


class MessagesResponse(BaseModel):
    messages: List[MessageResponse]


# =============== NOTES ===============+ #


class NoteCreate(BaseModel):
    content: str
    writer: str = "user"  # "user" | "ai"
    tag: Optional[str] = None  # e.g. "injury", "goal", "preference", "observation"


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    tag: Optional[str] = None


class NoteEntry(BaseModel):
    id: str
    content: str
    writer: str
    tag: Optional[str]
    created_at: str
    updated_at: str


class NotesResponse(BaseModel):
    notes: List[NoteEntry]
