from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
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


class User(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    email: EmailStr
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class UserResponse(BaseModel):
    id: str
    email: str
    token: str


# Exercise Models
class ExerciseCreate(BaseModel):
    name: str
    exercise_kind: str  # Barbell, Dumbbell, Machine/Other, Weighted Bodyweight, Assisted Bodyweight, Reps Only, Cardio, Duration
    primary_body_parts: List[str]
    secondary_body_parts: Optional[List[str]] = []
    category: Optional[str] = "Strength"
    is_custom: bool = False
    instructions: Optional[str] = None


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
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# Workout Template Models
class TemplateExerciseItem(BaseModel):
    exercise_id: str
    order: int
    default_sets: int = 3
    default_reps: Optional[int] = 10
    default_weight: Optional[float] = None


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
    
    # Weight + Reps (Barbell, Dumbbell, Machine, Weighted Bodyweight, Assisted Bodyweight, Reps Only)
    reps: Optional[int] = None
    weight: Optional[float] = None
    
    # Cardio fields
    distance: Optional[float] = None  # in km or miles
    duration: Optional[int] = None  # in seconds
    calories: Optional[int] = None
    
    # Duration only
    # duration field already covered above


class WorkoutExerciseItem(BaseModel):
    exercise_id: str
    order: int
    sets: List[WorkoutSetItem] = []
    notes: Optional[str] = None


class WorkoutSessionCreate(BaseModel):
    template_id: Optional[str] = None
    notes: Optional[str] = None


class WorkoutSessionUpdate(BaseModel):
    exercises: List[WorkoutExerciseItem]
    notes: Optional[str] = None
    ended_at: Optional[datetime] = None


class WorkoutSession(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    template_id: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    exercises: List[WorkoutExerciseItem] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


# PR Record Models
class PRRecord(BaseModel):
    id: Optional[str] = Field(default=None)
    user_id: str
    exercise_id: str
    weight: float
    reps: int
    estimated_1rm: float
    date: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
