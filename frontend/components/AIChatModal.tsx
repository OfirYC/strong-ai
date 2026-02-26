import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  AppStateStatus,
  Clipboard,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../store/authStore";
import { useConversationsStoreInternal } from "../store/convesationsStore";
import { IOS_PANEL_EASING } from "../utils/animation";
import api, { createWsClient } from "../utils/api";
import AnimatedMarkdown from "./AnimatedMarkdown";
import { PulseDot } from "./PulseDot";

/* =======================================================
   Types 
   ======================================================= */
type ToolMeta = {
  label: string;
  done: string;
};
type ToolStepStatus = "pending" | "done" | "error";
interface ToolStep {
  id: string;
  tool: string;
  label: string;
  status: ToolStepStatus;
  doneLabel?: string;
  errorLabel?: string;
}

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  toolSteps?: ToolStep[]; // 👈 chain of tool calls
  tool_call_id?: string; // 👈 for tool messages, to correlate with tool events
  tool_calls?: ToolCall[]; // for assistant tool_calls messages
  hidden?: boolean; // for messages that are part of the tool call chain but shouldn't be shown as separate bubbles
  hasStartedStreaming?: boolean; // 👈 once tokens arrive, hide tasks UI
}

interface AIChatModalProps {
  visible: boolean;
  onClose: () => void;
}

/* =======================================================
   Constants 
   ======================================================= */
const aiWsClient = createWsClient();

const TOOL_META: Record<string, ToolMeta> = {
  profile__get_context: {
    label: "Reviewing your profile...",
    done: "Reviewed your profile",
  },
  profile__update_insights: {
    label: "Updating your profile insights...",
    done: "Updated your profile insights",
  },

  exercise__search: {
    label: "Searching exercises...",
    done: "Found matching exercises",
  },
  exercise__get_by_ids: {
    label: "Loading exercise details...",
    done: "Loaded exercise details",
  },
  exercise__create_batch: {
    label: "Creating new exercises...",
    done: "Created exercises",
  },

  template__get_all: {
    label: "Checking your templates...",
    done: "Checked your templates",
  },
  template__get_by_id: {
    label: "Loading template details...",
    done: "Loaded template details",
  },
  template__create: {
    label: "Building your workout plan...",
    done: "Built your workout plan",
  },
  template__insert_exercises: {
    label: "Updating workout structure...",
    done: "Updated workout structure",
  },
  template__remove_by_order: {
    label: "Removing workout block...",
    done: "Removed workout block",
  },
  template__update: {
    label: "Rebuilding your workout template...",
    done: "Rebuilt workout template",
  },

  schedule__get: {
    label: "Checking your schedule...",
    done: "Checked your schedule",
  },
  schedule__add_workout: {
    label: "Scheduling workout...",
    done: "Scheduled workout",
  },
  schedule__update_workout: {
    label: "Updating scheduled workout...",
    done: "Updated scheduled workout",
  },
  schedule__delete_workout: {
    label: "Removing scheduled workout...",
    done: "Removed scheduled workout",
  },

  workout_history__get_all: {
    label: "Analyzing recent workouts...",
    done: "Analyzed recent workouts",
  },
  workout_history__get_by_exercise: {
    label: "Checking your performance history...",
    done: "Checked your performance history",
  },
};

const seedMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "Hi! I'm your AI strength coach. What are we training today?",
  },
];

/* -------------------------------------------------- */
/* Helpers
/* -------------------------------------------------- */
const getToolLabel = (tool: string) =>
  TOOL_META[tool]?.label || tool || "Working...";

const getToolDoneLabel = (tool: string) => {
  const meta = TOOL_META[tool];
  if (meta?.done) return meta.done;

  // fallback if not explicitly defined
  return getToolLabel(tool)
    .replace(/\.\.\.$/, "")
    .replace(/ing\b/i, "ed");
};

export default function AIChatModal({ visible, onClose }: AIChatModalProps) {
  /**
   * User
   */
  const user = useAuthStore(s => s.user);

  /**
   * Controller States
   */
  const runtime = useChatRuntime();
  const {
    conversationId,
    messages,
    setMessages,
    messagesRef,
    sendingRef,
    assistantIndexRef,
  } = runtime;

  /**
   * Websocket Controller
   */
  const ws = useWsController(runtime);

  /**
   * Conversation Controller
   */
  const { loadConversationMessages, startNewConversation, openConversation } =
    useConversationController({
      visible,
      runtime,
      ws,
    });

  /**
   * Chat Composer
   */
  const {
    sendMessage,
    input: { setInputText, inputText },
  } = useChatComposer({
    visible,
    user,
    runtime,
    ws,
  });

  /**
   * Drawer Animation
   */
  const {
    drawerOpen,
    drawerTranslateX,
    screenTranslateX,
    overlayOpacity,
    openDrawer,
    closeDrawer,
  } = useDrawerController();

  /**
   * Auto Scroll
   */
  const { scrollToBottom, onScroll, isAtBottom, scrollBtnAnim, scrollViewRef } =
    useAutoScroll(visible, messages);

  const insets = useSafeAreaInsets();

  /**
   * Multi-Conversations
   */
  const fetchConversations = useConversationsStoreInternal(s => s.fetchAll);
  const conversations = useConversationsStoreInternal(s => s.conversations);

  useEffect(() => {
    if (!visible) return;
    fetchConversations();
  }, [visible]);

  /* -------------------------------------------------- */
  /* UI */
  /* -------------------------------------------------- */
  const renderMessage = (message: ChatMessage, index: number) => {
    const isUser = message.role === "user";
    const isStreaming =
      index === assistantIndexRef.current && sendingRef.current;

    return (
      <View
        key={index}
        style={[
          // @ts-ignore - you said you’ll add styles back
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <TouchableOpacity
          onLongPress={() => Clipboard.setString(message.content || "")}
          activeOpacity={1}
        >
          <View
            style={[
              styles.messageContent,
              isUser ? styles.userContent : styles.assistantContent,
            ]}
          >
            {isUser ? (
              <Text style={styles.userText}>{message.content}</Text>
            ) : (
              <View>
                {/* Show tool chain until tokens begin */}
                {!message.hasStartedStreaming &&
                  (message.toolSteps?.length ?? 0) > 0 && (
                    <ToolChain steps={message.toolSteps!} />
                  )}

                {/* If assistant is "pending" (empty content), show pulse circle */}
                {!message.content ? (
                  <View style={styles.pendingWrap}>
                    <PulseDot />
                  </View>
                ) : (
                  <AnimatedMarkdown
                    content={message.content || ""}
                    isStreaming={isStreaming}
                  />
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide">
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: drawerTranslateX }],
          },
        ]}
      >
        <View style={styles.drawerContent}>
          {/* New Chat */}
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={() => {
              startNewConversation();
              closeDrawer();
            }}
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>

          <View style={styles.drawerDivider} />

          <Text style={styles.drawerSectionTitle}>Chats</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {conversations.map(conv => (
              <Pressable
                key={conv.id}
                style={({ pressed }) => [
                  styles.drawerItem,
                  pressed && { backgroundColor: "#F2F2F7" },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  openConversation(conv.id);
                  closeDrawer();
                }}
              >
                <Text
                  style={[
                    styles.drawerItemText,
                    conversationId === conv.id && { color: "#007AFF" },
                  ]}
                  numberOfLines={1}
                >
                  {conv.title || "Conversation"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Animated.View>
      <Animated.View
        pointerEvents={drawerOpen ? "auto" : "none"}
        style={[
          styles.drawerOverlay,
          {
            opacity: overlayOpacity,
          },
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateX: screenTranslateX }] },
        ]}
      >
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 16, paddingBottom: 16 },
          ]}
        >
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={openDrawer}
              style={styles.hamburgerButton}
            >
              <View style={styles.hamburgerWrap}>
                <View
                  style={[
                    styles.hamburgerLine,
                    {
                      width: "80%", // 👈 shorter middle line (matches iOS look)
                    },
                  ]}
                />
                <View style={[styles.hamburgerLine, styles.hamburgerMiddle]} />
              </View>
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>AI Coach</Text>
              <Text style={styles.headerSubtitle}>
                Your strength & conditioning assistant
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                startNewConversation();
              }}
              style={styles.headerIconButton}
            >
              <Feather name="edit" size={22} color="black" />
              {/* <Ionicons name="create-outline" size={22} color="#1C1C1E" /> */}
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.headerIconButton}>
              <Ionicons name="close" size={26} color="#1C1C1E" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
        >
          {messages
            .filter(m => !m.hidden && m.role !== "tool")
            .map(renderMessage)}
        </ScrollView>
        <Animated.View
          pointerEvents={isAtBottom ? "none" : "auto"}
          style={[
            styles.scrollToBottomWrapper,
            {
              opacity: scrollBtnAnim,
              transform: [
                { translateX: -22 },
                {
                  translateY: scrollBtnAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.scrollToBottomButton}
            onPress={scrollToBottom}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-down" size={24} color="#007AFF" />
          </TouchableOpacity>
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={[
              styles.inputContainer,
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={styles.inputPill}>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask me anything..."
                placeholderTextColor="#999"
                multiline
                editable={!sendingRef.current}
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || sendingRef.current) &&
                    styles.sendButtonDisabled,
                ]}
                onPress={sendMessage}
                disabled={!inputText.trim() || sendingRef.current}
              >
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

/* -------------------------------------------------- */
/* Components  */
/* -------------------------------------------------- */
const ToolChain = ({ steps }: { steps: ToolStep[] }) => {
  if (!steps.length) return null;

  const pendingIndex = steps.findIndex(s => s.status === "pending");
  const activeIndex = pendingIndex === -1 ? steps.length - 1 : pendingIndex;

  const iconFor = (s: ToolStep) => {
    if (s.status === "done") return "checkmark-circle" as const;
    if (s.status === "error") return "close-circle" as const;
    return "time" as const; // pending
  };

  const iconColorFor = (s: ToolStep) => {
    if (s.status === "done") return "#34C759";
    if (s.status === "error") return "#FF3B30";
    return "#007AFF";
  };

  return (
    <View style={styles.toolCard}>
      <View style={styles.toolCardHeader}>
        <View style={styles.toolCardHeaderLeft}>
          <View style={styles.toolBadge}>
            <Ionicons name="sparkles" size={14} color="#007AFF" />
          </View>
          <Text style={styles.toolCardTitle}>Working in the background</Text>
        </View>

        <View style={styles.toolCardRight}>
          <View style={styles.toolProgressPills}>
            <Text style={styles.toolProgressText}>
              {Math.min(activeIndex + 1, steps.length)}/{steps.length}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.toolList}>
        {steps.map((s, i) => {
          const isActive = s.status === "pending" && i === activeIndex;
          const text =
            s.status === "done"
              ? s.doneLabel || s.label
              : s.status === "error"
                ? s.errorLabel || s.label
                : s.label;

          return (
            <View key={s.id} style={styles.toolItemRow}>
              {/* left gutter: timeline */}
              <View style={styles.toolGutter}>
                <View
                  style={[styles.toolLineTop, i === 0 && styles.toolLineHidden]}
                />
                <View style={styles.toolDotWrap}>
                  {s.status === "pending" ? (
                    <View style={styles.toolDotPulseOuter}>
                      <View style={styles.toolDotPulseInner} />
                    </View>
                  ) : (
                    <Ionicons
                      name={iconFor(s)}
                      size={18}
                      color={iconColorFor(s)}
                    />
                  )}
                </View>
                <View
                  style={[
                    styles.toolLineBottom,
                    i === steps.length - 1 && styles.toolLineHidden,
                  ]}
                />
              </View>

              {/* content */}
              <View style={styles.toolItemContent}>
                <View style={styles.toolItemTopRow}>
                  <Text
                    style={[
                      styles.toolItemText,
                      s.status === "done" && styles.toolItemTextDone,
                      s.status === "error" && styles.toolItemTextError,
                      isActive && styles.toolItemTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {text}
                  </Text>

                  {s.status === "pending" && (
                    <View style={styles.toolChip}>
                      <Text style={styles.toolChipText}>Running</Text>
                    </View>
                  )}

                  {s.status === "done" && (
                    <View style={[styles.toolChip, styles.toolChipDone]}>
                      <Text
                        style={[styles.toolChipText, styles.toolChipTextDone]}
                      >
                        Done
                      </Text>
                    </View>
                  )}

                  {s.status === "error" && (
                    <View style={[styles.toolChip, styles.toolChipError]}>
                      <Text
                        style={[styles.toolChipText, styles.toolChipTextError]}
                      >
                        Failed
                      </Text>
                    </View>
                  )}
                </View>

                {/* subtle divider */}
                {i !== steps.length - 1 && <View style={styles.toolDivider} />}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

/* -------------------------------------------------- */
/* Runtime Owner: state + refs (single source of truth) */
/* -------------------------------------------------- */
function useChatRuntime() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendingRef = useRef(false);
  const assistantIndexRef = useRef<number | null>(null);
  const jobIdRef = useRef<string | null>(null);

  return {
    conversationId,
    setConversationId,
    messages,
    setMessages,
    messagesRef,
    sendingRef,
    assistantIndexRef,
    jobIdRef,
  };
}

/* -------------------------------------------------- */
/* Drawer Controller: Controls Chats Drawer Animation
/* -------------------------------------------------- */
const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 360);

function useDrawerController() {
  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const screenTranslateX = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);

    Animated.parallel([
      Animated.timing(drawerTranslateX, {
        toValue: 0,
        duration: 300,
        easing: IOS_PANEL_EASING,
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateX, {
        toValue: DRAWER_WIDTH,
        duration: 300,
        easing: IOS_PANEL_EASING,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerTranslateX, {
        toValue: -DRAWER_WIDTH,
        duration: 280,
        easing: IOS_PANEL_EASING,
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateX, {
        toValue: 0,
        duration: 280,
        easing: IOS_PANEL_EASING,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setDrawerOpen(false));
  }, []);

  return {
    drawerOpen,
    drawerTranslateX,
    screenTranslateX,
    overlayOpacity,
    openDrawer,
    closeDrawer,
  };
}

/* -------------------------------------------------- */
/* Scroll Controller: Controls Chats Scroll Animation
/* -------------------------------------------------- */

function useAutoScroll(visible: boolean, messages: ChatMessage[]) {
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollBtnAnim = useRef(new Animated.Value(0)).current;

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isBottom =
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom;
    setIsAtBottom(isBottom);
  };

  useEffect(() => {
    Animated.timing(scrollBtnAnim, {
      toValue: isAtBottom ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isAtBottom]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    // auto scroll on new messages
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [visible, messages.length]);

  return { scrollToBottom, onScroll, isAtBottom, scrollBtnAnim, scrollViewRef };
}

/* -------------------------------------------------- */
/* Conversation Controller: open/load/resume/new */
/* -------------------------------------------------- */
function useConversationController({
  visible,
  runtime,
  ws,
}: {
  visible: boolean;
  runtime: ReturnType<typeof useChatRuntime>;
  ws: ReturnType<typeof useWsController>;
}) {
  const {
    conversationId,
    setConversationId,
    setMessages,
    messagesRef,
    sendingRef,
    assistantIndexRef,
    jobIdRef,
  } = runtime;

  const loadConversationMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await api.get(`/ai/conversations/${conversationId}/messages`);
      const msgs: ChatMessage[] = res?.data?.messages || [];
      setMessages(msgs.map(m => (m.content ? m : { ...m, hidden: true })));
    } catch (e) {
      setMessages(seedMessages);
      console.log("[fetch messages error]", e);
    }
  }, [conversationId]);

  const waitForJobCompletion = async (conversationId: string) => {
    let finished = false;

    while (!finished) {
      await new Promise(res => setTimeout(res, 1000));

      const jobRes = await api.get(
        `/ai/conversations/${conversationId}/active-job`,
      );

      const job = jobRes?.data?.job;

      if (!job || job.status !== "running") {
        finished = true;
      }
    }

    await loadConversationMessages();
  };
  const openConversation = async (id: string) => {
    try {
      // Stop any current WS
      try {
        aiWsClient.stop();
      } catch {}

      sendingRef.current = false;
      assistantIndexRef.current = null;
      jobIdRef.current = null;

      setConversationId(id);
      setMessages([]);

      // 1️⃣ Load existing messages
      const res = await api.get(`/ai/conversations/${id}/messages`);
      const msgs: ChatMessage[] = res?.data?.messages || [];

      const visibleMsgs = msgs.map(m =>
        m.content ? m : { ...m, hidden: true },
      );

      setMessages(visibleMsgs);

      // 2️⃣ Ask backend if there's an active job
      const jobRes = await api.get(`/ai/conversations/${id}/active-job`);

      const activeJob = jobRes?.data?.job;

      if (activeJob?.status === "running") {
        console.log(`[Resume] Job still running. Polling until completion...`);

        sendingRef.current = true;

        // Optional: show temporary placeholder
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "⏳ Generating response...",
            hasStartedStreaming: true,
          },
        ]);

        waitForJobCompletion(id).then(() => {
          sendingRef.current = false;
        });

        return;
      }
    } catch (e) {
      console.log("[openConversation error]", e);
      setMessages(seedMessages);
    }
  };
  const startNewConversation = () => {
    try {
      aiWsClient.stop();
    } catch {}

    sendingRef.current = false;
    assistantIndexRef.current = null;
    jobIdRef.current = null;

    setConversationId(null);
    setMessages(seedMessages);
  };

  // Seed behavior (preserved)
  useEffect(() => {
    if (!visible) return;

    if (messagesRef.current.length === 0) {
      if (!conversationId) {
        setMessages(seedMessages);
        return;
      }
      loadConversationMessages();
    }
  }, [
    visible,
    conversationId,
    loadConversationMessages,
    messagesRef,
    setMessages,
  ]);

  // Reconnect/Refetch On App Foregrounding
  useEffect(() => {
    if (!conversationId) return;
    const sub = AppState.addEventListener(
      "change",
      async (state: AppStateStatus) => {
        if (state != "active") return;

        if (!conversationId) return;

        const jobRes = await api.get(
          `/ai/conversations/${conversationId}/active-job`,
        );

        const activeJob = jobRes?.data?.job;

        // if there's an active job, re-attach WS handlers and restart WS to get real-time updates
        if (activeJob?.status === "running") {
          ws.reconnectToJob(activeJob._id);
        } else {
          // fetch latest convo state
          await loadConversationMessages();
          sendingRef.current = false;
        }
      },
    );

    return () => sub.remove();
  }, [conversationId]);

  useEffect(() => {
    if (visible) return;

    // stop WS + reset in-flight refs
    try {
      aiWsClient.setHandlers({});
      aiWsClient.stop();
    } catch {}

    sendingRef.current = false;
    assistantIndexRef.current = null;
    jobIdRef.current = null;
  }, [visible]);

  return {
    loadConversationMessages,
    waitForJobCompletion,
    openConversation,
    startNewConversation,
  };
}

/* -------------------------------------------------- */
/* WS Controller: owns WS lifecycle + handlers */
/* -------------------------------------------------- */
function useWsController(runtime: ReturnType<typeof useChatRuntime>) {
  const { setMessages, assistantIndexRef, sendingRef, jobIdRef } = runtime;

  const markAllPendingDone = (idx: number) => {
    setMessages(prev => {
      const copy = [...prev];
      const msg = copy[idx];
      if (!msg || msg.role !== "assistant") return prev;

      const nextSteps = (msg.toolSteps ?? []).map(
        s =>
          (s.status === "pending" ? { ...s, status: "done" } : s) as ToolStep,
      );

      copy[idx] = { ...msg, toolSteps: nextSteps };
      return copy;
    });
  };
  const attachWsHandlers = (jobId: string) => {
    aiWsClient.setHandlers({
      onMessage: (data: any) => {
        if (!data?.type) return;

        /* ---------------- Assistant Token ---------------- */
        if (data.type === "assistant_token") {
          const idx = assistantIndexRef.current;
          if (idx === null) return;

          const token = data?.payload?.token ?? "";

          if (!token) return;

          // Once tokens start, mark streaming and clear pending tools visually
          setMessages(prev => {
            const copy = [...prev];
            if (!copy[idx]) {
              return prev;
            }

            copy[idx] = {
              ...copy[idx],
              hasStartedStreaming: true,
              content: (copy[idx].content || "") + token,
            };

            return copy;
          });

          return;
        }

        /* ---------------- Assistant Final Message ---------------- */
        if (data.type === "assistant_message") {
          const idx = assistantIndexRef.current;
          if (idx === null) return;

          const content = data?.payload?.content ?? "";

          setMessages(prev => {
            const copy = [...prev];
            if (!copy[idx]) return prev;
            copy[idx] = { ...copy[idx], content };
            return copy;
          });

          return;
        }

        /* ---------------- Tool Events ---------------- */
        /* ---------------- Tool Events ---------------- */
        /* ---------------- Tool Events ---------------- */
        if (
          data.type === "tool_start" ||
          data.type === "tool_result" ||
          data.type === "tool_error"
        ) {
          const idx = assistantIndexRef.current;
          if (idx === null) return;

          const toolName = data?.payload?.tool || "unknown_tool";
          const toolCallId = String(data?.payload?.tool_call_id || "");
          const args = String(data?.payload?.arguments ?? "{}");
          const result = data?.payload?.result;
          const errorMessage = data?.payload?.message;

          setMessages(prev => {
            const copy = [...prev];
            const msg = copy[idx];
            if (!msg || msg.role !== "assistant") return prev;

            const steps = msg.toolSteps ?? [];
            let nextSteps = [...steps];

            /* -------------------------------------------------- */
            /* 1️⃣ On tool_start → append hidden assistant tool_call */
            /* -------------------------------------------------- */
            if (data.type === "tool_start" && toolCallId) {
              // Insert hidden assistant tool_calls message right after visible assistant
              copy.splice(idx + 1, 0, {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: toolCallId,
                    type: "function",
                    function: {
                      name: toolName,
                      arguments: args || "{}",
                    },
                  },
                ],
                hidden: true,
              });

              // Add pending UI step
              nextSteps = [
                ...nextSteps,
                {
                  id: toolCallId,
                  tool: toolName,
                  label: getToolLabel(toolName),
                  doneLabel: getToolDoneLabel(toolName),
                  status: "pending",
                },
              ];

              copy[idx] = { ...msg, toolSteps: nextSteps };
              return copy;
            }

            /* -------------------------------------------------- */
            /* 2️⃣ On tool_result / tool_error → append hidden tool */
            /* -------------------------------------------------- */
            if (
              (data.type === "tool_result" || data.type === "tool_error") &&
              toolCallId
            ) {
              const toolContent =
                data.type === "tool_result"
                  ? typeof result === "string"
                    ? result
                    : JSON.stringify(result)
                  : JSON.stringify({ error: errorMessage || "tool_error" });

              // Insert hidden tool message right after assistant tool_call message
              copy.splice(idx + 1, 0, {
                role: "tool",
                tool_call_id: toolCallId,
                content: toolContent,
                hidden: true,
              });

              // Update UI step status
              nextSteps = nextSteps.map(step =>
                step.id === toolCallId
                  ? {
                      ...step,
                      status: data.type === "tool_result" ? "done" : "error",
                      errorLabel:
                        data.type === "tool_error"
                          ? `Failed: ${getToolLabel(toolName).replace(/\.\.\.$/, "")}`
                          : step.errorLabel,
                    }
                  : step,
              );

              copy[idx] = { ...msg, toolSteps: nextSteps };
              return copy;
            }

            return copy;
          });

          return;
        }
        /* ---------------- Completion ---------------- */
        /* ---------------- Completion / Error ---------------- */
        if (data.type === "done" || data.type === "error") {
          const idx = assistantIndexRef.current;

          if (idx !== null) {
            if (data.type === "error") {
              const errorMessage =
                data?.payload?.message ||
                data?.payload?.raw ||
                "Something went wrong.";

              setMessages(prev => {
                const copy = [...prev];
                if (!copy[idx]) return prev;

                copy[idx] = {
                  ...copy[idx],
                  content: `⚠️ Whoops - I've hit an error. Error:\n\n ${errorMessage}`,
                  hasStartedStreaming: true,
                };

                return copy;
              });
            }

            if (data.type === "done") {
              markAllPendingDone(idx);
            }
          }

          sendingRef.current = false;
          assistantIndexRef.current = null;

          try {
            aiWsClient.stop();
          } catch {}

          return;
        }
      },

      onError: (err: any) => {
        console.log("[WS error]", err.message);
        sendingRef.current = false;
        assistantIndexRef.current = null;
        try {
          aiWsClient.stop();
        } catch {}
      },

      onOpen: () => {
        console.log("[WS open] jobId=", jobId);
      },

      onClose: e => {
        console.log("[WS close] jobId=", jobId, e);
      },
    });
  };

  const reconnectToJob = (jobId: string) => {
    jobIdRef.current = jobId;
    attachWsHandlers(jobId);
    aiWsClient.reconnect();
  };

  return { markAllPendingDone, reconnectToJob, attachWsHandlers };
}

/* -------------------------------------------------- */
/* Composer: send message (preserves try/catch + ws start) */
/* -------------------------------------------------- */
function useChatComposer({
  visible,
  user,
  runtime,
  ws,
}: {
  visible: boolean;
  user: any;
  runtime: ReturnType<typeof useChatRuntime>;
  ws: ReturnType<typeof useWsController>;
}) {
  const {
    conversationId,
    setConversationId,
    setMessages,
    messagesRef,
    sendingRef,
    assistantIndexRef,
    jobIdRef,
  } = runtime;

  // Input text of user message input
  const [inputText, setInputText] = useState("");

  // If new conversation, create a temporary optimistic conversation in memory for the convos list.
  const tryCreateAndSetTempOptimisticConversation = useCallback(
    (isNewConversation: boolean, userMessage: string) => {
      const tempId = isNewConversation ? `temp_${Date.now()}` : null;

      if (tempId) {
        // upsert minimal convo immediately (optimistic)
        useConversationsStoreInternal.getState().upsert({
          id: tempId,
          title: userMessage.slice(0, 48) || "New Chat",
          user_id: user?.id!,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      setConversationId(tempId);

      return tempId;
    },
    [],
  );

  // Once a conversation was created in DB, we replace the temporary optimistic copy with it
  const tryReplaceTempOptimisticConversation = useCallback(
    (tempId: string | null, realConversationId: string) => {
      // It was an existing conversation so no optimistic version to replace
      if (!tempId) return;

      // Just for safety
      if (tempId == realConversationId) return;

      const store = useConversationsStoreInternal.getState();

      const existing = store.conversations.find(c => c.id === tempId);
      if (existing) {
        store.remove(tempId);

        store.upsert({
          ...existing,
          id: realConversationId,
          updated_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        });
      }
    },
    [],
  );

  const sendMessage = async () => {
    const trimmed = inputText.trim();

    if (!trimmed || sendingRef.current) return;

    // Clear the input text (TODO: Why sometimes dosent clear?)
    setInputText("");

    sendingRef.current = true;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const baseLength = messagesRef.current.length;

    const tempId = tryCreateAndSetTempOptimisticConversation(
      !conversationId,
      trimmed,
    );

    const assistantIndex = baseLength + 1; // user will be appended first

    assistantIndexRef.current = assistantIndex;

    setMessages(prev => [
      ...prev,
      userMessage,
      {
        role: "assistant",
        content: "",
        toolSteps: [],
        hasStartedStreaming: false,
      },
    ]);

    try {
      const res = await api.post("/ai/chat/start", {
        user_message: userMessage,
        conversation_id: conversationId,
      });
      const jobId = res?.data?.job_id;
      const conversationIdFromRes = res?.data?.conversation_id;

      if (conversationIdFromRes) {
        setConversationId(conversationIdFromRes);
        tryReplaceTempOptimisticConversation(tempId, conversationIdFromRes);
      }

      if (!jobId) {
        throw new Error("No job_id returned from /ai/chat/start");
      }

      jobIdRef.current = jobId;

      ws.attachWsHandlers(jobId);

      // Start WS
      aiWsClient.start(`/ws/ai/jobs/${jobId}`);

      // Optional keepalive (only if your aiWsClient supports it)
      // If your server loop is `await websocket.receive_text()`, sending pings helps.
      // @ts-ignore
      if (typeof aiWsClient.send === "function") {
        const interval = setInterval(() => {
          // stop sending if modal closed or new job started
          if (!visible || jobIdRef.current !== jobId) {
            clearInterval(interval);
            return;
          }
          try {
            // @ts-ignore
            aiWsClient.send("ping");
          } catch {}
        }, 15000);
      }
    } catch (e: any) {
      console.log("[sendMessage error]", e);

      sendingRef.current = false;
      assistantIndexRef.current = null;

      // show failure in the assistant placeholder (so UI doesn't look dead)
      setMessages(prev => {
        const copy = [...prev];
        const idx = copy.length - 1;
        if (copy[idx]?.role === "assistant" && copy[idx]?.content === "") {
          copy[idx] = {
            ...copy[idx],
            content:
              "⚠️ Something failed while starting the chat. Check backend logs.",
          };
        }
        return copy;
      });

      try {
        aiWsClient.stop();
      } catch {}
    }
  };

  return { sendMessage, input: { setInputText, inputText } };
}

/* -------------------------------------------------- */
/* Styles  */
/* -------------------------------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  messagesContainer: { flex: 1 },
  messagesContent: { paddingHorizontal: 12, paddingVertical: 16 },
  messageBubble: {
    flexDirection: "row",
    marginBottom: 16,
    maxWidth: "85%",
  },
  userBubble: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  assistantBubble: {
    alignSelf: "flex-start",
  },

  messageContent: {
    borderRadius: 16,
    padding: 12,
  },
  userContent: {
    backgroundColor: "#007AFF",
  },
  assistantContent: {
    backgroundColor: "#FFFFFF",
  },
  userText: { color: "#FFFFFF" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  inputPill: {
    flexDirection: "row",
    alignItems: "flex-end", // 👈 key: pin button to bottom when multiline grows
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6, // 👈 gives space for multiline without looking cramped
  },

  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 8, // 👈 controls text top/bottom feel
    paddingRight: 10, // space before the button
    // Android only, harmless on iOS:
    textAlignVertical: "top",
  },

  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2, // 👈 tiny baseline alignment tweak
    alignSelf: "flex-end",
  },
  sendButtonDisabled: {
    backgroundColor: "#C7C7CC",
    opacity: 0.6,
  },

  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },

  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1C1C1E" },
  headerSubtitle: { fontSize: 12, color: "#8E8E93", marginTop: 2 },

  toolIconPending: { backgroundColor: "#007AFF" },
  toolIconDone: { backgroundColor: "#34C759" },
  toolIconError: { backgroundColor: "#FF3B30" },
  toolText: {
    fontSize: 13,
    color: "#1C1C1E",
    flexShrink: 1,
  },
  pendingWrap: {
    paddingVertical: 8,
  },

  toolCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  toolCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  toolCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  toolBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E8F4FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  toolCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  toolCardRight: { flexDirection: "row", alignItems: "center" },
  toolProgressPills: {
    backgroundColor: "#F2F2F7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  toolProgressText: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "600",
  },

  toolList: {},

  toolItemRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },

  // timeline gutter
  toolGutter: {
    width: 26,
    alignItems: "center",
  },
  toolLineTop: {
    width: 2,
    flex: 1,
    backgroundColor: "#E5E5EA",
  },
  toolLineBottom: {
    width: 2,
    flex: 1,
    backgroundColor: "#E5E5EA",
  },
  toolLineHidden: {
    backgroundColor: "transparent",
  },
  toolDotWrap: {
    height: 22,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },

  // pulsing dot for active pending
  toolDotPulseOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,122,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolDotPulseInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007AFF",
    opacity: 0.9,
  },

  toolItemContent: {
    flex: 1,
    paddingLeft: 8,
    paddingTop: 2,
    paddingBottom: 2,
  },
  toolItemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  toolItemText: {
    flex: 1,
    fontSize: 13,
    color: "#1C1C1E",
    lineHeight: 18,
    fontWeight: "600",
  },
  toolItemTextActive: {
    color: "#007AFF",
  },
  toolItemTextDone: {
    color: "#3A3A3C",
    fontWeight: "600",
  },
  toolItemTextError: {
    color: "#FF3B30",
  },

  toolChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#E8F4FF",
    borderWidth: 1,
    borderColor: "#D6ECFF",
  },
  toolChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#007AFF",
  },
  toolChipDone: {
    backgroundColor: "#EAF8EF",
    borderColor: "#D3F0DB",
  },
  toolChipTextDone: {
    color: "#1F8A3B",
  },
  toolChipError: {
    backgroundColor: "#FFECEC",
    borderColor: "#FFD4D4",
  },
  toolChipTextError: {
    color: "#D92D20",
  },

  toolDivider: {
    height: 1,
    backgroundColor: "#E5E5EA",
    opacity: 0.6,
    marginTop: 10,
  },

  scrollToBottomWrapper: {
    position: "absolute",
    left: "50%",
    bottom: 120, // clean stable baseline
    zIndex: 1000,
  },

  scrollToBottomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 2,
    elevation: 2,
  },
  hamburgerButton: {
    padding: 6,
    marginRight: 12,
  },

  drawerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.14)",
    zIndex: 999,
  },

  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#FFFFFF",
    zIndex: 1000,
  },

  drawerContent: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
  },

  drawerItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1C1C1E",
    letterSpacing: -0.2,
  },

  drawerDivider: {
    height: 1,
    backgroundColor: "#E5E5EA",
    marginVertical: 16,
  },

  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  hamburgerWrap: {
    width: 22,
    height: 16,
    gap: 5,
  },

  hamburgerLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: "#1C1C1E",
  },

  hamburgerMiddle: {
    width: "60%", // 👈 shorter middle line (matches iOS look)
  },
  newChatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 24,
  },

  newChatText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
