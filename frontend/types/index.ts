export interface User {
  id: string;
  email: string;
  token: string;
}

export const EXERCISE_KINDS = [
  'Barbell',
  'Dumbbell',
  'Machine/Other',
  'Weighted Bodyweight',
  'Assisted Bodyweight',
  'Reps Only',
  'Cardio',
  'Duration',
] as const;

export type ExerciseKind = typeof EXERCISE_KINDS[number];

export interface Exercise {
  id: string;
  name: string;
  exercise_kind: ExerciseKind;
  primary_body_parts: string[];
  secondary_body_parts?: string[];
  category: string;
  is_custom: boolean;
  user_id?: string;
  instructions?: string;
}

export interface WorkoutSet {
  // Weight + Reps (for strength exercises)
  reps?: number;
  weight?: number;
  
  // Cardio fields
  distance?: number;  // in km
  duration?: number;  // in seconds
  calories?: number;
  
  is_warmup?: boolean;
  completed_at?: string;
}

// Helper function to determine what fields an exercise needs
export function getExerciseFields(kind: ExerciseKind): string[] {
  switch (kind) {
    case 'Barbell':
    case 'Dumbbell':
    case 'Machine/Other':
    case 'Weighted Bodyweight':
    case 'Assisted Bodyweight':
      return ['weight', 'reps'];
    case 'Reps Only':
      return ['reps'];
    case 'Cardio':
      return ['distance', 'duration'];
    case 'Duration':
      return ['duration'];
    default:
      return ['weight', 'reps'];
  }
}

export interface WorkoutExercise {
  exercise_id: string;
  order: number;
  sets: WorkoutSet[];
  notes?: string;
}

export interface TemplateExercise {
  exercise_id: string;
  order: number;
  default_sets: number;
  default_reps?: number;
  default_weight?: number;
}

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  notes?: string;
  exercises: TemplateExercise[];
  created_at: string;
  updated_at: string;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  template_id?: string;
  started_at: string;
  ended_at?: string;
  notes?: string;
  exercises: WorkoutExercise[];
}

export interface PRRecord {
  id: string;
  user_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  estimated_1rm: number;
  date: string;
}
