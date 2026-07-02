import React, { useMemo } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, Easing } from "react-native-reanimated";
import Mascot from "../components/Mascot";
import { MascotState } from "../../assets/mascot";
import PrimaryButton from "../components/PrimaryButton";
import { afterBody, genderFromSex, Goal, useOnboardingStore } from "../store";
import { buildPlan, PlanDay } from "../planTemplate";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const HBIG = Math.min(width * 0.66, 256); // header mascot
const BG = ob.bgMid;
const BG_CLEAR = "rgba(244,248,255,0)";

// Hero pose reflects the goal — a runner runs, a lifter flexes, etc.
const GOAL_POSE: Record<Goal, MascotState> = {
  muscle: "curl",
  strength: "lift",
  lean: "proud",
  endurance: "run",
  general: "proud",
};

export default function PlanRevealScreen({ onUnlock }: { onUnlock: () => void }) {
  const { answers, plan: storedPlan } = useOnboardingStore();
  const insets = useSafeAreaInsets();
  const gender = genderFromSex(answers.sex);
  const goalBody = afterBody(gender, answers.goal);
  // Prefer the live AI plan generated during the build moment; fall back to the local template.
  const plan = useMemo(() => storedPlan ?? buildPlan(answers), [storedPlan, answers]);
  const mins = (answers.daysPerWeek ?? 3) >= 5 ? 45 : 55;

  const n = plan.days.length;

  return (
    <View style={styles.root}>
      <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
        {/* Header — big goal mascot faded behind the title/stats */}
        <Animated.View entering={FadeInDown.duration(460).easing(Easing.out(Easing.cubic))}>
          <View style={styles.headerMascot} pointerEvents="none">
            <Mascot gender={gender} body={goalBody} state={GOAL_POSE[answers.goal ?? "general"]} size={HBIG} />
            <LinearGradient
              colors={[BG_CLEAR, BG]}
              locations={[0, 0.42]}
              style={[styles.headerFade, { height: HBIG * 0.6 }]}
            />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.kicker}>PERSONALIZED FOR YOU</Text>
            <Text style={styles.title}>{plan.title}</Text>
            <Text style={styles.subtitle}>{plan.subtitle}</Text>
            <View style={styles.stats}>
              <Stat value={`${answers.daysPerWeek ?? 3}`} label="days / week" />
              <View style={styles.statDivider} />
              <Stat value={`${plan.weeklyVolume}`} label="exercises" />
              <View style={styles.statDivider} />
              <Stat value={`~${mins}m`} label="per session" />
            </View>
          </View>
        </Animated.View>

        {/* The week — first 3 days clear; only longer plans dissolve their tail */}
        <View style={styles.listWrap}>
          <View style={styles.list}>
            {plan.days.map((day, i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(110 + i * 55)
                  .duration(360)
                  .easing(Easing.out(Easing.cubic))}
              >
                <DayRow day={day} index={i} />
              </Animated.View>
            ))}
          </View>
          {/* Clear through day 1, then one smooth continuous fade to solid — each day
              progressively more faded than the last. */}
          <LinearGradient
            pointerEvents="none"
            colors={[BG_CLEAR, BG_CLEAR, BG]}
            locations={[0, 1 / n, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      {/* Fade gate + sticky CTA */}
      <View
        style={[styles.gate, { paddingBottom: insets.bottom + 14 }]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={[BG_CLEAR, BG]}
          locations={[0, 0.62]}
          style={styles.gateFade}
          pointerEvents="none"
        />
        <View style={styles.gateInner}>
          <PrimaryButton label="See my 12-week outlook" onPress={onUnlock} />
          <Text style={styles.gateNote}>Your personalized plan is ready</Text>
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DayRow({ day, index }: { day: PlanDay; index: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.dayBadge}>
        <Text style={styles.dayBadgeNum}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {day.emoji}  {day.name}
          <Text style={styles.cardFocus}>   {day.focus}</Text>
        </Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {day.description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  page: { flex: 1, paddingHorizontal: ob.gutter },
  headerMascot: { height: HBIG, alignItems: "center", justifyContent: "flex-start", marginTop: 2 },
  headerFade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  // Fade goes solid by ~65%, so the content can overlap well up the mascot and still be on solid BG.
  headerContent: { alignItems: "center", marginTop: -HBIG * 0.3 },
  kicker: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: ob.primary,
    marginTop: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 5,
  },
  subtitle: {
    fontSize: ob.small,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 5,
    lineHeight: ob.small * 1.4,
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: ob.rMd,
    paddingVertical: 12,
    marginTop: 16,
    alignSelf: "stretch",
    shadowColor: "#0B1524",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 19, fontWeight: "800", color: ob.ink },
  statLabel: { fontSize: 10.5, color: ob.textSoft, marginTop: 2, fontWeight: "600" },
  statDivider: { width: 1, height: 26, backgroundColor: ob.hairline },

  listWrap: { marginTop: 18, position: "relative" },
  list: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: "#fff",
    borderRadius: ob.rMd,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ob.hairline,
  },
  dayBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: ob.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeNum: { fontSize: 14, fontWeight: "800", color: ob.primaryDeep },
  cardTitle: { fontSize: 15.5, fontWeight: "800", color: ob.ink },
  cardFocus: { fontSize: 12, fontWeight: "600", color: ob.textFaint },
  cardDesc: { fontSize: 12.5, color: ob.textSoft, marginTop: 4, fontWeight: "500", lineHeight: 17 },

  gate: { position: "absolute", left: 0, right: 0, bottom: 0 },
  gateFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 210 },
  gateInner: { paddingHorizontal: ob.gutter, paddingTop: 8 },
  gateNote: {
    fontSize: 12,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 10,
    fontWeight: "600",
  },
});
