import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";
import { useMultipleExercisesPreviousSets } from "../hooks/usePreviousSetValues";
import { useExercises } from "../store/exercisesStore";
import { useActiveWorkoutSheetUIStore } from "../store/workoutCompleteUIStore";
import { useWorkoutStore } from "../store/workoutStore";
import { useWorkouts } from "../store/workoutsStore";
import {
  Exercise,
  SetType,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
  getExerciseFields,
} from "../types";
import api from "../utils/api";
import Button from "./Button";
import CreateExerciseModal from "./CreateExerciseModal";
import ExerciseDetailModal from "./ExerciseDetailModal";
import ExercisePickerModal from "./ExercisePickerModal";
import SetRowInput, { SetHeader } from "./SetRowInput";
import SwipeToDeleteRow from "./SwipeToDeleteRow";

interface WorkoutSummaryData {
  name: string;
  date: Date;
  duration: number;
  totalVolume: number;
  prCount: number;
  exerciseCount: number;
  exercises: Array<{
    name: string;
    sets: number;
    bestSet: string;
  }>;
  workoutNumber: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const COLLAPSED_HEIGHT = 80;

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface ActiveWorkoutSheetProps {
  onFinishWorkout: () => void;
}

export default function ActiveWorkoutSheet({
  onFinishWorkout,
}: ActiveWorkoutSheetProps) {
  const insets = useSafeAreaInsets();

  const {
    activeWorkout,
    updateWorkout,
    updateWorkoutName,
    updateWorkoutNotes,
    endWorkout,
    workoutStartTime,
  } = useWorkoutStore();

  const {
    patch: patchWorkout,
    upsert: upsertWorkout,
    remove: removeWorkout,
    totalCount,
  } = useWorkouts();

  const activeWorkoutId = activeWorkout?.id;

  const exercises = activeWorkout?.exercises || [];

  const syncWorkoutPatch = (partial: Partial<WorkoutSession>) => {
    if (!activeWorkoutId) return;

    const nextName = partial.name ?? undefined;
    const nextNotes = partial.notes ?? undefined;
    const nextExercises = partial.exercises ?? exercises;

    updateWorkout(nextExercises, nextNotes, nextName);
    patchWorkout(activeWorkoutId, partial);
  };

  const syncExercises = (nextExercises: WorkoutExercise[]) => {
    if (!activeWorkoutId) return;

    updateWorkout(nextExercises);
    patchWorkout(activeWorkoutId, { exercises: nextExercises });
  };

  const syncName = (name: string) => {
    if (!activeWorkoutId) return;
    updateWorkoutName(name);
    patchWorkout(activeWorkoutId, { name });
  };

  const syncNotes = (notes: string | undefined) => {
    if (!activeWorkoutId) return;
    updateWorkoutNotes(notes);
    patchWorkout(activeWorkoutId, { notes });
  };

  const workoutName = activeWorkout?.name;
  const workoutNotes = activeWorkout?.notes;
  const [debouncedName] = useDebounce(workoutName, 800);
  const [debouncedNotes] = useDebounce(workoutNotes, 800);

  const { openWorkoutComplete, isExpanded, setIsExpanded } =
    useActiveWorkoutSheetUIStore();

  // Local imperative refs for gesture + animation; store is the source of truth
  const isExpandedRef = useRef<boolean>(false);

  const [showMenu, setShowMenu] = useState(false);
  const [showDescription, setShowDescription] = useState(
    !!activeWorkout?.notes
  );

  const elapsedSecondsRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null
  );

  const [isDraggingList, setIsDraggingList] = useState(false);
  const [extraTopPadding, setExtraTopPadding] = useState(0);

  const { byId: exercisesById, refetchById, upsert } = useExercises();

  // Scroll position for timer fade
  const scrollY = useRef(new Animated.Value(0)).current;

  const timerTopOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 40],
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
    [scrollY]
  );

  const mainTimerOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 40],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [scrollY]
  );

  const maxExpandedHeight = SCREEN_HEIGHT - insets.top - 85 - insets.bottom;

  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;

  const animateTo = useCallback(
    (nextExpanded: boolean) => {
      Animated.spring(animatedHeight, {
        toValue: nextExpanded ? maxExpandedHeight : COLLAPSED_HEIGHT,
        useNativeDriver: false,
        friction: 10,
      }).start();

      isExpandedRef.current = nextExpanded;

      // Reset scroll-driven fades when collapsing
      if (!nextExpanded) scrollY.setValue(0);
    },
    [animatedHeight, maxExpandedHeight, scrollY]
  );

  // Mount behavior: always paint collapsed first, then animate to store state
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;

    animatedHeight.setValue(COLLAPSED_HEIGHT);
    isExpandedRef.current = false;

    requestAnimationFrame(() => {
      animateTo(isExpanded);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store-driven animation for ANY external setIsExpanded calls
  const didSyncRef = useRef(false);
  useEffect(() => {
    // Skip first run; mount effect above handled the initial animation
    if (!didSyncRef.current) {
      didSyncRef.current = true;
      return;
    }
    animateTo(isExpanded);
  }, [isExpanded, animateTo]);

  // Pan responder uses ref (not store) to avoid stale closure during gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (!isExpandedRef.current && gestureState.dy < -20) {
          setIsExpanded(true);
        } else if (isExpandedRef.current && gestureState.dy > 20) {
          setIsExpanded(false);
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const expand = () => setIsExpanded(true);
  const collapse = () => setIsExpanded(false);
  const toggleExpand = () => setIsExpanded(!isExpanded);

  const listRef = useRef<typeof DraggableFlatList<WorkoutExercise> | null>(
    null
  );
  const itemRefs = useRef<Record<string, View | null>>({});

  useEffect(() => {
    if (!activeWorkout?.exercises?.length) return;
    for (const ex of activeWorkout.exercises) {
      if (!exercisesById[ex.exercise_id]) {
        refetchById(ex.exercise_id).catch(() => {});
      }
    }
  }, [activeWorkout?.exercises, exercisesById, refetchById]);

  const lastCommittedRef = useRef<{
    name: string | undefined;
    notes: string | undefined;
  }>({
    name: workoutName,
    notes: workoutNotes,
  });

  useEffect(() => {
    if (!activeWorkout) return;

    const prev = lastCommittedRef.current;
    if (debouncedName === prev.name && debouncedNotes === prev.notes) return;

    const commit = async () => {
      try {
        await api.put(`/workouts/${activeWorkout.id}`, {
          name: debouncedName,
          notes: debouncedNotes,
        });

        lastCommittedRef.current = {
          name: debouncedName,
          notes: debouncedNotes,
        };
      } catch (e) {
        console.error("Failed to save workout meta:", e);
      }
    };

    commit();
  }, [debouncedName, debouncedNotes, activeWorkout?.id]);

  const { previousMap, loadExercisePreviousSets } =
    useMultipleExercisesPreviousSets(
      activeWorkout?.exercises?.map(e => ({
        id: e.exercise_id,
        sets: e.sets,
      })) || []
    );

  const getDefaultRestTimer = () => 3 * 60;

  const handleShowExercisePicker = () => setShowExercisePicker(true);

  const handleAddExerciseToWorkout = async (exercise: Exercise) => {
    const previousSets = await loadExercisePreviousSets(exercise.id, true);
    const sets =
      !previousSets || previousSets.length === 0
        ? [
            {
              set_type: "normal" as SetType,
              rest_timer: getDefaultRestTimer(),
            },
          ]
        : previousSets.flatMap(s =>
            !s
              ? []
              : {
                  ...s,
                  rest_timer: s.rest_timer || getDefaultRestTimer(),
                }
          );

    const newExercise: WorkoutExercise = {
      exercise_id: exercise.id,
      order: exercises.length,
      sets,
    };

    syncExercises([...exercises, newExercise]);
    upsert(exercise);
    setShowExercisePicker(false);
  };

  const addSet = (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    const detail = exercisesById[exercise.exercise_id];
    const fields = getExerciseFields(detail?.exercise_kind || "Barbell");

    const newSet: WorkoutSet = {
      set_type: "normal",
      rest_timer: getDefaultRestTimer(),
    };

    if (fields.includes("weight")) newSet.weight = 0;
    if (fields.includes("reps")) newSet.reps = 0;
    if (fields.includes("distance")) newSet.distance = 0;
    if (fields.includes("duration")) newSet.duration = 0;
    if (fields.includes("calories")) newSet.calories = 0;

    const newExercises = [...exercises];
    newExercises[exerciseIndex] = {
      ...exercise,
      sets: [...exercise.sets, newSet],
    };

    syncExercises(newExercises);
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    fields: Partial<WorkoutSet>
  ) => {
    const newExercises = [...exercises];
    const oldExercise = newExercises[exerciseIndex];

    newExercises[exerciseIndex] = {
      ...oldExercise,
      sets: oldExercise.sets.map((set, i) =>
        i === setIndex ? { ...set, ...fields } : set
      ),
    };

    syncExercises(newExercises);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex),
    };
    syncExercises(newExercises);
  };

  const removeExercise = (exerciseIndex: number) => {
    const exerciseName =
      exercisesById[exercises[exerciseIndex]?.exercise_id]?.name ||
      "this exercise";

    Alert.alert(
      "Delete Exercise",
      `Are you sure you want to remove ${exerciseName} from this workout?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const newExercises = exercises.filter(
              (_, i) => i !== exerciseIndex
            );
            syncExercises(newExercises);
          },
        },
      ]
    );
  };

  const handleSaveAndFinish = async () => {
    if (!activeWorkout) return;

    let uncompletedSetCount = 0;
    exercises.forEach(ex => {
      ex.sets.forEach(set => {
        if (!set.completed) uncompletedSetCount++;
      });
    });

    if (uncompletedSetCount > 0) {
      Alert.alert(
        "Uncompleted Sets",
        `You have ${uncompletedSetCount} uncompleted set${
          uncompletedSetCount > 1 ? "s" : ""
        }. These will be removed. Are you sure you want to finish?`,
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes, Finish",
            style: "destructive",
            onPress: () => saveWorkout(true),
          },
        ]
      );
    } else {
      saveWorkout(false);
    }
  };

  const saveWorkout = async (removeUncompleted: boolean) => {
    if (!activeWorkout) return;

    let exercisesToSave = exercises;
    if (removeUncompleted) {
      exercisesToSave = exercises
        .map(ex => ({
          ...ex,
          sets: ex.sets.filter(set => set.completed),
        }))
        .filter(ex => ex.sets.length > 0);
    }

    try {
      setSaving(true);

      syncWorkoutPatch({
        exercises: exercisesToSave,
        name: activeWorkout.name,
        notes: activeWorkout.notes,
        ended_at: new Date().toISOString(),
      });

      const response = await api.put(`/workouts/${activeWorkout.id}`, {
        exercises: exercisesToSave,
        name: activeWorkout.name,
        notes: activeWorkout.notes,
        ended_at: new Date().toISOString(),
      });

      upsertWorkout(response.data as WorkoutSession);
      endWorkout();

      const workoutNumber = (totalCount || 0) + 1;

      const exerciseSummaries = exercisesToSave.map(ex => {
        const detail = exercisesById[ex.exercise_id];
        const sets = ex.sets;
        let bestSet = "";

        if (detail?.exercise_kind === "Cardio") {
          const bestDistanceSet = sets.reduce(
            (best, set) =>
              (set.distance || 0) > (best.distance || 0) ? set : best,
            sets[0] || ({} as any)
          );
          if (bestDistanceSet?.distance)
            bestSet = `${bestDistanceSet.distance} km`;
          else if (bestDistanceSet?.duration) {
            const mins = Math.floor((bestDistanceSet.duration || 0) / 60);
            bestSet = `${mins}m`;
          }
        } else if (
          detail?.exercise_kind &&
          ["Plank", "Static Hold"].includes(detail.exercise_kind)
        ) {
          const bestDurationSet = sets.reduce(
            (best, set) =>
              (set.duration || 0) > (best.duration || 0) ? set : best,
            sets[0] || ({} as any)
          );
          const mins = Math.floor((bestDurationSet?.duration || 0) / 60);
          const secs = (bestDurationSet?.duration || 0) % 60;
          bestSet = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        } else {
          const bestWeightSet = sets.reduce((best, set) => {
            const volume = (set.weight || 0) * (set.reps || 0);
            const bestVolume = (best.weight || 0) * (best.reps || 0);
            return volume > bestVolume ? set : best;
          }, sets[0] || ({} as any));

          if (bestWeightSet?.weight) {
            bestSet = `${bestWeightSet.weight} kg × ${bestWeightSet.reps || 0}`;
          } else if (bestWeightSet?.reps) {
            bestSet = `${bestWeightSet.reps} reps`;
          }
        }

        return {
          name: detail?.name || "Unknown Exercise",
          sets: sets.length,
          bestSet: bestSet || "-",
        };
      });

      let totalVolume = 0;
      exercisesToSave.forEach(ex => {
        ex.sets.forEach(set => {
          if (set.weight && set.reps) totalVolume += set.weight * set.reps;
        });
      });

      const summary: WorkoutSummaryData = {
        name: activeWorkout.name || "Workout",
        date: new Date(),
        duration: elapsedSecondsRef.current,
        totalVolume,
        prCount: 0,
        exerciseCount: exercises.length,
        exercises: exerciseSummaries,
        workoutNumber,
      };

      openWorkoutComplete(summary);
      collapse();
    } catch (error: any) {
      console.error("Save error:", error.response?.data || error);
      Alert.alert(
        "Error",
        error.response?.data?.detail || "Failed to save workout"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDescription = () => {
    if (showDescription) {
      syncNotes(undefined);
      setShowDescription(false);
    } else {
      setShowDescription(true);
    }
    setShowMenu(false);
  };

  const handleCancelWorkout = () => {
    if (activeWorkout?.planned_workout_id) {
      Alert.alert(
        "Cancel Scheduled Workout",
        "This is a scheduled workout. What would you like to do?",
        [
          { text: "Keep Training", style: "cancel" },
          {
            text: "Continue Later Today",
            onPress: () => {
              endWorkout();
              collapse();
            },
          },
          {
            text: "Cancel for Today",
            style: "destructive",
            onPress: async () => {
              try {
                syncWorkoutPatch({ skipped: true, exercises: [] });
                const res = await api.put(`/workouts/${activeWorkout.id}`, {
                  skipped: true,
                  exercises: [],
                });
                upsertWorkout(res.data);
              } catch (error) {
                console.error(
                  "Failed to update planned workout status:",
                  error
                );
              }
              endWorkout();
              collapse();
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Cancel Workout",
        "Are you sure you want to cancel this workout? All progress will be lost.",
        [
          { text: "Keep Workout", style: "cancel" },
          {
            text: "Cancel Workout",
            style: "destructive",
            onPress: async () => {
              try {
                if (activeWorkoutId) removeWorkout(activeWorkoutId);
                await api.delete(`/workouts/${activeWorkout?.id}`);
              } catch (error) {
                console.error("Failed to delete workout:", error);
              }
              endWorkout();
              collapse();
            },
          },
        ]
      );
    }
  };

  const handleReorderExercises = (data: WorkoutExercise[]) => {
    const reordered = data.map((ex, index) => ({ ...ex, order: index }));
    syncExercises(reordered);
  };

  if (!activeWorkout) return null;

  return (
    <>
      <Animated.View style={[styles.container, { height: animatedHeight }]}>
        <View {...panResponder.panHandlers}>
          <TouchableOpacity
            style={styles.collapsedHeader}
            onPress={toggleExpand}
            activeOpacity={0.9}
            disabled={isExpanded}
          >
            <View style={styles.dragHandle} />
            {!isExpanded ? (
              <View style={styles.collapsedContent}>
                <View style={styles.collapsedLeft}>
                  <Ionicons name="barbell" size={24} color="#007AFF" />
                  <Text style={styles.collapsedTitle} numberOfLines={1}>
                    {activeWorkout?.name || "Workout"}
                  </Text>
                </View>
                <View style={styles.collapsedRight}>
                  <View style={styles.timerBadge}>
                    <Ionicons name="time" size={16} color="#007AFF" />
                    <WorkoutElapsedTimerText
                      startTime={workoutStartTime}
                      onTick={secs => {
                        elapsedSecondsRef.current = secs;
                      }}
                      textStyle={styles.timerText}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.expandedTopBar}>
                <View style={{ flex: 1 }} />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.topBarTimerOverlay,
                    { opacity: timerTopOpacity },
                  ]}
                >
                  <WorkoutElapsedTimerText
                    startTime={workoutStartTime}
                    onTick={secs => {
                      elapsedSecondsRef.current = secs;
                    }}
                    textStyle={styles.topBarTimerText}
                  />
                </Animated.View>

                <TouchableOpacity
                  style={styles.finishButton}
                  onPress={handleSaveAndFinish}
                  disabled={saving || exercises.length === 0}
                >
                  <Text
                    style={[
                      styles.finishButtonText,
                      (saving || exercises.length === 0) &&
                        styles.finishButtonTextDisabled,
                    ]}
                  >
                    {saving ? "Saving..." : "Finish"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <DraggableFlatList
              ref={listRef as any}
              data={exercises || []}
              contentContainerStyle={{
                paddingTop: 4,
                paddingBottom: isDraggingList ? extraTopPadding : 32,
                paddingHorizontal: isDraggingList ? 0 : 20,
              }}
              keyExtractor={item => `${item.exercise_id}-${item.order}`}
              onScrollOffsetChange={offset => scrollY.setValue(offset)}
              scrollEventThrottle={16}
              ListHeaderComponentStyle={{ paddingLeft: 0 }}
              ListHeaderComponent={
                <View style={isDraggingList ? { paddingHorizontal: 20 } : {}}>
                  <View style={styles.nameRow}>
                    <Ionicons
                      name="barbell"
                      size={24}
                      color="#007AFF"
                      style={styles.nameBarbell}
                    />
                    <TextInput
                      style={styles.workoutNameInput}
                      value={activeWorkout?.name || ""}
                      onChangeText={syncName}
                      placeholder="Workout Name"
                      placeholderTextColor="#8E8E93"
                    />
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => setShowMenu(!showMenu)}
                    >
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={24}
                        color="#1C1C1E"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dateRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color="#8E8E93"
                    />
                    <Text style={styles.dateText}>
                      {new Date(
                        workoutStartTime || Date.now()
                      ).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                  </View>

                  <Animated.View
                    style={[styles.timerRow, { opacity: mainTimerOpacity }]}
                  >
                    <Ionicons name="time-outline" size={18} color="#007AFF" />
                    <WorkoutElapsedTimerText
                      startTime={workoutStartTime}
                      onTick={secs => {
                        elapsedSecondsRef.current = secs;
                      }}
                      textStyle={styles.timerTextLarge}
                    />
                  </Animated.View>

                  {showMenu && (
                    <View style={styles.menuDropdown}>
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={handleToggleDescription}
                      >
                        <Ionicons
                          name={
                            showDescription
                              ? "remove-circle-outline"
                              : "add-circle-outline"
                          }
                          size={20}
                          color="#1C1C1E"
                        />
                        <Text style={styles.menuItemText}>
                          {showDescription
                            ? "Remove Description"
                            : "Add Description"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {showDescription && (
                    <View style={styles.descriptionContainer}>
                      <TextInput
                        style={styles.descriptionInput}
                        value={activeWorkout?.notes || ""}
                        onChangeText={syncNotes}
                        placeholder="Add workout description..."
                        placeholderTextColor="#8E8E93"
                        multiline
                        numberOfLines={2}
                      />
                    </View>
                  )}
                </View>
              }
              ListFooterComponent={
                <View style={styles.footer}>
                  <Button
                    title="Add Exercise"
                    onPress={handleShowExercisePicker}
                    variant="tint"
                    style={styles.addExerciseButton}
                  />
                  <Button
                    variant="tint"
                    style={styles.cancelButton}
                    onPress={handleCancelWorkout}
                    title="Cancel Workout"
                    textStyle={styles.cancelButtonText}
                  />
                </View>
              }
              onDragBegin={() => setIsDraggingList(true)}
              onDragEnd={({ data }) => {
                setIsDraggingList(false);
                setExtraTopPadding(0);
                handleReorderExercises(data);
                Haptics.selectionAsync();
              }}
              onPlaceholderIndexChange={() => Haptics.selectionAsync()}
              animationConfig={{
                stiffness: 400,
                damping: 50,
                mass: 0.2,
                overshootClamping: true,
                // @ts-ignore
                restSpeedThreshold: 0.05,
                restDisplacementThreshold: 0.05,
              }}
              renderItem={({ item, drag, getIndex, isActive }) => {
                const index = getIndex?.();
                if (index == null) return null;

                const detail = exercisesById[item.exercise_id];
                const itemKey = `${item.exercise_id}-${item.order}`;
                const previousSetsForExercise = previousMap[item.exercise_id];

                return (
                  <ExerciseRow
                    item={item}
                    index={index}
                    isActive={!!isActive}
                    isDraggingList={isDraggingList}
                    detail={detail}
                    itemKey={itemKey}
                    previousSetsForExercise={previousSetsForExercise}
                    onDrag={drag}
                    listRef={listRef}
                    itemRefs={itemRefs}
                    setIsDraggingList={setIsDraggingList}
                    setExtraTopPadding={setExtraTopPadding}
                    removeExercise={removeExercise}
                    removeSet={removeSet}
                    updateSet={updateSet}
                    addSet={addSet}
                    setSelectedExercise={setSelectedExercise}
                    setShowExerciseDetail={setShowExerciseDetail}
                  />
                );
              }}
            />
          </View>
        )}
      </Animated.View>

      <ExercisePickerModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelectExercise={handleAddExerciseToWorkout}
        onCreateNew={() => {
          setShowExercisePicker(false);
          setTimeout(() => setShowCreateExercise(true), 300);
        }}
      />

      <CreateExerciseModal
        visible={showCreateExercise}
        onClose={() => setShowCreateExercise(false)}
        onExerciseCreated={(ex?: Exercise) => {
          if (ex) upsert(ex);
          setShowCreateExercise(false);
        }}
      />

      <ExerciseDetailModal
        visible={showExerciseDetail}
        exercise={selectedExercise}
        onClose={() => {
          setShowExerciseDetail(false);
          setSelectedExercise(null);
        }}
        onExerciseUpdated={(ex: Exercise) => {
          upsert(ex);
          setSelectedExercise(ex);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 60,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  collapsedHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D1D6",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  collapsedContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  collapsedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  collapsedTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  collapsedRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  timerText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#007AFF",
  },
  expandedTopBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  topBarTimerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarTimerText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1c1c1ed2",
  },
  expandedContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
  },
  nameBarbell: {
    marginRight: 12,
  },
  workoutNameInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "700",
    color: "#1C1C1E",
    padding: 0,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    gap: 8,
  },
  dateText: {
    fontSize: 15,
    color: "#8E8E93",
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 12,
    gap: 8,
  },
  timerTextLarge: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  menuButton: {
    padding: 4,
  },
  menuDropdown: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: "#1C1C1E",
  },
  descriptionContainer: {
    paddingVertical: 8,
  },
  descriptionInput: {
    fontSize: 15,
    color: "#3A3A3C",
    padding: 0,
    minHeight: 40,
  },
  finishButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  finishButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  finishButtonTextDisabled: {
    opacity: 0.5,
  },
  exerciseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 0,
    marginBottom: 16,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  exerciseNameContainer: {
    flex: 1,
  },
  exerciseNameClickable: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  exerciseMenuButton: {
    padding: 8,
  },
  setsContainer: {
    marginBottom: 0,
  },
  addSetButton: {
    backgroundColor: "#e9ebea",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 12,
  },
  addSetText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 6,
  },
  footer: {
    paddingHorizontal: 0,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
  },
  addExerciseButton: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
    minHeight: 0,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 0,
    minHeight: 0,
    backgroundColor: "#FF3B3015",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
  },
});

const WorkoutElapsedTimerText = React.memo(function WorkoutElapsedTimerText({
  startTime,
  onTick,
  textStyle,
}: {
  startTime?: any; // your workoutStartTime type (number/string) - keep loose
  onTick?: (seconds: number) => void;
  textStyle?: any;
}) {
  const [seconds, setSeconds] = useState(0);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!startTime) return;

    const startMs =
      typeof startTime === "string"
        ? new Date(startTime).getTime()
        : typeof startTime === "number"
        ? startTime
        : new Date(startTime).getTime();

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setSeconds(elapsed);
      onTickRef.current?.(elapsed);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return <Text style={textStyle}>{formatTime(seconds)}</Text>;
});

type ExerciseRowProps = {
  item: WorkoutExercise;
  index: number;
  isActive: boolean;
  isDraggingList: boolean;
  detail?: Exercise;
  itemKey: string;
  previousSetsForExercise?: any[]; // matches your previousMap shape
  onDrag: () => void;

  listRef: React.MutableRefObject<
    typeof DraggableFlatList<WorkoutExercise> | null
  >;
  itemRefs: React.MutableRefObject<Record<string, View | null>>;
  setIsDraggingList: (v: boolean) => void;
  setExtraTopPadding: (v: number) => void;

  removeExercise: (exerciseIndex: number) => void;
  removeSet: (exerciseIndex: number, setIndex: number) => void;
  updateSet: (
    exerciseIndex: number,
    setIndex: number,
    fields: Partial<WorkoutSet>
  ) => void;
  addSet: (exerciseIndex: number) => void;

  setSelectedExercise: (ex: Exercise | null) => void;
  setShowExerciseDetail: (v: boolean) => void;
};

const ExerciseRow = React.memo(function ExerciseRow({
  item,
  index,
  isActive,
  isDraggingList,
  detail,
  itemKey,
  previousSetsForExercise,
  onDrag,

  listRef,
  itemRefs,
  setIsDraggingList,
  setExtraTopPadding,

  removeExercise,
  removeSet,
  updateSet,
  addSet,

  setSelectedExercise,
  setShowExerciseDetail,
}: ExerciseRowProps) {
  const handleLongPress = useCallback(() => {
    setIsDraggingList(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    requestAnimationFrame(() => {
      const ref = itemRefs.current[itemKey];
      if (!ref) {
        onDrag();
        return;
      }

      ref.measure((x, y, width, height) => {
        setExtraTopPadding(index * height);

        setTimeout(() => {
          // @ts-ignore
          listRef.current?.scrollToOffset({
            offset: index * height,
            animated: false,
          } as any);
          onDrag();
        }, 0);
      });
    });
  }, [
    index,
    itemKey,
    itemRefs,
    listRef,
    onDrag,
    setExtraTopPadding,
    setIsDraggingList,
  ]);

  const isCompact = isDraggingList;

  return (
    <View
      ref={el => {
        itemRefs.current[itemKey] = el;
      }}
      style={[styles.exerciseCard, isDraggingList && { paddingHorizontal: 20 }]}
    >
      <View style={styles.exerciseHeader}>
        <TouchableOpacity
          style={styles.exerciseNameContainer}
          onPress={() => {
            if (!isDraggingList && detail) {
              setSelectedExercise(detail);
              setShowExerciseDetail(true);
            }
          }}
          onLongPress={handleLongPress}
          delayLongPress={150}
        >
          <Text
            style={[
              styles.exerciseNameClickable,
              isActive && {
                opacity: 0.95,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
              },
            ]}
          >
            {detail?.name ?? "Loading..."}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exerciseMenuButton}
          disabled={isDraggingList}
          onPress={() => {
            Alert.alert(
              detail?.name || "Exercise",
              "What would you like to do?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete Exercise",
                  style: "destructive",
                  onPress: () => removeExercise(index),
                },
              ]
            );
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {!isCompact && (
        <>
          {item.sets.length > 0 && (
            <View style={styles.setsContainer}>
              <SetHeader
                exerciseKind={detail?.exercise_kind || "Barbell"}
                showCompleteColumn
              />

              <View style={{ marginHorizontal: -20 }}>
                {item.sets.map((set, setIndex) => (
                  <SwipeToDeleteRow
                    key={setIndex}
                    onDelete={() => removeSet(index, setIndex)}
                  >
                    <SetRowInput
                      previousSetData={previousSetsForExercise?.[setIndex]}
                      exerciseId={item.exercise_id}
                      set={set}
                      setIndex={setIndex}
                      exerciseKind={detail?.exercise_kind || "Barbell"}
                      onUpdateSet={fields => updateSet(index, setIndex, fields)}
                      showCompleteButton
                    />
                  </SwipeToDeleteRow>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.addSetButton}
            onPress={() => addSet(index)}
          >
            <Ionicons name="add" size={20} color="" />
            <Text style={styles.addSetText}>Add Set</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
});
