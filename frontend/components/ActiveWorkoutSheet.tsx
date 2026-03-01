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
  Easing,
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
import {
  startWorkoutLiveActivity,
  stopWorkoutLiveActivity,
  updateWorkoutLiveActivity,
  WorkoutLiveModel,
} from "../utils/liveActivity";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IOS_PANEL_EASING } from "../utils/animation";

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
    endWorkout: _endWorkout,
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
    !!activeWorkout?.notes,
  );

  const elapsedSecondsRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
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
    [scrollY],
  );

  const mainTimerOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 40],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [scrollY],
  );

  const maxExpandedHeight = SCREEN_HEIGHT - insets.top - 85 - insets.bottom;
  const collapsedTranslateY = maxExpandedHeight - COLLAPSED_HEIGHT;
  const translateY = useRef(new Animated.Value(collapsedTranslateY)).current;

  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;

  const animateTo = useCallback(
    (nextExpanded: boolean) => {
      Animated.timing(translateY, {
        toValue: nextExpanded ? 0 : collapsedTranslateY,
        duration: 320, // try 280–360
        easing: IOS_PANEL_EASING,
        useNativeDriver: true,
      }).start(() => {
        // Your original side effects
        isExpandedRef.current = nextExpanded;
        if (!nextExpanded) scrollY.setValue(0);
      });

      isExpandedRef.current = nextExpanded;
    },
    [translateY, collapsedTranslateY, scrollY],
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
    }),
  ).current;

  const expand = () => setIsExpanded(true);
  const collapse = () => setIsExpanded(false);
  const toggleExpand = () => setIsExpanded(!isExpanded);

  const listRef = useRef<typeof DraggableFlatList<WorkoutExercise> | null>(
    null,
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
      })) || [],
    );

  /* -------------------------------------------------------------------------- */
  /*                              LIVE ACTIVITY                                 */
  /* -------------------------------------------------------------------------- */
  const endWorkout = useCallback(() => {
    _endWorkout();
  }, [_endWorkout]);

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
                },
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
    fields: Partial<WorkoutSet>,
  ) => {
    const prevSet = exercises[exerciseIndex]?.sets?.[setIndex];
    const wasCompleted = !!prevSet?.completed;

    const newExercises = [...exercises];
    const oldExercise = newExercises[exerciseIndex];

    newExercises[exerciseIndex] = {
      ...oldExercise,
      sets: oldExercise.sets.map((set, i) =>
        i === setIndex ? { ...set, ...fields } : set,
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
              (_, i) => i !== exerciseIndex,
            );
            syncExercises(newExercises);
          },
        },
      ],
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
        ],
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
            sets[0] || ({} as any),
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
            sets[0] || ({} as any),
          );
          const mins = Math.floor((bestDurationSet?.duration || 0) / 60);
          const secs = (bestDurationSet?.duration || 0) % 60;
          bestSet = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        } else {
          const bestWeightSet = sets.reduce(
            (best, set) => {
              const volume = (set.weight || 0) * (set.reps || 0);
              const bestVolume = (best.weight || 0) * (best.reps || 0);
              return volume > bestVolume ? set : best;
            },
            sets[0] || ({} as any),
          );

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
        error.response?.data?.detail || "Failed to save workout",
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
                  error,
                );
              }
              endWorkout();
              collapse();
            },
          },
        ],
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
        ],
      );
    }
  };

  const handleReorderExercises = (data: WorkoutExercise[]) => {
    const reordered = data.map((ex, index) => ({ ...ex, order: index }));
    syncExercises(reordered);
  };

  const { stopNow, getActivityId } = useWorkoutLiveActivity({
    activeWorkoutId: activeWorkout?.id || null,
    workoutStartTime: workoutStartTime || null,
    exercises: activeWorkout?.exercises || [],
    exercisesById,
    workoutName: activeWorkout?.name || "",
  });

  if (!activeWorkout) return null;

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            height: maxExpandedHeight,
            transform: [{ translateY }],
          },
        ]}
      >
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
                <View style={styles.topBarLeft} />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.topBarCenter, { opacity: timerTopOpacity }]}
                >
                  <WorkoutElapsedTimerText
                    startTime={workoutStartTime}
                    onTick={secs => {
                      elapsedSecondsRef.current = secs;
                    }}
                    textStyle={styles.topBarTimerText}
                  />
                </Animated.View>

                <View style={styles.topBarRight}>
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
              </View>
            )}
          </TouchableOpacity>
        </View>

        {
          <View style={styles.expandedContent}>
            <DraggableFlatList
              initialNumToRender={6}
              windowSize={7}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={16}
              removeClippedSubviews
              ref={listRef as any}
              data={exercises || []}
              contentContainerStyle={{
                paddingTop: 4,
                paddingBottom: isDraggingList ? extraTopPadding : 32,
                paddingHorizontal: isDraggingList ? 0 : 20,
              }}
              keyExtractor={item => `${item.exercise_id}-${item.order}`}
              onScrollOffsetChange={offset => {
                scrollY.setValue(offset);
              }}
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
                        workoutStartTime || Date.now(),
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
        }
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
    paddingVertical: 10,
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
    paddingHorizontal: 0, // ← important
    height: 44, // ← lock row height
  },

  topBarLeft: {
    flex: 1,
  },

  topBarCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  topBarRight: {
    marginLeft: "auto", // ensures right alignment
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
    fields: Partial<WorkoutSet>,
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
              ],
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

export type ExercisesById = Record<string, Exercise>;

export type UseWorkoutLiveActivityArgs = {
  activeWorkoutId: string | null;

  workoutName?: string;

  workoutStartTime: number | string | Date | null | undefined;

  exercises: WorkoutExercise[];
  exercisesById: ExercisesById;

  minIntervalMs?: number; // throttle interval (default 2000)
};

export type UseWorkoutLiveActivityReturn = {
  stopNow: () => void;
  getActivityId: () => string | null;
};

export function useWorkoutLiveActivity(
  args: UseWorkoutLiveActivityArgs,
): UseWorkoutLiveActivityReturn {
  const {
    activeWorkoutId,
    workoutName,
    workoutStartTime,
    exercises,
    exercisesById,
    minIntervalMs = 2000,
  } = args;

  const STORAGE_KEY = "live_activity_id_v1";

  const liveActivityIdRef = useRef<string | null>(null);
  const hasHydratedRef = useRef(false);
  const restartingRef = useRef(false);

  const lastUpdateAtRef = useRef<number>(0);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const restKeyRef = useRef<string | null>(null);
  const restEndAtRef = useRef<number | null>(null);
  const restStartAtRef = useRef<number | null>(null);
  const restTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevExercisesRef = useRef<WorkoutExercise[]>(exercises);

  /* ------------------------------------------------------------- */
  /*                        Start Time                             */
  /* ------------------------------------------------------------- */

  const getStartedAtMs = useCallback((): number => {
    if (!workoutStartTime) return Date.now();
    if (typeof workoutStartTime === "number") return workoutStartTime;
    if (typeof workoutStartTime === "string")
      return new Date(workoutStartTime).getTime();
    return workoutStartTime instanceof Date
      ? workoutStartTime.getTime()
      : Date.now();
  }, [workoutStartTime]);

  /* ------------------------------------------------------------- */
  /*                   Derived Workout State                       */
  /* ------------------------------------------------------------- */

  const derived = useMemo(() => {
    let totalSets = 0;
    let completedSets = 0;

    let currentExerciseId: string | undefined;
    let currentSetIndex: number | undefined;

    for (const ex of exercises) {
      totalSets += ex.sets.length;

      for (let i = 0; i < ex.sets.length; i++) {
        const set = ex.sets[i];

        if (set.completed) {
          completedSets++;
        } else if (!currentExerciseId) {
          currentExerciseId = ex.exercise_id;
          currentSetIndex = i;
        }
      }
    }

    return {
      totalSets,
      completedSets,
      currentExerciseId,
      currentSetIndex,
    };
  }, [exercises]);

  /* ------------------------------------------------------------- */
  /*                       Model Builder                           */
  /* ------------------------------------------------------------- */

  const buildModel = useCallback((): WorkoutLiveModel => {
    const { totalSets, completedSets, currentExerciseId, currentSetIndex } =
      derived;

    let currentExerciseName: string | undefined;
    let currentWeight: number | undefined;
    let currentReps: number | undefined;
    let currentDurationSeconds: number | undefined;
    let currentDistanceKm: number | undefined;

    if (currentExerciseId && typeof currentSetIndex === "number") {
      const ex = exercises.find(e => e.exercise_id === currentExerciseId);
      const set = ex?.sets[currentSetIndex];

      const detail = exercisesById[currentExerciseId];
      const fields = getExerciseFields(detail?.exercise_kind);

      currentExerciseName = detail?.name;

      if (fields.includes("weight")) currentWeight = set?.weight;
      if (fields.includes("reps")) currentReps = set?.reps;
      if (fields.includes("duration")) currentDurationSeconds = set?.duration;
      if (fields.includes("distance")) currentDistanceKm = set?.distance;
    }

    return {
      workoutName: workoutName || "Workout",
      timerStartDateInMilliseconds: getStartedAtMs(),
      workoutStartTimeMs: getStartedAtMs(),
      exerciseCount: exercises.length,
      totalSets,
      completedSets,
      currentExerciseName,
      currentSet:
        typeof currentSetIndex === "number"
          ? currentSetIndex + 1 // convert 0-based index → human 1-based
          : undefined,
      restEndAtMs: restEndAtRef.current ?? undefined,
      restStartedAtMs: restStartAtRef.current ?? undefined,
      currentWeight,
      currentReps,
      currentDurationSeconds,
      currentDistanceKm,
    };
  }, [derived, exercises, exercisesById, workoutName, getStartedAtMs]);

  /* ------------------------------------------------------------- */
  /*                       Throttled Update                        */
  /* ------------------------------------------------------------- */

  const sendUpdate = useCallback(
    (immediate: boolean = false) => {
      const id = liveActivityIdRef.current;
      if (!id) return;

      const run = () => {
        lastUpdateAtRef.current = Date.now();
        updateWorkoutLiveActivity(id, buildModel()).catch(async e => {
          if (restartingRef.current) return;
          restartingRef.current = true;

          const ACTIVITY_NOT_FOUND_ERROR_CODE = "ERR_ACTIVITY_NOT_FOUND";
          if (
            e instanceof Error &&
            (e as any).code === ACTIVITY_NOT_FOUND_ERROR_CODE
          ) {
            console.log(
              "Found dismissed live activity, clearing ID and starting a new one if workout is active",
            );
            await AsyncStorage.removeItem(STORAGE_KEY);

            if (activeWorkoutId) {
              const newId = await startWorkoutLiveActivity(buildModel());
              if (newId) {
                liveActivityIdRef.current = newId;
                await AsyncStorage.setItem(STORAGE_KEY, newId);
              }
            }
          }

          restartingRef.current = false;
        });
      };

      if (immediate) {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        run();
        return;
      }

      const now = Date.now();
      const elapsed = now - lastUpdateAtRef.current;
      const wait = Math.max(0, minIntervalMs - elapsed);

      if (updateTimeoutRef.current) return;

      updateTimeoutRef.current = setTimeout(() => {
        updateTimeoutRef.current = null;
        run();
      }, wait);
    },
    [buildModel, minIntervalMs],
  );

  /* ------------------------------------------------------------- */
  /*                     Hydrate persisted ID                      */
  /* ------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storedId = await AsyncStorage.getItem(STORAGE_KEY);
      if (cancelled) return;

      if (storedId) {
        liveActivityIdRef.current = storedId;
      }

      hasHydratedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------- */
  /*                Start / Stop Reconciliation                    */
  /* ------------------------------------------------------------- */

  useEffect(() => {
    if (!hasHydratedRef.current) return;

    let cancelled = false;

    (async () => {
      // START
      if (activeWorkoutId && !liveActivityIdRef.current) {
        const id = await startWorkoutLiveActivity(buildModel());
        if (cancelled) return;
        if (id) {
          liveActivityIdRef.current = id;
          await AsyncStorage.setItem(STORAGE_KEY, id);
        }

        return;
      }

      // STOP
      if (!activeWorkoutId && liveActivityIdRef.current) {
        const id = liveActivityIdRef.current;

        await stopWorkoutLiveActivity(id).catch(() => {});
        liveActivityIdRef.current = null;
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWorkoutId, buildModel]);

  /* ------------------------------------------------------------- */
  /*                Exercise Diff + Rest Handling                  */
  /* ------------------------------------------------------------- */

  useEffect(() => {
    if (!liveActivityIdRef.current) {
      prevExercisesRef.current = exercises;
      return;
    }

    const prev = prevExercisesRef.current;
    prevExercisesRef.current = exercises;

    let triggeredRestKey: string | null = null;
    let triggeredRestSeconds: number | null = null;
    let sawUncomplete = false;

    for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
      const nextEx = exercises[exIdx];
      const prevEx = prev.find(e => e.exercise_id === nextEx.exercise_id);

      const nextSets = nextEx?.sets ?? [];
      const prevSets = prevEx?.sets ?? [];

      const minLen = Math.min(nextSets.length, prevSets.length);

      for (let i = 0; i < minLen; i++) {
        const was = !!prevSets[i]?.completed;
        const now = !!nextSets[i]?.completed;

        const key = `${nextEx.exercise_id}:${i}`;

        if (was && !now && restKeyRef.current === key) {
          sawUncomplete = true;
        }

        if (!was && now && triggeredRestKey == null) {
          triggeredRestKey = key;
          triggeredRestSeconds = nextSets[i]?.rest_timer ?? 0;
        }
      }
    }

    if (sawUncomplete) {
      if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);
      restTimeoutRef.current = null;
      restKeyRef.current = null;
      restEndAtRef.current = null;
      restStartAtRef.current = null;
      sendUpdate(true);
      return;
    }

    if (triggeredRestKey && triggeredRestSeconds && triggeredRestSeconds > 0) {
      if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);

      const now = Date.now();
      restKeyRef.current = triggeredRestKey;
      restStartAtRef.current = now;
      restEndAtRef.current = now + triggeredRestSeconds * 1000;

      sendUpdate(true);

      restTimeoutRef.current = setTimeout(() => {
        restTimeoutRef.current = null;
        restKeyRef.current = null;
        restEndAtRef.current = null;
        restStartAtRef.current = null;
        sendUpdate(true);
      }, triggeredRestSeconds * 1000);

      return;
    }

    sendUpdate(false);
  }, [exercises, sendUpdate]);

  /* ------------------------------------------------------------- */
  /*                     Metadata Updates                          */
  /* ------------------------------------------------------------- */

  useEffect(() => {
    if (!liveActivityIdRef.current) return;
    sendUpdate(true);
  }, [workoutName, sendUpdate]);

  /* ------------------------------------------------------------- */
  /*                          Cleanup                              */
  /* ------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);
    };
  }, []);

  const stopNow = useCallback(async () => {
    const id = liveActivityIdRef.current;
    if (!id) return;

    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);

    restKeyRef.current = null;
    restEndAtRef.current = null;
    restStartAtRef.current = null;

    await stopWorkoutLiveActivity(id).catch(() => {});
    liveActivityIdRef.current = null;
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    stopNow,
    getActivityId: () => liveActivityIdRef.current,
  };
}
