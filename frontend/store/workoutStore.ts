import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutSession, WorkoutExercise } from '../types';

interface WorkoutState {
  activeWorkout: WorkoutSession | null;
  workoutStartTime: number | null;
  startWorkout: (workout: WorkoutSession) => void;
  updateWorkout: (exercises: WorkoutExercise[], notes?: string) => void;
  endWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => ({
      activeWorkout: null,
      workoutStartTime: null,
      startWorkout: (workout) => set({ 
        activeWorkout: workout,
        workoutStartTime: Date.now(),
      }),
      updateWorkout: (exercises, notes) => 
        set((state) => ({
          activeWorkout: state.activeWorkout
            ? { ...state.activeWorkout, exercises, notes }
            : null,
        })),
      endWorkout: () => set({ activeWorkout: null, workoutStartTime: null }),
    }),
    {
      name: 'workout-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
