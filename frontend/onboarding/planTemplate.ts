// Client-side workout-plan generator for the onboarding plan reveal.
// A believable template derived from the quiz answers. The live AI endpoint replaces this later.
import { Equipment, Goal, OnboardingAnswers } from "./store";

export type PlanExercise = { name: string; sets: number; reps: string };
export type FocusKey = "push" | "pull" | "legs" | "upper" | "lower" | "full";
export type PlanDay = {
  name: string;
  focus: string;
  emoji: string;
  /** AI-style persuasive one-liner. Day 0 (most relevant) carries the strongest hook. */
  description: string;
  exercises: PlanExercise[];
  /** Scheduling: 0=Mon … 6=Sun, and a calendar session type. */
  weekday?: number;
  type?: string;
};
export type Plan = { title: string; subtitle: string; days: PlanDay[]; weeklyVolume: number };

type Cat = "push" | "pull" | "legs" | "core";
type Ex = { name: string; cat: Cat; equip: Equipment[]; compound?: boolean; avoid?: string[] };

const ALL: Equipment[] = ["full_gym", "dumbbells", "bodyweight", "bands"];

// Curated movement pool. `avoid` = limitation regions that rule the move out.
const DB: Ex[] = [
  // push
  { name: "Barbell Bench Press", cat: "push", equip: ["full_gym"], compound: true, avoid: ["shoulders"] },
  { name: "Incline Dumbbell Press", cat: "push", equip: ["full_gym", "dumbbells"], compound: true, avoid: ["shoulders"] },
  { name: "Dumbbell Shoulder Press", cat: "push", equip: ["full_gym", "dumbbells"], compound: true, avoid: ["shoulders"] },
  { name: "Push-Up", cat: "push", equip: ["bodyweight", "bands"], compound: true, avoid: ["wrists"] },
  { name: "Band Chest Press", cat: "push", equip: ["bands"], compound: true },
  { name: "Dumbbell Lateral Raise", cat: "push", equip: ["full_gym", "dumbbells"] },
  { name: "Triceps Pushdown", cat: "push", equip: ["full_gym", "bands"], avoid: ["elbows"] },
  { name: "Overhead Triceps Extension", cat: "push", equip: ["dumbbells", "bands"], avoid: ["elbows"] },
  // pull
  { name: "Pull-Up", cat: "pull", equip: ["full_gym", "bodyweight"], compound: true },
  { name: "Barbell Row", cat: "pull", equip: ["full_gym"], compound: true, avoid: ["lower_back"] },
  { name: "One-Arm Dumbbell Row", cat: "pull", equip: ["full_gym", "dumbbells"], compound: true, avoid: ["lower_back"] },
  { name: "Band Row", cat: "pull", equip: ["bands"], compound: true },
  { name: "Inverted Row", cat: "pull", equip: ["bodyweight"], compound: true },
  { name: "Face Pull", cat: "pull", equip: ["full_gym", "bands"] },
  { name: "Dumbbell Bicep Curl", cat: "pull", equip: ["full_gym", "dumbbells"], avoid: ["elbows"] },
  { name: "Band Curl", cat: "pull", equip: ["bands"], avoid: ["elbows"] },
  // legs
  { name: "Back Squat", cat: "legs", equip: ["full_gym"], compound: true, avoid: ["knees", "lower_back"] },
  { name: "Goblet Squat", cat: "legs", equip: ["dumbbells"], compound: true, avoid: ["knees"] },
  { name: "Romanian Deadlift", cat: "legs", equip: ["full_gym", "dumbbells"], compound: true, avoid: ["lower_back"] },
  { name: "Walking Lunge", cat: "legs", equip: ["dumbbells", "bodyweight"], avoid: ["knees"] },
  { name: "Bulgarian Split Squat", cat: "legs", equip: ["dumbbells", "bodyweight"], avoid: ["knees"] },
  { name: "Glute Bridge", cat: "legs", equip: ["bodyweight", "bands", "dumbbells"] },
  { name: "Banded Squat", cat: "legs", equip: ["bands"], compound: true, avoid: ["knees"] },
  { name: "Calf Raise", cat: "legs", equip: ALL },
  // core
  { name: "Plank", cat: "core", equip: ALL },
  { name: "Hanging Leg Raise", cat: "core", equip: ["full_gym", "bodyweight"] },
  { name: "Dead Bug", cat: "core", equip: ALL },
];

const SETS_REPS: Record<Goal, { sets: number; reps: string }> = {
  strength: { sets: 4, reps: "4–6" },
  muscle: { sets: 4, reps: "8–12" },
  lean: { sets: 3, reps: "12–15" },
  endurance: { sets: 3, reps: "15–20" },
  general: { sets: 3, reps: "10–12" },
};

type SplitDay = { name: string; focus: string; emoji: string; key: FocusKey; cats: Cat[] };

// Day split by training frequency.
function split(days: number): SplitDay[] {
  const PUSH: SplitDay = { name: "Push", focus: "Chest · Shoulders · Triceps", emoji: "💥", key: "push", cats: ["push", "core"] };
  const PULL: SplitDay = { name: "Pull", focus: "Back · Biceps", emoji: "🪝", key: "pull", cats: ["pull", "core"] };
  const LEGS: SplitDay = { name: "Legs", focus: "Quads · Hamstrings · Glutes", emoji: "🦵", key: "legs", cats: ["legs", "core"] };
  const UPPER: SplitDay = { name: "Upper", focus: "Chest · Back · Arms", emoji: "💪", key: "upper", cats: ["push", "pull"] };
  const LOWER: SplitDay = { name: "Lower", focus: "Legs · Core", emoji: "🦵", key: "lower", cats: ["legs", "core"] };
  const FULL = (l: string): SplitDay => ({ name: `Full Body ${l}`, focus: "Total body", emoji: "🏋️", key: "full", cats: ["legs", "push", "pull"] });
  switch (days) {
    case 2: return [FULL("A"), FULL("B")];
    case 3: return [PUSH, PULL, LEGS];
    case 4: return [UPPER, LOWER, { ...UPPER }, { ...LOWER }];
    case 5: return [PUSH, PULL, LEGS, UPPER, LOWER];
    default: return [PUSH, PULL, LEGS, PUSH, PULL, LEGS];
  }
}

// Relevance of a day's focus to the user's goal — used to rank the most motivating day first.
const REL: Record<Goal, Record<FocusKey, number>> = {
  muscle: { push: 5, pull: 5, upper: 5, full: 4, legs: 3, lower: 3 },
  strength: { legs: 5, lower: 5, push: 4, pull: 4, upper: 4, full: 4 },
  lean: { full: 5, legs: 5, lower: 5, upper: 3, push: 3, pull: 3 },
  endurance: { full: 5, legs: 5, lower: 4, push: 2, pull: 2, upper: 2 },
  general: { full: 4, upper: 3, lower: 3, push: 3, pull: 3, legs: 3 },
};

const AREA: Record<FocusKey, string> = {
  push: "chest & shoulders",
  pull: "back & arms",
  legs: "legs",
  upper: "upper body",
  lower: "lower body",
  full: "whole body",
};

// Several phrasings per goal so consecutive days vary in structure, not just the muscle word.
const SHORT: Record<Goal, ((a: string) => string)[]> = {
  muscle: [
    (a) => `Maximize ${a} size.`,
    (a) => `Pack muscle onto your ${a}.`,
    (a) => `Sculpt fuller, rounder ${a}.`,
  ],
  strength: [
    (a) => `Build raw ${a} strength.`,
    (a) => `Add weight to your ${a} lifts.`,
    (a) => `Get powerful through your ${a}.`,
  ],
  lean: [
    (a) => `Burn fat, keep your ${a} lean.`,
    (a) => `Lean out and define your ${a}.`,
    (a) => `Torch calories, tone your ${a}.`,
  ],
  endurance: [
    (a) => `Boost your ${a} stamina.`,
    (a) => `Build lasting ${a} conditioning.`,
    (a) => `Go longer with stronger ${a}.`,
  ],
  general: [
    (a) => `Keep your ${a} fit and strong.`,
    (a) => `Stay balanced through your ${a}.`,
    (a) => `Build everyday ${a} strength.`,
  ],
};

// Short, day-specific copy (STUB — the live model writes this). `i` rotates the phrasing.
// Injuries live in the subtitle, so they're not repeated on every card.
function describe(key: FocusKey, goal: Goal, i: number): string {
  const opts = SHORT[goal];
  return opts[i % opts.length](AREA[key]);
}

function pick(cats: Cat[], equip: Equipment, limits: string[], count: number): Ex[] {
  const out: Ex[] = [];
  const used = new Set<string>();
  // Walk categories round-robin so a day is balanced; compounds first.
  const pool = DB.filter(
    (e) => e.equip.includes(equip) && !(e.avoid ?? []).some((a) => limits.includes(a)),
  );
  const byCat = (c: Cat, comp: boolean) =>
    pool.filter((e) => e.cat === c && !!e.compound === comp && !used.has(e.name));
  // 1 compound per primary cat, then accessories
  for (const comp of [true, false]) {
    for (const c of cats) {
      if (out.length >= count) break;
      const choice = byCat(c, comp)[0];
      if (choice) { out.push(choice); used.add(choice.name); }
    }
  }
  // top up
  for (const e of pool) {
    if (out.length >= count) break;
    if (!used.has(e.name)) { out.push(e); used.add(e.name); }
  }
  return out.slice(0, count);
}

const GOAL_WORD: Record<Goal, string> = {
  muscle: "muscle-building",
  strength: "strength",
  lean: "fat-loss",
  endurance: "conditioning",
  general: "all-round",
};
const EQUIP_WORD: Record<Equipment, string> = {
  full_gym: "full gym",
  dumbbells: "dumbbells",
  bodyweight: "bodyweight",
  bands: "resistance bands",
};

export function buildPlan(a: OnboardingAnswers): Plan {
  const days = a.daysPerWeek ?? 3;
  const goal = a.goal ?? "general";
  const equip = a.equipment ?? "full_gym";
  const limits = a.limitations ?? [];
  const sr = SETS_REPS[goal];
  const perDay = days >= 5 ? 5 : 6; // fewer days → more per session

  // Rank the most goal-relevant day first (stable), so the headline card hits hardest.
  const ranked = split(days)
    .map((d, i) => ({ d, i }))
    .sort((x, y) => REL[goal][y.d.key] - REL[goal][x.d.key] || x.i - y.i)
    .map(({ d }) => d);

  const plan: PlanDay[] = ranked.map((d, i) => ({
    name: d.name,
    focus: d.focus,
    emoji: d.emoji,
    weekday: Math.round((i * 7) / days) % 7,
    type: goal === "endurance" ? "cardio" : "strength",
    description: describe(d.key, goal, i),
    exercises: pick(d.cats, equip, limits, perDay).map((e) => ({
      name: e.name,
      sets: e.compound ? sr.sets : Math.max(3, sr.sets - 1),
      reps: sr.reps,
    })),
  }));

  const weeklyVolume = plan.reduce((n, d) => n + d.exercises.length, 0);
  return {
    title: `Your ${days}-day ${GOAL_WORD[goal]} plan`,
    subtitle: `Built for ${EQUIP_WORD[equip]}${limits.length && !limits.includes("none") ? " · adapted around your " + limits.filter((l) => l !== "none").join(" & ") : ""}`,
    days: plan,
    weeklyVolume,
  };
}
