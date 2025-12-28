import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
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

export interface SetData {
  weight?: number;
  reps?: number;
  duration?: number; // seconds
  distance?: number; // km
  set_type?: SetType;
  completed?: boolean;
}

interface SetRowInputProps {
  set: SetData;
  setIndex: number;
  exerciseKind: ExerciseKind;
  onUpdateSet: (fields: Partial<SetData>) => void; // <-- NEW
  showCompleteButton?: boolean;
  containerStyle?: ViewStyle;
}

interface PreviousSetData {
  weight?: number;
  reps?: number;
  duration?: number; // seconds
  distance?: number; // km
  set_type?: SetType;
}

/**
 * Dummy async helper – in the real app you'll replace this with an API call
 * that fetches the *actual* previous set data for this exercise + set index.
 */
async function getExercisePreviousData(
  exerciseKind: ExerciseKind,
  setIndex: number,
  setType: SetType
): Promise<PreviousSetData | null> {
  await new Promise(resolve => setTimeout(resolve, 40));

  const setNumber = setIndex + 1;
  const baseWeight = 30 + setNumber * 2;
  const baseReps = 6 + setNumber;
  const baseDuration = 60 * (3 + setIndex); // seconds
  const baseDistance = 1 + setIndex * 0.5; // km
  if (setNumber > 6) {
    return null;
  }
  switch (exerciseKind) {
    case "Barbell":
    case "Dumbbell":
    case "Machine/Other":
    case "Weighted Bodyweight":
      return {
        weight: baseWeight,
        reps: baseReps,
        set_type: setType,
      };

    case "Assisted Bodyweight":
      return {
        weight: -(20 + setNumber * 5),
        reps: 8,
        set_type: setType,
      };

    case "Reps Only":
    case "EMOM (Every Minute On The Minute)":
    case "ETOT (Every Thirty Seconds on Thirty Seconds)":
      return {
        reps: 8 + setNumber,
        set_type: setType,
      };

    case "Duration":
      return {
        duration: 40 + setNumber * 10,
        set_type: setType,
      };

    case "Cardio":
      return {
        distance: baseDistance,
        duration: baseDuration,
        set_type: setType,
      };

    case "Weighted Cardio":
      return {
        weight: baseWeight,
        distance: baseDistance,
        duration: baseDuration,
        set_type: setType,
      };

    case "Weighted Duration":
      return {
        weight: baseWeight,
        duration: baseDuration,
        set_type: setType,
      };

    default:
      return null;
  }
}

/**
 * Format previous set data into a human-friendly string for the "Previous" cell.
 * This is pure display logic; no parsing will be needed.
 */
function formatPreviousToText(
  data: PreviousSetData | null,
  exerciseKind: ExerciseKind
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
export default function SetRowInput({
  set,
  setIndex,
  exerciseKind,
  onUpdateSet,
  showCompleteButton = false,
  containerStyle,
}: SetRowInputProps) {
  const [showSetTypeDropdown, setShowSetTypeDropdown] = useState(false);
  const [previousData, setPreviousData] = useState<PreviousSetData | null>(
    null
  );
  const rowAnim = useState(new Animated.Value(1))[0];
  const rowShake = useState(new Animated.Value(0))[0];
  const isSameAsPrevious = (): boolean => {
    if (!previousData) return false;

    return (
      (previousData.weight ?? null) === (set.weight ?? null) &&
      (previousData.reps ?? null) === (set.reps ?? null) &&
      (previousData.duration ?? null) === (set.duration ?? null) &&
      (previousData.distance ?? null) === (set.distance ?? null)
    );
  };
  const runShakeAnimation = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {}
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
  const isClickable = !!previousData && !isSameAsPrevious();

  const previousColor = isClickable ? "#3e3e41ff" : "#8E8E93";

  const fields = getExerciseFields(exerciseKind);
  const isCompleted = set.completed;
  const setType: SetType = set.set_type || "normal";
  const typeConfig = SET_TYPE_CONFIG[setType];

  // Load dummy "previous" value when row mounts / changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const value = await getExercisePreviousData(
        exerciseKind,
        setIndex,
        setType
      );
      if (!cancelled) setPreviousData(value);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [exerciseKind, setIndex, setType]);

  const previousText = formatPreviousToText(previousData, exerciseKind);

  const handleApplyPrevious = () => {
    if (!previousData || isSameAsPrevious()) {
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
                  outputRange: [-4, 4], // <-- reduced for a tight iOS shake
                }),
              },
            ],
          },
        ]}
      >
        {/* SET column (fixed width, matches header) */}
        <View style={styles.setIndexColumn}>
          {
            <SetNumber
              setIndex={setIndex}
              setType={setType}
              onClick={() => setShowSetTypeDropdown(!showSetTypeDropdown)}
            />
          }
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
              style={[styles.setInput, isCompleted && styles.setInputCompleted]}
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
              onPress={() => onUpdateSet({ completed: !isCompleted })}
            >
              <Ionicons
                name="checkmark"
                size={18}
                color={isCompleted ? "#FFFFFF" : "#000000"}
              />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* Set Type Dropdown Modal */}
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
    </>
  );
}

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
  const fields = getExerciseFields(exerciseKind);

  return (
    <View style={styles.setHeader}>
      {/* SET column */}
      <View style={styles.setIndexColumn}>
        <View style={styles.headerSetCell}>
          <Text style={styles.setHeaderText}>SET</Text>
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
            <Text style={styles.setHeaderText}>KG</Text>
          </View>
        </View>
      )}

      {fields.includes("reps") && (
        <View style={styles.setFieldColumn}>
          <View style={styles.headerFieldCell}>
            <Text style={styles.setHeaderText}>REPS</Text>
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
    marginBottom: 2,
    paddingHorizontal: 4,
    gap: 8,
  },
  setHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
  },
  headerSetCell: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerFieldCell: {
    width: "100%",
    paddingHorizontal: 12,
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
    marginBottom: 8,
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  setRowCompleted: {
    opacity: 0.65,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  setInputCompleted: {
    backgroundColor: "#E8F8ED",
    borderColor: "#34C759",
  },
  durationInput: {
    width: "100%",
  },
  durationInputCompleted: {
    backgroundColor: "#E8F8ED",
    borderColor: "#34C759",
  },

  /* COMPLETE BUTTON */
  completeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  completeButtonActive: {
    backgroundColor: "#34C759",
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
