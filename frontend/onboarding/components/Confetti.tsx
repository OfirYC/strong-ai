import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { ob } from "../theme";

const COLORS = [ob.primary, ob.primaryGlow, "#34C759", "#FFD60A", "#FF375F"];

type P = {
  angle: number;
  dist: number;
  color: string;
  size: number;
  rot: number;
  delay: number;
};

/** One-shot confetti burst from center. Mounts → fires once. */
export default function Confetti({ count = 20 }: { count?: number }) {
  const particles = useMemo<P[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5,
        dist: 130 + Math.random() * 170,
        color: COLORS[i % COLORS.length],
        size: 7 + Math.random() * 8,
        rot: Math.random() * 360,
        delay: Math.random() * 80,
      })),
    [count],
  );

  return (
    <View style={styles.root} pointerEvents="none">
      {particles.map((p, i) => (
        <Particle key={i} p={p} />
      ))}
    </View>
  );
}

function Particle({ p }: { p: P }) {
  const t = useSharedValue(0);
  t.value = withDelay(p.delay, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));

  const style = useAnimatedStyle(() => {
    const x = Math.cos(p.angle) * p.dist * t.value;
    const y =
      Math.sin(p.angle) * p.dist * t.value + 260 * t.value * t.value; // gravity
    const opacity = t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3;
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${p.rot + t.value * 320}deg` },
        { scale: 0.6 + t.value * 0.6 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        { width: p.size, height: p.size * 0.6, backgroundColor: p.color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  piece: { position: "absolute", borderRadius: 2 },
});
