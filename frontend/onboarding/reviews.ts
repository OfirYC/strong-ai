// Testimonial matching for the social-proof interstitials. The large tagged bank lives in
// reviewsData.ts; here we type it and rank by relevance to the user's profile.
import { CurrentActivity, Goal } from "./store";
import { MascotBody } from "../assets/mascot";
import { REVIEWS } from "./reviewsData";

export type Review = {
  id: string;
  quote: string;
  name: string;
  result: string;
  sex?: "m" | "f";
  goal?: Goal;
  subGoals?: string[];
  activity?: CurrentActivity;
  body?: MascotBody;
  injury?: string;
  stars?: number;
};

const ALL: Review[] = REVIEWS as Review[];

export type MatchProfile = {
  goal?: Goal;
  subGoals: string[];
  activity?: CurrentActivity;
  body: MascotBody;
  sex: "m" | "f";
};

// Relevance score for a transformation review against the user's profile.
function scoreTransform(r: Review, p: MatchProfile): number {
  let s = 0;
  if (r.goal && p.goal && r.goal === p.goal) s += 6;
  const overlap = (r.subGoals ?? []).filter((x) => p.subGoals.includes(x)).length;
  s += overlap * 4;
  if (r.activity && r.activity === p.activity) s += 2;
  if (r.body && r.body === p.body) s += 2;
  if (r.sex && r.sex === p.sex) s += 1;
  return s;
}

function takeDistinct(ranked: Review[], n: number): Review[] {
  const out: Review[] = [];
  const seen = new Set<string>();
  for (const r of ranked) {
    if (out.length >= n) break;
    if (seen.has(r.name)) continue; // avoid two reviews from the "same person"
    out.push(r);
    seen.add(r.name);
  }
  return out;
}

/** Best-matched transformation testimonials for the user, most relevant first. */
export function pickTransformation(p: MatchProfile, n = 3): Review[] {
  const pool = ALL.filter((r) => !r.injury);
  const ranked = pool
    .map((r) => ({ r, s: scoreTransform(r, p) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
  return takeDistinct(ranked, n);
}

/** Problem-solved testimonials for a specific injury, most relevant first. */
export function pickProblem(
  injury: string | undefined,
  p: { goal?: Goal; sex: "m" | "f" },
  n = 3,
): Review[] {
  let pool = ALL.filter((r) => r.injury === injury);
  if (pool.length < n) pool = ALL.filter((r) => !!r.injury); // fall back to any injury review
  const ranked = pool
    .map((r) => ({ r, s: (r.goal === p.goal ? 2 : 0) + (r.sex === p.sex ? 1 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
  return takeDistinct(ranked, n);
}
