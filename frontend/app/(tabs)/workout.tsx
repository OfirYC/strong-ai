// app/(tabs)/workout.tsx (or wherever this screen lives)
// Updated plan: plannedWorkoutsStore is the source of truth for today's planned workouts,
// workoutsStore is the source of truth for workout sessions (name/notes/status), and we
// only fetch what is missing. We also patch stores on local actions instead of refetching
// on every activeWorkout change.
import NotesModal from "../../components/NotesModal";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../components/Button";
import CalendarModal from "../../components/CalendarModal";
import { LoadingData } from "../../components/LoadingData";
import RoutineDetailModal from "../../components/RoutineDetailModal";
import ScheduleWorkoutModal from "../../components/ScheduleWorkoutModal";
import {
  plannedWorkoutsStore,
  PlannedWorkout as StorePlannedWorkout,
  usePlannedWorkouts,
} from "../../store/plannedWorkoutsStore";
import { useTemplates } from "../../store/templatesStore";
import { useWorkoutStore } from "../../store/workoutStore";
import { useWorkouts, workoutsStore } from "../../store/workoutsStore";
import { WorkoutExercise, WorkoutSession, WorkoutTemplate } from "../../types";
import api from "../../utils/api";
import { useActiveWorkoutSheetUIStore } from "../../store/workoutCompleteUIStore";

// Keep your enriched shape for UI only
type EnrichedPlannedWorkout = StorePlannedWorkout & {
  actualName?: string;
  actualNotes?: string;
  __sessionOnly?: boolean; // add this
};

const toLocalYMD = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD

const isSessionOnDate = (session: any, ymd: string) => {
  const raw =
    session?.started_at ??
    session?.created_at ??
    session?.ended_at ??
    session?.date; // whichever exists in your model
  if (!raw) return false;

  const dt = new Date(raw);

  if (Number.isNaN(dt.getTime())) return false;

  return toLocalYMD(dt) === ymd;
};

export default function WorkoutScreen() {
  const router = useRouter();
  const {
    activeWorkout,
    startWorkout: _startWorkout,
    endWorkout,
  } = useWorkoutStore();

  const startWorkout = useCallback(
    (workout: WorkoutSession) => {
      _startWorkout(workout);
      setIsActiveWorkoutSheetExpanded(true);
    },
    [_startWorkout],
  );

  const { list: templatesList, loading: templatesLoading } = useTemplates();

  const today = useMemo(() => new Date().toLocaleDateString("en-CA"), []); // YYYY-MM-DD, local

  // Planned workouts for today
  const { list: todaysPlannedBase, loading: plannedLoading } =
    usePlannedWorkouts({ date: today, expandRecurring: true });

  // Workouts sessions cache
  const {
    byId: workoutsById,

    getManyByIds,
    getById: getWorkoutById,
    getByDate: getWorkoutSessionsByDate,
  } = useWorkouts();

  const [loading, setLoading] = useState(false);
  const [selectedRoutine, setSelectedRoutine] =
    useState<WorkoutTemplate | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const { setIsExpanded: setIsActiveWorkoutSheetExpanded } =
    useActiveWorkoutSheetUIStore();
  const [showNotesModal, setShowNotesModal] = useState(false);

  // Derive the set of workout session ids that we need for enrichment
  const todaysWorkoutSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pw of todaysPlannedBase) {
      if (pw.workout_session_id) ids.add(pw.workout_session_id);
    }

    return Array.from(ids);
  }, [todaysPlannedBase]);

  // Fetch workout sessions by current date
  useEffect(() => {
    getWorkoutSessionsByDate({ date: today }).catch();
  }, [getWorkoutSessionsByDate]);

  // Fetch missing workout sessions (once), and rely on workoutsStore afterwards
  useEffect(() => {
    if (todaysWorkoutSessionIds.length === 0) return;
    const missing = todaysWorkoutSessionIds.filter(id => !workoutsById[id]);
    if (missing.length === 0) return;

    getManyByIds(missing).catch(() => {});
  }, [todaysWorkoutSessionIds, workoutsById, getManyByIds]);

  // When active workout changes locally, upsert into workoutsStore so UI enriches immediately
  useEffect(() => {
    if (!activeWorkout?.id) return;
    workoutsStore.getState().upsert(activeWorkout);
  }, [
    activeWorkout?.id,
    activeWorkout?.name,
    activeWorkout?.notes,
    // include anything else you know changes locally
  ]);

  // Also patch planned workout linkage when we know it (avoid refetch on activeWorkout change)
  useEffect(() => {
    if (!activeWorkout?.id) return;
    const plannedId = (activeWorkout as any)?.planned_workout_id;
    if (!plannedId) return;

    // plannedWorkoutsStore.getState().patch(plannedId, {
    //   status: "in_progress",
    //   workout_session_id: activeWorkout.id,
    // });
  }, [activeWorkout?.id]);

  const getActiveWorkout = () => useWorkoutStore.getState().activeWorkout;

  const discardCurrentAndRun = async (next: () => Promise<void>) => {
    const current = getActiveWorkout();
    if (current) {
      if (!(current as any).planned_workout_id) {
        try {
          await api.delete(`/workouts/${current.id}`);
          workoutsStore.getState().remove(current.id);
        } catch (error) {
          console.error("Failed to delete workout:", error);
        }
      }
      endWorkout();
    }
    await next();
  };

  const handleStartEmptyWorkout = async () => {
    const current = getActiveWorkout();
    if (current) {
      Alert.alert(
        "Active Workout",
        "You already have an Active Workout. Do you want to discard it and start a new one?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard & Start New",
            style: "destructive",
            onPress: async () => {
              try {
                setLoading(true);
                await discardCurrentAndRun(async () => {
                  const response = await api.post("/workouts", { notes: "" });
                  startWorkout(response.data);
                  workoutsStore.getState().upsert(response.data);
                });
              } catch (error) {
                console.error(error);
                Alert.alert("Error", "Failed to start workout");
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
      return;
    }
    await createNewWorkout();
  };

  const createNewWorkout = async () => {
    try {
      setLoading(true);
      const response = await api.post("/workouts", { notes: "" });
      startWorkout(response.data);
      // workoutsStore.getState().upsert(response.data);
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", "Failed to start workout");
    } finally {
      setLoading(false);
    }
  };

  const handleStartTemplate = (template: WorkoutTemplate) => {
    setSelectedRoutine(template);
    setShowRoutineModal(true);
  };

  const handleStartWorkoutFromRoutine = async (routine: WorkoutTemplate) => {
    const current = getActiveWorkout();

    if (current) {
      Alert.alert(
        "Active Workout",
        "You already have an Active Workout. Do you want to discard it and start a new one?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard & Start New",
            style: "destructive",
            onPress: async () => {
              try {
                setLoading(true);
                await discardCurrentAndRun(async () => {
                  await createTemplateWorkout(routine.id);
                });
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
      return;
    }
    await createTemplateWorkout(routine.id);
  };

  const createTemplateWorkout = async (templateId: string) => {
    try {
      setLoading(true);
      const response = await api.post("/workouts", { template_id: templateId });
      startWorkout(response.data);
      workoutsStore.getState().upsert(response.data);
    } catch (error: any) {
      Alert.alert("Error", "Failed to start workout");
    } finally {
      setLoading(false);
    }
  };

  const handleStartPlannedWorkout = async (
    plannedWorkout: EnrichedPlannedWorkout,
  ) => {
    if (
      plannedWorkout.status === "completed" &&
      plannedWorkout.workout_session_id
    ) {
      router.push(
        `/workout-detail?workoutId=${plannedWorkout.workout_session_id}`,
      );
      return;
    }

    if (plannedWorkout.status === "skipped") return;

    if (
      plannedWorkout.status === "in_progress" &&
      plannedWorkout.workout_session_id &&
      activeWorkout?.id === plannedWorkout.workout_session_id
    ) {
      setIsActiveWorkoutSheetExpanded(true);
      return;
    }

    if (
      plannedWorkout.status === "in_progress" &&
      plannedWorkout.workout_session_id
    ) {
      if (
        activeWorkout &&
        activeWorkout.id !== plannedWorkout.workout_session_id
      ) {
        Alert.alert(
          "Active Workout",
          "You already have an Active Workout. Do you want to discard it and resume this one?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Discard & Resume",
              style: "destructive",
              onPress: async () => {
                try {
                  setLoading(true);
                  await discardCurrentAndRun(async () => {
                    const workout = await getWorkoutById(
                      plannedWorkout.workout_session_id!,
                    );
                    if (workout) {
                      startWorkout(workout);
                      return;
                    }
                  });
                } catch (error) {
                  console.error("Failed to resume workout:", error);
                  Alert.alert("Error", "Failed to resume workout");
                } finally {
                  setLoading(false);
                }
              },
            },
          ],
        );
        return;
      }

      try {
        const workout = await getWorkoutById(
          plannedWorkout.workout_session_id!,
        );
        if (workout) {
          startWorkout(workout);
          return;
        }
        return;
      } catch (error) {
        console.error("Failed to resume workout:", error);
        Alert.alert("Error", "Failed to resume workout");
        return;
      }
    }

    if (activeWorkout) {
      Alert.alert(
        "Active Workout",
        "You already have an Active Workout. Do you want to discard it and start a new one?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard & Start New",
            style: "destructive",
            onPress: async () => {
              try {
                setLoading(true);
                await discardCurrentAndRun(async () => {
                  await createPlannedWorkoutSession(plannedWorkout);
                });
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
      return;
    }

    await createPlannedWorkoutSession(plannedWorkout);
  };

  const createPlannedWorkoutSession = async (
    plannedWorkout: EnrichedPlannedWorkout,
  ) => {
    try {
      setLoading(true);

      const payload: any = {
        planned_workout_id: plannedWorkout.id,
        name: plannedWorkout.name,
        notes: plannedWorkout.notes,
      };

      if (plannedWorkout.inline_exercises?.length) {
        payload.exercises =
          plannedWorkout.inline_exercises satisfies WorkoutExercise[];
      } else if (plannedWorkout.template_id) {
        payload.template_id = plannedWorkout.template_id;
      }

      const response = await api.post("/workouts", payload);
      startWorkout(response.data);
      workoutsStore.getState().upsert(response.data);

      // // Patch planned workout immediately (no refetch needed)
      // plannedWorkoutsStore.getState().patch(plannedWorkout.id, {
      //   status: "in_progress",
      //   workout_session_id: response.data.id,
      // });
    } catch (error: any) {
      Alert.alert("Error", "Failed to start workout");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "completed":
        return { backgroundColor: "#34C759", color: "#FFFFFF" };
      case "in_progress":
        return { backgroundColor: "#FF9500", color: "#FFFFFF" };
      case "skipped":
        return { backgroundColor: "#8E8E93", color: "#FFFFFF" };
      default:
        return { backgroundColor: "#007AFF", color: "#FFFFFF" };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "checkmark-circle";
      case "in_progress":
        return "play-circle";
      case "skipped":
        return "close-circle";
      default:
        return "time-outline";
    }
  };

  const todaysWorkoutsOrder: Record<string, number> = {
    in_progress: 0,
    planned: 1,
    completed: 2,
    skipped: 3,
  };

  const sessionsByPlannedAndDate = useMemo(() => {
    const map = new Map<string, WorkoutSession>();

    for (const s of Object.values(workoutsById)) {
      const plannedId = (s as any)?.planned_workout_id as string | undefined;
      if (!plannedId) continue;

      // use your existing date logic (local YMD)
      const ymd = (() => {
        const raw =
          (s as any)?.started_at ??
          (s as any)?.created_at ??
          (s as any)?.ended_at ??
          (s as any)?.date;

        if (!raw) return null;
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return null;
        return toLocalYMD(dt);
      })();

      if (!ymd) continue;

      map.set(`${plannedId}__${ymd}`, s as WorkoutSession);
    }

    return map;
  }, [workoutsById]);

  // Enrich planned workouts using workoutsStore (single source of truth for workout session fields)
  const todaysWorkouts: EnrichedPlannedWorkout[] = useMemo(() => {
    // sessions that exist in cache and happened today, but are NOT linked to a planned workout
    const sessionOnly = Object.values(workoutsById)
      .filter(s => isSessionOnDate(s, today))
      .map(_s => {
        const s = _s as WorkoutSession;
        const sid = (s as any).id as string;

        const status: StorePlannedWorkout["status"] = s.skipped
          ? "skipped"
          : s.ended_at
            ? "completed"
            : "in_progress";

        // Pseudo planned workout card shape

        return {
          id: sid, // unique key for list rendering
          date: today,
          status,
          name: (s as any).name ?? "Workout",
          notes: (s as any).notes ?? "",
          workout_session_id: sid,
          actualName: (s as any).name ?? "Workout",
          actualNotes: (s as any).notes ?? "",
          __sessionOnly: true,
          planned_workout_id: s.planned_workout_id,
        } as any;
      });

    const planned = (todaysPlannedBase ?? [])
      .map(pw => {
        const actualSession = sessionsByPlannedAndDate.get(
          `${pw.id}__${pw.date}`,
        );

        if (!actualSession) {
          // No session for THIS date → planned stays planned (or whatever pw.status is)
          // Critical: do NOT propagate an old workout_session_id into today’s card.
          const { workout_session_id, ...rest } = pw as any;
          return {
            ...(rest as EnrichedPlannedWorkout),
            workout_session_id: undefined,
            actualName: pw.name,
            actualNotes: pw.notes,
            status: pw.status, // usually "planned" for today's occurrence
          };
        }

        const derivedStatus: StorePlannedWorkout["status"] = (
          actualSession as any
        ).ended_at
          ? "completed"
          : (actualSession as any).skipped
            ? "skipped"
            : "in_progress";

        return {
          ...(pw as EnrichedPlannedWorkout),
          workout_session_id: (actualSession as any).id, // session for THIS date
          actualName: (actualSession as any).name ?? pw.name,
          actualNotes: (actualSession as any).notes ?? pw.notes,
          status: derivedStatus,
        };
      })
      .filter(pw => pw.status == "planned");

    return [...planned, ...sessionOnly];
  }, [todaysPlannedBase, workoutsById, today]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          activeWorkout && styles.scrollContentWithSheet,
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Start Workout</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setShowNotesModal(true)}
            >
              <Ionicons
                name="document-text-outline"
                size={24}
                color="#007AFF"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setShowCalendarModal(true)}
            >
              <Ionicons name="calendar-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>

        <NotesModal
          visible={showNotesModal}
          onClose={() => setShowNotesModal(false)}
        />
        {(plannedLoading || todaysWorkouts.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Workouts</Text>

            {plannedLoading && todaysWorkouts.length === 0 ? (
              <LoadingData loadingTitle="Loading Today's Workouts..." />
            ) : (
              todaysWorkouts
                .slice()
                .sort(
                  (a, b) =>
                    (todaysWorkoutsOrder[a.status] ?? 99) -
                    (todaysWorkoutsOrder[b.status] ?? 99),
                )
                .map(plannedWorkout => (
                  <TouchableOpacity
                    key={plannedWorkout.id}
                    style={[
                      styles.plannedWorkoutCard,
                      plannedWorkout.status === "completed" &&
                        styles.completedCard,
                      plannedWorkout.status === "skipped" && styles.skippedCard,
                    ]}
                    onPress={() => handleStartPlannedWorkout(plannedWorkout)}
                    disabled={plannedWorkout.status === "skipped"}
                  >
                    <View style={styles.plannedWorkoutContent}>
                      <View style={styles.plannedWorkoutHeader}>
                        <Text style={styles.plannedWorkoutName}>
                          {plannedWorkout.actualName || plannedWorkout.name}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            getStatusBadgeStyle(plannedWorkout.status),
                          ]}
                        >
                          <Ionicons
                            name={getStatusIcon(plannedWorkout.status) as any}
                            size={14}
                            color={
                              getStatusBadgeStyle(plannedWorkout.status).color
                            }
                            style={styles.statusIcon}
                          />
                          <Text
                            style={[
                              styles.statusText,
                              {
                                color: getStatusBadgeStyle(
                                  plannedWorkout.status,
                                ).color,
                              },
                            ]}
                          >
                            {plannedWorkout.status.replace("_", " ")}
                          </Text>
                        </View>
                      </View>

                      {(plannedWorkout.actualNotes || plannedWorkout.notes) && (
                        <Text style={styles.plannedWorkoutNotes}>
                          {plannedWorkout.actualNotes || plannedWorkout.notes}
                        </Text>
                      )}

                      {plannedWorkout.type && !plannedWorkout.actualNotes && (
                        <Text style={styles.plannedWorkoutType}>
                          {plannedWorkout.type}
                        </Text>
                      )}
                    </View>

                    {plannedWorkout.status === "planned" && (
                      <Ionicons
                        name="play-circle-outline"
                        size={32}
                        color="#007AFF"
                      />
                    )}
                    {plannedWorkout.status === "in_progress" && (
                      <Ionicons name="play-circle" size={32} color="#FF9500" />
                    )}
                  </TouchableOpacity>
                ))
            )}
          </View>
        )}
        <Button
          title="Quick Start"
          onPress={handleStartEmptyWorkout}
          loading={loading}
          style={styles.quickStartButton}
        />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Routines</Text>
          {templatesList.length === 0 ? (
            templatesLoading ? (
              <LoadingData loadingTitle="Loading Routines..." />
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="list-outline" size={64} color="#3A3A3C" />
                <Text style={styles.emptyText}>No routines yet</Text>
                <Text style={styles.emptySubtext}>
                  Create a routine in the Routines tab
                </Text>
              </View>
            )
          ) : (
            templatesList.map(template => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateCard}
                onPress={() => handleStartTemplate(template)}
              >
                <View style={styles.templateInfo}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateDetail}>
                    {template.exercises.length} exercises
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#8E8E93" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <RoutineDetailModal
        visible={showRoutineModal}
        routine={selectedRoutine}
        onRoutineEdited={setSelectedRoutine}
        onClose={() => setShowRoutineModal(false)}
        onStartWorkout={handleStartWorkoutFromRoutine}
        onSchedule={routine => {
          setSelectedRoutine(routine);
          setShowScheduleModal(true);
        }}
      />

      <ScheduleWorkoutModal
        visible={showScheduleModal}
        routine={selectedRoutine}
        onClose={() => setShowScheduleModal(false)}
        onScheduled={() => {}}
      />

      <CalendarModal
        visible={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        onDateSelect={() => {
          // no-op; CalendarModal handles internal rendering
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerIconBtn: {
    padding: 8,
    marginLeft: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  scrollContentWithSheet: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1C1C1E",
    flex: 1,
  },
  calendarButton: {
    padding: 8,
    marginLeft: 12,
  },
  quickStartButton: {
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  templateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  templateDetail: {
    fontSize: 14,
    color: "#8E8E93",
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#8E8E93",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#636366",
    marginTop: 8,
    textAlign: "center",
  },
  plannedWorkoutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#007AFF",
    minHeight: 80,
  },
  completedCard: {
    opacity: 0.6,
    borderColor: "#34C759",
  },
  skippedCard: {
    opacity: 0.5,
    borderColor: "#8E8E93",
  },
  plannedWorkoutContent: {
    flex: 1,
    marginRight: 12,
    justifyContent: "center",
  },
  plannedWorkoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  plannedWorkoutName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusIcon: {
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  plannedWorkoutNotes: {
    fontSize: 14,
    color: "#636366",
    marginBottom: 4,
  },
  plannedWorkoutType: {
    fontSize: 12,
    color: "#8E8E93",
    textTransform: "capitalize",
  },
});
