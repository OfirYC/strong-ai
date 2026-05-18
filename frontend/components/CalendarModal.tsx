import React, { useEffect, useMemo, useState, useCallback, act } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import RoutineDetailModal from "./RoutineDetailModal";
import { TemplateExercise, WorkoutSession, WorkoutTemplate } from "../types";
import { useAuthStore } from "../store/authStore";

// STORES
import { usePlannedWorkouts } from "../store/plannedWorkoutsStore";
import { useWorkouts } from "../store/workoutsStore";
import { templatesStore } from "../store/templatesStore";

interface PlannedWorkout {
  id: string;
  date: string;
  name: string;
  status: "planned" | "in_progress" | "completed" | "skipped";
  template_id?: string;
  workout_session_id?: string;
  type?: string;
  notes?: string;
  inline_exercises?: TemplateExercise[];
}

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onDateSelect?: (date: string, workouts: PlannedWorkout[]) => void;
  onStartWorkout?: (routine: WorkoutTemplate) => void;
}

const toLocalYMD = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD

const getSessionLocalYMD = (s: any) => {
  const raw = s?.started_at ?? s?.created_at ?? s?.ended_at ?? s?.date;
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return toLocalYMD(dt);
};

export default function CalendarModal({
  visible,
  onClose,
  onDateSelect,
  onStartWorkout,
}: CalendarModalProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(
    new Date().toISOString().split("T")[0]
  );

  const [selectedRoutine, setSelectedRoutine] =
    useState<WorkoutTemplate | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const { user } = useAuthStore();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // ---- DATE RANGE (MONTH) ----
  const { startDate, endDate } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    return {
      startDate: toLocalYMD(firstDay),
      endDate: toLocalYMD(lastDay),
    };
  }, [currentDate]);

  // Planned workouts store: month range
  // Assumption (matching your store pattern): it supports range queries.
  const {
    list: monthPlannedWorkouts,
    loading: plannedLoading,
    getRange,
  } = usePlannedWorkouts({ startDate, endDate, expandRecurring: true });

  // Workouts store: session enrichment
  const { byId: workoutsById, getManyByIds, getByDateRange } = useWorkouts();

  // Load month planned workouts when modal opens / month changes
  useEffect(() => {
    if (!visible) return;
    getRange(startDate, endDate).catch(() => {});
  }, [visible, startDate, endDate, getRange]);

  useEffect(() => {
    if (!visible) return;
    getByDateRange({ startDate, endDate }).catch();
  }, [visible, startDate, endDate, getByDateRange]);

  // Fetch missing workout sessions for enrichment (name/notes/status consistency)
  const monthWorkoutSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pw of monthPlannedWorkouts as PlannedWorkout[]) {
      if (pw.workout_session_id) ids.add(pw.workout_session_id);
    }
    return Array.from(ids);
  }, [monthPlannedWorkouts]);

  const sessionsByPlannedAndDate = useMemo(() => {
    const map = new Map<string, any>();

    for (const s of Object.values(workoutsById)) {
      const plannedId = (s as any)?.planned_workout_id as string | undefined;
      if (!plannedId) continue;

      const ymd = getSessionLocalYMD(s);
      if (!ymd) continue;

      map.set(`${plannedId}__${ymd}`, s);
    }

    return map;
  }, [workoutsById]);
  const isSessionInMonthRange = (s: any) => {
    const ymd = getSessionLocalYMD(s); // from previous message (started_at/created_at/ended_at)
    if (!ymd) return null;
    if (ymd < startDate || ymd > endDate) return null; // inclusive
    return ymd;
  };

  const sessionOnlyByDate = useMemo(() => {
    const grouped: Record<string, PlannedWorkout[]> = {};

    for (const s of Object.values(workoutsById)) {
      const plannedId = (s as any)?.planned_workout_id;
      if (plannedId) continue; // NOT session-only

      const ymd = isSessionInMonthRange(s);
      if (!ymd) continue;

      const status: PlannedWorkout["status"] = (s as any).skipped
        ? "skipped"
        : (s as any).ended_at
        ? "completed"
        : (s as any).started_at
        ? "in_progress"
        : "planned";

      const sid = (s as any).id as string;

      const pseudo: PlannedWorkout = {
        id: `session-${sid}`, // unique key (avoid collisions with planned ids)
        date: ymd,
        name: (s as any).name ?? "Workout",
        notes: (s as any).notes ?? "",
        status,
        workout_session_id: sid,
        type: "quick_start",
      };

      if (!grouped[ymd]) grouped[ymd] = [];
      grouped[ymd].push(pseudo);
    }

    return grouped;
  }, [workoutsById, startDate, endDate]);
  // Group by date (YYYY-MM-DD)
  const workoutsByDate = useMemo(() => {
    const grouped: Record<string, PlannedWorkout[]> = {};

    // planned workouts (expanded recurring)
    for (const w of monthPlannedWorkouts as PlannedWorkout[]) {
      if (!grouped[w.date]) grouped[w.date] = [];
      grouped[w.date].push(w);
    }

    // session-only workouts (quick start etc.)
    for (const [date, sessions] of Object.entries(sessionOnlyByDate)) {
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(...sessions);
    }

    return grouped;
  }, [monthPlannedWorkouts, sessionOnlyByDate]);
  useEffect(() => {
    if (!visible) return;
    if (monthWorkoutSessionIds.length === 0) return;

    const missing = monthWorkoutSessionIds.filter(id => !workoutsById[id]);
    if (missing.length === 0) return;

    getManyByIds(missing).catch(() => {});
  }, [visible, monthWorkoutSessionIds, workoutsById, getManyByIds]);

  // Enrich a date’s workouts on the fly (use cached sessions if present)
  const getWorkoutsForDate = useCallback(
    (dateStr: string) => {
      const base = workoutsByDate[dateStr] || [];

      return base.map(pw => {
        // Find the actual session for THIS planned workout occurrence date
        const actualSession = sessionsByPlannedAndDate.get(
          `${pw.id}__${pw.date}`
        ) as WorkoutSession;

        if (!actualSession) {
          // No session for this occurrence date -> do NOT leak an old workout_session_id/status
          const { workout_session_id, ...rest } = pw as any;
          return {
            ...(rest as PlannedWorkout),
            workout_session_id: undefined,
            status: pw.status ?? "planned",
          };
        }

        const derivedStatus: PlannedWorkout["status"] = actualSession.ended_at
          ? "completed"
          : actualSession.skipped
          ? "skipped"
          : actualSession.started_at
          ? "in_progress"
          : "planned";

        return {
          ...pw,
          workout_session_id: actualSession.id, // session for THIS date
          name: actualSession.name ?? pw.name,
          notes: actualSession.notes ?? pw.notes,
          status: derivedStatus,
        } as const;
      });
    },
    [workoutsByDate, sessionsByPlannedAndDate]
  );

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // JS: 0=Sun...6=Sat; we want Mon=0...Sun=6
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek === -1) firstDayOfWeek = 6;

    const daysInMonth = lastDay.getDate();
    return { firstDayOfWeek, daysInMonth };
  };

  const goToPreviousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
  };

  const goToToday = () => {
    const d = new Date();
    setCurrentDate(d);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleWorkoutClick = async (workout: PlannedWorkout) => {
    // If workout has a template, show routine detail modal (use templatesStore, not API)
    if (workout.template_id) {
      try {
        setLoadingTemplate(true);
        const tpl = await templatesStore
          .getState()
          .getById(workout.template_id);
        if (!tpl) throw new Error("Template not found");
        setSelectedRoutine(tpl);
        setShowRoutineModal(true);
      } catch (error) {
        console.error("Failed to load template:", error);
        Alert.alert("Error", "Failed to load workout details");
      } finally {
        setLoadingTemplate(false);
      }
      return;
    }

    // Inline exercises -> build a template-like object
    if (workout.inline_exercises && workout.inline_exercises.length > 0) {
      const templateLike: WorkoutTemplate = {
        id: `inline-${workout.id}`,
        user_id: user!.id,
        name: workout.name,
        notes: workout.notes,
        exercises: workout.inline_exercises,
        created_at: workout.date,
        updated_at: workout.date,
      };
      setSelectedRoutine(templateLike);
      setShowRoutineModal(true);
      return;
    }

    // If no template but has a workout session, navigate
    if (workout.workout_session_id) {
      onClose();
      router.push(`/workout-detail?workoutId=${workout.workout_session_id}`);
      return;
    }

    // Fallback
    const details: string[] = [];
    if (workout.type) details.push(`Type: ${workout.type}`);
    if (workout.notes) details.push(workout.notes);

    const message =
      details.length > 0
        ? details.join("\n\n")
        : "No template or details available. This workout was created without exercises.";

    Alert.alert(workout.name, message, [{ text: "OK" }]);
  };

  const handleDatePress = (dateStr: string) => {
    setSelectedDate(dateStr);
    const workouts = getWorkoutsForDate(dateStr);
    onDateSelect?.(dateStr, workouts);
  };

  const getStatusColor = (workouts: PlannedWorkout[]) => {
    if (workouts.some(w => w.status === "completed")) return "#34C759";
    if (workouts.some(w => w.status === "in_progress")) return "#FF9500";
    if (workouts.some(w => w.status === "skipped")) return "#8E8E93";
    return "#007AFF";
  };

  const renderCalendar = () => {
    const { firstDayOfWeek, daysInMonth } = getDaysInMonth();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const cells: React.ReactNode[] = [];
    const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

    const todayStr = new Date().toISOString().split("T")[0];

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - firstDayOfWeek + 1;
      const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;

      if (!isValidDay) {
        cells.push(<View key={i} style={styles.dayCell} />);
        continue;
      }

      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
        dayNumber
      ).padStart(2, "0")}`;

      const workouts = getWorkoutsForDate(dateStr);
      const hasWorkouts = workouts.length > 0;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;

      cells.push(
        <TouchableOpacity
          key={i}
          style={[
            styles.dayCell,
            isToday && styles.todayCell,
            isSelected && styles.selectedCell,
          ]}
          onPress={() => handleDatePress(dateStr)}
        >
          <Text
            style={[
              styles.dayText,
              isToday && styles.todayText,
              isSelected && styles.selectedText,
            ]}
          >
            {dayNumber}
          </Text>

          {hasWorkouts && (
            <View style={styles.indicatorContainer}>
              {workouts.slice(0, 3).map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.workoutIndicator,
                    { backgroundColor: getStatusColor(workouts) },
                  ]}
                />
              ))}
            </View>
          )}
        </TouchableOpacity>
      );
    }

    return cells;
  };

  const renderSelectedDateWorkouts = () => {
    if (!selectedDate) return null;

    const workouts = getWorkoutsForDate(selectedDate);
    if (workouts.length === 0) return null;

    const dateObj = new Date(selectedDate + "T00:00:00");
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    return (
      <View style={styles.selectedDateSection}>
        <Text style={styles.selectedDateTitle}>{formattedDate}</Text>

        {workouts.map(workout => (
          <TouchableOpacity
            key={workout.id}
            style={styles.workoutItem}
            onPress={() => handleWorkoutClick(workout)}
            disabled={loadingTemplate}
          >
            <View
              style={[
                styles.workoutStatus,
                { backgroundColor: getStatusColor([workout]) },
              ]}
            />
            <View style={styles.workoutInfo}>
              <Text style={styles.workoutName}>{workout.name}</Text>
              <Text style={styles.workoutStatusText}>
                {workout.status.replace("_", " ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.modalContent}
          activeOpacity={1}
          onPress={e => e.stopPropagation()}
        >
          <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={28} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Workout Calendar</Text>
              <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {/* Month Navigation */}
              <View style={styles.monthNav}>
                <TouchableOpacity
                  onPress={goToPreviousMonth}
                  style={styles.navButton}
                >
                  <Ionicons name="chevron-back" size={24} color="#007AFF" />
                </TouchableOpacity>

                <Text style={styles.monthTitle}>
                  {monthNames[currentDate.getMonth()]}{" "}
                  {currentDate.getFullYear()}
                </Text>

                <TouchableOpacity
                  onPress={goToNextMonth}
                  style={styles.navButton}
                >
                  <Ionicons name="chevron-forward" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>

              {/* Day Headers */}
              <View style={styles.dayHeaders}>
                {dayNames.map(day => (
                  <View key={day} style={styles.dayHeader}>
                    <Text style={styles.dayHeaderText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar Grid */}
              {plannedLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                </View>
              ) : (
                <View style={styles.calendarGrid}>{renderCalendar()}</View>
              )}

              {/* Selected Date Workouts */}
              {renderSelectedDateWorkouts()}

              {/* Legend */}
              <View style={styles.legend}>
                <Text style={styles.legendTitle}>Status</Text>
                <View style={styles.legendItems}>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#007AFF" }]}
                    />
                    <Text style={styles.legendText}>Planned</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#FF9500" }]}
                    />
                    <Text style={styles.legendText}>In Progress</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#34C759" }]}
                    />
                    <Text style={styles.legendText}>Completed</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#8E8E93" }]}
                    />
                    <Text style={styles.legendText}>Skipped</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Routine Detail Modal */}
      <RoutineDetailModal
        visible={showRoutineModal}
        routine={selectedRoutine}
        onRoutineEdited={setSelectedRoutine}
        onClose={() => setShowRoutineModal(false)}
        onStartWorkout={(routine) => {
          setShowRoutineModal(false);
          setTimeout(() => {
            onClose();
            onStartWorkout?.(routine);
          }, 300);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    flex: 1,
    marginTop: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  closeButton: {
    width: 44,
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    textAlign: "center",
  },
  todayButton: {
    width: 60,
    alignItems: "flex-end",
  },
  todayButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  content: {
    flex: 1,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  navButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  dayHeaders: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    alignItems: "center",
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    marginBottom: 4,
  },
  todayCell: {
    backgroundColor: "#E8F4FF",
    borderRadius: 8,
  },
  selectedCell: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
  },
  dayText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1C1C1E",
  },
  todayText: {
    color: "#007AFF",
    fontWeight: "700",
  },
  selectedText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  indicatorContainer: {
    flexDirection: "row",
    marginTop: 2,
    gap: 2,
  },
  workoutIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  selectedDateSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    backgroundColor: "#F5F5F7",
    borderRadius: 12,
  },
  selectedDateTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 12,
  },
  workoutItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    marginBottom: 8,
  },
  workoutStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 2,
  },
  workoutStatusText: {
    fontSize: 13,
    color: "#8E8E93",
    textTransform: "capitalize",
  },
  legend: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#F5F5F7",
    borderRadius: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 12,
  },
  legendItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 13,
    color: "#636366",
  },
});
