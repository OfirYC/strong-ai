import { MascotState } from "../assets/mascot";
import { Goal, Sex } from "./store";

export type QuestionId =
  | "sex"
  | "metrics"
  | "currentActivity"
  | "trainingAge"
  | "goal"
  | "subGoals"
  | "daysPerWeek"
  | "equipment"
  | "limitations";

export interface QOption {
  value: string;
  label: string;
  emoji?: string;
}

export interface Question {
  id: QuestionId;
  kind: "single" | "multi" | "metrics";
  prompt: string;
  sub?: string;
  options: QOption[];
  mascotState: MascotState;
}

export const QUESTIONS: Question[] = [
  {
    id: "sex",
    kind: "single",
    prompt: "Who am I coaching?",
    sub: "So your plan and your coach fit you.",
    mascotState: "think",
    options: [
      { value: "male", label: "I'm a guy", emoji: "♂️" },
      { value: "female", label: "I'm a woman", emoji: "♀️" },
    ],
  },
  {
    id: "metrics",
    kind: "metrics",
    prompt: "Your height & weight",
    sub: "Helps me size your numbers and shape your plan.",
    mascotState: "think",
    options: [],
  },
  {
    id: "currentActivity",
    kind: "single",
    prompt: "What does your training look like now?",
    sub: "Where you're starting from — be honest, no judgment.",
    mascotState: "think",
    options: [
      { value: "lifting", label: "I lift weights", emoji: "🏋️" },
      { value: "cardio", label: "Cardio / running", emoji: "🏃" },
      { value: "mixed", label: "A bit of everything", emoji: "🤸" },
      { value: "inactive", label: "Not training right now", emoji: "🌱" },
    ],
  },
  {
    id: "trainingAge",
    kind: "single",
    prompt: "How long have you been training?",
    mascotState: "think",
    options: [
      { value: "new", label: "Brand new", emoji: "🌱" },
      { value: "1-2y", label: "Beginner", emoji: "🙂" },
      { value: "2-5y", label: "Intermediate", emoji: "😎" },
      { value: "5y+", label: "Advanced", emoji: "🔥" },
    ],
  },
  {
    id: "goal",
    kind: "multi",
    prompt: "What are you training for?",
    sub: "Pick all that fit — I'll build around them.",
    mascotState: "think",
    options: [
      { value: "muscle", label: "Gain muscle", emoji: "💪" },
      { value: "strength", label: "Get stronger", emoji: "🏋️" },
      { value: "lean", label: "Lose fat & get lean", emoji: "🔥" },
      { value: "endurance", label: "Endurance & conditioning", emoji: "🏃" },
      { value: "general", label: "Just stay fit", emoji: "⚡" },
    ],
  },
  {
    // Goal-conditional: prompt + options are overridden per goal at render (see SUBGOALS).
    // Skipped entirely for the "general" goal.
    id: "subGoals",
    kind: "multi",
    prompt: "What matters most to you?",
    sub: "Pick up to 3 — I'll prioritize them.",
    mascotState: "think",
    options: [],
  },
  {
    id: "daysPerWeek",
    kind: "single",
    prompt: "How many days a week can you train?",
    mascotState: "think",
    options: [
      { value: "2", label: "2 days" },
      { value: "3", label: "3 days" },
      { value: "4", label: "4 days" },
      { value: "5", label: "5 days" },
      { value: "6", label: "6 days" },
    ],
  },
  {
    id: "equipment",
    kind: "single",
    prompt: "What do you train with?",
    mascotState: "think",
    options: [
      { value: "full_gym", label: "Full gym", emoji: "🏟️" },
      { value: "dumbbells", label: "Dumbbells at home", emoji: "🏠" },
      { value: "bodyweight", label: "Just my bodyweight", emoji: "🤸" },
      { value: "bands", label: "Resistance bands", emoji: "➰" },
    ],
  },
  {
    id: "limitations",
    kind: "multi",
    prompt: "Anything I should work around?",
    sub: "Tap any that apply — I'll keep your plan safe.",
    mascotState: "think",
    options: [
      { value: "knees", label: "Knees", emoji: "🦵" },
      { value: "lower_back", label: "Lower back", emoji: "🔧" },
      { value: "shoulders", label: "Shoulders", emoji: "💢" },
      { value: "wrists", label: "Wrists", emoji: "🤚" },
      { value: "elbows", label: "Elbows", emoji: "💪" },
      { value: "neck", label: "Neck", emoji: "🧣" },
      { value: "hips", label: "Hips", emoji: "🦿" },
      { value: "ankles", label: "Ankles", emoji: "🦶" },
      { value: "other", label: "Something else", emoji: "✍️" },
      { value: "none", label: "Nope, I'm good", emoji: "✅" },
    ],
  },
];

export type SubCfg = { prompt: string; options: QOption[] };

/** Gender-aware sub-goals per goal. Women see goal areas ordered/worded for what they usually
 *  train for (glutes, legs, waist, hips…); men the classic upper-body/lift emphasis. `value`s are
 *  the matching vocab used by the AI plan + the review bank. "general" has none (skipped). */
export function subGoalsFor(goal: Goal, sex?: Sex): SubCfg {
  const female = sex === "female";
  switch (goal) {
    case "muscle":
      return {
        prompt: "Which areas matter most?",
        options: female
          ? [
              { value: "glutes", label: "Rounder glutes", emoji: "🍑" },
              { value: "legs", label: "Toned legs", emoji: "🦵" },
              { value: "hips", label: "Wider hips", emoji: "⏳" },
              { value: "abs", label: "Toned abs", emoji: "🔲" },
              { value: "back", label: "Sculpted back", emoji: "🦅" },
              { value: "arms", label: "Toned arms", emoji: "💪" },
              { value: "shoulders", label: "Defined shoulders", emoji: "🪨" },
            ]
          : [
              { value: "arms", label: "Bigger arms", emoji: "💪" },
              { value: "chest", label: "Fuller chest", emoji: "🎯" },
              { value: "back", label: "Wider back", emoji: "🦅" },
              { value: "shoulders", label: "Round shoulders", emoji: "🪨" },
              { value: "legs", label: "Stronger legs", emoji: "🦵" },
              { value: "glutes", label: "Glutes", emoji: "🍑" },
              { value: "abs", label: "Visible abs", emoji: "🔲" },
            ],
      };
    case "strength":
      return {
        prompt: "Which lifts do you want to crush?",
        options: [
          { value: "squat", label: "Stronger squat", emoji: "🦵" },
          { value: "deadlift", label: "Bigger deadlift", emoji: "🪨" },
          { value: "bench", label: "Bigger bench", emoji: "🏋️" },
          { value: "overhead_press", label: "Overhead press", emoji: "🙌" },
          { value: "pullups", label: "More pull-ups", emoji: "🆙" },
        ],
      };
    case "lean":
      return {
        prompt: "What does success look like?",
        options: female
          ? [
              { value: "waist", label: "Slimmer waist", emoji: "📉" },
              { value: "glutes", label: "Lifted glutes", emoji: "🍑" },
              { value: "abs", label: "Toned abs", emoji: "🔲" },
              { value: "legs", label: "Leaner legs", emoji: "🦵" },
              { value: "overall", label: "Lean all over", emoji: "✨" },
            ]
          : [
              { value: "abs", label: "Visible abs", emoji: "🔲" },
              { value: "waist", label: "Slimmer waist", emoji: "📉" },
              { value: "arms", label: "Toned arms", emoji: "💪" },
              { value: "overall", label: "Lean all over", emoji: "✨" },
            ],
      };
    case "endurance":
      return {
        prompt: "Your endurance goal?",
        options: [
          { value: "run_longer", label: "Run longer", emoji: "🏃" },
          { value: "run_faster", label: "Run faster", emoji: "⚡" },
          { value: "stamina", label: "General stamina", emoji: "🔋" },
        ],
      };
    default:
      return { prompt: "", options: [] };
  }
}

/** Merge sub-goals across all selected goals (dedup by value), gender-aware. */
export function mergedSubGoals(goals: Goal[], sex?: Sex): SubCfg {
  const real = (goals || []).filter((g) => g !== "general");
  if (!real.length) return { prompt: "", options: [] };
  if (real.length === 1) return subGoalsFor(real[0], sex);
  const seen = new Set<string>();
  const options: QOption[] = [];
  for (const g of real) {
    for (const o of subGoalsFor(g, sex).options) {
      if (!seen.has(o.value)) {
        seen.add(o.value);
        options.push(o);
      }
    }
  }
  return { prompt: "What matters most to you?", options };
}

/** Goal → the mascot pose that previews it when picked. */
export const GOAL_POSE: Record<Goal, MascotState> = {
  muscle: "curl",
  strength: "lift",
  lean: "run",
  endurance: "run",
  general: "wave",
};
