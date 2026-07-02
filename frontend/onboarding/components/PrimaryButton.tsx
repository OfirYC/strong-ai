import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { hapticMedium } from "../haptics";
import { ob } from "../theme";

const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 170, easing: Easing.out(Easing.cubic) };

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Primary CTA: solid app-blue, spring press-scale, medium haptic. Flat + clean to match the app. */
export default function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: Props) {
  const scale = useSharedValue(1);
  const press = useSharedValue(0);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.4 : 1,
  }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: press.value * 0.14 }));

  return (
    <APressable
      style={[styles.wrap, aStyle, style]}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withTiming(0.97, PRESS_IN);
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, PRESS_OUT);
        press.value = withTiming(0, { duration: 160 });
      }}
      onPress={() => {
        if (disabled) return;
        hapticMedium();
        onPress();
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <Animated.View style={[styles.shade, shadeStyle]} pointerEvents="none" />
    </APressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    borderRadius: 14,
    backgroundColor: ob.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: ob.primary,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  label: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
});
