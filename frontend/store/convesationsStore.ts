import { create } from "zustand";
import api from "../utils/api";
import { Conversation } from "../types/gen";

interface ConversationsState {
  conversations: Conversation[];
  loading: boolean;

  setAll: (items: Conversation[]) => void;
  upsert: (item: Conversation) => void;
  remove: (id: string) => void;
  refetchById?: (id: string) => Promise<void>;
  fetchAll: () => Promise<void>;
}

function sortConversations(items: Conversation[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.last_message_at ?? a.updated_at).getTime();
    const bTime = new Date(b.last_message_at ?? b.updated_at).getTime();
    return bTime - aTime;
  });
}

export const useConversationsStoreInternal = create<ConversationsState>(
  (set, get) => ({
    conversations: [],
    loading: false,

    setAll: items =>
      set({
        conversations: sortConversations(items),
      }),

    upsert: item => {
      const existing = get().conversations;
      const idx = existing.findIndex(c => c.id === item.id);

      let next: Conversation[];

      if (idx === -1) {
        next = [...existing, item];
      } else {
        next = [...existing];
        next[idx] = {
          ...existing[idx],
          ...item,
        };
      }

      set({
        conversations: sortConversations(next),
      });
    },

    remove: id => {
      set({
        conversations: get().conversations.filter(c => c.id !== id),
      });
    },

    refetchById: async (id: string) => {
      try {
        const res = await api.get(`/ai/conversations/${id}`);
        get().upsert(res.data);
      } catch (e) {
        console.warn("[conversationsStore] refetchById failed", e);
      }
    },

    fetchAll: async () => {
      set({ loading: true });
      try {
        const res = await api.get("/ai/conversations");
        set({
          conversations: sortConversations(res.data.conversations),
          loading: false,
        });
      } catch (e) {
        console.warn("[conversationsStore] fetchAll failed", e);
        set({ loading: false });
      }
    },
  }),
);
