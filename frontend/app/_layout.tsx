import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../store/authStore';

export default function RootLayout() {
  const loadUser = useAuthStore((state) => state.loadUser);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Top safe area - matches app background */}
      <View style={[styles.topSafeArea, { height: insets.top }]} />
      
      {/* Main content */}
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </View>
      
      {/* Bottom safe area - matches tab bar (white) */}
      <View style={[styles.bottomSafeArea, { height: insets.bottom }]} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSafeArea: {
    backgroundColor: '#F5F5F7',
  },
  content: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  bottomSafeArea: {
    backgroundColor: '#FFFFFF',
  },
});
