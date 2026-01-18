// src/store/authStore.ts
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { User } from "../types";
import { wsClient } from "../utils/api";
import { storageKey } from "../env";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
}

// IMPORTANT: env-namespaced key so Expo Go local/prod don't collide
const USER_KEY = storageKey("user");

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: async (user) => {
    try {
      if (user) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

        // Start WS on login if token exists
        if (user.token) {
          wsClient.start();
        }
      } else {
        await AsyncStorage.removeItem(USER_KEY);

        // Stop WS on logout/clear
        wsClient.stop();
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

    wsClient.stop();
    set({ user: null });
  },

  loadUser: async () => {
    try {
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (userData) {
        const user: User = JSON.parse(userData);
        set({ user, isLoading: false });

        // Start WS on boot if token already stored
        if (user?.token) {
          wsClient.start();
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Failed to load user:", error);
      set({ isLoading: false });
    }
  },
}));
