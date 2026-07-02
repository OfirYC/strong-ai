// Analytics + attribution. One place to init PostHog, capture utm_* attribution once, and
// auto-forward it to BOTH PostHog (super properties) and RevenueCat (subscriber attributes)
// so every event/purchase carries it without ever passing it manually.
import PostHog from "posthog-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import Purchases from "react-native-purchases";
import { storageKey } from "../env";

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const ATTR_KEY = storageKey("attribution");

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

let posthog: PostHog | null = null;

/** First-touch attribution, resolved at boot. Read it anywhere via `getAttribution()`. */
export let attribution: Record<string, string> = {};
export const getAttribution = () => attribution;

export function initAnalytics() {
  if (posthog) return;
  if (!KEY) {
    console.warn("[analytics] EXPO_PUBLIC_POSTHOG_KEY missing — analytics disabled");
    return;
  }
  posthog = new PostHog(KEY, { host: HOST });
}

/** Fire an event. No-op until analytics is initialised (safe to call anywhere). */
export function track(event: string, props?: Record<string, any>) {
  posthog?.capture(event, props);
}

export function identify(userId: string, props?: Record<string, any>) {
  posthog?.identify(userId, props);
}

/** Screen view (navigation). Called automatically on route change. */
export function screen(name: string, props?: Record<string, any>) {
  posthog?.screen(name, props);
}

export function resetAnalytics() {
  posthog?.reset();
}

/**
 * Register the onboarding profile as super properties so EVERY event can be broken down by
 * goal / experience / equipment / injuries etc. Call once the answers are complete.
 */
export function setProfile(a: {
  goal?: string;
  goals?: string[];
  sex?: string;
  trainingAge?: string;
  currentActivity?: string;
  daysPerWeek?: number;
  equipment?: string;
  subGoals?: string[];
  limitations?: string[];
  customLimitation?: string;
}) {
  const props: Record<string, any> = {};
  if (a.goal != null) props.ob_goal = a.goal; // primary
  if (a.goals?.length) props.ob_goals = a.goals; // all selected
  if (a.sex != null) props.ob_sex = a.sex;
  if (a.trainingAge != null) props.ob_experience = a.trainingAge;
  if (a.currentActivity != null) props.ob_activity = a.currentActivity;
  if (a.daysPerWeek != null) props.ob_days_per_week = a.daysPerWeek;
  if (a.equipment != null) props.ob_equipment = a.equipment;
  if (a.subGoals?.length) props.ob_sub_goals = a.subGoals;
  const injuries = [
    ...(a.limitations ?? []).filter((l) => l !== "other"),
    ...(a.customLimitation?.trim() ? [a.customLimitation.trim()] : []),
  ];
  if (injuries.length) props.ob_injuries = injuries;
  if (Object.keys(props).length) posthog?.register(props);
}

/**
 * Capture utm_* from the launch URL (first-touch, persisted), then register it globally on
 * PostHog + RevenueCat. Called once at boot after configurePurchases()/initAnalytics().
 */
function extractUtm(url: string | null): Record<string, string> {
  const q = (url ? Linking.parse(url).queryParams : null) ?? {};
  const found: Record<string, string> = {};
  for (const k of UTM_KEYS) if (q[k] != null) found[k] = String(q[k]);
  return found;
}

async function persistAndApply(found: Record<string, string>) {
  if (!Object.keys(found).length) return;
  attribution = found;
  try {
    await AsyncStorage.setItem(ATTR_KEY, JSON.stringify(found));
  } catch {}
  applyAttribution();
}

export async function captureAttribution() {
  try {
    const stored = await AsyncStorage.getItem(ATTR_KEY);
    if (stored) {
      attribution = JSON.parse(stored);
      applyAttribution();
    } else {
      await persistAndApply(extractUtm(await Linking.getInitialURL())); // cold launch
    }
  } catch {}
  // Links that arrive while the app is running (warm) — first-touch only.
  Linking.addEventListener("url", ({ url }) => {
    if (Object.keys(attribution).length) return;
    persistAndApply(extractUtm(url));
  });
}

function applyAttribution() {
  if (!Object.keys(attribution).length) return;

  // PostHog: super properties → auto-attached to EVERY event from now on.
  posthog?.register(attribution);

  // RevenueCat: subscriber attributes → attached to the customer + all purchase events,
  // and the reserved attribution fields power RC's attribution dashboards/integrations.
  try {
    Purchases.setAttributes(attribution);
    if (attribution.utm_source) Purchases.setMediaSource(attribution.utm_source);
    if (attribution.utm_campaign) Purchases.setCampaign(attribution.utm_campaign);
    if (attribution.utm_medium) Purchases.setAdGroup(attribution.utm_medium);
    if (attribution.utm_term) Purchases.setKeyword(attribution.utm_term);
    if (attribution.utm_content) Purchases.setCreative(attribution.utm_content);
  } catch {}
}
