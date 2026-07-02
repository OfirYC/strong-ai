import React, { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn, Easing } from "react-native-reanimated";
import Backdrop from "../components/Backdrop";
import Mascot from "../components/Mascot";
import Confetti from "../components/Confetti";
import GlowCTA from "../components/GlowCTA";
import { afterBody, genderFromSex, useOnboardingStore } from "../store";
import { track } from "../../analytics";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const MASCOT = Math.min(width * 0.6, 230);
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WelcomeScreen() {
  const router = useRouter();
  const { answers, plan } = useOnboardingStore();
  const gender = genderFromSex(answers.sex);
  const goalBody = afterBody(gender, answers.goal);

  const days = (plan?.days ?? [])
    .map((d) => d.weekday)
    .filter((w): w is number => typeof w === "number")
    .sort((a, b) => a - b)
    .map((w) => DOW[w % 7]);
  const schedule = days.length ? Array.from(new Set(days)).join(" · ") : null;

  useEffect(() => {
    track("onboarding_completed", { goal: answers.goal });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Backdrop>
      <SafeAreaView style={styles.safe}>
        <Confetti />
        <View style={styles.center}>
          <Animated.View entering={FadeIn.duration(420)}>
            <Mascot gender={gender} body={goalBody} state="cheer" size={MASCOT} />
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(120).duration(460).easing(Easing.out(Easing.cubic))}
            style={styles.kicker}
          >
            YOU'RE ALL SET 🎉
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(180).duration(460).easing(Easing.out(Easing.cubic))}
            style={styles.title}
          >
            {plan?.title ?? "Your plan is ready"}
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(240).duration(460).easing(Easing.out(Easing.cubic))}
            style={styles.sub}
          >
            Saved to your account and scheduled across your week. Time to get to work.
          </Animated.Text>

          {!!schedule && (
            <Animated.View
              entering={FadeInDown.delay(300).duration(460).easing(Easing.out(Easing.cubic))}
              style={styles.pill}
            >
              <Text style={styles.pillText}>Training days: {schedule}</Text>
            </Animated.View>
          )}
        </View>

        <View style={styles.footer}>
          <GlowCTA
            label="Start training"
            onPress={() => {
              track("start_training_tapped");
              router.replace("/(tabs)/workout" as any);
            }}
          />
        </View>
      </SafeAreaView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: ob.gutter },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 13, fontWeight: "800", letterSpacing: 1.4, color: ob.primary, marginTop: 10 },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
    lineHeight: 32,
  },
  sub: {
    fontSize: 15,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 21,
    paddingHorizontal: 12,
    fontWeight: "500",
  },
  pill: {
    marginTop: 18,
    backgroundColor: ob.primaryTint,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  pillText: { fontSize: 13.5, fontWeight: "700", color: ob.primaryDeep },
  footer: { paddingBottom: 8 },
});
