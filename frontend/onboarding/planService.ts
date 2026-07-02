// Live AI plan fetch for onboarding. Mints an anonymous device token (wall-free, pre-signup),
// calls the tool-equipped AI endpoint, and normalizes the result. Callers fall back to the
// local template (planTemplate.buildPlan) on any failure.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { storageKey } from "../env";
import { OnboardingAnswers } from "./store";
import { Plan } from "./planTemplate";

const API = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const DEVICE_ID_KEY = storageKey("device_id");
const DEVICE_TOKEN_KEY = storageKey("device_token");

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Get (or mint + cache) an anonymous device token. */
export async function getDeviceToken(): Promise<string> {
  const cached = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (cached) return cached;

  const device_id = await getDeviceId();
  const res = await fetch(`${API}/api/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id }),
  });
  if (!res.ok) throw new Error(`device auth failed (${res.status})`);
  const data = await res.json();
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, data.token);
  return data.token as string;
}

export type AuthUser = { id: string; email: string; token: string; is_pro: boolean };

/**
 * Upgrade the current anonymous device user into a real account (email/password or Apple),
 * keeping the same user_id so the plan + purchase carry over. Sends the DEVICE token as auth.
 */
export async function upgradeDeviceAccount(
  creds: { email: string; password: string } | { apple_token: string; email?: string },
): Promise<AuthUser> {
  const token = await getDeviceToken();
  const res = await fetch(`${API}/api/auth/upgrade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(creds),
  });
  if (!res.ok) {
    let detail = `Something went wrong (${res.status})`;
    try {
      detail = (await res.json())?.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return (await res.json()) as AuthUser;
}

/**
 * Persist the finished onboarding plan into the account as routines (one template per day).
 * Best-effort — callers should not block app entry on failure.
 */
export async function saveOnboardingPlan(
  user: AuthUser,
  plan: Plan,
  a: OnboardingAnswers,
): Promise<void> {
  await fetch(`${API}/api/ai/onboarding/save-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({
      title: plan.title,
      sex: a.sex,
      heightCm: a.heightCm,
      weightKg: a.weightKg,
      trainingAge: a.trainingAge,
      goal: a.goal,
      raw: a, // full raw onboarding answers, saved verbatim
      days: plan.days.map((d) => ({
        name: d.name,
        focus: d.focus,
        description: d.description,
        weekday: d.weekday,
        type: d.type,
        exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
      })),
    }),
  });
}

/** Call the live AI plan-gen. Throws on any failure so the caller can fall back. */
export async function fetchAiPlan(a: OnboardingAnswers): Promise<Plan> {
  const token = await getDeviceToken();
  const res = await fetch(`${API}/api/ai/onboarding/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sex: a.sex,
      heightCm: a.heightCm,
      weightKg: a.weightKg,
      currentActivity: a.currentActivity,
      goal: a.goal,
      goals: a.goals,
      subGoals: a.subGoals,
      trainingAge: a.trainingAge,
      daysPerWeek: a.daysPerWeek,
      equipment: a.equipment,
      limitations: a.limitations,
      customLimitation: a.customLimitation,
    }),
  });
  if (!res.ok) throw new Error(`plan gen failed (${res.status})`);
  const data = await res.json();

  const days = Array.isArray(data?.days) ? data.days : [];
  if (!days.length) throw new Error("plan gen returned no days");

  // Normalize to the local Plan shape (compute weeklyVolume the AI doesn't return).
  const weeklyVolume = days.reduce(
    (n: number, d: any) => n + (Array.isArray(d.exercises) ? d.exercises.length : 0),
    0,
  );
  return {
    title: data.title ?? "Your plan",
    subtitle: data.subtitle ?? "",
    weeklyVolume,
    days: days.map((d: any) => ({
      name: d.name ?? "",
      focus: d.focus ?? "",
      emoji: d.emoji ?? "🏋️",
      weekday: typeof d.weekday === "number" ? d.weekday : undefined,
      type: typeof d.type === "string" ? d.type : undefined,
      description: d.description ?? "",
      exercises: (Array.isArray(d.exercises) ? d.exercises : []).map((e: any) => ({
        name: e.name ?? "",
        sets: typeof e.sets === "number" ? e.sets : parseInt(e.sets, 10) || 3,
        reps: String(e.reps ?? ""),
      })),
    })),
  };
}
