import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const [checkingProfile, setCheckingProfile] = useState(false);

  useEffect(() => {
    checkProfileAndRedirect();
  }, [user, isLoading]);

  const checkProfileAndRedirect = async () => {
    if (!isLoading) {
      if (user) {
        // Check if profile is complete
        setCheckingProfile(true);
        try {
          const response = await api.get('/profile/context');
          const userContext = response.data;
          
          if (!userContext.is_profile_complete) {
            router.replace('/onboarding');
          } else {
            router.replace('/(tabs)/workout');
          }
        } catch (error) {
          console.error('Failed to check profile:', error);
          // On error, just go to main app
          router.replace('/(tabs)/workout');
        } finally {
          setCheckingProfile(false);
        }
      } else {
        router.replace('/(auth)/login');
      }
    }
  };

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
