# Exercise kind → allowed set fields + semantics
EXERCISE_KIND_RULES = {
    "Barbell": {
        "fields": ["reps", "weight"],
        "description": "Use reps + weight (kg)"
    },
    "Dumbbell": {
        "fields": ["reps", "weight"],
        "description": "Use reps + weight (kg)"
    },
    "Machine/Other": {
        "fields": ["reps", "weight"],
        "description": "Use reps + weight (kg)"
    },
    "Weighted Bodyweight": {
        "fields": ["reps", "weight"],
        "description": "Use reps + additional weight (kg)"
    },
    "Assisted Bodyweight": {
        "fields": ["reps", "weight"],
        "description": "Use reps + assistance weight (kg, positive number)"
    },
    "Reps Only": {
        "fields": ["reps"],
        "description": "Use reps only, no weight"
    },
    "Duration": {
        "fields": ["duration"],
        "description": "Use duration in seconds"
    },
    "Cardio": {
        "fields": ["duration", "distance"],
        "description": "Use duration (seconds) and/or distance (km)"
    },
    "Weighted Cardio": {
        "fields": ["duration", "weight", "distance"],
        "description": "Use duration (seconds) and/or distance (km) with optional carried weight (kg)"
    },
    "Weighted Duration": {
        "fields": ["duration", "weight"],
        "description": "Use duration (seconds) with optional carried weight (kg)"
    },
    "EMOM (Every Minute On The Minute)": {
        "fields": ["reps", "weight", "duration"],
        "description": "Use reps + weight (kg) + duration (seconds)"
    },
    "ETOT (Every Thirty Seconds on Thirty Seconds)": {
        "fields": ["reps", "weight", "duration"],
        "description": "Use reps + weight (kg) + duration (seconds)"
    },

}
