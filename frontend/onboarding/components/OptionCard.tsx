import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { hapticSelect } from "../haptics";
import { ob } from "../theme";

const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 170, easing: Easing.out(Easing.cubic) };

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean; // show a check toggle instead of arrow
};

/** Tap-only answer card. Spring press, selection haptic, animated selected state. */
export default function OptionCard({
  label,
  emoji,
  selected,
  onPress,
  multi,
}: Props) {
  const scale = useSharedValue(1);
  const sel = useSharedValue(selected ? 1 : 0);
  sel.value = withTiming(selected ? 1 : 0, { duration: 160 });

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: selected ? ob.primary : ob.hairline,
    backgroundColor: selected ? ob.primaryTint : ob.surface,
  }));

  return (
    <APressable
      style={[styles.card, aStyle]}
      onPressIn={() => (scale.value = withTiming(0.975, PRESS_IN))}
      onPressOut={() => (scale.value = withTiming(1, PRESS_OUT))}
      onPress={() => {
        hapticSelect();
        onPress();
      }}
    >
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={[styles.label, selected && styles.labelSel]}>{label}</Text>
      <View style={styles.right}>
        {multi ? (
          <View style={[styles.box, selected && styles.boxSel]}>
            {selected && <Ionicons name="checkmark" size={15} color="#fff" />}
          </View>
        ) : selected ? (
          <Ionicons name="checkmark-circle" size={22} color={ob.primary} />
        ) : (
          <View style={styles.dot} />
        )}
      </View>
    </APressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: "#0B1524",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emoji: { fontSize: 24 },
  label: { flex: 1, fontSize: 17, fontWeight: "600", color: ob.text },
  labelSel: { color: ob.primaryDeep },
  right: { width: 24, alignItems: "center" },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ob.hairline,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: ob.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  boxSel: { backgroundColor: ob.primary, borderColor: ob.primary },
});
