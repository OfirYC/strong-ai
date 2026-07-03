import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/authStore";
import Button from "../../components/Button";
import MuscleVolumeModal from "../../components/MuscleVolumeModal";
import api from "../../utils/api";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [muscleVolumeVisible, setMuscleVolumeVisible] = useState(false);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data including workouts, templates, and progress. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "All your data will be permanently deleted.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete Everything",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.delete("/auth/account");
                      await logout();
                      router.replace("/(auth)/login");
                    } catch {
                      Alert.alert("Error", "Failed to delete account. Please try again.");
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={48} color="#4A90E2" />
          </View>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/profile-settings")}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="person-outline" size={24} color="#007AFF" />
              <Text style={styles.menuItemText}>Profile Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setMuscleVolumeVisible(true)}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="stats-chart-outline" size={24} color="#007AFF" />
              <Text style={styles.menuItemText}>Statistics</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle-outline" size={24} color="#007AFF" />
              <Text style={styles.menuItemText}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <Button
          title="Logout"
          onPress={handleLogout}
          variant="outline"
          style={styles.logoutButton}
        />

        <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL("https://strong-ai-production.up.railway.app/privacy")}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")}>
            <Text style={styles.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.legalNote}>
          Stronger provides general fitness guidance, not medical advice. Consult a physician before
          starting any exercise program.
        </Text>
      </ScrollView>

      <MuscleVolumeModal
        visible={muscleVolumeVisible}
        onClose={() => setMuscleVolumeVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  legalLink: { fontSize: 13, color: "#8E8E93", fontWeight: "600" },
  legalDot: { fontSize: 13, color: "#C7C7CC" },
  legalNote: {
    fontSize: 11,
    color: "#AEAEB2",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 32,
    lineHeight: 15,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1C1C1E",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F5F5F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  email: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  section: {
    marginBottom: 24,
  },
  menuItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuItemText: {
    fontSize: 16,
    color: "#1C1C1E",
    marginLeft: 16,
  },
  logoutButton: {
    marginTop: 16,
  },
  deleteAccountButton: {
    alignItems: "center",
    paddingVertical: 16,
  },
  deleteAccountText: {
    fontSize: 14,
    color: "#FF3B30",
  },
});
