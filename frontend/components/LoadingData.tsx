import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { View } from "react-native";

export function LoadingData({loadingTitle}: { loadingTitle: `Loading ${string}` }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" />
      <Text style={styles.loadingText}>{loadingTitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#636366",
  },
});
