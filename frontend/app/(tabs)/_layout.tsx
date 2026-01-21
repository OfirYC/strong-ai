// _layout.tsx
if (__DEV__) {
  console.log("Development mode - loading wdyr");
  require("../../wdyr");
} else {
  console.log("Production mode - not loading wdyr");
}

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import ActiveWorkoutSheet from "../../components/ActiveWorkoutSheet";
import AIChatModal from "../../components/AIChatModal";
import WorkoutCompleteModal from "../../components/WorkoutCompleteModal";
import { useAuthStore } from "../../store/authStore";
import { useActiveWorkoutSheetUIStore } from "../../store/workoutCompleteUIStore";
import { useWorkoutStore } from "../../store/workoutStore";

export default function TabLayout() {
  const { user } = useAuthStore();

  const [showAIChat, setShowAIChat] = useState(false);

  const workoutCompleteVisible = useActiveWorkoutSheetUIStore(
    s => s.workoutCompleteVisible
  );
  const workoutCompleteSummary = useActiveWorkoutSheetUIStore(
    s => s.workoutCompleteSummary
  );
  const closeWorkoutComplete = useActiveWorkoutSheetUIStore(
    s => s.closeWorkoutComplete
  );

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#007AFF",
          tabBarInactiveTintColor: "#8E8E93",
          tabBarStyle: {
            zIndex: 9999,
            backgroundColor: "#FFFFFF",
            borderTopColor: "#D1D1D6",
            paddingTop: 8,
            paddingBottom: 8,
            height: 60,
          },
        }}
      >
        {/* screens unchanged */}
        <Tabs.Screen
          name="workout"
          options={{
            title: "Workout",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="barbell" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="routines"
          options={{
            title: "Routines",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="exercises"
          options={{
            title: "Exercises",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="fitness" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <ActiveWorkoutSheet onFinishWorkout={() => {}} />

      {/* Completion modal lives OUTSIDE the activeWorkout conditional */}
      <WorkoutCompleteModal
        visible={workoutCompleteVisible}
        summaryData={workoutCompleteSummary}
        onClose={() => {
          closeWorkoutComplete();
          // optional: navigate or do other post-finish behavior here
        }}
      />

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

      <AIChatModal visible={showAIChat} onClose={() => setShowAIChat(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  aiButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  aiButtonGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
