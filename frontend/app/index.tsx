import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      // Signed-in users go straight to the app. The Pro gate in (tabs) handles entitlement.
      router.replace('/(tabs)/workout');
    } else {
      // New / signed-out users start in the value-first onboarding funnel (the funnel handles
      // its own device-auth + activation, and offers "Log in" on the hero for returning users).
      router.replace('/onboarding');
    }
  }, [user, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
