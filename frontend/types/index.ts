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
  'Duration',
  'Cardio',
  'Weighted Cardio',
  'Weighted Duration',
  'EMOM (Every Minute On The Minute)',
  'ETOT (Every Thirty Seconds on Thirty Seconds)',
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

// Set types for workout sets
export const SET_TYPES = ['normal', 'warmup', 'cooldown', 'failure'] as const;
export type SetType = typeof SET_TYPES[number];

// Set type display config
export const SET_TYPE_CONFIG: Record<SetType, { label: string; initial: string; color: string; bgColor: string }> = {
  normal: { label: 'Normal', initial: '', color: '#000000', bgColor: 'transparent' },
  warmup: { label: 'Warmup', initial: 'W', color: '#F59E0B', bgColor: 'rgba(245, 158, 11, 0.15)' },
  cooldown: { label: 'Cooldown', initial: 'C', color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.15)' },
  failure: { label: 'Failure', initial: 'F', color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
};

export interface WorkoutSet {
  // Set type
  set_type?: SetType;
  
  // Weight + Reps (for strength exercises)
  reps?: number;
  weight?: number;
  
  // Cardio fields
  distance?: number;  // in km
  duration?: number;  // in seconds
  calories?: number;
  
  completed?: boolean;
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
    case 'Duration':
      return ['duration'];
    case 'Cardio':
      return ['duration', 'distance'];
    case 'Weighted Cardio':
      return ['duration', 'distance', 'weight'];
    case 'Weighted Duration':
      return ['duration', 'weight'];
    case 'EMOM (Every Minute On The Minute)':
    case 'ETOT (Every Thirty Seconds on Thirty Seconds)':
      return ['reps', 'weight', 'duration'];
    default:
      return ['weight', 'reps'];
  }
}

// Helper to check if exercise is duration-based
export function isDurationBased(kind: ExerciseKind): boolean {
  return ['Duration', 'Cardio', 'Weighted Cardio', 'Weighted Duration', 'EMOM (Every Minute On The Minute)', 'ETOT (Every Thirty Seconds on Thirty Seconds)'].includes(kind);
}

// Helper to check if exercise uses weight
export function usesWeight(kind: ExerciseKind): boolean {
  return ['Barbell', 'Dumbbell', 'Machine/Other', 'Weighted Bodyweight', 'Assisted Bodyweight', 'Weighted Cardio', 'Weighted Duration', 'EMOM (Every Minute On The Minute)', 'ETOT (Every Thirty Seconds on Thirty Seconds)'].includes(kind);
}

// Helper to check if exercise uses distance
export function usesDistance(kind: ExerciseKind): boolean {
  return ['Cardio', 'Weighted Cardio'].includes(kind);
}

// Helper to check if exercise uses reps
export function usesReps(kind: ExerciseKind): boolean {
  return ['Barbell', 'Dumbbell', 'Machine/Other', 'Weighted Bodyweight', 'Assisted Bodyweight', 'Reps Only', 'EMOM (Every Minute On The Minute)', 'ETOT (Every Thirty Seconds on Thirty Seconds)'].includes(kind);
}

export interface WorkoutExercise {
  exercise_id: string;
  order: number;
  sets: WorkoutSet[];
  notes?: string;
}

export interface TemplateSet {
  weight?: number;
  reps?: number;
  duration?: number;
  distance?: number;
  set_type?: SetType;
}

export interface TemplateExercise {
  exercise_id: string;
  order: number;
  sets: TemplateSet[];
  notes?: string;
  // Legacy fields
  default_sets?: number;
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

// Helper to format duration in mm:ss.cc (with centiseconds support)
export function formatDuration(seconds: number): string {
  const totalCentiseconds = Math.round(seconds * 100);
  const mins = Math.floor(totalCentiseconds / 6000);
  const secs = Math.floor((totalCentiseconds % 6000) / 100);
  const centis = totalCentiseconds % 100;
  
  // Only show centiseconds if they exist
  if (centis > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format duration in minutes (e.g., "12m")
export function formatDurationMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins}m`;
}

export function formatWorkoutDuration(seconds: number): string  {
  const totalMins = Math.round(seconds / 60);

  if (totalMins < 60) {
    return `${totalMins}m`;
  }

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  // pad minutes to always 2 digits (e.g., 1:05)
  const paddedMins = mins.toString().padStart(2, "0");

  return `${hours}h ${paddedMins}m`;
}