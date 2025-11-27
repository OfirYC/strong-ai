"""Seed exercise data with proper exercise kinds matching Strong App"""

EXERCISES = [
    # CHEST - Barbell
    {"name": "Barbell Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps", "Shoulders"], "category": "Strength"},
    {"name": "Incline Barbell Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Shoulders"], "category": "Strength"},
    {"name": "Decline Barbell Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    
    # CHEST - Dumbbell
    {"name": "Dumbbell Bench Press", "exercise_kind": "Dumbbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    {"name": "Incline Dumbbell Press", "exercise_kind": "Dumbbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Shoulders"], "category": "Strength"},
    {"name": "Dumbbell Fly", "exercise_kind": "Dumbbell", "primary_body_parts": ["Chest"], "secondary_body_parts": [], "category": "Strength"},
    
    # CHEST - Machine/Other
    {"name": "Cable Fly", "exercise_kind": "Machine/Other", "primary_body_parts": ["Chest"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Pec Deck", "exercise_kind": "Machine/Other", "primary_body_parts": ["Chest"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Chest Press Machine", "exercise_kind": "Machine/Other", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    
    # CHEST - Bodyweight
    {"name": "Push-Up", "exercise_kind": "Reps Only", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    {"name": "Chest Dips", "exercise_kind": "Weighted Bodyweight", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    
    # BACK - Barbell
    {"name": "Barbell Row", "exercise_kind": "Barbell", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    {"name": "Deadlift", "exercise_kind": "Barbell", "primary_body_parts": ["Back"], "secondary_body_parts": ["Legs", "Glutes"], "category": "Strength"},
    {"name": "Romanian Deadlift", "exercise_kind": "Barbell", "primary_body_parts": ["Back"], "secondary_body_parts": ["Hamstrings"], "category": "Strength"},
    {"name": "T-Bar Row", "exercise_kind": "Barbell", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    
    # BACK - Dumbbell
    {"name": "Dumbbell Row", "exercise_kind": "Dumbbell", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    
    # BACK - Machine/Other
    {"name": "Lat Pulldown", "exercise_kind": "Machine/Other", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    {"name": "Seated Cable Row", "exercise_kind": "Machine/Other", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    {"name": "Face Pull", "exercise_kind": "Machine/Other", "primary_body_parts": ["Shoulders"], "secondary_body_parts": ["Back"], "category": "Strength"},
    
    # BACK - Bodyweight
    {"name": "Pull-Up", "exercise_kind": "Weighted Bodyweight", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    {"name": "Chin-Up", "exercise_kind": "Weighted Bodyweight", "primary_body_parts": ["Back"], "secondary_body_parts": ["Biceps"], "category": "Strength"},
    
    # SHOULDERS - Barbell
    {"name": "Overhead Press", "exercise_kind": "Barbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    {"name": "Military Press", "exercise_kind": "Barbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    {"name": "Upright Row", "exercise_kind": "Barbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": ["Traps"], "category": "Strength"},
    
    # SHOULDERS - Dumbbell
    {"name": "Dumbbell Shoulder Press", "exercise_kind": "Dumbbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    {"name": "Lateral Raise", "exercise_kind": "Dumbbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Front Raise", "exercise_kind": "Dumbbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Rear Delt Fly", "exercise_kind": "Dumbbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Arnold Press", "exercise_kind": "Dumbbell", "primary_body_parts": ["Shoulders"], "secondary_body_parts": ["Triceps"], "category": "Strength"},
    {"name": "Dumbbell Shrugs", "exercise_kind": "Dumbbell", "primary_body_parts": ["Traps"], "secondary_body_parts": [], "category": "Strength"},
    
    # LEGS - Barbell
    {"name": "Barbell Squat", "exercise_kind": "Barbell", "primary_body_parts": ["Legs"], "secondary_body_parts": ["Glutes"], "category": "Strength"},
    {"name": "Front Squat", "exercise_kind": "Barbell", "primary_body_parts": ["Legs"], "secondary_body_parts": ["Core"], "category": "Strength"},
    
    # LEGS - Machine/Other
    {"name": "Leg Press", "exercise_kind": "Machine/Other", "primary_body_parts": ["Legs"], "secondary_body_parts": ["Glutes"], "category": "Strength"},
    {"name": "Leg Extension", "exercise_kind": "Machine/Other", "primary_body_parts": ["Legs"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Leg Curl", "exercise_kind": "Machine/Other", "primary_body_parts": ["Hamstrings"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Hack Squat", "exercise_kind": "Machine/Other", "primary_body_parts": ["Legs"], "secondary_body_parts": ["Glutes"], "category": "Strength"},
    {"name": "Calf Raise Machine", "exercise_kind": "Machine/Other", "primary_body_parts": ["Calves"], "secondary_body_parts": [], "category": "Strength"},
    
    # LEGS - Dumbbell
    {"name": "Bulgarian Split Squat", "exercise_kind": "Dumbbell", "primary_body_parts": ["Legs"], "secondary_body_parts": ["Glutes"], "category": "Strength"},
    {"name": "Walking Lunge", "exercise_kind": "Dumbbell", "primary_body_parts": ["Legs"], "secondary_body_parts": ["Glutes"], "category": "Strength"},
    {"name": "Goblet Squat", "exercise_kind": "Dumbbell", "primary_body_parts": ["Legs"], "secondary_body_parts": [], "category": "Strength"},
    
    # ARMS - Barbell
    {"name": "Barbell Curl", "exercise_kind": "Barbell", "primary_body_parts": ["Biceps"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Close-Grip Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Triceps"], "secondary_body_parts": ["Chest"], "category": "Strength"},
    {"name": "Skull Crusher", "exercise_kind": "Barbell", "primary_body_parts": ["Triceps"], "secondary_body_parts": [], "category": "Strength"},
    
    # ARMS - Dumbbell
    {"name": "Dumbbell Curl", "exercise_kind": "Dumbbell", "primary_body_parts": ["Biceps"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Hammer Curl", "exercise_kind": "Dumbbell", "primary_body_parts": ["Biceps"], "secondary_body_parts": ["Forearms"], "category": "Strength"},
    {"name": "Concentration Curl", "exercise_kind": "Dumbbell", "primary_body_parts": ["Biceps"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Overhead Tricep Extension", "exercise_kind": "Dumbbell", "primary_body_parts": ["Triceps"], "secondary_body_parts": [], "category": "Strength"},
    
    # ARMS - Machine/Other
    {"name": "Preacher Curl", "exercise_kind": "Machine/Other", "primary_body_parts": ["Biceps"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Cable Curl", "exercise_kind": "Machine/Other", "primary_body_parts": ["Biceps"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Tricep Pushdown", "exercise_kind": "Machine/Other", "primary_body_parts": ["Triceps"], "secondary_body_parts": [], "category": "Strength"},
    
    # ARMS - Bodyweight
    {"name": "Tricep Dips", "exercise_kind": "Weighted Bodyweight", "primary_body_parts": ["Triceps"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Diamond Push-Up", "exercise_kind": "Reps Only", "primary_body_parts": ["Triceps"], "secondary_body_parts": ["Chest"], "category": "Strength"},
    
    # ABS - Reps Only
    {"name": "Crunch", "exercise_kind": "Reps Only", "primary_body_parts": ["Abs"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Russian Twist", "exercise_kind": "Reps Only", "primary_body_parts": ["Abs"], "secondary_body_parts": ["Obliques"], "category": "Strength"},
    {"name": "Leg Raise", "exercise_kind": "Reps Only", "primary_body_parts": ["Abs"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Bicycle Crunch", "exercise_kind": "Reps Only", "primary_body_parts": ["Abs"], "secondary_body_parts": ["Obliques"], "category": "Strength"},
    {"name": "Mountain Climber", "exercise_kind": "Reps Only", "primary_body_parts": ["Abs"], "secondary_body_parts": ["Cardio"], "category": "Cardio"},
    
    # ABS - Duration
    {"name": "Plank", "exercise_kind": "Duration", "primary_body_parts": ["Abs"], "secondary_body_parts": ["Core"], "category": "Strength"},
    {"name": "Side Plank", "exercise_kind": "Duration", "primary_body_parts": ["Obliques"], "secondary_body_parts": ["Core"], "category": "Strength"},
    
    # ABS - Machine/Other
    {"name": "Cable Crunch", "exercise_kind": "Machine/Other", "primary_body_parts": ["Abs"], "secondary_body_parts": [], "category": "Strength"},
    {"name": "Ab Wheel Rollout", "exercise_kind": "Reps Only", "primary_body_parts": ["Abs"], "secondary_body_parts": ["Core"], "category": "Strength"},
    
    # CARDIO
    {"name": "Running", "exercise_kind": "Cardio", "primary_body_parts": ["Cardio"], "secondary_body_parts": ["Legs"], "category": "Cardio"},
    {"name": "Cycling", "exercise_kind": "Cardio", "primary_body_parts": ["Cardio"], "secondary_body_parts": ["Legs"], "category": "Cardio"},
    {"name": "Rowing Machine", "exercise_kind": "Cardio", "primary_body_parts": ["Cardio"], "secondary_body_parts": ["Back", "Legs"], "category": "Cardio"},
    {"name": "Elliptical", "exercise_kind": "Cardio", "primary_body_parts": ["Cardio"], "secondary_body_parts": ["Legs"], "category": "Cardio"},
    {"name": "Jump Rope", "exercise_kind": "Cardio", "primary_body_parts": ["Cardio"], "secondary_body_parts": ["Calves"], "category": "Cardio"},
    
    # FULL BODY
    {"name": "Burpee", "exercise_kind": "Reps Only", "primary_body_parts": ["Full Body"], "secondary_body_parts": ["Cardio"], "category": "Cardio"},
    {"name": "Kettlebell Swing", "exercise_kind": "Machine/Other", "primary_body_parts": ["Full Body"], "secondary_body_parts": ["Glutes"], "category": "Strength"},
    {"name": "Thruster", "exercise_kind": "Barbell", "primary_body_parts": ["Full Body"], "secondary_body_parts": ["Legs", "Shoulders"], "category": "Strength"},
    {"name": "Clean and Press", "exercise_kind": "Barbell", "primary_body_parts": ["Full Body"], "secondary_body_parts": ["Shoulders", "Legs"], "category": "Strength"},
]
