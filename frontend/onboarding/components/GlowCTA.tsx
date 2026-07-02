import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { hapticMedium } from "../haptics";
import { ob } from "../theme";

const APressable = Animated.createAnimatedComponent(Pressable);
const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 170, easing: Easing.out(Easing.cubic) };

/** High-intent CTA: gradient fill, a continuously breathing glow halo, and an arrow nudge. */
export default function GlowCTA({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1150, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.05 }],
  }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
      <APressable
        style={[styles.btn, btnStyle]}
        onPressIn={() => (scale.value = withTiming(0.97, PRESS_IN))}
        onPressOut={() => (scale.value = withTiming(1, PRESS_OUT))}
        onPress={() => {
          if (loading) return;
          hapticMedium();
          onPress();
        }}
      >
        <LinearGradient
          colors={["#3AA0FF", ob.primary, "#0A5BD6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.label}>{label}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.arrow} />
          </>
        )}
      </APressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: ob.primary,
    shadowColor: ob.primary,
    shadowOpacity: 0.9,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  btn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 58,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: ob.primary,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  label: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 0.2 },
  arrow: { marginLeft: 8 },
});
