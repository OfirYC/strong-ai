// src/store/authStore.ts
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { User } from "../types";
import { storageKey } from "../env";
import api from "../utils/api"; // Import the api client
import { dbWsClient } from "../realtime/registerRealtime";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
}

// IMPORTANT: env-namespaced key so Expo Go local/prod don't collide
const USER_KEY = storageKey("user");

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  isLoading: true,

  setUser: async user => {
    try {
      if (user) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

        // Start WS on login if token exists
        if (user.token) {
          dbWsClient.start();
        }
      } else {
        await AsyncStorage.removeItem(USER_KEY);

        // Stop WS on logout/clear
        dbWsClient.stop();
      }

      set({ user });
    } catch (error) {
      console.error("Failed to set user:", error);
      // Still update in-memory to avoid UI getting stuck
      set({ user });
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error("Failed to remove user:", error);
    }

    dbWsClient.stop();
    set({ user: null });
  },

  loadUser: async () => {
    try {
      let userData = await AsyncStorage.getItem(USER_KEY);
      if (userData) {
        // Refresh token on app boot to ensure it's valid and has a fresh expiry
        const tempUser: User = JSON.parse(userData);
        if (tempUser?.token) {
          try {
            const res = await api.post("/auth/refresh");
            if (res?.data?.token) {
              tempUser.token = res.data.token;
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(tempUser));
              userData = JSON.stringify(tempUser);
            }
          } catch (error) {
            console.error("Failed to refresh token on load:", error);
            // If refresh fails, we can still proceed with the old token (might still be valid)
          }
        }

        const user: User = JSON.parse(userData);

        set({ user, isLoading: false });

        // Start WS on boot if token already stored
        if (user?.token) {
          dbWsClient.start();
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Failed to load user:", error);
      set({ isLoading: false });
    }
  },

  // After successful login (or sign-in), call backend refresh and save refreshed token:
  refreshUserToken: async (user: User) => {
    try {
      const res = await api.post("/auth/refresh"); // sends Authorization header via api client
      if (res?.data?.token) {
        user.token = res.data.token;
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        set({ user });
      }
    } catch (error) {
      console.error("Failed to refresh token:", error);
    }
  },
}));
