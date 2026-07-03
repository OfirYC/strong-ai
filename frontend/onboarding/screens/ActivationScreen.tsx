import React, { useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, Easing } from "react-native-reanimated";
import Mascot from "../components/Mascot";
import { MascotState } from "../../assets/mascot";
import GlowCTA from "../components/GlowCTA";
import { afterBody, genderFromSex, Goal, useOnboardingStore } from "../store";
import { upgradeDeviceAccount, saveOnboardingPlan, AuthUser } from "../planService";
import { useAuthStore } from "../../store/authStore";
import { identifyUser } from "../../utils/purchases";
import { track } from "../../analytics";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const HB = Math.min(width * 0.52, 188);
const BG = ob.bgMid;
const BG_CLEAR = "rgba(244,248,255,0)";

const GOAL_POSE: Record<Goal, MascotState> = {
  muscle: "curl",
  strength: "lift",
  lean: "proud",
  endurance: "run",
  general: "proud",
};

export default function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboardingStore();
  const setUser = useAuthStore((s) => s.setUser);

  const gender = genderFromSex(answers.sex);
  const goalBody = afterBody(gender, answers.goal);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterApp = async (user: AuthUser) => {
    await setUser(user as any);
    // Alias the anonymous purchase to this account so Pro carries over.
    try {
      await identifyUser(user.id);
    } catch {}
    // Persist the plan they just watched get built into their account (best-effort).
    try {
      const plan = useOnboardingStore.getState().plan;
      if (plan) await saveOnboardingPlan(user, plan, answers);
    } catch {}
    onActivated();
  };

  const createAccount = async () => {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError("Enter a valid email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const user = await upgradeDeviceAccount({ email: e, password });
      track("signup_completed", { method: "email" });
      await enterApp(user);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't create your account.");
    } finally {
      setBusy(false);
    }
  };

  const appleSignUp = async () => {
    setError(null);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) return setError("Apple sign-in was cancelled.");
      setBusy(true);
      const user = await upgradeDeviceAccount({
        apple_token: cred.identityToken,
        email: cred.email ?? undefined,
      });
      track("signup_completed", { method: "apple" });
      await enterApp(user);
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return; // user backed out
      setError(err?.message ?? "Apple sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.page,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Faded goal mascot */}
          <Animated.View
            entering={FadeInDown.duration(440).easing(Easing.out(Easing.cubic))}
            style={styles.mascotZone}
            pointerEvents="none"
          >
            <Mascot gender={gender} body={goalBody} state={GOAL_POSE[answers.goal ?? "general"]} size={HB} />
            <LinearGradient colors={[BG_CLEAR, BG]} locations={[0, 0.45]} style={[styles.fade, { height: HB * 0.6 }]} />
          </Animated.View>

          <View style={styles.content}>
            <Text style={styles.kicker}>LAST STEP</Text>
            <Text style={styles.title}>Save your plan</Text>
            <Text style={styles.sub}>
              Create your account so your plan and Pro access are always here — on any device.
            </Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={ob.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={ob.textFaint}
                secureTextEntry
                textContentType="newPassword"
                value={password}
                onChangeText={setPassword}
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>

            <GlowCTA label="Create my account" onPress={createAccount} loading={busy} />

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.or}>or</Text>
              <View style={styles.line} />
            </View>

            {Platform.OS === "ios" && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.apple}
                onPress={appleSignUp}
              />
            )}

            <Text style={styles.legal}>
              By continuing you agree to our Terms & Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  page: { paddingHorizontal: ob.gutter },
  mascotZone: { height: HB, alignItems: "center", justifyContent: "flex-start", marginTop: 2 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },

  content: { alignItems: "center", marginTop: -HB * 0.3 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, color: ob.primary },
  title: { fontSize: 27, fontWeight: "800", color: ob.ink, letterSpacing: -0.5, marginTop: 6 },
  sub: {
    fontSize: 14.5,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 22,
    lineHeight: 20,
    paddingHorizontal: 6,
    fontWeight: "500",
  },

  form: { alignSelf: "stretch", gap: 12, marginBottom: 18 },
  input: {
    height: 52,
    borderRadius: ob.rMd,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: ob.hairline,
    paddingHorizontal: 16,
    fontSize: 16,
    color: ob.ink,
  },
  error: { fontSize: 13, color: "#E5484D", fontWeight: "600", paddingHorizontal: 2 },

  divider: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", gap: 12, marginVertical: 18 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: ob.hairline },
  or: { fontSize: 13, color: ob.textFaint, fontWeight: "600" },

  apple: { alignSelf: "stretch", height: 52 },
  legal: { fontSize: 11.5, color: ob.textFaint, textAlign: "center", marginTop: 20, lineHeight: 16 },
});
