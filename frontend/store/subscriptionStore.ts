import { create } from "zustand";
import { checkIsPro } from "../utils/purchases";

interface SubscriptionState {
  isPro: boolean;
  isLoading: boolean;
  setIsPro: (val: boolean) => void;
  refresh: () => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionState>()(set => ({
  isPro: false,
  isLoading: true,
  setIsPro: isPro => set({ isPro }),
  refresh: async () => {
    try {
      set({ isLoading: true });
      const isPro = await checkIsPro();
      set({ isPro, isLoading: false });
    } catch {
      set({ isPro: false, isLoading: false });
    }
  },
}));
