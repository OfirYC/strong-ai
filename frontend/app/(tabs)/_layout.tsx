// _layout.tsx
if (__DEV__) {
  console.log("Development mode - loading wdyr");
  require("../../wdyr");
} else {
  console.log("Production mode - not loading wdyr");
}

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import ActiveWorkoutSheet from "../../components/ActiveWorkoutSheet";
import AIChatModal from "../../components/AIChatModal";
import WorkoutCompleteModal from "../../components/WorkoutCompleteModal";
import { useAuthStore } from "../../store/authStore";
import { useActiveWorkoutSheetUIStore } from "../../store/workoutCompleteUIStore";
import { useWorkoutStore } from "../../store/workoutStore";
import { useSubscriptionStore } from "../../store/subscriptionStore";
import { identifyUser } from "../../utils/purchases";
import { MOCK_PURCHASES } from "../../utils/devFlags";
import PaywallScreen from "../../onboarding/screens/PaywallScreen";
import { useOnboardingStore } from "../../onboarding/store";
import { track } from "../../analytics";
import api from "../../utils/api";

export default function TabLayout() {
  const { user } = useAuthStore();
  const {
    isPro,
    isLoading: subLoading,
    refresh: refreshSub,
  } = useSubscriptionStore();

  useEffect(() => {
    if (user?.id) {
      // Always resolve subscription state, even if RevenueCat login fails.
      // Otherwise subLoading stays true forever and the paywall silently
      // never renders (which would hand out free access). Fail toward showing
      // the paywall; server-side `require_pro` is the real entitlement gate.
      identifyUser(user.id).then(refreshSub).catch(refreshSub);
    }
  }, [user?.id]);

  // Rehydrate the saved onboarding answers (goal, sex, injuries…) so the paywall gate
  // and any personalization reflect THIS user even on a fresh app launch.
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const hasOnboarding = useOnboardingStore((s) => !!s.answers.goal);
  useEffect(() => {
    if (!user?.id || hasOnboarding) return;
    api
      .get("/onboarding/data")
      .then((r: any) => {
        if (r?.data?.onboarding) hydrateOnboarding(r.data.onboarding);
      })
      .catch(() => {});
  }, [user?.id, hasOnboarding]);

  const [showAIChat, setShowAIChat] = useState(false);

  const workoutCompleteVisible = useActiveWorkoutSheetUIStore(
    s => s.workoutCompleteVisible,
  );
  const workoutCompleteSummary = useActiveWorkoutSheetUIStore(
    s => s.workoutCompleteSummary,
  );
  const closeWorkoutComplete = useActiveWorkoutSheetUIStore(
    s => s.closeWorkoutComplete,
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
          onPress={() => {
            track("ai_chat_opened");
            setShowAIChat(true);
          }}
          activeOpacity={0.8}
        >
          <View style={styles.aiButtonGradient}>
            <Ionicons name="sparkles" size={24} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      <AIChatModal visible={showAIChat} onClose={() => setShowAIChat(false)} />

      {/* Paywall gate — the SAME premium paywall as onboarding, as a hard gate (no "Not now").
          Full-screen overlay above the tab bar (zIndex beats the navbar's 9999).
          Bypassed only while MOCK_PURCHASES is on (dev UI iteration). Always active in release. */}
      {!MOCK_PURCHASES && user && !subLoading && !isPro && !user.is_pro && (
        <View style={styles.gate}>
          <PaywallScreen onSubscribed={refreshSub} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gate: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: "#F4F8FF",
  },
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
