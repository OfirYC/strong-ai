import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Input from "../../components/Input";
import Button from "../../components/Button";
import api from "../../utils/api";
import { useAuthStore } from "../../store/authStore";
import * as AppleAuthentication from "expo-apple-authentication";

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore(state => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/login", { email, password });
      setUser(response.data);
      router.replace("/(tabs)/workout");
    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const appleToken = credential.identityToken;
      const email = credential.email; // may be undefined after first sign-in
      const payload: any = { apple_token: appleToken };
      if (email) payload.email = email;

      const res = await api.post("/auth/apple", payload);
      await setUser(res.data); // use your auth store's setUser()
      router.replace("/(tabs)/workout");
    } catch (err) {
      console.error("Apple sign-in failed", err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Strong</Text>
            <Text style={styles.subtitle}>Workout Tracker</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="your@email.com"
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
            />

            {/** A vertical stack for the login button and a seperatoer then the social logins like apple login */}

            <View style={styles.authStack}>
              {/* Primary Login */}
              <Button
                title="Log In"
                onPress={handleLogin}
                loading={loading}
                style={styles.button}
              />

              {/* Separator */}
              <View style={styles.separatorContainer}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>OR</Text>
                <View style={styles.separatorLine} />
              </View>

              {/* Social Auth Stack */}
              <View style={styles.socialStack}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={8}
                  style={styles.socialButton}
                  onPress={handleAppleSignIn}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/register")}
              style={styles.linkContainer}
            >
              <Text style={styles.linkText}>
                Don't have an account?{" "}
                <Text style={styles.linkTextBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#8E8E93",
  },
  form: {
    width: "100%",
  },
  button: {
    marginTop: 8,
  },
  linkContainer: {
    marginTop: 24,
    alignItems: "center",
  },
  linkText: {
    color: "#8E8E93",
    fontSize: 14,
  },
  linkTextBold: {
    color: "#007AFF",
    fontWeight: "600",
  },
  authStack: {
    width: "100%",
    gap: 16, // RN 0.71+ — if older, replace with marginBottoms
  },

  separatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },

  separatorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
  },

  appleButton: {
    width: "100%",
    height: 44,
  },
  socialStack: {
    width: "100%",
    gap: 12,
  },

  socialButton: {
    width: "100%",
    height: 44,
  },
});
