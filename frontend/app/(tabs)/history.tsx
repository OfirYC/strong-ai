import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { useRouter } from "expo-router";
import { LoadingData } from "../../components/LoadingData";
import type {
  WorkoutSession,
  WorkoutSummary,
  ExerciseKind,
  WorkoutExerciseSummary,
} from "../../types";
import { formatDuration } from "../../types";
import { useWorkouts } from "../../store/workoutsStore";
import { useExercises } from "../../store/exercisesStore";
import { usePRs } from "../../store/prsStore";

interface GroupedWorkouts {
  title: string;
  date: string;
  data: WorkoutSummary[];
}

// ------------------ local summary compute ------------------
const estimate1RM_Brzycki = (weight: number, reps: number) => {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
};

const bestSetDisplay = (
  kind: ExerciseKind,
  best: { w: number; r: number; d: number }
) => {
  if (kind === "Cardio" || kind === "Duration") {
    return best.d > 0 ? formatDuration(best.d) : "0:00";
  }
  if (kind === "Reps Only") {
    return best.r > 0 ? `${best.r} reps` : "-";
  }
  if (best.w > 0 && best.r > 0) return `${best.w}kg × ${best.r}`;
  if (best.r > 0) return `${best.r} reps`;
  return "-";
};

function computeWorkoutSummaryFromSession(args: {
  session: WorkoutSession;
  exercisesById: Record<string, any>;
}): WorkoutSummary {
  const { session, exercisesById } = args;

  const started = new Date(session.started_at);
  const ended = session.ended_at ? new Date(session.ended_at) : null;

  const duration_seconds =
    ended && !Number.isNaN(+ended) && !Number.isNaN(+started)
      ? Math.max(0, Math.floor((+ended - +started) / 1000))
      : 0;

  let set_count = 0;
  let total_volume_kg = 0;

  const exercises: WorkoutExerciseSummary[] = (session.exercises ?? []).map(
    ex => {
      const meta = exercisesById[ex.exercise_id];
      const name = meta?.name ?? "Unknown Exercise";
      const kind = (meta?.exercise_kind ?? "Barbell") as ExerciseKind;

      set_count += (ex.sets ?? []).length;

      let best = { w: 0, r: 0, d: 0 };
      let bestE1RM = 0;

      for (const s of ex.sets ?? []) {
        const setType = s.set_type ?? "normal";
        if (setType === "warmup" || setType === "cooldown") continue;

        const w = s.weight ?? 0;
        const r = s.reps ?? 0;
        const d = s.duration ?? 0;

        if (w > 0 && r > 0) total_volume_kg += w * r;

        const e1rm = estimate1RM_Brzycki(w, r);
        if (e1rm > bestE1RM) {
          bestE1RM = e1rm;
          best.w = w;
          best.r = r;
        }

        if (d > best.d) best.d = d;
        if (kind === "Reps Only" && r > best.r) best.r = r;
      }

      return {
        exercise_id: ex.exercise_id,
        name,
        exercise_kind: kind,
        set_count: (ex.sets ?? []).length,
        best_set_display: bestSetDisplay(kind, best),
        estimated_1rm: bestE1RM > 0 ? bestE1RM : undefined,
      };
    }
  );

  return {
    id: session.id,
    name: session.name,
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_seconds,
    exercise_count: (session.exercises ?? []).length,
    set_count,
    total_volume_kg,
    pr_count: 0,
    exercises,
  };
}
// ----------------------------------------------------------

export default function HistoryScreen() {
  const router = useRouter();

  const PAGE_SIZE = 50;

  // Workouts store (canonical sessions cache + paging)
  const {
    historySessions,
    ensureNextPage, // assumes you added this to the hook as discussed
    ensureCount,
    hasMore, // optional but recommended
    loading: workoutsLoading,
    clear, // optional, only if you want full reset on refresh
  } = useWorkouts();

  // Needed to compute summaries locally (names/kinds + PR counts)
  const { byId: exercisesById, getAll: getAllExercises } = useExercises();

  const [refreshing, setRefreshing] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // initial boot: load supporting caches + first page
  useEffect(() => {
    let cancelled = false;

    if (historySessions.length > 0) {
      setBootLoading(false);
      return;
    }

    (async () => {
      try {
        setBootLoading(true);

        // load first page
        await ensureNextPage({ pageSize: PAGE_SIZE });
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureCount, getAllExercises, ensureNextPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Optional: full reset then reload page 1
      // If you don't want to clear cache globally, remove these two lines
      clear?.();

      await Promise.all([
        ensureCount({ force: true }).catch(() => {}),
        getAllExercises().catch(() => {}),
      ]);

      await ensureNextPage({ pageSize: PAGE_SIZE });
    } finally {
      setRefreshing(false);
    }
  }, [clear, ensureCount, getAllExercises, ensureNextPage]);

  const onEndReached = useCallback(async () => {
    if (loadingMore) return;
    if (hasMore === false) return;

    setLoadingMore(true);
    try {
      await ensureNextPage({ pageSize: PAGE_SIZE });
    } finally {
      setLoadingMore(false);
    }
  }, [ensureNextPage, loadingMore, hasMore]);

  // Convert cached sessions -> WorkoutSummary[] for UI
  const workouts = useMemo(() => {
    return historySessions.map(session =>
      computeWorkoutSummaryFromSession({
        session,
        exercisesById,
      })
    );
  }, [historySessions, exercisesById]);

  // Group workouts by date
  const groupedWorkouts = useMemo((): GroupedWorkouts[] => {
    const groups: { [key: string]: WorkoutSummary[] } = {};

    workouts.forEach(workout => {
      const date = format(parseISO(workout.started_at), "yyyy-MM-dd");
      if (!groups[date]) groups[date] = [];
      groups[date].push(workout);
    });

    return Object.entries(groups).map(([date, data]) => {
      const parsedDate = parseISO(date);
      let title: string;

      if (isToday(parsedDate)) title = "Today";
      else if (isYesterday(parsedDate)) title = "Yesterday";
      else title = format(parsedDate, "EEEE, MMM d, yyyy");

      return { title, date, data };
    });
  }, [workouts]);

  const formatDurationMinutes = (seconds: number): string => {
    const totalMins = Math.round(seconds / 60);
    if (totalMins < 60) return `${totalMins}m`;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours}h ${mins.toString().padStart(2, "0")}m`;
  };

  const formatVolume = (kg: number): string => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
    return `${Math.round(kg)}`;
  };

  const handleWorkoutPress = (workout: WorkoutSummary) => {
    router.push({
      pathname: "/workout-detail",
      params: { workoutId: workout.id },
    });
  };

  const renderWorkoutCard = ({ item }: { item: WorkoutSummary }) => {
    const startTime = format(parseISO(item.started_at), "h:mm a");

    return (
      <TouchableOpacity
        style={styles.workoutCard}
        onPress={() => handleWorkoutPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.workoutName} numberOfLines={1}>
              {item.name || "Workout"}
            </Text>
          </View>
          <Text style={styles.workoutTime}>{startTime}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="barbell-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>{item.exercise_count} exercises</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="layers-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>{item.set_count} sets</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="fitness-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>
              {formatVolume(item.total_volume_kg)} vol
            </Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>
              {formatDurationMinutes(item.duration_seconds)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: GroupedWorkouts }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  const showEmptyLoading = bootLoading || workoutsLoading;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      <SectionList
        sections={groupedWorkouts}
        keyExtractor={item => item.id}
        renderItem={renderWorkoutCard}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoading}>
              <LoadingData loadingTitle="Loading more..." />
            </View>
          ) : null
        }
        ListEmptyComponent={
          showEmptyLoading ? (
            <LoadingData loadingTitle="Loading Workouts..." />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={64} color="#C7C7CC" />
              <Text style={styles.emptyText}>No workouts yet</Text>
              <Text style={styles.emptySubtext}>
                Complete your first workout to see it here
              </Text>
            </View>
          )
        }
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 32, fontWeight: "bold", color: "#1C1C1E" },

  listContent: { paddingHorizontal: 20, paddingBottom: 100 },

  sectionHeader: { paddingTop: 16, paddingBottom: 8 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6E6E73",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  workoutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitleContainer: { flex: 1, marginRight: 12 },
  workoutName: { fontSize: 17, fontWeight: "600", color: "#1C1C1E" },
  workoutTime: { fontSize: 15, color: "#8E8E93" },

  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 13, color: "#6E6E73" },

  emptyState: { alignItems: "center", paddingVertical: 64 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#8E8E93",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#AEAEB2",
    marginTop: 8,
    textAlign: "center",
  },

  footerLoading: { paddingVertical: 12 },
});
