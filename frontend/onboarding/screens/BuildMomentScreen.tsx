import React, { useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Backdrop from "../components/Backdrop";
import Mascot from "../components/Mascot";
import Glow from "../components/Glow";
import Confetti from "../components/Confetti";
import { MascotBody, MascotState } from "../../assets/mascot";
import {
  afterBody,
  bmiOf,
  genderFromSex,
  inferStartBody,
  OnboardingAnswers,
  useOnboardingStore,
} from "../store";
import { buildPlan, Plan } from "../planTemplate";
import { fetchAiPlan } from "../planService";
import { track, setProfile } from "../../analytics";
import { hapticSuccess } from "../haptics";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const MASCOT = Math.min(width * 0.74, 310);
const AURA = MASCOT * 1.7;

// Personalised build steps from the user's answers. Each line + how long it lingers.
function buildSteps(a: OnboardingAnswers): { label: string; dur: number }[] {
  const goalWord =
    { muscle: "muscle-building", strength: "strength", lean: "fat-loss", endurance: "conditioning", general: "all-round" }[
      a.goal ?? "general"
    ] ?? "training";
  const equipWord =
    { full_gym: "full-gym", dumbbells: "dumbbell", bodyweight: "bodyweight", bands: "resistance-band" }[
      a.equipment ?? "full_gym"
    ] ?? "";
  const expWord =
    { new: "beginner", "1-2y": "beginner", "2-5y": "intermediate", "5y+": "advanced" }[a.trainingAge ?? "new"] ??
    "your";
  const limit = a.limitations[0]?.replace(/_/g, " ");

  // Each run gets jittered durations so it never feels scripted.
  const jit = (base: number) => Math.round(base + (Math.random() - 0.4) * 500);
  const steps: { label: string; dur: number }[] = [
    { label: "Reading your answers…", dur: jit(800) },
    { label: `Designing your ${goalWord} program…`, dur: jit(1200) },
    { label: a.daysPerWeek ? `Mapping your ${a.daysPerWeek}-day week…` : "Mapping your training week…", dur: jit(1000) },
    { label: `Picking ${equipWord} exercises…`, dur: jit(1050) },
    limit
      ? { label: `Working safely around your ${limit}…`, dur: jit(1100) }
      : { label: `Calibrating volume for ${expWord} level…`, dur: jit(1000) },
    { label: "Putting it all together…", dur: jit(950) },
  ];
  return steps;
}

export default function BuildMomentScreen({ onComplete }: { onComplete: () => void }) {
  const { answers, setPlan } = useOnboardingStore();
  const gender = genderFromSex(answers.sex);
  const bmi = bmiOf(answers.heightCm, answers.weightKg);
  const before = inferStartBody(gender, bmi, answers.trainingAge, answers.currentActivity);
  const after = afterBody(gender, answers.goal);

  const [body, setBody] = useState<MascotBody>(before);
  const [mstate, setMState] = useState<MascotState>("idle");
  const [label, setLabel] = useState("Reading your answers…");
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState(false);

  const glow = useSharedValue(0.45);
  const pop = useSharedValue(1);
  const prog = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tailRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Answers are complete by now — attach the profile to every event + log plan gen.
    setProfile(answers);
    track("plan_generation_started", { goal: answers.goal });
    glow.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    const steps = buildSteps(answers);
    const n = steps.length;

    // Uneven, randomized progress chunks (bigger early, smaller/stalling later) summing to ~92%.
    // Different every run, so the bar moves like real work, not a scripted fill.
    const weights = steps.map((_, i) => (n - i) * (0.55 + Math.random() * 0.9));
    const wsum = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    const targets = weights.map((w) => (acc += (w / wsum) * 0.92));

    let elapsed = 0;
    steps.forEach((s, i) => {
      timers.current.push(
        setTimeout(() => {
          setLabel(s.label);
          prog.value = withTiming(targets[i], {
            duration: Math.round(s.dur * (0.5 + Math.random() * 0.4)),
            easing: Easing.out(Easing.cubic),
          });
        }, elapsed),
      );
      elapsed += s.dur;
    });

    // If the AI plan runs longer than the scripted steps (it can take 10-15s), keep the
    // final phase alive — rotate sublabels + creep the bar every 2s so it never looks frozen.
    const TAIL = [
      "Putting it all together…",
      "Balancing your weekly volume…",
      "Sequencing your sessions…",
      "Fine-tuning your progressions…",
      "Adapting around your limits…",
      "Almost ready…",
    ];
    timers.current.push(
      setTimeout(() => {
        if (cancelled || revealed.current) return;
        let ti = 0;
        let creep = targets[targets.length - 1];
        tailRef.current = setInterval(() => {
          if (cancelled || revealed.current) {
            if (tailRef.current) clearInterval(tailRef.current);
            return;
          }
          setLabel(TAIL[ti % TAIL.length]);
          ti++;
          creep = Math.min(0.985, creep + (0.99 - creep) * 0.35);
          prog.value = withTiming(creep, { duration: 1600, easing: Easing.out(Easing.cubic) });
        }, 2000);
      }, elapsed),
    );

    // Kick off the LIVE AI plan immediately; fall back to the local template on failure/timeout.
    // Real tool-driven gen takes ~20-30s, so give it room — the tail loader keeps the screen alive.
    const planPromise: Promise<Plan | null> = Promise.race([
      fetchAiPlan(answers),
      new Promise<null>((res) =>
        timers.current.push(setTimeout(() => res(null), 45000)),
      ),
    ]).catch(() => null);

    const minDisplay = new Promise<void>((res) =>
      timers.current.push(setTimeout(res, elapsed)),
    );

    // Reveal once the plan is ready AND the steps have had their minimum on-screen time.
    Promise.all([planPromise, minDisplay]).then(([result]) => {
      if (cancelled) return;
      revealed.current = true;
      if (tailRef.current) clearInterval(tailRef.current);
      setPlan(result ?? buildPlan(answers));

      // The level-up beat
      setBody(after);
      setMState("cheer");
      setBurst(true);
      setDone(true);
      prog.value = withTiming(1, { duration: 320 });
      hapticSuccess();
      glow.value = withSequence(
        withTiming(1, { duration: 220 }),
        withTiming(0.65, { duration: 600 }),
      );
      pop.value = withSequence(
        withTiming(1.12, { duration: 240, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 300 }),
      );
      timers.current.push(
        setTimeout(() => {
          if (!cancelled) onComplete();
        }, 1700),
      );
    });

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      if (tailRef.current) clearInterval(tailRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${prog.value * 100}%` }));

  return (
    <Backdrop>
      <SafeAreaView style={styles.safe}>
        <View style={styles.stage}>
          <Animated.View style={[styles.auraWrap, glowStyle]}>
            <Glow size={AURA} id="buildGlow" intensity={0.6} />
          </Animated.View>
          {burst && <Confetti />}
          <Animated.View style={popStyle}>
            <Mascot gender={gender} body={body} state={mstate} size={MASCOT} />
          </Animated.View>
        </View>

        {/* Calm header + personalized substep — reads genuine, not a hypey fake loader */}
        <View style={styles.copy}>
          <Text style={styles.title}>
            {done ? "Your plan is ready" : "Building your plan"}
          </Text>
          <View style={styles.subRow}>
            {!done && (
              <Animated.Text
                key={label}
                entering={FadeIn.duration(240)}
                exiting={FadeOut.duration(150)}
                style={styles.substep}
              >
                {label}
              </Animated.Text>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFillWrap, barStyle]}>
            <LinearGradient
              colors={[ob.primary, ob.primaryGlow]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </SafeAreaView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { alignItems: "center", justifyContent: "center", height: MASCOT + 40 },
  auraWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  copy: { alignItems: "center", marginTop: 30, paddingHorizontal: 28 },
  title: { fontSize: ob.h2, fontWeight: "800", color: ob.ink, letterSpacing: -0.3 },
  subRow: { height: 24, marginTop: 8, justifyContent: "center" },
  substep: { fontSize: ob.body, color: ob.textSoft, textAlign: "center", fontWeight: "500" },
  barTrack: {
    width: 230,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E3EAF5",
    overflow: "hidden",
    marginTop: 22,
  },
  barFillWrap: { height: "100%", borderRadius: 4, overflow: "hidden" },
});
