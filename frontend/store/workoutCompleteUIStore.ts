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
    openWorkoutComplete: summary =>
      set({ workoutCompleteVisible: true, workoutCompleteSummary: summary }),
    closeWorkoutComplete: () =>
      set({ workoutCompleteVisible: false, workoutCompleteSummary: null }),
    isExpanded: INITIAL_IS_EXPANDED,
    setIsExpanded: (isExpanded: boolean) => set({ isExpanded }),
  })
);
