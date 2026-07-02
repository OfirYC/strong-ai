import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Mascot from "../components/Mascot";
import Glow from "../components/Glow";
import PrimaryButton from "../components/PrimaryButton";
import { MascotState } from "../../assets/mascot";
import { hapticLight } from "../haptics";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const MASCOT = Math.min(width * 0.82, 340);

type Props = {
  onStart?: () => void;
  onLogin?: () => void;
};

export default function HeroScreen({ onStart, onLogin }: Props) {
  // Wave hello on entrance, then settle into a breathing idle.
  const [state, setState] = useState<MascotState>("wave");
  useEffect(() => {
    const t = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(t);
  }, []);

  // Slow-pulsing aura behind the mascot for atmosphere.
  const aura = useSharedValue(0);
  useEffect(() => {
    aura.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);
  const auraStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + aura.value * 0.16 }],
    opacity: 0.5 + aura.value * 0.3,
  }));
  const aura2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1.05 + aura.value * 0.1 }],
    opacity: 0.35 - aura.value * 0.18,
  }));

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[ob.bgTop, ob.bgMid, ob.bgBottom]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Brand wordmark */}
        <Animated.Text entering={FadeIn.duration(500)} style={styles.brand}>
          Strong<Text style={{ color: ob.primary }}>AI</Text>
        </Animated.Text>

        {/* Mascot + aura */}
        <View style={styles.stage}>
          <Animated.View style={[styles.auraWrap, aura2Style]}>
            <Glow size={AURA} id="heroGlow2" color={ob.primary} intensity={0.28} />
          </Animated.View>
          <Animated.View style={[styles.auraWrap, auraStyle]}>
            <Glow size={AURA} id="heroGlow1" color={ob.primaryGlow} intensity={0.5} />
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(620).easing(Easing.out(Easing.cubic))}>
            <Mascot gender="m" body="lean" state={state} size={MASCOT} />
          </Animated.View>
        </View>

        {/* Copy */}
        <View style={styles.copy}>
          <Animated.Text
            entering={FadeInDown.delay(220).duration(540).easing(Easing.out(Easing.cubic))}
            style={styles.h1}
          >
            Your AI strength coach.
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(340).duration(560)}
            style={styles.sub}
          >
            A plan built around your body, your goals, your gym — adjusting every
            week.
          </Animated.Text>
        </View>

        {/* CTA */}
        <Animated.View
          entering={FadeInDown.delay(480).duration(540).easing(Easing.out(Easing.cubic))}
          style={styles.cta}
        >
          <PrimaryButton label="Build my plan" onPress={() => onStart?.()} />
          <Pressable
            onPress={() => {
              hapticLight();
              onLogin?.();
            }}
            hitSlop={12}
            style={styles.loginWrap}
          >
            <Text style={styles.login}>
              I already have an account
            </Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const AURA = MASCOT * 1.7;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ob.bgBottom },
  safe: { flex: 1, paddingHorizontal: ob.gutter },
  brand: {
    fontSize: 20,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: 0.3,
    marginTop: 8,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  auraWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { marginBottom: 18 },
  h1: {
    fontSize: ob.display,
    lineHeight: ob.display * 1.06,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: ob.body,
    lineHeight: ob.body * 1.45,
    color: ob.textSoft,
    marginTop: 12,
    paddingRight: 12,
  },
  cta: { paddingBottom: 8, gap: 4 },
  loginWrap: { alignItems: "center", paddingVertical: 14 },
  login: { fontSize: 15, color: ob.textSoft, fontWeight: "600" },
});
