import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "expo-haptics";
import React, {
  JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../constants/colors";
import {
  ExerciseKind,
  SET_TYPES,
  SET_TYPE_CONFIG,
  SetType,
  getExerciseFields,
} from "../types";
import DecimalInput from "./DecimalInput";
import DurationInput from "./DurationInput";
import { SetNumber } from "./SetNumber";

// Descriptions for each set type
const SET_TYPE_DESCRIPTIONS: Record<SetType, string> = {
  normal: "A regular working set at your target weight and reps.",
  warmup:
    "A lighter set to prepare your muscles and joints before working sets.",
  cooldown: "A lighter set after your working sets to help recovery.",
  failure:
    "A set where you attempted another rep but could not complete it (reached muscle failure).",
};

const MS_ENABLED_EXERCISE_KINDS: ExerciseKind[] = ["Cardio", "Weighted Cardio"];
export interface SetData {
  weight?: number;
  reps?: number;
  duration?: number; // seconds
  distance?: number; // km
  set_type?: SetType;
  completed?: boolean;
  rest_timer: number | null; // seconds to rest after completing the set
}

interface SetRowInputProps {
  set: SetData;
  exerciseId: string;
  setIndex: number;
  exerciseKind: ExerciseKind;
  onUpdateSet: (fields: Partial<SetData>) => void;
  showCompleteButton?: boolean;
  containerStyle?: ViewStyle;
  previousSetData: PreviousSetData | null;
}

interface PreviousSetData {
  weight?: number;
  reps?: number;
  duration?: number; // seconds
  distance?: number; // km
  set_type?: SetType;
}

/* -------------------------------------------------------------------------- */
/* SHARED REST TIMER REGISTRY (ONE ACTIVE TIMER AT A TIME)                    */
/* -------------------------------------------------------------------------- */

type TimerKey = string;
type TimerStopper = () => void;

const restTimerRegistry: {
  activeKey: TimerKey | null;
  listeners: Map<TimerKey, TimerStopper>;
} = {
  activeKey: null,
  listeners: new Map(),
};

function registerRestTimer(key: TimerKey, stopper: TimerStopper) {
  restTimerRegistry.listeners.set(key, stopper);

  return () => {
    restTimerRegistry.listeners.delete(key);
    if (restTimerRegistry.activeKey === key) {
      restTimerRegistry.activeKey = null;
    }
  };
}

function activateRestTimer(key: TimerKey) {
  if (restTimerRegistry.activeKey && restTimerRegistry.activeKey !== key) {
    const prevStopper = restTimerRegistry.listeners.get(
      restTimerRegistry.activeKey,
    );
    if (prevStopper) {
      prevStopper();
    }
  }
  restTimerRegistry.activeKey = key;
}

/**
 * Format previous set data into a human-friendly string for the "Previous" cell.
 * This is pure display logic; no parsing will be needed.
 */
function formatPreviousToText(
  data: PreviousSetData | null,
  exerciseKind: ExerciseKind,
): string {
  if (!data) return "--";

  const parts: string[] = [];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Weight / reps
  if (data.weight != null && data.reps != null) {
    parts.push(`${data.weight} kg × ${data.reps}`);
  } else if (data.weight != null) {
    parts.push(`${data.weight} kg`);
  } else if (data.reps != null) {
    parts.push(`${data.reps} reps`);
  }

  // Distance
  if (data.distance != null) {
    const dist = Number.isInteger(data.distance)
      ? data.distance.toFixed(0)
      : data.distance.toFixed(1);
    parts.push(`${dist} km`);
  }

  // Duration
  if (data.duration != null) {
    parts.push(formatTime(data.duration));
  }

  // Set type suffix
  if (data.set_type && data.set_type !== "normal") {
    const initial = data.set_type[0].toUpperCase();
    parts.push(`(${initial})`);
  }

  return parts.join(" ");
}

/**
 * Reusable set row input component used in both ActiveWorkoutSheet and CreateRoutine
 * Renders appropriate inputs based on exercise kind (weight/reps, duration, distance, etc.)
 */

function SetRowInput({
  set,
  setIndex,
  exerciseId,
  exerciseKind,
  onUpdateSet,
  showCompleteButton = false,
  containerStyle,
  previousSetData: previousData,
}: SetRowInputProps) {
  const [showSetTypeDropdown, setShowSetTypeDropdown] = useState(false);

  const rowAnim = useRef(new Animated.Value(1)).current;
  const rowShake = useRef(new Animated.Value(0)).current;

  const isSameAsPrevious = useMemo(() => {
    if (!previousData) return false;
    return (
      (previousData.weight ?? null) === (set.weight ?? null) &&
      (previousData.reps ?? null) === (set.reps ?? null) &&
      (previousData.duration ?? null) === (set.duration ?? null) &&
      (previousData.distance ?? null) === (set.distance ?? null)
    );
  }, [previousData, set.weight, set.reps, set.duration, set.distance]);

  const runShakeAnimation = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {},
    );

    rowShake.setValue(0);

    Animated.sequence([
      Animated.timing(rowShake, {
        toValue: 1,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rowShake, {
        toValue: -1,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rowShake, {
        toValue: 1,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.spring(rowShake, {
        toValue: 0,
        tension: 120,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const runCompleteSuccessAnimation = () => {
    // quick tap-expand animation on the entire row
    Animated.sequence([
      Animated.timing(rowAnim, {
        toValue: 1.03,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(rowAnim, {
        toValue: 1,
        tension: 140,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const isClickable = !!previousData && !isSameAsPrevious;
  const previousColor = isClickable ? "#3e3e41ff" : "#8E8E93";

  const fields = getExerciseFields(exerciseKind);
  const isCompleted = set.completed;
  const setType: SetType = set.set_type || "normal";

  const previousText = useMemo(
    () => formatPreviousToText(previousData, exerciseKind),
    [previousData, exerciseKind],
  );
  const handleApplyPrevious = () => {
    if (!previousData || isSameAsPrevious) {
      runShakeAnimation();
      return;
    }

    Haptics.selectionAsync().catch(() => {});

    // SUCCESS animation (scale)
    Animated.sequence([
      Animated.timing(rowAnim, {
        toValue: 1.04,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(rowAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();

    const fields: Partial<SetData> = {};
    if (previousData.weight !== undefined) fields.weight = previousData.weight;
    if (previousData.reps !== undefined) fields.reps = previousData.reps;
    if (previousData.duration !== undefined)
      fields.duration = previousData.duration;
    if (previousData.distance !== undefined)
      fields.distance = previousData.distance;

    onUpdateSet(fields);
  };

  const timerKey = `${exerciseId}-${setIndex}`;

  const handleToggleComplete = () => {
    const nextCompleted = !isCompleted;

    if (nextCompleted) {
      // Positive “success” feedback when completing a set
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      runCompleteSuccessAnimation();
    } else {
      // Optional: light haptic when un-completing
      Haptics.selectionAsync().catch(() => {});
    }

    onUpdateSet({ completed: nextCompleted });
  };

  return (
    <>
      <Animated.View
        style={[
          styles.setRow,
          isCompleted && styles.setRowCompleted,
          containerStyle,
          {
            transform: [
              { scale: rowAnim },
              {
                translateX: rowShake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-4, 4],
                }),
              },
            ],
          },
        ]}
      >
        {/* SET column (fixed width, matches header) */}
        <View style={styles.setIndexColumn}>
          <SetNumber
            setIndex={setIndex}
            completed={!!set.completed}
            setType={setType}
            onClick={() => setShowSetTypeDropdown(!showSetTypeDropdown)}
          />
        </View>

        {/* PREVIOUS column (tap to apply) */}
        <View style={styles.setFieldColumn}>
          <TouchableOpacity
            style={styles.previousCell}
            onPress={handleApplyPrevious}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.previousText, { color: previousColor }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {previousText}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Weight / reps / duration / distance columns (flex, full width) */}
        {fields.includes("weight") && (
          <View style={styles.setFieldColumn}>
            <DecimalInput
              style={[
                styles.setInput,
                isCompleted ? styles.setInputCompleted : undefined,
              ]}
              value={set.weight || 0}
              onChangeValue={value => onUpdateSet({ weight: value })}
              placeholder="0"
            />
          </View>
        )}

        {fields.includes("reps") && (
          <View style={styles.setFieldColumn}>
            <TextInput
              style={[styles.setInput, isCompleted && styles.setInputCompleted]}
              value={set.reps?.toString() || ""}
              onChangeText={value =>
                onUpdateSet({ reps: parseInt(value) || 0 })
              }
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#999"
            />
          </View>
        )}

        {fields.includes("duration") && (
          <View style={styles.setFieldColumn}>
            <DurationInput
              value={set.duration || 0}
              onChangeValue={value => onUpdateSet({ duration: value })}
              style={[
                styles.durationInput,
                isCompleted && styles.durationInputCompleted,
              ]}
              enableMilliseconds={MS_ENABLED_EXERCISE_KINDS.includes(
                exerciseKind,
              )}
            />
          </View>
        )}

        {fields.includes("distance") && (
          <View style={styles.setFieldColumn}>
            <DecimalInput
              style={[styles.setInput, isCompleted && styles.setInputCompleted]}
              value={set.distance || 0}
              onChangeValue={value => onUpdateSet({ distance: value })}
              placeholder="0"
            />
          </View>
        )}

        {/* Complete button column (fixed width, matches header) */}
        {showCompleteButton && (
          <View style={styles.completeColumn}>
            <TouchableOpacity
              style={[
                styles.completeButton,
                isCompleted && styles.completeButtonActive,
              ]}
              onPress={handleToggleComplete}
            >
              <MaterialCommunityIcons
                name="check" // medium weight
                size={18}
                color={isCompleted ? "#FFFFFF" : "#000000"}
              />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      <RestTimerRow
        timerKey={timerKey}
        value={set.rest_timer ?? null}
        isSetCompleted={!!set.completed}
        onChangeValue={v => onUpdateSet({ rest_timer: v })}
      />

      {/* Set Type Dropdown Modal */}
      {showSetTypeDropdown && (
        <Modal
          visible={showSetTypeDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSetTypeDropdown(false)}
        >
          <Pressable
            style={styles.dropdownOverlay}
            onPress={() => setShowSetTypeDropdown(false)}
          >
            <View style={styles.dropdownContainer}>
              <Text style={styles.dropdownTitle}>Set Type</Text>
              {SET_TYPES.map(type => {
                const config = SET_TYPE_CONFIG[type];
                const isSelected = type === setType;

                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.dropdownOption,
                      isSelected && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      onUpdateSet({ set_type: type });
                      setShowSetTypeDropdown(false);
                    }}
                  >
                    {type !== "normal" ? (
                      <View
                        style={[
                          styles.dropdownIndicator,
                          { backgroundColor: config.bgColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownInitial,
                            { color: config.color },
                          ]}
                        >
                          {config.initial}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.dropdownIndicatorNormal}>
                        <Text style={styles.dropdownNumber}>#</Text>
                      </View>
                    )}
                    <Text
                      style={[
                        styles.dropdownLabel,
                        isSelected && styles.dropdownLabelSelected,
                      ]}
                    >
                      {config.label}
                    </Text>

                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color="#007AFF"
                        style={styles.checkIcon}
                      />
                    )}
                    <TouchableOpacity
                      style={styles.infoButton}
                      onPress={e => {
                        e.stopPropagation();
                        Alert.alert(config.label, SET_TYPE_DESCRIPTIONS[type]);
                      }}
                    >
                      <Ionicons
                        name="help-circle-outline"
                        size={20}
                        color="#8E8E93"
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
export default SetRowInput;
/* -------------------------------------------------------------------------- */
/* SET HEADER (unchanged)                                                     */
/* -------------------------------------------------------------------------- */

export function SetHeader({
  exerciseKind,
  showCompleteColumn = false,
}: {
  exerciseKind: ExerciseKind;
  showCompleteColumn?: boolean;
}) {
  const fields = useMemo(() => getExerciseFields(exerciseKind), [exerciseKind]);

  return (
    <View style={styles.setHeader}>
      {/* SET column */}
      <View style={styles.setIndexColumn}>
        <View style={styles.headerSetCell}>
          <Text style={styles.setHeaderText}>Set</Text>
        </View>
      </View>

      {/* PREVIOUS */}
      <View style={styles.setFieldColumn}>
        <View style={styles.headerFieldCell}>
          <Text style={styles.setHeaderText}>Previous</Text>
        </View>
      </View>

      {/* Dynamic field headers */}
      {fields.includes("weight") && (
        <View style={styles.setFieldColumn}>
          <View style={styles.headerFieldCell}>
            <Text style={styles.setHeaderText}>+kg</Text>
          </View>
        </View>
      )}

      {fields.includes("reps") && (
        <View style={styles.setFieldColumn}>
          <View style={styles.headerFieldCell}>
            <Text style={styles.setHeaderText}>Reps</Text>
          </View>
        </View>
      )}

      {fields.includes("duration") && (
        <View style={styles.setFieldColumn}>
          <View style={styles.headerFieldCell}>
            <Text style={styles.setHeaderText}>TIME</Text>
          </View>
        </View>
      )}

      {fields.includes("distance") && (
        <View style={styles.setFieldColumn}>
          <View style={styles.headerFieldCell}>
            <Text style={styles.setHeaderText}>KM</Text>
          </View>
        </View>
      )}

      {showCompleteColumn && (
        <View style={styles.completeColumn}>
          <View style={styles.headerCompleteCell} />
        </View>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  setHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  setHeaderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    textAlign: "center",
  },
  headerSetCell: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerFieldCell: {
    width: "100%",
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCompleteCell: {
    width: 36,
  },

  /* LAYOUT */
  setIndexColumn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  setFieldColumn: {
    flex: 1,
    justifyContent: "center",
  },
  completeColumn: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ROW */
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 0,
    paddingTop: 4,
    paddingHorizontal: 20,
  },
  setRowCompleted: {
    opacity: 0.65,
    paddingVertical: 8,
    marginVertical: 0,
    backgroundColor: "#eafbf0",
  },
  setNumberContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  setNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    textAlign: "center",
  },
  setNumberCompleted: {
    color: "#34C759",
  },

  /* TYPE INDICATORS */
  setTypeIndicator: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  setTypeInitial: {
    fontSize: 14,
    fontWeight: "700",
  },

  /* PREVIOUS CELL */
  previousCell: {
    width: "100%",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  previousText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#8E8E93",
    textAlign: "center",
  },

  /* INPUTS */
  setInput: {
    width: "100%",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: "center",
    backgroundColor: "#e9ebea",
    borderColor: "transparent",
  },
  setInputCompleted: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  durationInput: {
    width: "100%",
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "#e9ebea",
  },
  durationInputCompleted: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },

  /* COMPLETE BUTTON */
  completeButton: {
    width: 30,
    height: 26.666,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  completeButtonActive: {
    backgroundColor: "#28c36a",
    borderWidth: 1,
    borderColor: "#40bb77",
  },

  /* DROPDOWN */
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    width: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 12,
    textAlign: "center",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  dropdownOptionSelected: {
    backgroundColor: "#F2F2F7",
  },
  dropdownIndicator: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  dropdownIndicatorNormal: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "#F2F2F7",
  },
  dropdownNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E8E93",
  },
  dropdownInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  dropdownLabel: {
    flex: 1,
    fontSize: 16,
    color: "#1C1C1E",
  },
  dropdownLabelSelected: {
    fontWeight: "600",
  },
  checkIcon: {
    marginRight: 8,
  },
  infoButton: {
    padding: 4,
    marginLeft: 4,
  },
});

/* -------------------------------------------------------------------------- */
/* REST TIMER ROW                                                             */
/* -------------------------------------------------------------------------- */

function RestTimerRow({
  timerKey,
  value,
  isSetCompleted,
  onChangeValue,
}: {
  timerKey: string;
  value: number | null;
  isSetCompleted: boolean;
  onChangeValue: (v: number | null) => void;
}) {
  const planned = useMemo(() => (value != null ? value : 0), [value]);
  const hasTimer = useMemo(() => planned > 0, [planned]);

  const [mode, setMode] = useState<"display" | "edit" | "running" | "done">(
    () => {
      if (isSetCompleted && hasTimer) return "done";
      return "display";
    },
  );

  const [remaining, setRemaining] = useState<number>(() => {
    if (isSetCompleted && hasTimer) return 0;
    return planned;
  });

  const [showModal, setShowModal] = useState(false);

  const progress = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  const prevCompletedRef = useRef(isSetCompleted);
  const hasAutoStartedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const fmt = useCallback((s: number) => {
    const safe = Math.max(0, Math.floor(s));
    const m = Math.floor(safe / 60);
    const sec = safe % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }, []);

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    progress.stopAnimation?.();
  }, [progress]);

  // Shared finish function with "silent" flag
  const finishTimer = useCallback(
    (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;

      clear();
      endTimeRef.current = null;

      if (modeRef.current !== "done") {
        setMode("done");
        progress.setValue(0);
        setRemaining(0);

        if (!silent) {
          setShowModal(true);
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }
      }
    },
    [clear, progress],
  );

  // Natural finish (used by tick + animation completion)
  const handleFinishNatural = useCallback(() => {
    finishTimer({ silent: false });
  }, [finishTimer]);

  const tick = useCallback(() => {
    if (!endTimeRef.current) return;

    const msLeft = endTimeRef.current - Date.now();
    const nextRemaining = Math.max(0, Math.ceil(msLeft / 1000));
    setRemaining(nextRemaining);

    if (nextRemaining <= 0) {
      handleFinishNatural();
    }
  }, [handleFinishNatural]);

  const startBarAnimation = useCallback(
    (durationMs: number) => {
      Animated.timing(progress, {
        toValue: 0,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          // In case tick didn't already fire exactly at 0
          handleFinishNatural();
        }
      });
    },
    [handleFinishNatural, progress],
  );

  const start = useCallback(() => {
    if (!hasTimer || planned <= 0) return;

    activateRestTimer(timerKey);

    clear();
    const now = Date.now();
    endTimeRef.current = now + planned * 1000;

    setMode("running");
    setRemaining(planned);
    progress.setValue(1);

    startBarAnimation(planned * 1000);
    // @ts-ignore
    intervalRef.current = setInterval(tick, 1000);
  }, [clear, hasTimer, planned, progress, startBarAnimation, tick, timerKey]);

  // Registry: if another timer starts, we force-finish silently
  useEffect(() => {
    const unregister = registerRestTimer(timerKey, () => {
      if (modeRef.current === "running") {
        // forced finish → NO modal, NO haptic
        finishTimer({ silent: true });
      }
    });

    return unregister;
  }, [timerKey, finishTimer]);

  // React to completion toggles
  useEffect(() => {
    const prev = prevCompletedRef.current;

    // not completed -> completed
    if (!prev && isSetCompleted && hasTimer) {
      if (!hasAutoStartedRef.current) {
        hasAutoStartedRef.current = true;
        start();
      }
    }

    // completed -> not completed
    if (prev && !isSetCompleted) {
      clear();
      endTimeRef.current = null;
      setMode("display");
      setRemaining(planned);
      progress.setValue(1);
      hasAutoStartedRef.current = false;
    }

    prevCompletedRef.current = isSetCompleted;
  }, [isSetCompleted, hasTimer, planned, start, clear, progress]);

  // Completed + timer = 0 → show done pill with no countdown
  useEffect(() => {
    if (isSetCompleted && !hasTimer && value !== null && mode === "display") {
      clear();
      setMode("done");
      setRemaining(0);
      progress.setValue(0);
    }
  }, [isSetCompleted, hasTimer, value, mode, clear, progress]);

  // Sync when planned changes while idle
  useEffect(() => {
    if (mode === "display" || mode === "edit") {
      setRemaining(planned);
      progress.setValue(1);
    }
  }, [planned, mode, progress]);

  // AppState listener: when returning to foreground, fix bar for remaining time
  useEffect(() => {
    const sub = AppState.addEventListener("change", nextState => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        prevState.match(/inactive|background/) &&
        nextState === "active" &&
        modeRef.current === "running" &&
        endTimeRef.current &&
        planned > 0
      ) {
        const msLeft = endTimeRef.current - Date.now();

        if (msLeft <= 0) {
          handleFinishNatural();
          return;
        }

        const fraction = msLeft / (planned * 1000);
        progress.stopAnimation?.();
        progress.setValue(fraction);

        startBarAnimation(msLeft);
      }
    });

    return () => {
      sub.remove();
    };
  }, [handleFinishNatural, planned, progress, startBarAnimation]);

  useEffect(() => {
    return () => clear();
  }, [clear]);

  if (value == null && mode === "display") return null;

  const onChangeFocus = useCallback(
    (focused: boolean) => {
      if (!focused) {
        setMode(isSetCompleted ? "done" : "display");
      }
    },
    [isSetCompleted],
  );

  const handleDurationChange = (sec: number | null) => {
    const safe = sec ?? 0;
    setRemaining(safe);
    onChangeValue(safe);
  };

  let content: JSX.Element | null = null;

  if (mode === "display") {
    content = (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setMode("edit")}
        style={rtStyles.displayRow}
      >
        <View style={rtStyles.line} />
        <View style={rtStyles.pill}>
          <Text style={[rtStyles.pillText]}>{fmt(remaining)}</Text>
        </View>
        <View style={rtStyles.line} />
      </TouchableOpacity>
    );
  } else if (mode === "edit") {
    content = (
      <View style={{ paddingHorizontal: 8 }}>
        <DurationInput
          value={remaining}
          onChangeValue={handleDurationChange}
          style={[rtStyles.pillEdit, rtStyles.pillText]}
          enableMilliseconds={false}
          onChangeFocus={onChangeFocus}
          autoFocus
        />
      </View>
    );
  } else if (mode === "running") {
    const widthInterpolate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["0%", "100%"],
    });

    content = (
      <View style={{ paddingHorizontal: 8, height: 32, marginVertical: 5 }}>
        <MaskedView
          style={{ flex: 1 }}
          maskElement={
            <View
              style={{
                flex: 1,
                backgroundColor: "black",
                borderRadius: 8,
              }}
            />
          }
        >
          {/* Gray background bar */}
          <View
            style={{
              flex: 1,
              backgroundColor: `${colors.primary}15`,
              borderRadius: 8,
            }}
          />

          {/* Blue progress bar */}
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: widthInterpolate,
              backgroundColor: "#0A84FF",
              borderRadius: 0,
            }}
          />

          {/* Text masking */}
          <MaskedView
            style={StyleSheet.absoluteFillObject}
            maskElement={
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "black",
                  }}
                >
                  {fmt(remaining)}
                </Text>
              </View>
            }
          >
            <View style={{ flex: 1, flexDirection: "row" }}>
              <Animated.View
                style={{
                  width: widthInterpolate,
                  backgroundColor: "white",
                }}
              />
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#0A84FF",
                }}
              />
            </View>
          </MaskedView>
        </MaskedView>
      </View>
    );
  } else if (mode === "done") {
    content = (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setMode("edit")}
        style={[
          rtStyles.displayRow,
          { backgroundColor: "#eafbf0", opacity: 0.65 },
        ]}
      >
        <View style={rtStyles.lineDone} />
        <View style={rtStyles.pillDone}>
          <Text style={rtStyles.pillDoneText}>{fmt(planned)}</Text>
        </View>
        <View style={rtStyles.lineDone} />
      </TouchableOpacity>
    );
  }

  return (
    <>
      <View style={{ marginTop: 0, marginBottom: 0 }}>{content}</View>

      {/* Completion modal – only on NATURAL finish now */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          style={rtStyles.modalOverlay}
          onPress={() => setShowModal(false)}
        >
          <Pressable
            style={rtStyles.modalCard}
            onPress={e => e.stopPropagation()}
          >
            <View style={rtStyles.modalHeader}>
              <Text style={rtStyles.modalTitle}>Get Back To Work 💪</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <Text style={rtStyles.modalBody}>
              Your rest period is over. Time for the next set.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* RestTimerRow styles                                                        */
/* -------------------------------------------------------------------------- */

const rtStyles = StyleSheet.create({
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    paddingTop: 4,
    paddingBottom: 0,
    // marginBottom: 4,

    // marginBottom: 4,
    // marginTop: 4,
  },
  line: {
    flex: 1,
    height: 4,
    backgroundColor: "#007bff10",
    borderRadius: 2,
  },
  pill: {
    marginHorizontal: 10,
  },
  pillEdit: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#E5F2FF",
    borderWidth: 2,
    borderColor: "#0A84FF",
    // marginTop: 2,
  },
  pillDone: {
    marginHorizontal: 10,
  },
  pillText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A84FF",
  },

  /* Running */
  runningWrap: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  progressOuter: {
    width: "100%",
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a9b",
    backgroundColor: "#F2F2F7",
    overflow: "hidden",
  },
  progressInner: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#0A84FF",
  },
  centerTextWrap: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  progressText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  plannedLabel: {
    fontSize: 12,
    color: "#34C759",
  },

  /* Done state */
  lineDone: {
    flex: 1,
    height: 4,
    backgroundColor: "#c2e0d17f",
    borderRadius: 2,
  },

  pillDoneText: {
    color: "#34C759",
    fontWeight: "600",
    fontSize: 16,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  modalBody: {
    fontSize: 15,
    color: "#3A3A3C",
  },
  progressTextMask: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
  },
  progressTextInside: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  textLayer: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  textBase: {
    fontSize: 16,
    fontWeight: "700",
  },
});
