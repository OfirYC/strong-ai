import React from "react";
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { User } from "../types";
import { wsClient } from "../utils/api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  loadUser: () => Promise<void>;
}
export const useAuthStore = create<AuthState>(set => ({
  user: null,
  isLoading: true,

  setUser: async user => {
    if (user) {
      await AsyncStorage.setItem("user", JSON.stringify(user));

      // ✅ START WS ON LOGIN
      if (user.token) {
        wsClient.start();
      }
    } else {
      await AsyncStorage.removeItem("user");

      // ✅ STOP WS ON LOGOUT / CLEAR
      wsClient.stop();
    }

    set({ user });
  },

  logout: async () => {
    await AsyncStorage.removeItem("user");

    // ✅ STOP WS
    wsClient.stop();

    set({ user: null });
  },

  loadUser: async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);

        set({ user, isLoading: false });
        // ✅ START WS ON APP BOOT (token already stored)
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
