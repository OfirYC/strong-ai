import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutSession, WorkoutExercise } from '../types';

interface WorkoutState {
  activeWorkout: WorkoutSession | null;
  workoutStartTime: number | null;
  startWorkout: (workout: WorkoutSession) => void;
  updateWorkout: (exercises: WorkoutExercise[], notes?: string, name?: string) => void;
  updateWorkoutName: (name: string) => void;
  updateWorkoutNotes: (notes: string | undefined) => void;
  endWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => ({
      activeWorkout: null,
      workoutStartTime: null,
      startWorkout: (workout) => set({ 
        activeWorkout: {
          ...workout,
          name: workout.name || 'Workout',
        },
        workoutStartTime: Date.now(),
      }),
      updateWorkout: (exercises, notes, name) => 
        set((state) => ({
          activeWorkout: state.activeWorkout
            ? { 
                ...state.activeWorkout, 
                exercises, 
                ...(notes !== undefined && { notes }),
                ...(name !== undefined && { name }),
              }
            : null,
        })),
      updateWorkoutName: (name) =>
        set((state) => ({
          activeWorkout: state.activeWorkout
            ? { ...state.activeWorkout, name }
            : null,
        })),
      updateWorkoutNotes: (notes) =>
        set((state) => ({
          activeWorkout: state.activeWorkout
            ? { ...state.activeWorkout, notes }
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
