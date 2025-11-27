import { create } from 'zustand';
import { WorkoutSession, WorkoutExercise } from '../types';

interface WorkoutState {
  activeWorkout: WorkoutSession | null;
  startWorkout: (workout: WorkoutSession) => void;
  updateWorkout: (exercises: WorkoutExercise[], notes?: string) => void;
  endWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  activeWorkout: null,
  startWorkout: (workout) => set({ activeWorkout: workout }),
  updateWorkout: (exercises, notes) => 
    set((state) => ({
      activeWorkout: state.activeWorkout
        ? { ...state.activeWorkout, exercises, notes }
        : null,
    })),
  endWorkout: () => set({ activeWorkout: null }),
}));
