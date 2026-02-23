import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Clipboard, StyleSheet } from "react-native";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import api, { wsClient } from "../utils/api";
import { Animated, Easing } from "react-native";
import { AppState } from "react-native";
import AnimatedMarkdown from "./AnimatedMarkdown";

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

/* -------------------------------------------------- */
/* Tool Labels */
/* -------------------------------------------------- */

const TOOL_LABELS: Record<string, string> = {
  profile__get_context: "Reviewing your profile...",
  profile__update_insights: "Updating your profile insights...",
  exercise__get_all: "Looking up exercises...",
  exercise__create_batch: "Creating new exercises...",
  exercise__create_single: "Creating exercise...",
  template__get_all: "Checking your templates...",
  template__create: "Building your workout plan...",
  template__update: "Updating your template...",
  schedule__get: "Checking your schedule...",
  schedule__add_workout: "Scheduling workout...",
  schedule__update_workout: "Updating scheduled workout...",
  schedule__delete_workout: "Removing scheduled workout...",
  workout_history__get_all: "Analyzing recent workouts...",
  workout_history__get_by_exercise: "Checking your performance history...",
};

const TOOL_DONE_LABELS: Record<string, string> = {
  profile__get_context: "Reviewed your profile",
  profile__update_insights: "Updated your profile insights",
  exercise__get_all: "Found exercises",
  exercise__create_batch: "Created exercises",
  exercise__create_single: "Created exercise",
  template__get_all: "Checked your templates",
  template__create: "Built your workout plan",
  template__update: "Updated your template",
  schedule__get: "Checked your schedule",
  schedule__add_workout: "Scheduled workout",
  schedule__update_workout: "Updated scheduled workout",
  schedule__delete_workout: "Removed scheduled workout",
  workout_history__get_all: "Analyzed recent workouts",
  workout_history__get_by_exercise: "Checked your performance history",
};

const seedMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "Hi! I'm your AI strength coach. What are we training today?",
  },
];

const getToolLabel = (tool: string) =>
  TOOL_LABELS[tool] || tool || "Working...";

const getToolDoneLabel = (tool: string) =>
  TOOL_DONE_LABELS[tool] ||
  // fallback: remove trailing "..." and try to make it past tense-ish
  getToolLabel(tool)
    .replace(/\.\.\.$/, "")
    .replace(/ing\b/i, "ed");

export default function AIChatModal({ visible, onClose }: AIChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Important: avoid stale closures
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendingRef = useRef(false);
  const assistantIndexRef = useRef<number | null>(null);
  const jobIdRef = useRef<string | null>(null);

  /* -------------------------------------------------- */
  /* Auto Scroll */
  /* -------------------------------------------------- */
  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const scrollBtnAnim = useRef(new Animated.Value(0)).current;

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

  /* -------------------------------------------------- */
  /* Welcome Message */
  /* -------------------------------------------------- */

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

  useEffect(() => {
    if (!visible) return;

    // Only seed once per open if empty
    if (messagesRef.current.length === 0) {
      if (!conversationId) {
        setMessages(seedMessages);
        return;
      }

      loadConversationMessages();
    }
  }, [visible]);

  /* -------------------------------------------------- */
  /* Cleanup on close */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!conversationId) return;
    const sub = AppState.addEventListener("change", async state => {
      if (state === "active") {
        if (!conversationId) return;

        const jobRes = await api.get(
          `/ai/conversations/${conversationId}/active-job`,
        );

        const activeJob = jobRes?.data?.job;

        // if there's an active job, re-attach WS handlers and restart WS to get real-time updates
        if (activeJob?.status === "running") {
          console.log(
            `Resuming WS for active job ${activeJob._id} on conversation ${conversationId}`,
          );
          jobIdRef.current = activeJob._id;
          attachWsHandlers(activeJob._id);
          wsClient.reconnect();
        } else {
          console.log(
            `No active job for conversation ${conversationId} on app resume, fetching latest messages...`,
          );
          // fetch latest convo state
          await loadConversationMessages();
          sendingRef.current = false;
        }
      }
    });

    return () => sub.remove();
  }, [conversationId]);

  useEffect(() => {
    if (visible) return;

    // stop WS + reset in-flight refs
    try {
      wsClient.setHandlers({});
      wsClient.stop();
    } catch {}

    sendingRef.current = false;
    assistantIndexRef.current = null;
    jobIdRef.current = null;
  }, [visible]);

  /* -------------------------------------------------- */
  /* WS Handlers */
  /* -------------------------------------------------- */
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
    wsClient.setHandlers({
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
        if (data.type === "done" || data.type === "error") {
          const idx = assistantIndexRef.current;
          if (idx !== null) {
            // finalize any pending step as done on normal completion
            if (data.type === "done") markAllPendingDone(idx);
          }

          sendingRef.current = false;
          assistantIndexRef.current = null;

          try {
            wsClient.stop();
          } catch {}

          return;
        }
      },

      onError: (err: any) => {
        console.log("[WS error]", err.message);
        sendingRef.current = false;
        assistantIndexRef.current = null;
        try {
          wsClient.stop();
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

  /* -------------------------------------------------- */
  /* Send Message */
  /* -------------------------------------------------- */

  const sendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || sendingRef.current) return;
    setInputText("");
    sendingRef.current = true;

    const userMessage: ChatMessage = { role: "user", content: trimmed };

    const baseLength = messagesRef.current.length;
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
      }

      if (!jobId) {
        throw new Error("No job_id returned from /ai/chat/start");
      }

      jobIdRef.current = jobId;

      attachWsHandlers(jobId);

      // Start WS
      wsClient.start(`/ws/ai/jobs/${jobId}`);

      // Optional keepalive (only if your wsClient supports it)
      // If your server loop is `await websocket.receive_text()`, sending pings helps.
      // @ts-ignore
      if (typeof wsClient.send === "function") {
        const interval = setInterval(() => {
          // stop sending if modal closed or new job started
          if (!visible || jobIdRef.current !== jobId) {
            clearInterval(interval);
            return;
          }
          try {
            // @ts-ignore
            wsClient.send("ping");
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
        wsClient.stop();
      } catch {}
    }
  };

  /* -------------------------------------------------- */
  /* Render Message */
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
                    markdownStyles={markdownStyles}
                  />
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  /* -------------------------------------------------- */
  /* UI */
  /* -------------------------------------------------- */
  const PulseDot = () => {
    const scale = useRef(new Animated.Value(0.85)).current;
    const ringScale = useRef(new Animated.Value(0.7)).current;
    const ringOpacity = useRef(new Animated.Value(0.0)).current;

    useEffect(() => {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.0,
              duration: 650,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 0.85,
              duration: 650,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.parallel([
              Animated.timing(ringScale, {
                toValue: 1.8,
                duration: 1300,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.sequence([
                Animated.timing(ringOpacity, {
                  toValue: 0.28,
                  duration: 120,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(ringOpacity, {
                  toValue: 0.0,
                  duration: 1180,
                  easing: Easing.in(Easing.quad),
                  useNativeDriver: true,
                }),
              ]),
            ]),
            // reset ring scale for the next loop
            Animated.timing(ringScale, {
              toValue: 0.7,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );

      loop.start();
      return () => loop.stop();
    }, [scale, ringScale, ringOpacity]);

    return (
      <View style={styles.pulseWrap}>
        {/* Expanding ring */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        {/* Solid dot */}
        <Animated.View
          style={[
            styles.pulseCore,
            {
              transform: [{ scale }],
            },
          ]}
        />
      </View>
    );
  };
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
                    style={[
                      styles.toolLineTop,
                      i === 0 && styles.toolLineHidden,
                    ]}
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
                          style={[
                            styles.toolChipText,
                            styles.toolChipTextError,
                          ]}
                        >
                          Failed
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* subtle divider */}
                  {i !== steps.length - 1 && (
                    <View style={styles.toolDivider} />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 16, paddingBottom: 16 },
          ]}
        >
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="fitness" size={24} color="#007AFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Coach</Text>
              <Text style={styles.headerSubtitle}>
                Your strength & conditioning assistant
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#1C1C1E" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={event => {
            const { layoutMeasurement, contentOffset, contentSize } =
              event.nativeEvent;
            const paddingToBottom = 20;
            const isBottom =
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - paddingToBottom;
            setIsAtBottom(isBottom);
          }}
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
      </View>
    </Modal>
  );
}

/* -------------------------------------------------- */
/* Styles (UNCHANGED) */
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
  toolStatusContainer: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F4FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 12,
  },
  toolStatusText: {
    color: "#007AFF",
    fontSize: 14,
  },
  closeButton: { padding: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8F4FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1C1C1E" },
  headerSubtitle: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  toolChainWrap: {
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  toolIcon: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
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
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#007AFF",
    opacity: 0.6,
  },
  toolPrefix: { width: 22, fontSize: 13 },
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
  pulseWrap: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#007AFF",
  },
  pulseCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007AFF",
    opacity: 0.95,
  },

  inputWrapper: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
  },

  sendButtonInside: {
    position: "absolute",
    right: 6,
    bottom: 6, // keeps it aligned nicely with multiline input
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
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
});
const markdownStyles = {
  body: {
    color: "#1C1C1E",
    fontSize: 16,
    lineHeight: 22,
  },
  heading1: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#1C1C1E",
    marginTop: 16,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: "#1C1C1E",
    marginTop: 12,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#1C1C1E",
    marginTop: 8,
    marginBottom: 4,
  },
  strong: {
    fontWeight: "700" as const,
    color: "#1C1C1E",
  },
  em: {
    fontStyle: "italic" as const,
  },
  code_inline: {
    backgroundColor: "#F2F2F7",
    color: "#007AFF",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  code_block: {
    backgroundColor: "#F2F2F7",
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  fence: {
    backgroundColor: "#F2F2F7",
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  bullet_list: {
    marginVertical: 8,
  },
  ordered_list: {
    marginVertical: 8,
  },
  list_item: {
    marginVertical: 4,
  },
  bullet_list_icon: {
    color: "#007AFF",
    fontSize: 16,
  },
  link: {
    color: "#007AFF",
    textDecorationLine: "underline" as const,
  },
  blockquote: {
    backgroundColor: "#F2F2F7",
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },
  paragraph: {
    marginVertical: 4,
  },
  hr: {
    backgroundColor: "#E5E5EA",
    height: 1,
    marginVertical: 12,
  },
};
