import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ob, timing } from "../theme";

/** Slim progress bar that eases smoothly to its new fill whenever `progress` (0..1) changes. */
export default function ProgressBar({ progress }: { progress: number }) {
  const p = useSharedValue(progress);
  useEffect(() => {
    p.value = withTiming(progress, timing.base);
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const fill = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, p.value)) * 100}%`,
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#DCE6F5",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: ob.primary,
  },
});
