import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { SafeAreaView } from "react-native-safe-area-context";

import CreateExerciseModal from "./CreateExerciseModal";
import ExercisePickerModal from "./ExercisePickerModal";
import Input from "./Input";
import SetRowInput, { SetHeader } from "./SetRowInput";
import SwipeToDeleteRow from "./SwipeToDeleteRow";
import { Exercise, TemplateExercise, WorkoutTemplate } from "../types";
import api from "../utils/api";

type OnSaveRoutine = (
  name: string,
  notes: string,
  exercises: TemplateExercise[]
) => Promise<void>;

export function ModifyRoutine({
  onSaveRoutine,
  onClose,
  title: modalTitle,
  routine,
  style: propStyle,
}: {
  onSaveRoutine: OnSaveRoutine;
  onClose: () => void;
  title: string;
  routine?: WorkoutTemplate;
  style?: StyleProp<ViewStyle>;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedExercises, setSelectedExercises] = useState<
    TemplateExercise[]
  >([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [exerciseDetails, setExerciseDetails] = useState<{
    [key: string]: Exercise;
  }>({});
  const [saving, setSaving] = useState(false);

  // Drag / collapse logic copied from ActiveWorkoutSheet
  const [isDraggingList, setIsDraggingList] = useState(false);
  const [extraTopPadding, setExtraTopPadding] = useState(0);
  const listRef = useRef<typeof DraggableFlatList<TemplateExercise> | null>(
    null
  );
  const itemRefs = useRef<Record<string, View | null>>({});

  useEffect(() => {
    loadExerciseDetails();
  }, [selectedExercises]);

  // On injected routine into modal
  useEffect(() => {
    if (!routine?.id) {
      return;
    }

    setSelectedExercises(routine.exercises);
    setName(routine.name);
    setNotes(routine.notes || "");
  }, [routine?.id]);

  const loadExerciseDetails = async () => {
    const exerciseIds = selectedExercises.map(e => e.exercise_id);
    const missingIds = exerciseIds.filter(id => !exerciseDetails[id]);

    if (missingIds.length > 0) {
      try {
        const response = await api.get("/exercises");
        const allExercises: Exercise[] = response.data;
        const detailsMap: { [key: string]: Exercise } = { ...exerciseDetails };

        allExercises.forEach(ex => {
          if (missingIds.includes(ex.id)) {
            detailsMap[ex.id] = ex;
          }
        });

        setExerciseDetails(detailsMap);
      } catch (error) {
        console.error("Failed to load exercise details:", error);
      }
    }
  };

  const addExercise = (exercise: Exercise) => {
    const newExercise: TemplateExercise = {
      exercise_id: exercise.id,
      order: selectedExercises.length,
      sets: [{ set_type: "normal" }], // Start with one empty set
    };
    setSelectedExercises(prev => [...prev, newExercise]);
    // Add to details immediately
    setExerciseDetails(prev => ({ ...prev, [exercise.id]: exercise }));
  };

  const removeExercise = (index: number) => {
    Alert.alert(
      "Remove Exercise",
      "Are you sure you want to remove this exercise?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const newExercises = selectedExercises.filter(
              (_, i) => i !== index
            );
            setSelectedExercises(newExercises);
          },
        },
      ]
    );
  };

  const addSet = (exerciseIndex: number) => {
    const newExercises = [...selectedExercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: [...newExercises[exerciseIndex].sets, { set_type: "normal" }],
    };
    setSelectedExercises(newExercises);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...selectedExercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex),
    };
    setSelectedExercises(newExercises);
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    field: string,
    value: any
  ) => {
    const newExercises = [...selectedExercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.map((set, i) =>
        i === setIndex ? { ...set, [field]: value } : set
      ),
    };
    setSelectedExercises(newExercises);
  };

  const handleReorderExercises = (data: TemplateExercise[]) => {
    // 1:1 with ActiveWorkoutSheet: update order to match new index
    const reordered = data.map((ex, index) => ({
      ...ex,
      order: index,
    }));
    setSelectedExercises(reordered);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a routine name");
      return;
    }

    if (selectedExercises.length === 0) {
      Alert.alert("Error", "Please add at least one exercise");
      return;
    }

    try {
      setSaving(true);
      await onSaveRoutine(name.trim(), notes.trim(), selectedExercises);
    } catch (error) {
      Alert.alert("Error", "Failed to create routine");
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const getExerciseName = (exerciseId: string) => {
    return exerciseDetails[exerciseId]?.name || "Loading...";
  };

  const renderExerciseItem = ({
    item,
    drag,
    getIndex,
    isActive,
  }: RenderItemParams<TemplateExercise>) => {
    const index = getIndex?.();
    if (index == null) return null;

    const detail = exerciseDetails[item.exercise_id];
    const exerciseKind = detail?.exercise_kind || "Barbell";
    const itemKey = `${item.exercise_id}-${item.order}`;
    const isCompact = isDraggingList; // collapse sets while dragging, same as ActiveWorkoutSheet

    const handleLongPress = (e: GestureResponderEvent) => {
      if (selectedExercises.length <= 1) return;

      // Enter compact mode + haptic
      setIsDraggingList(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Wait one frame so compact layout takes effect, then measure + scroll
      requestAnimationFrame(() => {
        const ref = itemRefs.current[itemKey];
        if (!ref) {
          drag();
          return;
        }

        ref.measure((x, y, width, height, pageX, pageY) => {
          const desiredY = e.nativeEvent.locationY;
          const cumulativeHeightsOfOtherItems = index * height;
          const baseAbsoluteLocation = pageY;
          const diff = baseAbsoluteLocation - desiredY; // kept for 1:1 logic, even if not used

          setExtraTopPadding(cumulativeHeightsOfOtherItems);
          setTimeout(() => {
            // @ts-ignore
            listRef.current?.scrollToOffset({
              offset: cumulativeHeightsOfOtherItems,
              animated: false,
            });
            drag();
          }, 0);
        });
      });
    };

    return (
      <View
        ref={el => {
          itemRefs.current[itemKey] = el;
        }}
        style={[
          styles.exerciseCard,
          isActive && {
            opacity: 0.95,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
          },
        ]}
      >
        <View style={styles.exerciseHeader}>
          <TouchableOpacity
            style={styles.exerciseNameTouch}
            onLongPress={handleLongPress}
            delayLongPress={150}
            activeOpacity={0.8}
          >
            <Text style={styles.exerciseName}>
              {getExerciseName(item.exercise_id)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => removeExercise(index)}
            disabled={isDraggingList}
          >
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        {/* BODY – only rendered in full mode */}
        {!isCompact && (
          <>
            {item.sets.length > 0 && (
              <View style={styles.setsContainer}>
                <SetHeader exerciseKind={exerciseKind} />

                {item.sets.map((set, setIndex) => (
                  <SwipeToDeleteRow
                    key={setIndex}
                    onDelete={() => removeSet(index, setIndex)}
                  >
                    <SetRowInput
                      set={set}
                      setIndex={setIndex}
                      exerciseKind={exerciseKind}
                      onUpdateSet={(field, value) =>
                        updateSet(index, setIndex, field, value)
                      }
                      showCompleteButton={false}
                    />
                  </SwipeToDeleteRow>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.addSetButton}
              onPress={() => addSet(index)}
              disabled={isDraggingList}
            >
              <Ionicons name="add" size={20} color="#007AFF" />
              <Text style={styles.addSetText}>Add Set</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, propStyle]}>
      {/* Header (unchanged) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={28} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{modalTitle}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !name.trim() || selectedExercises.length === 0}
          style={[
            styles.saveButton,
            (saving || !name.trim() || selectedExercises.length === 0) &&
              styles.saveButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.saveButtonText,
              (saving || !name.trim() || selectedExercises.length === 0) &&
                styles.saveButtonTextDisabled,
            ]}
          >
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* DraggableFlatList replaces ScrollView for exercises section,
          but uses same paddings / styles so visuals stay the same */}
      <DraggableFlatList
        ref={listRef as any}
        data={selectedExercises}
        keyExtractor={item => `${item.exercise_id}-${item.order}`}
        contentContainerStyle={{
          ...styles.scrollContent,
          paddingBottom: isDraggingList
            ? extraTopPadding
            : styles.scrollContent.paddingBottom,
        }}
        ListHeaderComponent={
          <>
            <Input
              label="Routine Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Push Day"
            />

            <Input
              label="Notes (Optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes about this routine"
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Exercises</Text>
            </View>
          </>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={() => setShowExercisePicker(true)}
            disabled={isDraggingList}
          >
            <Ionicons name="add" size={24} color="#007AFF" />
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </TouchableOpacity>
        }
        renderItem={renderExerciseItem}
        onDragBegin={() => {
          if (selectedExercises.length <= 1) return;
          setIsDraggingList(true);
        }}
        onDragEnd={({ data }) => {
          setIsDraggingList(false);
          setExtraTopPadding(0);
          handleReorderExercises(data);
          Haptics.selectionAsync(); // confirmation tap, same as ActiveWorkoutSheet
        }}
        onPlaceholderIndexChange={() => {
          Haptics.selectionAsync().catch(() => {});
        }}
        animationConfig={{
          stiffness: 400,
          damping: 50,
          mass: 0.2,
          overshootClamping: true,
          // @ts-ignore
          restSpeedThreshold: 0.05,
          restDisplacementThreshold: 0.05,
        }}
      />

      {/* Modals (unchanged) */}
      <ExercisePickerModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelectExercise={addExercise}
        onCreateNew={() => {
          setShowExercisePicker(false);
          setTimeout(() => setShowCreateExercise(true), 300);
        }}
      />

      <CreateExerciseModal
        visible={showCreateExercise}
        onClose={() => setShowCreateExercise(false)}
        onExerciseCreated={() => {}}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D1D6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  saveButtonDisabled: {
    backgroundColor: "#D1D1D6",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  saveButtonTextDisabled: {
    color: "#8E8E93",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  notesInput: {
    height: 80,
    textAlignVertical: "top",
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  exerciseCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  exerciseNameTouch: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
    flex: 1,
  },
  setsContainer: {
    marginBottom: 12,
  },
  addSetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  addSetText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    marginLeft: 6,
  },
  addExerciseButton: {
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#D1D1D6",
    borderStyle: "dashed",
  },
  addExerciseText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    marginLeft: 8,
  },
});
