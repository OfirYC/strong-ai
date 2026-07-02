import React, { useEffect, useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  MascotBody,
  MascotGender,
  MascotState,
  mascotSource,
} from "../../assets/mascot";
import { timing } from "../theme";

type Props = {
  gender: MascotGender;
  body: MascotBody;
  state: MascotState;
  size?: number;
  /** subtle idle breathing loop */
  breathing?: boolean;
  /**
   * "full"  = whole body
   * "bust"  = shoulders-and-up in a soft disc (use BEFORE body type is inferred)
   * "knees" = knees-and-up portrait (use AFTER inference so the body reads large)
   */
  crop?: "full" | "bust" | "knees";
  style?: ViewStyle;
};

// scale = zoom factor; topF = vertical offset as a fraction of `size` (more negative = pans down).
// No circles/discs — bottom is faded into the BG by the screen, not clipped by a shape.
const CROP_CFG = {
  full: { scale: 1, topF: 0, clip: false },
  bust: { scale: 2.5, topF: -0.12, clip: true }, // shoulders-and-up (eased so shoulders don't clip)
  knees: { scale: 1.6, topF: -0.1, clip: true }, // upper-knees-and-up
} as const;

/**
 * The mascot. Two stacked image layers crossfade whenever gender/body/state changes,
 * so transitions glide instead of popping. An outer transform runs a gentle breathing loop.
 */
export default function Mascot({
  gender,
  body,
  state,
  size = 240,
  breathing = true,
  crop = "full",
  style,
}: Props) {
  const source = mascotSource(gender, body, state);
  const [layers, setLayers] = useState({ prev: source, curr: source });
  const fade = useSharedValue(1);
  const breath = useSharedValue(0);

  // Crossfade on any source change
  useEffect(() => {
    setLayers((l) => (l.curr === source ? l : { prev: l.curr, curr: source }));
    fade.value = 0;
    fade.value = withTiming(1, timing.base);
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  // Breathing loop
  useEffect(() => {
    if (breathing) {
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(breath);
      breath.value = withTiming(0, timing.base);
    }
    return () => cancelAnimation(breath);
  }, [breathing]); // eslint-disable-line react-hooks/exhaustive-deps

  const breathStyle = useAnimatedStyle(() => {
    const s = 1 + breath.value * 0.022;
    const ty = breath.value * -6;
    return { transform: [{ translateY: ty }, { scale: s }] };
  });
  const currStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const prevStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

  const cfg = CROP_CFG[crop];
  const clipStyle: ViewStyle = cfg.clip
    ? { width: size, height: size, overflow: "hidden" }
    : { width: "100%", height: "100%" };
  const layerStyle: any =
    crop === "full"
      ? styles.layer
      : {
          position: "absolute",
          width: size * cfg.scale,
          height: size * cfg.scale,
          top: size * cfg.topF,
          left: -(size * (cfg.scale - 1)) / 2,
        };

  return (
    <Animated.View
      style={[{ width: size, height: size }, breathStyle, style]}
      pointerEvents="none"
    >
      <View style={clipStyle}>
        {layers.prev !== layers.curr && (
          <Animated.Image
            source={layers.prev}
            resizeMode="contain"
            style={[layerStyle, prevStyle]}
          />
        )}
        <Animated.Image
          source={layers.curr}
          resizeMode="contain"
          style={[layerStyle, currStyle]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", width: "100%", height: "100%" },
});
