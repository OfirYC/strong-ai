import React, { useRef } from "react";
import { View, StyleSheet, Text, ViewStyle, Dimensions } from "react-native";
import Swipeable, {
  SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedStyle,
  SharedValue,
  useAnimatedReaction,
  runOnJS,
  withSpring,
  interpolate,
  Extrapolation,
  interpolateColor,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DELETE_THRESHOLD = -SCREEN_WIDTH * 0.45;

export default function SwipeToDeleteRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const renderRightActions = (
    _progress: SharedValue<number>,
    translation: SharedValue<number>,
  ) => {
    useAnimatedReaction(
      () => translation.value,
      (current, previous) => {
        if (!previous) return;
        if (current <= DELETE_THRESHOLD && previous > DELETE_THRESHOLD) {
          runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Heavy);
        }
      },
    );

    const animatedBackgroundStyle = useAnimatedStyle((): ViewStyle => {
      const isPast = translation.value <= DELETE_THRESHOLD;
      const bgColor = interpolateColor(
        translation.value,
        [DELETE_THRESHOLD, DELETE_THRESHOLD + 60], // transition window
        ["#D32F2F", "#FF3B30"],
      );
      return {
        backgroundColor: bgColor,
        // FIX: Start with full width so it can never "split" or show a gap
        width: SCREEN_WIDTH,
        // FIX: This ensures the right edge of the red box stays pinned to the screen's right edge
        // while the left edge follows the row.
        transform: [{ translateX: SCREEN_WIDTH + translation.value }],
        flexDirection: "row",
        justifyContent: "flex-start", // Content stays on the left of this red block (near the row)
        alignItems: "center",
      } as ViewStyle;
    });

    const animatedContentStyle = useAnimatedStyle((): ViewStyle => {
      const isPast = translation.value <= DELETE_THRESHOLD;
      const distance = Math.abs(translation.value);

      return {
        opacity: interpolate(distance, [20, 60], [0, 1], Extrapolation.CLAMP),
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 20, // Distance from the row edge
      } as ViewStyle;
    });

    return (
      <Animated.View style={animatedBackgroundStyle}>
        <Animated.View style={animatedContentStyle}>
          <Ionicons name="trash" size={22} color="white" />
          <Text style={styles.deleteText}>Delete</Text>
        </Animated.View>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      onSwipeableOpen={() => {
        swipeableRef.current?.reset();
        onDelete();
      }}
      rightThreshold={Math.abs(DELETE_THRESHOLD)}
      // 0.4 = High sensitivity. Row moves ~2.5x faster than your finger.
      friction={0.8}
      overshootRight={false}
    >
      <View style={styles.content}>{children}</View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteText: {
    color: "white",
    fontWeight: "700",
    fontSize: 17,
  },
  content: {
    backgroundColor: "#FFFFFF",
  },
});
