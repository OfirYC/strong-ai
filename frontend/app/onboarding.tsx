import React from "react";
import { Stack } from "expo-router";
import OnboardingFlow from "../onboarding/OnboardingFlow";

// The value-first onboarding funnel (hero → quiz → build → plan → projection → paywall →
// win-back → activation → welcome). Entered from app/index.tsx for new/unauthed users.
export default function Onboarding() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OnboardingFlow />
    </>
  );
}
