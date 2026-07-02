import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from "react-native-reanimated";
import Mascot from "../components/Mascot";
import OptionCard from "../components/OptionCard";
import ProgressBar from "../components/ProgressBar";
import PrimaryButton from "../components/PrimaryButton";
import RulerPicker from "../components/RulerPicker";
import { MascotState } from "../../assets/mascot";
import {
  afterBody,
  bmiOf,
  genderFromSex,
  Goal,
  inferStartBody,
  useOnboardingStore,
} from "../store";
import { QUESTIONS, mergedSubGoals } from "../quizConfig";
import ProofInterstitial from "./ProofInterstitial";
import { hapticLight } from "../haptics";
import { ob } from "../theme";

const TOTAL = QUESTIONS.length;
const { width } = Dimensions.get("window");
// Solid quiz background so the mascot's lower body can fade into an exact match.
const BG = ob.bgMid; // #F4F8FF
const BG_CLEAR = "rgba(244,248,255,0)";

export default function QuizFlow({
  onComplete,
  onExit,
}: {
  onComplete: () => void;
  onExit: () => void;
}) {
  const { answers, set } = useOnboardingStore();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [react, setReact] = useState<MascotState | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>(answers.limitations);
  const [customInj, setCustomInj] = useState<string>(answers.customLimitation ?? "");
  const [h, setH] = useState<number>(answers.heightCm ?? 175);
  const [wt, setWt] = useState<number>(answers.weightKg ?? 75);
  // Social-proof interstitials shown after goal (transformation) + after injuries (problem-solved).
  const [proof, setProof] = useState<null | "transformation" | "problem">(null);

  const q = QUESTIONS[qIndex];
  const gender = genderFromSex(answers.sex);
  const mascotState = react ?? q.mascotState;
  const progress = (qIndex + 1) / TOTAL;

  // Once we have sex + BMI + experience, the coach BECOMES the inferred body.
  const bmi = bmiOf(answers.heightCm, answers.weightKg);
  const inferred = !!(
    answers.sex &&
    bmi != null &&
    answers.currentActivity &&
    answers.trainingAge
  );
  const mascotBody = inferred
    ? inferStartBody(gender, bmi, answers.trainingAge, answers.currentActivity)
    : "lean";
  const mascotCrop = inferred ? "knees" : "bust";
  // Keep the mascot compact so the question + options sit high and ~5 options are visible.
  // (metrics needs room for the two pickers, so it's smallest.)
  const isMetrics = q.id === "metrics";
  // One consistent size for every pre-inference page (sex / metrics / activity / experience);
  // it only grows once the body is inferred.
  const mascotSize = inferred ? Math.min(width * 0.5, 196) : Math.min(width * 0.44, 168);

  // Sub-goal screen merges options across all chosen goals, gender-aware.
  const subCfg = q.id === "subGoals" ? mergedSubGoals(answers.goals, answers.sex) : null;
  const displayPrompt = subCfg ? subCfg.prompt : q.prompt;
  const displayOptions = subCfg ? subCfg.options : q.options;

  useEffect(() => {
    setReact(null);
    if (QUESTIONS[qIndex].kind === "multi") {
      const a = useOnboardingStore.getState().answers;
      const id = QUESTIONS[qIndex].id;
      setMultiSel(id === "subGoals" ? a.subGoals : id === "goal" ? a.goals : a.limitations);
    }
  }, [qIndex]);
  useEffect(() => setMounted(true), []);

  // The sub-goal screen is skipped when no specific goal is chosen (only "general").
  const skipSubGoals = (idx: number) =>
    QUESTIONS[idx]?.id === "subGoals" &&
    !useOnboardingStore.getState().answers.goals.some((g) => g !== "general");

  const goNext = () => {
    let next = qIndex + 1;
    if (skipSubGoals(next)) next += 1;
    if (next >= TOTAL) onComplete();
    else {
      setDir(1);
      setQIndex(next);
    }
  };
  const goBack = () => {
    let prev = qIndex - 1;
    if (skipSubGoals(prev)) prev -= 1;
    if (prev < 0) onExit();
    else {
      setDir(-1);
      setQIndex(prev);
    }
  };

  const onSingle = (value: string) => {
    if (q.id === "daysPerWeek") set("daysPerWeek", parseInt(value, 10));
    else set(q.id as any, value as any);
    // Cropped phases must avoid arms-overhead poses (they'd clip). "proud" stays in frame.
    if (q.id === "sex" || q.id === "currentActivity") setReact("proud");
    else setReact(q.mascotState);
    setTimeout(goNext, 300);
  };

  const confirmMetrics = () => {
    set("heightCm", h);
    set("weightKg", wt);
    goNext();
  };

  const toggleMulti = (value: string) => {
    setMultiSel((cur) => {
      if (q.id === "goal") {
        // "general" (just stay fit) is exclusive — it means no specific goal.
        if (value === "general") return ["general"];
        const without = cur.filter((v) => v !== "general");
        return without.includes(value)
          ? without.filter((v) => v !== value)
          : [...without, value];
      }
      if (q.id === "subGoals") {
        if (cur.includes(value)) return cur.filter((v) => v !== value);
        if (cur.length >= 3) return cur; // pick up to 3
        return [...cur, value];
      }
      if (value === "none") return ["none"];
      const without = cur.filter((v) => v !== "none");
      return without.includes(value)
        ? without.filter((v) => v !== value)
        : [...without, value];
    });
  };
  const confirmMulti = () => {
    if (q.id === "goal") {
      if (!multiSel.length) return; // goal is required
      const gs = multiSel as Goal[];
      set("goals", gs);
      set("goal", gs[0]); // primary drives the mascot/projection/templates
      // A specific goal → pick priorities next; only "general" → straight to the proof.
      if (gs.some((g) => g !== "general")) goNext();
      else setProof("transformation");
      return;
    }
    if (q.id === "subGoals") {
      set("subGoals", multiSel);
      // Sub-goals chosen → goal+sub-goal-matched transformation testimonial.
      setProof("transformation");
      return;
    }
    const injuries = multiSel.filter((v) => v !== "none");
    set("limitations", injuries);
    set("customLimitation", injuries.includes("other") ? customInj.trim() : "");
    // If they flagged an injury, reassure with a problem-solved testimonial before finishing.
    if (injuries.length) setProof("problem");
    else goNext();
  };

  const onProofContinue = () => {
    setProof(null);
    goNext();
  };

  const isSelected = (value: string) => {
    if (q.kind === "multi") return multiSel.includes(value);
    if (q.id === "daysPerWeek") return answers.daysPerWeek === parseInt(value, 10);
    return (answers as any)[q.id] === value;
  };

  if (proof) {
    return <ProofInterstitial kind={proof} onContinue={onProofContinue} />;
  }

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.safe,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 4 },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            hitSlop={12}
            onPress={() => {
              hapticLight();
              goBack();
            }}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={26} color={ob.text} />
          </Pressable>
          <ProgressBar progress={progress} />
          <View style={styles.back} />
        </View>

        {/* Mascot zone — un-clipped character, lower body faded into the BG */}
        <View style={[styles.mascotZone, { height: mascotSize }]}>
          <Mascot
            gender={gender}
            body={mascotBody}
            state={mascotState}
            size={mascotSize}
            crop={mascotCrop}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[BG_CLEAR, BG]}
            locations={[0, 0.9]}
            style={[styles.zoneFade, { height: mascotSize * 0.36 }]}
          />
        </View>

        {/* Sliding question area */}
        <View style={styles.qArea}>
          <Animated.View
            key={qIndex}
            entering={
              !mounted
                ? undefined
                : dir > 0
                  ? SlideInRight.duration(300)
                  : SlideInLeft.duration(300)
            }
            exiting={dir > 0 ? SlideOutLeft.duration(240) : SlideOutRight.duration(240)}
            style={StyleSheet.absoluteFill}
          >
            <Text style={styles.prompt}>{displayPrompt}</Text>
            {q.sub ? <Text style={styles.sub}>{q.sub}</Text> : null}

            {q.kind === "metrics" ? (
              <View style={styles.metrics}>
                <RulerPicker min={140} max={210} value={h} unit="cm" onChange={setH} />
                <View style={{ height: 20 }} />
                <RulerPicker min={40} max={160} value={wt} unit="kg" onChange={setWt} />
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                {displayOptions.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    emoji={o.emoji}
                    selected={isSelected(o.value)}
                    multi={q.kind === "multi"}
                    onPress={() =>
                      q.kind === "multi" ? toggleMulti(o.value) : onSingle(o.value)
                    }
                  />
                ))}
              </ScrollView>
            )}

            {q.id === "limitations" && multiSel.includes("other") ? (
              <View style={styles.customWrap}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Tell me what to work around…"
                  placeholderTextColor={ob.textFaint}
                  value={customInj}
                  onChangeText={setCustomInj}
                  multiline
                />
              </View>
            ) : null}

            {q.kind === "multi" || q.kind === "metrics" ? (
              <View style={styles.cta}>
                <PrimaryButton
                  label={
                    q.kind === "metrics" || q.id === "goal"
                      ? "Continue"
                      : multiSel.length
                        ? "Continue"
                        : "Skip"
                  }
                  onPress={q.kind === "metrics" ? confirmMetrics : confirmMulti}
                />
              </View>
            ) : null}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: ob.gutter,
    paddingTop: 6,
    paddingBottom: 4,
  },
  back: { width: 30, alignItems: "center" },
  mascotZone: { width: "100%", alignItems: "center", justifyContent: "flex-start" },
  zoneFade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  qArea: { flex: 1, marginTop: 2 },
  prompt: {
    fontSize: ob.h1,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.4,
    paddingHorizontal: ob.gutter,
  },
  sub: {
    fontSize: ob.body,
    color: ob.textSoft,
    marginTop: 8,
    paddingHorizontal: ob.gutter,
  },
  metrics: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 22,
    paddingHorizontal: ob.gutter,
    paddingBottom: 20,
  },
  list: { flex: 1, marginTop: 16 },
  listContent: { paddingHorizontal: ob.gutter, paddingBottom: 16, gap: 12 },
  customWrap: { paddingHorizontal: ob.gutter, paddingBottom: 8 },
  customInput: {
    minHeight: 48,
    borderRadius: ob.rMd,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: ob.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: ob.ink,
  },
  cta: { paddingHorizontal: ob.gutter, paddingBottom: 8, paddingTop: 4 },
});
