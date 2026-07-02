// src/store/workoutStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WorkoutSession, WorkoutExercise } from "../types";
import { storageKey } from "../env";
import { track } from "../analytics";

interface WorkoutState {
  activeWorkout: WorkoutSession | null;
  workoutStartTime: number | null;
  startWorkout: (workout: WorkoutSession) => void;
  updateWorkout: (
    exercises: WorkoutExercise[],
    notes?: string,
    name?: string
  ) => void;
  updateWorkoutName: (name: string) => void;
  updateWorkoutNotes: (notes: string | undefined) => void;
  endWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    set => ({
      activeWorkout: null,
      workoutStartTime: null,
      startWorkout: workout => {
        track("workout_started", {
          name: workout.name || "Workout",
          exercises: workout.exercises?.length ?? 0,
          template_id: (workout as any).template_id ?? undefined,
          from_routine: !!(workout as any).template_id,
        });
        set({
          activeWorkout: {
            ...workout,
            name: workout.name || "Workout",
          },
          workoutStartTime: Date.now(),
        });
      },

      updateWorkout: (exercises, notes, name) =>
        set(state => ({
          activeWorkout: state.activeWorkout
            ? {
                ...state.activeWorkout,
                exercises,
                ...(notes !== undefined && { notes }),
                ...(name !== undefined && { name }),
              }
            : null,
        })),
      updateWorkoutName: name =>
        set(state => ({
          activeWorkout: state.activeWorkout
            ? { ...state.activeWorkout, name }
            : null,
        })),
      updateWorkoutNotes: notes =>
        set(state => ({
          activeWorkout: state.activeWorkout
            ? { ...state.activeWorkout, notes }
            : null,
        })),
      endWorkout: () => set({ activeWorkout: null, workoutStartTime: null }),
    }),
    {
      // IMPORTANT: env-namespaced key so Expo Go local/prod don't collide
      name: storageKey("workout-storage"),
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
