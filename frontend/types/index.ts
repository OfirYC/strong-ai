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
  image?: string;
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
  
  // PR flags
  is_volume_pr?: boolean;
  is_weight_pr?: boolean;
  is_reps_pr?: boolean;
  is_duration_pr?: boolean;
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

// Helper to check if exercise is duration-based
export function isDurationBased(kind: ExerciseKind): boolean {
  return kind === 'Cardio' || kind === 'Duration';
}

// Helper to check if exercise uses weight
export function usesWeight(kind: ExerciseKind): boolean {
  return ['Barbell', 'Dumbbell', 'Machine/Other', 'Weighted Bodyweight', 'Assisted Bodyweight'].includes(kind);
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
  name?: string;
  started_at: string;
  ended_at?: string;
  notes?: string;
  exercises: WorkoutExercise[];
}

// Workout Summary types for history view
export interface WorkoutExerciseSummary {
  exercise_id: string;
  name: string;
  exercise_kind: ExerciseKind;
  set_count: number;
  best_set_display: string;
  estimated_1rm?: number;
}

export interface WorkoutSummary {
  id: string;
  name?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds: number;
  exercise_count: number;
  set_count: number;
  total_volume_kg: number;
  pr_count: number;
  exercises: WorkoutExerciseSummary[];
}

export interface PRRecord {
  id: string;
  user_id: string;
  exercise_id: string;
  workout_id?: string;
  pr_type: string;
  weight?: number;
  reps?: number;
  duration?: number;
  volume?: number;
  estimated_1rm?: number;
  date: string;
}

// Helper to format duration in mm:ss
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format duration in minutes (e.g., "12m")
export function formatDurationMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins}m`;
}
