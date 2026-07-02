// Onboarding design + motion tokens. Built on the app's existing palette (constants/colors)
// but adds the atmosphere + spring language that makes the funnel feel alive.
import { Easing } from "react-native-reanimated";

export const ob = {
  // ── Color (extends app palette) ──
  ink: "#0B1524", // deeper than #1C1C1E for big display type
  text: "#1C1C1E",
  textSoft: "#6E6E73",
  textFaint: "#9AA3AE",
  primary: "#007AFF",
  primaryDeep: "#0A5BD6",
  primaryTint: "#E5F0FF", // selected fill (matches existing onboarding)
  primaryGlow: "#5AC8FA",
  surface: "#FFFFFF",
  hairline: "#E9EDF2",
  // Atmospheric gradient stops (top → bottom), very subtle so it stays "clean"
  bgTop: "#EAF2FF",
  bgMid: "#F4F8FF",
  bgBottom: "#FFFFFF",

  // ── Radii ──
  rSm: 12,
  rMd: 18,
  rLg: 24,
  rXl: 30,
  rPill: 999,

  // ── Spacing ──
  gutter: 24,

  // ── Type scale ──
  display: 40,
  h1: 30,
  h2: 22,
  body: 17,
  small: 14,
} as const;

// ── Motion ──
// One snappy spring used everywhere so the whole flow feels physically consistent.
export const spring = {
  snappy: { damping: 18, stiffness: 220, mass: 0.9 },
  soft: { damping: 22, stiffness: 140, mass: 1 },
  press: { damping: 26, stiffness: 420, mass: 0.7 },
} as const;

export const timing = {
  fast: { duration: 180, easing: Easing.out(Easing.cubic) },
  base: { duration: 280, easing: Easing.out(Easing.cubic) },
  slow: { duration: 520, easing: Easing.inOut(Easing.cubic) },
} as const;

// Stagger helper for entrance reveals (ms per index)
export const stagger = (i: number, step = 70, base = 60) => base + i * step;
