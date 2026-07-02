import React, { useMemo } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, Easing } from "react-native-reanimated";
import Mascot from "../components/Mascot";
import PrimaryButton from "../components/PrimaryButton";
import { MascotBody, MascotState } from "../../assets/mascot";
import {
  afterBody,
  bmiOf,
  CurrentActivity,
  genderFromSex,
  Goal,
  inferStartBody,
  useOnboardingStore,
} from "../store";
import { pickTransformation, Review } from "../reviews";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const BIG = Math.min(width * 0.76, 300);
const BG = ob.bgMid;
const BG_CLEAR = "rgba(244,248,255,0)";

const GOAL_POSE: Record<Goal, MascotState> = {
  muscle: "curl",
  strength: "lift",
  lean: "cheer", // lose-fat = excited reveal, NOT running (running only for explicit endurance)
  endurance: "run",
  general: "wave",
};
const INJURY_LABEL: Record<string, string> = {
  knees: "knees",
  lower_back: "lower back",
  shoulders: "shoulders",
  wrists: "wrists",
  elbows: "elbows",
};

// ── Transformation copy (reviews screen) ─────────────────────────────
const SUBGOAL_HEADLINE: Record<string, string> = {
  arms: "built the arms they wanted",
  chest: "built a fuller chest",
  back: "built a wider back",
  shoulders: "built rounder shoulders",
  legs: "built stronger legs",
  glutes: "built the glutes they wanted",
  abs: "finally saw their abs",
  bench: "smashed their bench",
  squat: "crushed their squat",
  deadlift: "pulled bigger deadlifts",
  overhead_press: "locked out heavier presses",
  pullups: "ripped out more pull-ups",
  waist: "trimmed their waist for good",
  overall: "leaned down all over",
  run_longer: "ran further than ever",
  run_faster: "got noticeably faster",
  stamina: "built real stamina",
};
const GOAL_HEADLINE: Record<Goal, string> = {
  muscle: "packed on real muscle",
  strength: "got seriously strong",
  lean: "leaned down for good",
  endurance: "built real endurance",
  general: "got fit and stayed fit",
};
const GOAL_TRUST: Record<Goal, string> = {
  muscle: "building muscle",
  strength: "getting stronger",
  lean: "leaning down",
  endurance: "going the distance",
  general: "staying in shape",
};

function subject(body: MascotBody, activity?: CurrentActivity, goal?: Goal): string {
  if (goal === "muscle" && body === "skinny") return "Hard-gainers like you";
  if (activity === "inactive") return "People who started from zero";
  if (activity === "cardio" && (goal === "muscle" || goal === "strength"))
    return "Cardio lovers turned lifters";
  if (body === "soft" && (goal === "lean" || goal === "general"))
    return "People on the same journey";
  return "People just like you";
}

// ── Injury reassurance (app's own voice): a hook + two value points —
//    (1) the plan is built around it, (2) the AI actively diagnoses + fixes the root cause.
type Reassure = { hook: string; around: string; solve: string };
const INJURY_REASSURE: Record<string, Reassure> = {
  knees: {
    hook: "Bad knees? I've got you.",
    around: "Built around them — no risky squatting or high-impact work.",
    solve: "And the moment a knee flares, just tell me — I'll pinpoint exactly what's causing it and fix it so it stops for good.",
  },
  lower_back: {
    hook: "Your back's safe with me.",
    around: "No risky loading — lifts that build strength while sparing your spine.",
    solve: "And the moment your back acts up, tell me — I'll get to the root of it and reshape your plan until it's gone.",
  },
  shoulders: {
    hook: "Shoulder? Covered.",
    around: "Pain-free pressing angles and smarter volume.",
    solve: "And if you ever feel a pinch, tell me — I'll find exactly what's triggering it and train it out.",
  },
  wrists: {
    hook: "Wrists? No problem.",
    around: "Grips and movements that keep them comfortable.",
    solve: "And the moment a wrist bothers you, tell me — I'll pinpoint the cause and fix it so it stops for good.",
  },
  elbows: {
    hook: "Elbows? Handled.",
    around: "Pressing and curling volume managed so they stay good.",
    solve: "And the moment an elbow flares, tell me — I'll find what's behind it and get rid of it for good.",
  },
};

function reassurance(injuries: string[]): Reassure {
  if (injuries.length === 1 && INJURY_REASSURE[injuries[0]]) return INJURY_REASSURE[injuries[0]];
  if (injuries.length === 2) {
    const a = INJURY_LABEL[injuries[0]] ?? injuries[0];
    const b = INJURY_LABEL[injuries[1]] ?? injuries[1];
    return {
      hook: "Both? Covered.",
      around: `Your whole plan built around your ${a} and ${b}.`,
      solve: "And the moment either one flares, tell me — I'll pinpoint the real cause and fix it for good.",
    };
  }
  return {
    hook: "All handled.",
    around: "Your whole plan routed around every one.",
    solve: "And the moment something flares, tell me — I'll pinpoint the cause and fix it for good.",
  };
}

export default function ProofInterstitial({
  kind,
  onContinue,
}: {
  kind: "transformation" | "problem";
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboardingStore();

  const gender = genderFromSex(answers.sex);
  const goal = answers.goal;
  const isTransform = kind === "transformation";

  const startBody = useMemo(
    () =>
      inferStartBody(
        gender,
        bmiOf(answers.heightCm, answers.weightKg),
        answers.trainingAge,
        answers.currentActivity,
      ),
    [answers, gender],
  );

  const pageStyle = [
    styles.page,
    { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 14 },
  ];

  // ── PROBLEM: the coach reassuring in its own voice (hook + detail) ──
  if (!isTransform) {
    const injuries = answers.limitations.filter((l) => l && l !== "none");
    const { hook, around, solve } = reassurance(injuries);
    return (
      <View style={styles.root}>
        <View style={pageStyle}>
          <Animated.View entering={FadeIn.duration(260)} style={styles.badge}>
            <Ionicons name="shield-checkmark" size={13} color={ob.primaryDeep} />
            <Text style={styles.badgeText}>I'VE GOT YOU</Text>
          </Animated.View>

          {/* Big coach mascot faded behind */}
          <Animated.View
            entering={FadeInDown.duration(440).easing(Easing.out(Easing.cubic))}
            style={styles.mascotZone}
            pointerEvents="none"
          >
            <Mascot gender={gender} body="lean" state="proud" size={BIG} />
            <LinearGradient
              colors={[BG_CLEAR, BG]}
              locations={[0, 0.42]}
              style={[styles.zoneFade, { height: BIG * 0.6 }]}
            />
          </Animated.View>

          <View style={styles.reassureContent}>
            <Animated.Text
              entering={FadeInDown.delay(80).duration(440).easing(Easing.out(Easing.cubic))}
              style={styles.hook}
            >
              {hook}
            </Animated.Text>
            <View style={styles.points}>
              <ReassurePoint icon="shield-checkmark" text={around} delay={160} />
              <ReassurePoint icon="pulse" text={solve} delay={250} />
            </View>
          </View>

          <PrimaryButton label="Continue" onPress={onContinue} />
        </View>
      </View>
    );
  }

  // ── TRANSFORMATION: matched reviews ────────────────────────────────
  const reviews = pickTransformation(
    { goal, subGoals: answers.subGoals, activity: answers.currentActivity, body: startBody, sex: gender },
    3,
  );
  const mascotBody = isTransform ? afterBody(gender, goal) : "lean";
  const mascotPose: MascotState = goal ? GOAL_POSE[goal] : "cheer";
  const sub = answers.subGoals[0];
  const heading = `${subject(startBody, answers.currentActivity, goal)} ${
    (sub && SUBGOAL_HEADLINE[sub]) || (goal && GOAL_HEADLINE[goal]) || "reached their goals"
  }`;
  const trust = `4.9 · 12,000+ ${goal ? GOAL_TRUST[goal] : "members"}`;

  return (
    <View style={styles.root}>
      <View style={pageStyle}>
        <Animated.View entering={FadeIn.duration(260)} style={styles.trust}>
          <View style={styles.stars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons key={i} name="star" size={13} color="#FFB300" />
            ))}
          </View>
          <Text style={styles.trustText}>{trust}</Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(440).easing(Easing.out(Easing.cubic))}
          style={styles.mascotZone}
          pointerEvents="none"
        >
          <Mascot gender={gender} body={mascotBody} state={mascotPose} size={BIG} />
          <LinearGradient
            colors={[BG_CLEAR, BG]}
            locations={[0, 0.42]}
            style={[styles.zoneFade, { height: BIG * 0.6 }]}
          />
        </Animated.View>

        <View style={styles.content}>
          <Animated.Text
            entering={FadeInDown.delay(70).duration(420).easing(Easing.out(Easing.cubic))}
            style={styles.heading}
          >
            {heading}
          </Animated.Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {reviews.map((r, i) => (
              <Animated.View
                key={r.id}
                entering={FadeInDown.delay(130 + i * 80)
                  .duration(420)
                  .easing(Easing.out(Easing.cubic))}
              >
                <ReviewCard r={r} />
              </Animated.View>
            ))}
          </ScrollView>
        </View>

        <PrimaryButton label="Continue" onPress={onContinue} />
      </View>
    </View>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.starsSm}>
          {Array.from({ length: r.stars ?? 5 }).map((_, i) => (
            <Ionicons key={i} name="star" size={11} color="#FFB300" />
          ))}
        </View>
        {!!r.result && (
          <View style={styles.resultChip}>
            <Ionicons name="trending-up" size={12} color={ob.primaryDeep} />
            <Text style={styles.resultText}>{r.result}</Text>
          </View>
        )}
      </View>
      <Text style={styles.quote} numberOfLines={3}>
        “{r.quote}”
      </Text>
      <View style={styles.author}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{(r.name || "?").charAt(0)}</Text>
        </View>
        <Text style={styles.authorName}>{r.name}</Text>
      </View>
    </View>
  );
}

function ReassurePoint({ icon, text, delay }: { icon: any; text: string; delay: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(440).easing(Easing.out(Easing.cubic))}
      style={styles.point}
    >
      <View style={styles.pointIcon}>
        <Ionicons name={icon} size={15} color={ob.primaryDeep} />
      </View>
      <Text style={styles.pointText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  page: { flex: 1, paddingHorizontal: ob.gutter },

  // shared badge / trust
  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ob.primaryTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ob.rPill,
  },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: ob.primaryDeep },
  trust: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  stars: { flexDirection: "row", gap: 2 },
  trustText: { fontSize: 12.5, fontWeight: "700", color: ob.textSoft },

  // problem (reassurance)
  reassureContent: { flex: 1, alignItems: "center", marginTop: -BIG * 0.16, paddingHorizontal: 4 },
  hook: {
    fontSize: 27,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 12,
  },
  points: { alignSelf: "stretch", gap: 16, marginTop: 6, paddingHorizontal: 8 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pointIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: ob.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  pointText: { flex: 1, fontSize: 15.5, lineHeight: 22, color: ob.text, fontWeight: "500" },

  // transformation (reviews)
  mascotZone: { height: BIG, alignItems: "center", justifyContent: "flex-start", marginTop: 2 },
  zoneFade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  content: { flex: 1, marginTop: -BIG * 0.3 },
  heading: {
    fontSize: ob.h1,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  list: { flex: 1, alignSelf: "stretch" },
  listContent: { gap: 10, paddingBottom: 8 },
  card: {
    backgroundColor: "#fff",
    borderRadius: ob.rLg,
    padding: 16,
    shadowColor: "#0B1524",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  starsSm: { flexDirection: "row", gap: 1.5 },
  resultChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: ob.primaryTint,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: ob.rPill,
  },
  resultText: { fontSize: 11.5, fontWeight: "800", color: ob.primaryDeep },
  quote: { fontSize: 14.5, lineHeight: 21, color: ob.ink, fontWeight: "500" },
  author: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ob.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 13, fontWeight: "800" },
  authorName: { fontSize: 13, fontWeight: "700", color: ob.text },
});
