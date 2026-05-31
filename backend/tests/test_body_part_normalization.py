"""Regression tests for enum coercion on Exercise and PlannedWorkout models."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import (
    normalize_exercise_category,
    normalize_planned_workout_type,
    Exercise,
    ExerciseCategory,
    PlannedWorkoutType,
)
from constants import EXERCISE_KIND_RULES


EXERCISE_KIND = next(iter(EXERCISE_KIND_RULES))


def test_exercise_category_coercion():
    assert normalize_exercise_category("Balance") == "Stability"
    assert normalize_exercise_category("Strength") == "Strength"
    assert normalize_exercise_category("rehab") == "Recovery"
    assert normalize_exercise_category("UnknownThing") == "Strength"


def test_planned_workout_type_coercion():
    assert normalize_planned_workout_type("recovery") == "other"
    assert normalize_planned_workout_type("cardio") == "cardio"
    assert normalize_planned_workout_type("swim") == "cardio"
    assert normalize_planned_workout_type("unknown") == "other"


def test_exercise_model_creates_without_body_parts():
    ex = Exercise(name="Bench Press", exercise_kind=EXERCISE_KIND, muscle_loads=[])
    assert ex.name == "Bench Press"
    assert ex.muscle_loads == []
    assert not ex.is_tagged


def test_exercise_category_validator_on_model():
    ex = Exercise(name="BOSU Balance", exercise_kind=EXERCISE_KIND, category="Balance")
    assert ex.category == ExerciseCategory.STABILITY
