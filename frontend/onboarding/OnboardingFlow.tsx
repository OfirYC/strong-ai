import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { SlideInRight, SlideOutLeft } from "react-native-reanimated";
import HeroScreen from "./screens/HeroScreen";
import IntroScreen from "./screens/IntroScreen";
import QuizFlow from "./screens/QuizFlow";
import BuildMomentScreen from "./screens/BuildMomentScreen";
import PlanRevealScreen from "./screens/PlanRevealScreen";
import ProjectionScreen from "./screens/ProjectionScreen";
import PaywallScreen from "./screens/PaywallScreen";
import WinbackScreen from "./screens/WinbackScreen";
import ActivationScreen from "./screens/ActivationScreen";
import WelcomeScreen from "./screens/WelcomeScreen";
import Backdrop from "./components/Backdrop";
import Mascot from "./components/Mascot";
import PrimaryButton from "./components/PrimaryButton";
import { genderFromSex, useOnboardingStore } from "./store";
import { track } from "../analytics";
import { ob } from "./theme";

/**
 * Onboarding step machine. Holds the current step + (later) the answer state,
 * and slides between screens. Screens 3-8 get added here as they're built.
 */
export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));
  const go = (s: number) => setStep(s);

  useEffect(() => {
    track("onboarding_started");
  }, []);

  let screen: React.ReactNode;
  if (step === 0) {
    screen = (
      <HeroScreen
        onStart={next}
        onLogin={() => router.replace("/(auth)/login" as any)}
      />
    );
  } else if (step === 1) {
    screen = <IntroScreen onNext={next} onSkip={next} />;
  } else if (step === 2) {
    screen = <QuizFlow onComplete={next} onExit={back} />;
  } else if (step === 3) {
    screen = <BuildMomentScreen onComplete={next} />;
  } else if (step === 4) {
    screen = <PlanRevealScreen onUnlock={next} />;
  } else if (step === 5) {
    screen = <ProjectionScreen onContinue={next} />;
  } else if (step === 6) {
    // Subscribe → straight to activation (8). Decline → win-back offer (7).
    screen = (
      <PaywallScreen
        onSubscribed={() => go(8)}
        onMaybeLater={() => {
          track("paywall_dismissed");
          go(7);
        }}
      />
    );
  } else if (step === 7) {
    // Win-back: last-chance offer. Claim or pass both proceed to activation.
    screen = <WinbackScreen onClaimed={() => go(8)} onDecline={() => go(8)} />;
  } else if (step === 8) {
    // Account creation (device user → real account); advances to the welcome screen on success.
    screen = <ActivationScreen onActivated={() => go(9)} />;
  } else if (step === 9) {
    // Congrats / "you're all set" → enters the app.
    screen = <WelcomeScreen />;
  } else {
    screen = <BuildPlaceholder onBack={back} />;
  }

  return (
    <View style={styles.root}>
      <Animated.View
        key={step}
        entering={step === 0 ? undefined : SlideInRight.duration(340)}
        exiting={SlideOutLeft.duration(280)}
        style={StyleSheet.absoluteFill}
      >
        {screen}
      </Animated.View>
    </View>
  );
}

function BuildPlaceholder({ onBack }: { onBack: () => void }) {
  const { answers } = useOnboardingStore();
  const gender = genderFromSex(answers.sex);
  const summary = [
    answers.goal && `Goal: ${answers.goal}`,
    answers.trainingAge && `Experience: ${answers.trainingAge}`,
    answers.daysPerWeek && `${answers.daysPerWeek} days/week`,
    answers.equipment && `Equipment: ${answers.equipment}`,
    answers.limitations.length
      ? `Avoiding: ${answers.limitations.join(", ")}`
      : "No limitations",
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Backdrop>
      <SafeAreaView style={styles.ph}>
        <Mascot gender={gender} body="lean" state="cheer" size={200} />
        <Text style={styles.phTitle}>Paywall next</Text>
        <Text style={styles.phBody}>
          Screen 6 — the 7-day trial paywall (annual default). Building it next.
        </Text>
        <Text style={styles.phSummary}>{summary}</Text>
        <View style={styles.phCta}>
          <PrimaryButton label="Back" onPress={onBack} />
        </View>
      </SafeAreaView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ob.bgBottom },
  ph: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ob.gutter,
  },
  phTitle: {
    fontSize: ob.h1,
    fontWeight: "800",
    color: ob.ink,
    marginTop: 8,
  },
  phBody: {
    fontSize: ob.body,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 10,
  },
  phSummary: {
    fontSize: ob.small,
    color: ob.primaryDeep,
    textAlign: "center",
    marginTop: 18,
    paddingHorizontal: 8,
    lineHeight: ob.small * 1.5,
  },
  phCta: { alignSelf: "stretch", marginTop: 32 },
});
