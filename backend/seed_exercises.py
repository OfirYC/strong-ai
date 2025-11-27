"""Seed exercise data for the workout app"""

EXERCISES = [
    # Chest - Barbell
    {"name": "Barbell Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps", "Shoulders"], "category": "Strength", "instructions": "Lie on bench, lower bar to chest, press up"},
    {"name": "Incline Barbell Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Shoulders", "Triceps"], "category": "Strength", "instructions": "Set bench to 30-45 degrees, press bar up"},
    {"name": "Decline Bench Press", "exercise_kind": "Barbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength", "instructions": "Decline bench, press bar from lower chest"},
    
    # Chest - Dumbbell
    {"name": "Dumbbell Bench Press", "exercise_kind": "Dumbbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps", "Shoulders"], "category": "Strength", "instructions": "Lie on bench, press dumbbells up from chest"},
    {"name": "Incline Dumbbell Press", "exercise_kind": "Dumbbell", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Shoulders", "Triceps"], "category": "Strength", "instructions": "Incline bench, press dumbbells up"},
    {"name": "Dumbbell Fly", "exercise_kind": "Dumbbell", "primary_body_parts": ["Chest"], "secondary_body_parts": [], "category": "Strength", "instructions": "Lie on bench, arc dumbbells out and up"},
    
    # Chest - Machine
    {"name": "Cable Fly", "exercise_kind": "Machine/Other", "primary_body_parts": ["Chest"], "secondary_body_parts": [], "category": "Strength", "instructions": "Stand between cables, bring handles together"},
    {"name": "Pec Deck", "exercise_kind": "Machine/Other", "primary_body_parts": ["Chest"], "secondary_body_parts": [], "category": "Strength", "instructions": "Sit in machine, bring handles together"},
    
    # Chest - Reps Only
    {"name": "Push-Up", "exercise_kind": "Reps Only", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps", "Shoulders"], "category": "Strength", "instructions": "Hands shoulder width, lower chest to ground"},
    {"name": "Dips (Chest)", "exercise_kind": "Weighted Bodyweight", "primary_body_parts": ["Chest"], "secondary_body_parts": ["Triceps"], "category": "Strength", "instructions": "Lean forward, lower body between bars"},
    
    # Back
    {"name": "Barbell Row", "muscle_group": "Back", "equipment": "Barbell", "category": "Strength", "instructions": "Bent over, pull bar to lower chest"},
    {"name": "Dumbbell Row", "muscle_group": "Back", "equipment": "Dumbbell", "category": "Strength", "instructions": "One arm on bench, pull dumbbell to hip"},
    {"name": "Pull-Up", "muscle_group": "Back", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Hang from bar, pull chin over bar"},
    {"name": "Lat Pulldown", "muscle_group": "Back", "equipment": "Cable", "category": "Strength", "instructions": "Sit at machine, pull bar to chest"},
    {"name": "Seated Cable Row", "muscle_group": "Back", "equipment": "Cable", "category": "Strength", "instructions": "Sit, pull handles to torso"},
    {"name": "T-Bar Row", "muscle_group": "Back", "equipment": "Barbell", "category": "Strength", "instructions": "Straddle bar, pull to chest"},
    {"name": "Deadlift", "muscle_group": "Back", "equipment": "Barbell", "category": "Strength", "instructions": "Hip hinge, lift bar from floor"},
    {"name": "Romanian Deadlift", "muscle_group": "Back", "equipment": "Barbell", "category": "Strength", "instructions": "Slight knee bend, hinge at hips"},
    {"name": "Face Pull", "muscle_group": "Back", "equipment": "Cable", "category": "Strength", "instructions": "Pull rope to face, elbows high"},
    {"name": "Chin-Up", "muscle_group": "Back", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Underhand grip, pull up"},
    
    # Shoulders
    {"name": "Overhead Press", "muscle_group": "Shoulders", "equipment": "Barbell", "category": "Strength", "instructions": "Press bar overhead from shoulders"},
    {"name": "Dumbbell Shoulder Press", "muscle_group": "Shoulders", "equipment": "Dumbbell", "category": "Strength", "instructions": "Press dumbbells overhead"},
    {"name": "Lateral Raise", "muscle_group": "Shoulders", "equipment": "Dumbbell", "category": "Strength", "instructions": "Raise dumbbells to sides"},
    {"name": "Front Raise", "muscle_group": "Shoulders", "equipment": "Dumbbell", "category": "Strength", "instructions": "Raise dumbbells forward"},
    {"name": "Rear Delt Fly", "muscle_group": "Shoulders", "equipment": "Dumbbell", "category": "Strength", "instructions": "Bent over, raise dumbbells to sides"},
    {"name": "Arnold Press", "muscle_group": "Shoulders", "equipment": "Dumbbell", "category": "Strength", "instructions": "Rotate dumbbells while pressing"},
    {"name": "Military Press", "muscle_group": "Shoulders", "equipment": "Barbell", "category": "Strength", "instructions": "Strict overhead press"},
    {"name": "Upright Row", "muscle_group": "Shoulders", "equipment": "Barbell", "category": "Strength", "instructions": "Pull bar up along body"},
    {"name": "Cable Lateral Raise", "muscle_group": "Shoulders", "equipment": "Cable", "category": "Strength", "instructions": "Raise cable handle to side"},
    {"name": "Shrugs", "muscle_group": "Shoulders", "equipment": "Dumbbell", "category": "Strength", "instructions": "Lift shoulders toward ears"},
    
    # Legs
    {"name": "Barbell Squat", "muscle_group": "Legs", "equipment": "Barbell", "category": "Strength", "instructions": "Bar on back, squat down"},
    {"name": "Front Squat", "muscle_group": "Legs", "equipment": "Barbell", "category": "Strength", "instructions": "Bar on front shoulders, squat"},
    {"name": "Leg Press", "muscle_group": "Legs", "equipment": "Machine", "category": "Strength", "instructions": "Push platform with feet"},
    {"name": "Leg Extension", "muscle_group": "Legs", "equipment": "Machine", "category": "Strength", "instructions": "Extend legs from seated position"},
    {"name": "Leg Curl", "muscle_group": "Legs", "equipment": "Machine", "category": "Strength", "instructions": "Curl legs while lying or seated"},
    {"name": "Bulgarian Split Squat", "muscle_group": "Legs", "equipment": "Dumbbell", "category": "Strength", "instructions": "Rear foot elevated, squat"},
    {"name": "Walking Lunge", "muscle_group": "Legs", "equipment": "Dumbbell", "category": "Strength", "instructions": "Step forward into lunge"},
    {"name": "Goblet Squat", "muscle_group": "Legs", "equipment": "Dumbbell", "category": "Strength", "instructions": "Hold dumbbell at chest, squat"},
    {"name": "Calf Raise", "muscle_group": "Legs", "equipment": "Machine", "category": "Strength", "instructions": "Raise onto toes"},
    {"name": "Hack Squat", "muscle_group": "Legs", "equipment": "Machine", "category": "Strength", "instructions": "Squat on angled machine"},
    
    # Arms - Biceps
    {"name": "Barbell Curl", "muscle_group": "Arms", "equipment": "Barbell", "category": "Strength", "instructions": "Curl bar to shoulders"},
    {"name": "Dumbbell Curl", "muscle_group": "Arms", "equipment": "Dumbbell", "category": "Strength", "instructions": "Curl dumbbells alternating or together"},
    {"name": "Hammer Curl", "muscle_group": "Arms", "equipment": "Dumbbell", "category": "Strength", "instructions": "Curl with neutral grip"},
    {"name": "Preacher Curl", "muscle_group": "Arms", "equipment": "Barbell", "category": "Strength", "instructions": "Curl with arms on pad"},
    {"name": "Cable Curl", "muscle_group": "Arms", "equipment": "Cable", "category": "Strength", "instructions": "Curl cable handle"},
    {"name": "Concentration Curl", "muscle_group": "Arms", "equipment": "Dumbbell", "category": "Strength", "instructions": "Seated, curl one arm"},
    
    # Arms - Triceps
    {"name": "Close-Grip Bench Press", "muscle_group": "Arms", "equipment": "Barbell", "category": "Strength", "instructions": "Narrow grip bench press"},
    {"name": "Tricep Dip", "muscle_group": "Arms", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Dip between parallel bars"},
    {"name": "Overhead Tricep Extension", "muscle_group": "Arms", "equipment": "Dumbbell", "category": "Strength", "instructions": "Press dumbbell overhead"},
    {"name": "Tricep Pushdown", "muscle_group": "Arms", "equipment": "Cable", "category": "Strength", "instructions": "Push cable bar down"},
    {"name": "Skull Crusher", "muscle_group": "Arms", "equipment": "Barbell", "category": "Strength", "instructions": "Lower bar to forehead"},
    {"name": "Diamond Push-Up", "muscle_group": "Arms", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Push-up with hands together"},
    
    # Abs
    {"name": "Crunch", "muscle_group": "Abs", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Curl shoulders toward hips"},
    {"name": "Plank", "muscle_group": "Abs", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Hold push-up position"},
    {"name": "Russian Twist", "muscle_group": "Abs", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Rotate torso side to side"},
    {"name": "Leg Raise", "muscle_group": "Abs", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Raise legs from lying position"},
    {"name": "Cable Crunch", "muscle_group": "Abs", "equipment": "Cable", "category": "Strength", "instructions": "Crunch with cable resistance"},
    {"name": "Bicycle Crunch", "muscle_group": "Abs", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Alternating elbow to knee"},
    {"name": "Mountain Climber", "muscle_group": "Abs", "equipment": "Bodyweight", "category": "Bodyweight", "instructions": "Drive knees to chest alternating"},
    {"name": "Ab Wheel Rollout", "muscle_group": "Abs", "equipment": "Ab Wheel", "category": "Strength", "instructions": "Roll wheel forward and back"},
    
    # Full Body
    {"name": "Burpee", "muscle_group": "Full Body", "equipment": "Bodyweight", "category": "Cardio", "instructions": "Squat, plank, push-up, jump"},
    {"name": "Kettlebell Swing", "muscle_group": "Full Body", "equipment": "Kettlebell", "category": "Strength", "instructions": "Swing kettlebell between legs"},
    {"name": "Thruster", "muscle_group": "Full Body", "equipment": "Barbell", "category": "Strength", "instructions": "Squat then overhead press"},
    {"name": "Clean and Press", "muscle_group": "Full Body", "equipment": "Barbell", "category": "Strength", "instructions": "Pull bar to shoulders, press overhead"},
    {"name": "Battle Ropes", "muscle_group": "Full Body", "equipment": "Battle Ropes", "category": "Cardio", "instructions": "Wave ropes alternating arms"},
]
