import React, { useEffect, useMemo } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Circle,
  Defs,
  Stop,
  LinearGradient as SvgGrad,
} from "react-native-svg";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Mascot from "../components/Mascot";
import GlowCTA from "../components/GlowCTA";
import { MascotState } from "../../assets/mascot";
import {
  bmiOf,
  genderFromSex,
  Goal,
  inferStartBody,
  projectionBody,
  useOnboardingStore,
} from "../store";
import { ob } from "../theme";

// The "after" mascot's pose shows the RESULT — so the change reads even when the body barely moves.
const AFTER_POSE: Record<Goal, MascotState> = {
  muscle: "curl",
  strength: "lift",
  lean: "proud",
  endurance: "run",
  general: "proud",
};

const { width } = Dimensions.get("window");
const CARD_W = width - ob.gutter * 2;
const PLOT = { w: CARD_W - 32, h: 150, padL: 6, padR: 6, padT: 18, padB: 6 };
const DASH = 1400;

const BG = ob.bgMid;
const BG_CLEAR = "rgba(244,248,255,0)";
const WHITE_CLEAR = "rgba(255,255,255,0)";
const AnimatedPath = Animated.createAnimatedComponent(Path);
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Curve sample points (concave: fast early progress, tapering) → smooth path + milestone coords.
const N = 26;
// Curve peaks at Y_TOP (not 0), leaving headroom up top for the finish-line mascot.
const Y_TOP = 66;
const Y_BOT = PLOT.h - PLOT.padB;
const yAt = (t: number) => Math.pow(t, 0.72);
const px = (t: number) => PLOT.padL + t * (PLOT.w - PLOT.padL - PLOT.padR);
const py = (t: number) => Y_BOT - yAt(t) * (Y_BOT - Y_TOP);

function buildLine() {
  let d = `M${px(0).toFixed(1)} ${py(0).toFixed(1)}`;
  for (let i = 1; i <= N; i++)
    d += ` L${px(i / N).toFixed(1)} ${py(i / N).toFixed(1)}`;
  return d;
}
const LINE = buildLine();
const AREA = `${LINE} L${px(1).toFixed(1)} ${(PLOT.h - PLOT.padB).toFixed(1)} L${px(0).toFixed(1)} ${(PLOT.h - PLOT.padB).toFixed(1)} Z`;

// Correct payoff phrasing per sub-goal (NOT "bigger abs"/"bigger waist").
const SUBGOAL_PAYOFF: Record<string, string> = {
  arms: "bigger arms",
  chest: "a fuller chest",
  back: "a wider back",
  shoulders: "rounder shoulders",
  legs: "stronger legs",
  glutes: "fuller glutes",
  abs: "visible abs",
  bench: "a bigger bench",
  squat: "a stronger squat",
  deadlift: "a bigger deadlift",
  overhead_press: "a stronger press",
  pullups: "more pull-ups",
  waist: "a slimmer waist",
  overall: "a leaner physique",
  run_longer: "lasting endurance",
  run_faster: "a faster pace",
  stamina: "real stamina",
};

// Goal-specific early win (weeks 1–3) so the first milestone matches what they're after.
const EARLY_WIN: Record<Goal, string> = {
  muscle: "Bigger pumps, early strength jumps",
  strength: "Bar speed and your numbers climbing",
  lean: "Scale moving, clothes fitting looser",
  endurance: "Workouts start feeling easier",
  general: "Energy up and the habit clicks",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function project(
  answers: ReturnType<typeof useOnboardingStore.getState>["answers"],
) {
  const goal = answers.goal ?? "general";
  const exp = answers.trainingAge;
  const w = answers.weightKg;
  const beginner = exp === "new" || exp === "1-2y";
  const inter = exp === "2-5y";

  let metric = "Noticeably fitter";
  if (goal === "muscle")
    metric = beginner
      ? "+3–4 kg lean muscle"
      : inter
        ? "+1.5–2.5 kg muscle"
        : "+0.5–1.5 kg muscle";
  else if (goal === "strength")
    metric = beginner
      ? "+30% on your big lifts"
      : inter
        ? "+15% on your big lifts"
        : "+8% on your big lifts";
  else if (goal === "lean")
    metric = w
      ? `−${Math.round(w * 0.05)}–${Math.round(w * 0.08)} kg`
      : "Visibly leaner";
  else if (goal === "endurance") metric = "Nearly double your stamina";

  const payoffByGoal: Record<Goal, string> = {
    muscle: "Noticeably bigger and fuller",
    strength: "Real strength on every lift",
    lean: "Leaner, tighter, more defined",
    endurance: "Stamina you didn't have before",
    general: "The fittest you've felt in years",
  };
  const subs = (answers.subGoals ?? [])
    .map((s) => SUBGOAL_PAYOFF[s])
    .filter(Boolean);
  const payoff = subs.length
    ? cap(subs.slice(0, 2).join(" & "))
    : payoffByGoal[goal];

  return {
    metric,
    payoff,
    milestones: [
      { wk: "Weeks 1–3", label: EARLY_WIN[goal] },
      { wk: "Weeks 4–8", label: "Visible changes — people start noticing" },
      { wk: "Weeks 9–12", label: payoff },
    ],
  };
}

export default function ProjectionScreen({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboardingStore();
  const gender = genderFromSex(answers.sex);
  const startBody = inferStartBody(
    gender,
    bmiOf(answers.heightCm, answers.weightKg),
    answers.trainingAge,
    answers.currentActivity,
  );
  // Realistic 12-week result (one step toward the goal), NOT the full long-term archetype.
  const goalBody = projectionBody(gender, startBody, answers.goal);
  const p = useMemo(() => project(answers), [answers]);

  const targetMonth = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 84); // ~12 weeks
    return MONTHS[d.getMonth()];
  }, []);

  const draw = useSharedValue(0);
  useEffect(() => {
    draw.value = withDelay(
      250,
      withTiming(1, { duration: 1150, easing: Easing.out(Easing.cubic) }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: DASH * (1 - draw.value),
  }));
  const areaProps = useAnimatedProps(() => ({
    fillOpacity: draw.value * 0.18,
  }));

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.Text entering={FadeIn.duration(300)} style={styles.kicker}>
          YOUR 12-WEEK OUTLOOK
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(60).duration(440).easing(Easing.out(Easing.cubic))}
          style={styles.headline}
        >
          Stick with it and here's{"\n"}where you'll be
        </Animated.Text>

        {/* Before → After — large; lower legs fade into the chart card below (labels above) */}
        <Animated.View
          entering={FadeInDown.delay(120).duration(480).easing(Easing.out(Easing.cubic))}
          style={styles.baWrap}
        >
          <View style={styles.baLabels}>
            <Text style={[styles.baLabel, styles.baCol]}>YOU NOW</Text>
            <View style={styles.baArrowCol} />
            <Text style={[styles.baLabel, styles.baLabelGoal, styles.baCol]}>IN 12 WEEKS</Text>
          </View>
          <View style={styles.baRow}>
            <View style={styles.baCol}>
              <Mascot gender={gender} body={startBody} state="idle" size={152} />
            </View>
            <View style={styles.baArrowCol}>
              <Ionicons name="arrow-forward" size={24} color={ob.primary} />
            </View>
            <View style={styles.baCol}>
              <Mascot
                gender={gender}
                body={goalBody}
                state={AFTER_POSE[answers.goal ?? "general"]}
                size={152}
              />
            </View>
          </View>
          <LinearGradient
            colors={[WHITE_CLEAR, "#fff"]}
            locations={[0, 0.92]}
            style={styles.baFade}
            pointerEvents="none"
          />
        </Animated.View>

        {/* Outlook chart (clean curve) — tucks up under the faded legs */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(480).easing(Easing.out(Easing.cubic))}
          style={styles.card}
        >
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Projected by {targetMonth}</Text>
            <Text style={styles.metric} numberOfLines={1} adjustsFontSizeToFit>
              {p.metric}
            </Text>
          </View>

          <View style={{ height: PLOT.h }}>
            <Svg width={PLOT.w} height={PLOT.h}>
              <Defs>
                <SvgGrad id="area" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={ob.primary} stopOpacity="1" />
                  <Stop offset="1" stopColor={ob.primary} stopOpacity="0" />
                </SvgGrad>
              </Defs>
              <AnimatedPath d={AREA} fill="url(#area)" animatedProps={areaProps} />
              <AnimatedPath
                d={LINE}
                stroke={ob.primary}
                strokeWidth={3.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={DASH}
                animatedProps={lineProps}
              />
              {[0.33, 0.66].map((t, i) => (
                <Circle key={i} cx={px(t)} cy={py(t)} r={4.5} fill="#fff" stroke={ob.primary} strokeWidth={2.5} />
              ))}
              <Circle cx={px(1)} cy={py(1)} r={5} fill={ob.primary} />
              <Circle cx={px(0)} cy={py(0)} r={4} fill={ob.textFaint} />
            </Svg>
          </View>

          <View style={styles.axis}>
            <Text style={styles.axisLabel}>Today</Text>
            <Text style={styles.axisLabel}>Week 6</Text>
            <Text style={styles.axisLabel}>{targetMonth}</Text>
          </View>
        </Animated.View>

        <View style={styles.milestones}>
          {p.milestones.map((m, i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(300 + i * 80).duration(420).easing(Easing.out(Easing.cubic))}
              style={styles.mRow}
            >
              <View style={[styles.mDot, i === 2 && styles.mDotGoal]} />
              <Text style={styles.mWk}>{m.wk}</Text>
              <Text style={styles.mLabel} numberOfLines={1}>
                {m.label}
              </Text>
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      {/* Pinned dopamine CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <LinearGradient
          colors={[BG_CLEAR, BG]}
          locations={[0, 0.5]}
          style={styles.footerFade}
          pointerEvents="none"
        />
        <View style={styles.footerInner}>
          <GlowCTA label="Unlock my full plan" onPress={onContinue} />
          <Text style={styles.footerNote}>7-day free trial · cancel anytime</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ob.bgMid },
  page: { paddingHorizontal: ob.gutter },
  kicker: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: ob.primary,
    textAlign: "center",
  },
  headline: {
    fontSize: ob.h1,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 8,
    lineHeight: ob.h1 * 1.12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: ob.rLg,
    padding: 16,
    marginTop: -8,
    shadowColor: "#0B1524",
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  metricRow: { marginBottom: 6 },
  metricLabel: { fontSize: 12.5, fontWeight: "600", color: ob.textSoft, marginBottom: 3 },
  metric: {
    fontSize: 23,
    fontWeight: "800",
    color: ob.primaryDeep,
    letterSpacing: -0.4,
  },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  axisLabel: { fontSize: 11, fontWeight: "700", color: ob.textFaint },

  // before → after (big mascots, labels above, lower legs fade into the card)
  baWrap: { marginTop: 14, position: "relative" },
  baLabels: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  baRow: { flexDirection: "row", alignItems: "center" },
  baCol: { flex: 1, alignItems: "center", textAlign: "center" },
  baArrowCol: { width: 44, alignItems: "center" },
  baFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 64 },
  baLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: ob.textFaint,
    textAlign: "center",
  },
  baLabelGoal: { color: ob.primaryDeep },

  milestones: { marginTop: 22, gap: 12 },
  mRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  mDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#C5D2E6" },
  mDotGoal: { backgroundColor: ob.primary },
  mWk: { fontSize: 13, fontWeight: "800", color: ob.ink, width: 86 },
  mLabel: { fontSize: 13, fontWeight: "500", color: ob.textSoft, flex: 1 },

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: ob.gutter },
  footerFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 150 },
  footerInner: { paddingTop: 8 },
  footerNote: {
    fontSize: 12,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 10,
    fontWeight: "600",
  },
});
