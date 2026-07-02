import { create } from "zustand";
import { track } from "../analytics";

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

type ActiveWorkoutSheetUIStore = {
  workoutCompleteVisible: boolean;
  workoutCompleteSummary: WorkoutSummaryData | null;
  openWorkoutComplete: (summary: WorkoutSummaryData) => void;
  closeWorkoutComplete: () => void;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
};

const INITIAL_IS_EXPANDED = true;

export const useActiveWorkoutSheetUIStore = create<ActiveWorkoutSheetUIStore>(
  set => ({
    workoutCompleteVisible: false,
    workoutCompleteSummary: null,
    openWorkoutComplete: summary => {
      track("workout_completed", {
        name: summary.name,
        duration_sec: summary.duration,
        total_volume: summary.totalVolume,
        exercises: summary.exerciseCount,
        prs: summary.prCount,
        workout_number: summary.workoutNumber,
      });
      set({ workoutCompleteVisible: true, workoutCompleteSummary: summary });
    },
    closeWorkoutComplete: () =>
      set({ workoutCompleteVisible: false, workoutCompleteSummary: null }),
    isExpanded: INITIAL_IS_EXPANDED,
    setIsExpanded: (isExpanded: boolean) => set({ isExpanded }),
  })
);
