import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWorkoutStore } from '../../store/workoutStore';
import { useAuthStore } from '../../store/authStore';
import ActiveWorkoutSheet from '../../components/ActiveWorkoutSheet';
import AIChatModal from '../../components/AIChatModal';

export default function TabLayout() {
  const { activeWorkout } = useWorkoutStore();
  const { user } = useAuthStore();
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#D1D1D6',
            paddingTop: 8,
            paddingBottom: 8,
            height: 60,
          },
        }}
      >
        <Tabs.Screen
          name="workout"
          options={{
            title: 'Workout',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="barbell" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="routines"
          options={{
            title: 'Routines',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="exercises"
          options={{
            title: 'Exercises',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="fitness" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      
      {activeWorkout && (
        <ActiveWorkoutSheet 
          onFinishWorkout={() => {}}
        />
      )}

      {/* Floating AI Chat Button */}
      {user && (
        <TouchableOpacity
          style={styles.aiButton}
          onPress={() => setShowAIChat(true)}
          activeOpacity={0.8}
        >
          <View style={styles.aiButtonGradient}>
            <Ionicons name="sparkles" size={24} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      {/* AI Chat Modal */}
      <AIChatModal
        visible={showAIChat}
        onClose={() => setShowAIChat(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
