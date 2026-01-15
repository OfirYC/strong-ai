import { create } from "zustand";

export interface WorkoutSummaryData {
  name: string;
  date: Date;
  duration: number;
  totalVolume: number;
  prCount: number;
  exerciseCount: number;
  exercises: Array<{
    name: string;
    sets: number;
    bestSet: string;
  }>;
  workoutNumber: number;
}

type WorkoutCompleteUIState = {
  workoutCompleteVisible: boolean;
  workoutCompleteSummary: WorkoutSummaryData | null;
  openWorkoutComplete: (summary: WorkoutSummaryData) => void;
  closeWorkoutComplete: () => void;
};

export const useWorkoutCompleteUIStore = create<WorkoutCompleteUIState>(set => ({
  workoutCompleteVisible: false,
  workoutCompleteSummary: null,
  openWorkoutComplete: summary =>
    set({ workoutCompleteVisible: true, workoutCompleteSummary: summary }),
  closeWorkoutComplete: () =>
    set({ workoutCompleteVisible: false, workoutCompleteSummary: null }),
}));
