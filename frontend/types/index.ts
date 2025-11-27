export interface User {
  id: string;
  email: string;
  token: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
  equipment?: string;
  category?: string;
  is_custom: boolean;
  user_id?: string;
  instructions?: string;
}

export interface WorkoutSet {
  reps: number;
  weight: number;
  is_warmup?: boolean;
  completed_at?: string;
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
