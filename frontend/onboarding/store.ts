import { create } from "zustand";
import { MascotGender } from "../assets/mascot";
import type { Plan } from "./planTemplate";

export type Sex = "male" | "female";
export type Goal = "muscle" | "strength" | "lean" | "endurance" | "general";
export type TrainingAge = "new" | "1-2y" | "2-5y" | "5y+";
export type Equipment = "full_gym" | "dumbbells" | "bodyweight" | "bands";
// What the user does NOW (drives the START body — distinct from their goal/future).
export type CurrentActivity = "lifting" | "cardio" | "mixed" | "inactive";

export interface OnboardingAnswers {
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  currentActivity?: CurrentActivity;
  /** All selected goals (multi-select). `goal` mirrors goals[0] as the primary. */
  goals: Goal[];
  /** Primary goal = goals[0]. Drives the mascot body/pose, projection, templates. */
  goal?: Goal;
  /** Goal-specific priorities (e.g. ["arms","chest"] or ["bench"]). Up to 3. */
  subGoals: string[];
  trainingAge?: TrainingAge;
  daysPerWeek?: number;
  equipment?: Equipment;
  limitations: string[];
  /** Free-text injury from the "Something else" option. */
  customLimitation?: string;
}

interface OnboardingState {
  answers: OnboardingAnswers;
  /** The generated plan (AI result, or local fallback) — set during the build moment. */
  plan?: Plan;
  set: <K extends keyof OnboardingAnswers>(
    key: K,
    value: OnboardingAnswers[K],
  ) => void;
  setPlan: (p: Plan) => void;
  /** Populate answers from saved data (e.g. rehydrate the account's onboarding for the gate). */
  hydrate: (a: Partial<OnboardingAnswers>) => void;
  reset: () => void;
}

const initial: OnboardingAnswers = { limitations: [], subGoals: [], goals: [] };

export const useOnboardingStore = create<OnboardingState>((set) => ({
  answers: initial,
  plan: undefined,
  set: (key, value) =>
    set((s) => ({ answers: { ...s.answers, [key]: value } })),
  setPlan: (p) => set({ plan: p }),
  hydrate: (a) =>
    set((s) => ({
      answers: {
        ...s.answers,
        ...a,
        goals: a.goals ?? s.answers.goals ?? [],
        subGoals: a.subGoals ?? s.answers.subGoals ?? [],
        limitations: a.limitations ?? s.answers.limitations ?? [],
      },
    })),
  reset: () =>
    set({ answers: { ...initial, limitations: [], subGoals: [], goals: [] }, plan: undefined }),
}));

/** Mascot gender derived from the sex answer (defaults male until chosen). */
export const genderFromSex = (sex?: Sex): MascotGender =>
  sex === "female" ? "f" : "m";

import { MascotBody } from "../assets/mascot";

// "Strong" archetype differs by gender: male = muscular, female = after.
const strongBody = (g: MascotGender): MascotBody => (g === "f" ? "after" : "muscular");

export const bmiOf = (heightCm?: number, weightKg?: number): number | undefined => {
  if (!heightCm || !weightKg) return undefined;
  const m = heightCm / 100;
  return weightKg / (m * m);
};

/**
 * Build-moment START body — who they are NOW. Inferred from BMI × CURRENT ACTIVITY × experience × gender.
 * Uses *current activity* (what they actually do), NOT their goal — a runner who WANTS to get jacked is
 * still a runner today. Key nuances:
 *  - A high BMI only reads as muscle if they actually lift; a high-BMI runner is fat even when advanced.
 *  - Not training → no muscle to claim (high BMI = soft, low = skinny).
 *  - Women build less mass, so they need more experience before a high BMI reads as "strong".
 * Goal never enters here — it only drives the AFTER body. Falls back to activity + experience without a BMI.
 */
export const inferStartBody = (
  g: MascotGender,
  bmi?: number,
  age?: TrainingAge,
  activity?: CurrentActivity,
): MascotBody => {
  const female = g === "f";
  const strong = strongBody(g); // 'after' (f) | 'muscular' (m)
  const adv = age === "5y+";
  const inter = age === "2-5y";
  const act = activity ?? "mixed"; // default: assume some general training
  const lifts = act === "lifting" || act === "mixed";

  // No metrics → infer from current activity + experience
  if (bmi == null) return lifts && (adv || inter) ? strong : "lean";

  // 1) Genuinely thin → skinny (an experienced lifter reads lean, not skinny)
  if (bmi < 18.5) return act === "lifting" && adv ? "lean" : "skinny";

  // 2) CARDIO / runner: never carries gym muscle. low = skinny · mid = lean · high = fat, even when advanced.
  if (act === "cardio") {
    if (bmi < 20) return "skinny";
    if (bmi < 24) return "lean";
    return "soft";
  }

  // 3) NOT TRAINING: no muscle to claim.
  if (act === "inactive") {
    if (bmi < 20) return "skinny";
    if (bmi >= 25) return "soft";
    return "lean";
  }

  // 4) LIFTING / MIXED: a high BMI can be muscle — scaled by experience + gender.
  //    "mixed" is a touch more conservative than pure lifting (cardio dilutes the mass).
  const pureLift = act === "lifting";
  if (adv) return bmi >= (pureLift ? 23 : 25) ? strong : "lean";
  if (inter) {
    // women build less; they need to be advanced before a high BMI reads as strong
    if (female) return bmi >= 27 ? "soft" : "lean";
    return bmi >= (pureLift ? 24 : 27) ? strong : "lean";
  }
  // beginner lifter: barely any muscle yet
  return bmi >= 26 ? "soft" : "lean";
};

/** Build-moment AFTER body — the goal archetype the coach levels up toward (long-term dream). */
export const afterBody = (g: MascotGender, goal?: Goal): MascotBody =>
  goal === "muscle" || goal === "strength" ? strongBody(g) : "lean";

/**
 * Realistic ~12-week outcome — ONE step toward the goal, not the full archetype.
 * Skinny/soft starters reach "lean/athletic" in 12 weeks (not bodybuilder); only those who
 * already start lean+ reach the strong archetype. Keeps the projection honest (and on-claim).
 */
export const projectionBody = (
  g: MascotGender,
  current: MascotBody,
  goal?: Goal,
): MascotBody => {
  const strong = strongBody(g);
  const massGoal = goal === "muscle" || goal === "strength";
  if (massGoal) {
    return current === "lean" || current === "muscular" || current === "after"
      ? strong
      : "lean";
  }
  // lose-fat / endurance / general → athletic, unless already built
  return current === "muscular" || current === "after" ? current : "lean";
};
