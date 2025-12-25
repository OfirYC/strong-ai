import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ViewStyle,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DecimalInput from "./DecimalInput";
import DurationInput from "./DurationInput";
import {
  getExerciseFields,
  ExerciseKind,
  SetType,
  SET_TYPES,
  SET_TYPE_CONFIG,
} from "../types";

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
  duration?: number;
  distance?: number;
  set_type?: SetType;
  completed?: boolean;
}

interface SetRowInputProps {
  set: SetData;
  setIndex: number;
  exerciseKind: ExerciseKind;
  onUpdateSet: (field: string, value: any) => void;
  showCompleteButton?: boolean;
  containerStyle?: ViewStyle;
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
  const fields = getExerciseFields(exerciseKind);
  const isCompleted = set.completed;
  const setType = set.set_type || "normal";
  const typeConfig = SET_TYPE_CONFIG[setType];

  const renderSetNumber = () => {
    if (setType === "normal") {
      return (
        <TouchableOpacity
          style={styles.setNumberContainer}
          onPress={() => setShowSetTypeDropdown(true)}
        >
          <Text
            style={[styles.setNumber, isCompleted && styles.setNumberCompleted]}
          >
            {setIndex + 1}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[
          styles.setTypeIndicator,
          { backgroundColor: typeConfig.bgColor },
        ]}
        onPress={() => setShowSetTypeDropdown(true)}
      >
        <Text style={[styles.setTypeInitial, { color: typeConfig.color }]}>
          {typeConfig.initial}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View
        style={[
          styles.setRow,
          isCompleted && styles.setRowCompleted,
          containerStyle,
        ]}
      >
        {renderSetNumber()}

        {fields.includes("weight") && (
          <DecimalInput
            style={[styles.setInput, isCompleted && styles.setInputCompleted]}
            value={set.weight || 0}
            onChangeValue={value => onUpdateSet("weight", value)}
            placeholder="0"
          />
        )}

        {fields.includes("reps") && (
          <TextInput
            style={[styles.setInput, isCompleted && styles.setInputCompleted]}
            value={set.reps?.toString() || ""}
            onChangeText={value => onUpdateSet("reps", parseInt(value) || 0)}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#999"
          />
        )}

        {fields.includes("duration") && (
          <DurationInput
            value={set.duration || 0}
            onChangeValue={value => onUpdateSet("duration", value)}
            style={[
              styles.durationInput,
              isCompleted && styles.durationInputCompleted,
            ]}
          />
        )}

        {fields.includes("distance") && (
          <DecimalInput
            style={[styles.setInput, isCompleted && styles.setInputCompleted]}
            value={set.distance || 0}
            onChangeValue={value => onUpdateSet("distance", value)}
            placeholder="0"
          />
        )}

        {showCompleteButton && (
          <TouchableOpacity
            style={[
              styles.completeButton,
              isCompleted && styles.completeButtonActive,
            ]}
            onPress={() => onUpdateSet("completed", !isCompleted)}
          >
            <Ionicons
              name="checkmark"
              size={18}
              color={isCompleted ? "#FFFFFF" : "#000000"}
            />
          </TouchableOpacity>
        )}
      </View>

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
                    onUpdateSet("set_type", type);
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

// Helper component for set header row
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
      <Text style={styles.setHeaderText}>SET</Text>
      {fields.includes("weight") && (
        <Text style={styles.setHeaderText}>KG</Text>
      )}
      {fields.includes("reps") && (
        <Text style={styles.setHeaderText}>REPS</Text>
      )}
      {fields.includes("duration") && (
        <Text style={styles.setHeaderText}>TIME</Text>
      )}
      {fields.includes("distance") && (
        <Text style={styles.setHeaderText}>KM</Text>
      )}
      {showCompleteColumn && <Text style={styles.setHeaderText}></Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  setHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  setHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
  },
  setRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  setRowCompleted: {
    opacity: 0.7,
  },
  setNumberContainer: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 32,
    minHeight: 32,
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
  setTypeIndicator: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 32,
    minHeight: 32,
    maxWidth: 32,
    borderRadius: 6,
  },
  setTypeInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  setInput: {
    flex: 1,
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
    flex: 1,
  },
  durationInputCompleted: {
    backgroundColor: "#E8F8ED",
    borderColor: "#34C759",
  },
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
  // Dropdown styles
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
