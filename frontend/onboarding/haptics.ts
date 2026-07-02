// Thin, safe wrappers around expo-haptics. Every meaningful touch in the funnel fires one of these.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const ok = Platform.OS === "ios" || Platform.OS === "android";

export const hapticSelect = () => {
  if (ok) Haptics.selectionAsync().catch(() => {});
};
export const hapticLight = () => {
  if (ok) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
export const hapticMedium = () => {
  if (ok) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
export const hapticSuccess = () => {
  if (ok)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
};
