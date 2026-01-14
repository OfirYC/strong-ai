import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useWorkout, useWorkouts } from "../store/workoutsStore";
import { useExercises } from "../store/exercisesStore";
import { useTemplatesStoreInternal } from "../store/templatesStore";
import {
  WorkoutSummary,
  WorkoutSession,
  WorkoutSet,
  WorkoutTemplate,
  formatDuration,
  formatWorkoutDuration,
  formatDurationMinutes,
  isDurationBased,
  usesWeight,
  ExerciseKind,
} from "../types";
import RoutineDetailModal from "../components/RoutineDetailModal";
import { usePRs } from "../store/prsStore";

interface ExerciseWithSets {
  exercise_id: string;
  name: string;
  exercise_kind: ExerciseKind;
  sets: WorkoutSet[];
  estimated_1rm?: number;
}
function safeParseISO(s?: string) {
  if (!s) return null;
  try {
    return parseISO(s);
  } catch {
    return null;
  }
}

function estimate1RM(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
}

function bestSetDisplay(args: {
  kind: ExerciseKind;
  bestWeight: number;
  bestReps: number;
  bestDuration: number;
}) {
  const { kind, bestWeight, bestReps, bestDuration } = args;

  if (kind === "Cardio" || kind === "Duration") {
    return bestDuration > 0 ? formatDuration(bestDuration) : "0:00";
  }

  if (kind === "Reps Only") {
    return bestReps > 0 ? `${bestReps} reps` : "-";
  }

  if (bestWeight > 0 && bestReps > 0) return `${bestWeight}kg × ${bestReps}`;
  if (bestReps > 0) return `${bestReps} reps`;
  return "-";
}

/**
 * Build WorkoutSummary purely client-side from:
 * - WorkoutSession
 * - PRRecord[] (filtered by workout_id)
 * - optional exercise lookup { [exercise_id]: { name, exercise_kind } }
 */
function computeWorkoutSummary(params: {
  workout: WorkoutSession;
  prs: { id: string }[]; // only need count
  exerciseLookup?: Record<
    string,
    { name?: string; exercise_kind?: ExerciseKind }
  >;
}): WorkoutSummary {
  const { workout, prs, exerciseLookup } = params;

  const started = safeParseISO(workout.started_at);
  const ended = safeParseISO(workout.ended_at);

  const duration_seconds =
    started && ended ? Math.max(0, Math.floor((+ended - +started) / 1000)) : 0;

  let set_count = 0;
  let total_volume_kg = 0;

  const exercises = workout.exercises.map(ex => {
    const exMeta = exerciseLookup?.[ex.exercise_id];
    const kind = (exMeta?.exercise_kind ?? "Barbell") as ExerciseKind;
    const name = exMeta?.name ?? "Unknown Exercise";

    set_count += ex.sets.length;

    let bestWeight = 0;
    let bestReps = 0;
    let bestDuration = 0;
    let bestE1RM = 0;

    for (const s of ex.sets) {
      const setType = s.set_type ?? "normal";
      if (setType === "warmup" || setType === "cooldown") continue;

      const weight = s.weight ?? 0;
      const reps = s.reps ?? 0;
      const duration = s.duration ?? 0;

      // Volume + 1RM
      if (weight > 0 && reps > 0) {
        total_volume_kg += weight * reps;

        const e1rm = estimate1RM(weight, reps);
        if (e1rm > bestE1RM) {
          bestE1RM = e1rm;
          bestWeight = weight;
          bestReps = reps;
        }
      }

      // Duration-based best
      if (duration > bestDuration) bestDuration = duration;

      // Reps-only best
      if (kind === "Reps Only" && reps > bestReps) bestReps = reps;
    }

    return {
      exercise_id: ex.exercise_id,
      name,
      exercise_kind: kind,
      set_count: ex.sets.length,
      best_set_display: bestSetDisplay({
        kind,
        bestWeight,
        bestReps,
        bestDuration,
      }),
      estimated_1rm: bestE1RM > 0 ? bestE1RM : undefined,
    };
  });

  return {
    id: workout.id,
    name: workout.name,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
    duration_seconds,
    exercise_count: workout.exercises.length,
    set_count,
    total_volume_kg,
    pr_count: prs.length,
    exercises,
  };
}

function computeExercisesWithSets(params: {
  workout: WorkoutSession;
  summary: WorkoutSummary;
}): ExerciseWithSets[] {
  const { workout, summary } = params;

  return workout.exercises.map(ex => {
    const sumEx = summary.exercises.find(s => s.exercise_id === ex.exercise_id);
    return {
      exercise_id: ex.exercise_id,
      name: sumEx?.name || "Unknown Exercise",
      exercise_kind: (sumEx?.exercise_kind || "Barbell") as ExerciseKind,
      sets: ex.sets,
      estimated_1rm: sumEx?.estimated_1rm,
    };
  });
}

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();

  const { workout, loading: workoutLoading } = useWorkout(workoutId);
  const { byId: prsById, getByWorkoutId: getPRsByWorkoutId, loading: prsLoading } = usePRs();
  const { byId: exercisesById, getAll: getAllExercises } = useExercises();

  useEffect(() => {
    if (!workoutId) return;
    getPRsByWorkoutId(workoutId, { minCount: 1 }).catch(() => {});
    getAllExercises({ minCount: 1 }).catch(() => {});
  }, [workoutId, getPRsByWorkoutId, getAllExercises]);

  const summary = useMemo(() => {
    if (!workout) return null;
    return computeWorkoutSummary({
      workout,
      prs: Object.values(prsById).filter(pr => pr.workout_id === workout.id),
      exerciseLookup: Object.fromEntries(
        Object.values(exercisesById).map(ex => [
          ex.id,
          { name: ex.name, exercise_kind: ex.exercise_kind },
        ])
      ),
    });
  }, [workout, exercisesById, prsById]);

  const [showFullDetail, setShowFullDetail] = useState(false);
  const [routine, setRoutine] = useState<WorkoutTemplate | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);

  const formatWorkoutDate = (dateStr: string): string => {
    const date = parseISO(dateStr);
    return format(date, "EEEE, d MMM yyyy — HH:mm");
  };

  const getEquipmentLabel = (kind: ExerciseKind): string => {
    switch (kind) {
      case "Barbell":
        return "Barbell";
      case "Dumbbell":
        return "Dumbbell";
      case "Machine/Other":
        return "Machine";
      case "Weighted Bodyweight":
        return "Weighted BW";
      case "Assisted Bodyweight":
        return "Assisted BW";
      case "Reps Only":
        return "Bodyweight";
      case "Duration":
        return "Timed";
      case "Cardio":
        return "Cardio";
      case "Weighted Cardio":
        return "Weighted Cardio";
      case "Weighted Duration":
        return "Weighted Timed";
      case "EMOM (Every Minute On The Minute)":
        return "EMOM";
      case "ETOT (Every Thirty Seconds on Thirty Seconds)":
        return "ETOT";
      default:
        return "";
    }
  };

  const exercisesWithSets = useMemo(() => {
    if (!workout || !summary) return [];
    return computeExercisesWithSets({ workout, summary });
  }, [workout, summary]);

  const renderPRBadge = (type: string) => (
    <View style={styles.prBadge} key={type}>
      <Text style={styles.prBadgeText}>{type}</Text>
    </View>
  );

  // Helper to format pace (min:sec per km)
  const formatPace = (durationSeconds: number, distanceKm: number): string => {
    if (distanceKm <= 0) return "--:--";
    const paceSeconds = durationSeconds / distanceKm;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const renderSetValue = (
    set: WorkoutSet,
    kind: ExerciseKind,
    index: number
  ) => {
    const isDuration = isDurationBased(kind);
    const hasWeight = usesWeight(kind);
    const isCardio = kind === "Cardio";

    // Collect PR badges
    const badges: string[] = [];
    if (set.is_weight_pr) badges.push("WEIGHT");
    if (set.is_reps_pr) badges.push("REPS");
    if (set.is_volume_pr) badges.push("VOL.");
    if (set.is_duration_pr) badges.push("DURATION");

    // Cardio: show distance, time, and pace
    if (isCardio) {
      const duration = set.duration || 0;
      const distance = set.distance || 0;
      const pace = formatPace(duration, distance);

      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <View style={styles.cardioSetValue}>
            {distance > 0 && <Text style={styles.setValue}>{distance} km</Text>}
            <Text style={styles.setValueSecondary}>
              {formatDuration(duration)}
            </Text>
            {distance > 0 && <Text style={styles.setValuePace}>{pace}/km</Text>}
          </View>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    } else if (isDuration) {
      // Duration only (non-cardio timed exercises like planks)
      const duration = set.duration || 0;
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <Text style={styles.setValue}>{formatDuration(duration)}</Text>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    } else if (hasWeight && set.weight && set.weight > 0) {
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <Text style={styles.setValue}>
            {set.weight} kg × {set.reps || 0}
          </Text>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    } else {
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <Text style={styles.setValue}>{set.reps || 0} reps</Text>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    }
  };

  if (workoutLoading || prsLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Workout not found</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBackButton}
        >
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Section */}
        <View style={styles.summarySection}>
          <Text style={styles.workoutTitle}>{summary.name || "Workout"}</Text>
          <Text style={styles.workoutDate}>
            {formatWorkoutDate(summary.started_at)}
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={20} color="#007AFF" />
              <Text style={styles.metricValue}>
                {formatWorkoutDuration(summary.duration_seconds)}
              </Text>
            </View>

            <View style={styles.metricItem}>
              <Ionicons name="barbell-outline" size={20} color="#007AFF" />
              <Text style={styles.metricValue}>
                {Math.round(summary.total_volume_kg)} kg
              </Text>
            </View>

            <View style={styles.metricItem}>
              <Ionicons name="trophy-outline" size={20} color="#FFD700" />
              <Text style={styles.metricValue}>{summary.pr_count} PRs</Text>
            </View>
          </View>

          {/* View Routine Button */}
          {routine && (
            <TouchableOpacity
              style={styles.viewRoutineButton}
              onPress={() => setShowRoutineModal(true)}
            >
              <Ionicons name="list-outline" size={20} color="#007AFF" />
              <Text style={styles.viewRoutineText}>View Routine</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Exercise Summary List (2-column) */}
        <View style={styles.exercisesSummarySection}>
          <Text style={styles.sectionTitle}>Exercises</Text>

          <View style={styles.summaryTable}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Exercise</Text>
              <Text style={styles.tableHeaderText}>Best Set</Text>
            </View>

            {summary.exercises.map((ex, idx) => (
              <View key={ex.exercise_id + idx} style={styles.summaryRow}>
                <Text style={styles.exerciseName} numberOfLines={1}>
                  {ex.set_count} × {ex.name}
                </Text>
                <Text style={styles.bestSet}>{ex.best_set_display}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Toggle Full Detail */}
        <TouchableOpacity
          style={styles.toggleDetailButton}
          onPress={() => setShowFullDetail(!showFullDetail)}
        >
          <Text style={styles.toggleDetailText}>
            {showFullDetail ? "Hide Set Details" : "Show Set Details"}
          </Text>
          <Ionicons
            name={showFullDetail ? "chevron-up" : "chevron-down"}
            size={20}
            color="#007AFF"
          />
        </TouchableOpacity>

        {/* Full Exercise Detail */}
        {showFullDetail && (
          <View style={styles.fullDetailSection}>
            {exercisesWithSets.map((exercise, exIdx) => (
              <View
                key={exercise.exercise_id + exIdx}
                style={styles.exerciseCard}
              >
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseTitleContainer}>
                    <Text style={styles.exerciseTitle}>{exercise.name}</Text>
                    <Text style={styles.exerciseEquipment}>
                      ({getEquipmentLabel(exercise.exercise_kind)})
                    </Text>
                  </View>
                  {exercise.estimated_1rm && exercise.estimated_1rm > 0 && (
                    <Text style={styles.oneRmText}>
                      1RM: {Math.round(exercise.estimated_1rm)} kg
                    </Text>
                  )}
                </View>

                <View style={styles.setsContainer}>
                  {exercise.sets.map((set, setIdx) => (
                    <View key={setIdx}>
                      {renderSetValue(set, exercise.exercise_kind, setIdx)}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Routine Detail Modal */}
      <RoutineDetailModal
        visible={showRoutineModal}
        routine={routine}
        onClose={() => setShowRoutineModal(false)}
        onRoutineEdited={setRoutine}
        onStartWorkout={routine => {
          setShowRoutineModal(false);
          // Navigate to workout tab to start workout from this routine
          router.push({
            pathname: "/(tabs)/workout",
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#8E8E93",
    marginBottom: 16,
  },
  backButton: {
    padding: 12,
    backgroundColor: "#007AFF",
    borderRadius: 8,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    // backgroundColor: "#FFFFFF",
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  summarySection: {
    // backgroundColor: "#FFFFFF",
    padding: 20,
    marginBottom: 8,
  },
  workoutTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  workoutDate: {
    fontSize: 15,
    color: "#8E8E93",
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  metricItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  viewRoutineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F0FF",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  viewRoutineText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#007AFF",
  },
  exercisesSummarySection: {
    // backgroundColor: "#FFFFFF",
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  summaryTable: {
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  exerciseName: {
    fontSize: 15,
    color: "#1C1C1E",
    flex: 1,
    marginRight: 12,
  },
  bestSet: {
    fontSize: 15,
    color: "#8E8E93",
    fontWeight: "500",
  },
  toggleDetailButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    // backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    marginBottom: 8,
    gap: 8,
  },
  toggleDetailText: {
    fontSize: 15,
    color: "#007AFF",
    fontWeight: "500",
  },
  fullDetailSection: {
    // backgroundColor: "#FFFFFF",
    padding: 16,
  },
  exerciseCard: {
    marginBottom: 24,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  exerciseTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  exerciseTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  exerciseEquipment: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 2,
  },
  oneRmText: {
    fontSize: 13,
    color: "#007AFF",
    fontWeight: "500",
  },
  setsContainer: {
    gap: 8,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  setIndex: {
    width: 24,
    fontSize: 15,
    color: "#8E8E93",
    fontWeight: "500",
  },
  setValue: {
    fontSize: 15,
    color: "#1C1C1E",
    fontWeight: "500",
    flex: 1,
  },
  cardioSetValue: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  setValueSecondary: {
    fontSize: 14,
    color: "#8E8E93",
    fontWeight: "500",
  },
  setValuePace: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },
  badgesContainer: {
    flexDirection: "row",
    gap: 6,
  },
  prBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  bottomSpacer: {
    height: 100,
  },
});
