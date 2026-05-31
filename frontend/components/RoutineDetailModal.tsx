import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useExercises } from "../store/exercisesStore";
import { useWorkouts } from "../store/workoutsStore";
import { Exercise, WorkoutTemplate } from "../types";
import { getGroupsFromLoads } from "../utils/muscleUtils";
import { EditRoutineModal, EditRoutineModalProps } from "./EditRoutineModal";
import ExerciseDetailModal from "./ExerciseDetailModal";

interface RoutineDetailModalProps {
  visible: boolean;
  routine: WorkoutTemplate | null;
  onClose: () => void;
  onStartWorkout: (routine: WorkoutTemplate) => void;
  onSchedule?: (routine: WorkoutTemplate) => void;
  onRoutineEdited: EditRoutineModalProps["onRoutineEdited"];
}

export default function RoutineDetailModal({
  visible,
  routine,
  onClose,
  onStartWorkout,
  onSchedule,
  onRoutineEdited,
}: RoutineDetailModalProps) {
  const { byId, loading: exercisesLoading, getById } = useExercises();

  // Workouts store (canonical session cache)
  const { historySessions, ensurePrefix, exhausted } = useWorkouts();

  const [loading, setLoading] = useState(false);
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null
  );
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [showEditRoutineModal, setShowEditRoutineModal] = useState(false);

  // Prefetch exercises used in routine
  useEffect(() => {
    if (!routine || routine.exercises.length === 0) return;

    const nonAvailableExercises = routine.exercises.filter(
      ex => !byId[ex.exercise_id]
    );
    if (nonAvailableExercises.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(nonAvailableExercises.map(ex => getById(ex.exercise_id)))
      .catch(err => {
        console.error("Failed to load routine exercises:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [routine, routine?.exercises, byId, getById]);

  // Compute last performed using store-backed historySessions (ended_at != null)
  useEffect(() => {
    if (!visible || !routine) return;

    let cancelled = false;

    const computeLabel = (startedAtISO: string) => {
      const date = new Date(startedAtISO);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      return `${diffDays} days ago`;
    };

    const findMostRecentTemplateSession = () => {
      // historySessions are derived from prefix cache and should already be sorted newest->older
      // because paging returns newest->older and we compute from prefix.
      return historySessions.find(s => s.template_id === routine.id);
    };

    const loadLastPerformed = async () => {
      try {
        // First attempt: use whatever is already cached
        let match = findMostRecentTemplateSession();
        if (match?.started_at) {
          if (!cancelled) setLastPerformed(computeLabel(match.started_at));
          return;
        }

        // If not found, progressively fetch a few more pages and retry.
        // We cap attempts so this modal doesn't become a “fetch the whole DB” spinner.
        const PAGE_SIZE = 50;
        const MAX_PAGES_TO_TRY = 6; // 300 sessions max attempt

        for (let i = 0; i < MAX_PAGES_TO_TRY; i++) {
          if (cancelled) return;
          if (exhausted) break;
          console.log("Ensuring Prefix RoutineDetailModal lastPerformed");
          // Ask store to extend the prefix by one page each time
          await ensurePrefix((i + 1) * PAGE_SIZE, { pageSize: PAGE_SIZE });

          match = findMostRecentTemplateSession();
          if (match?.started_at) {
            if (!cancelled) setLastPerformed(computeLabel(match.started_at));
            return;
          }
        }

        // Still not found
        if (!cancelled) setLastPerformed(null);
      } catch (e) {
        console.error("Failed to compute last performed:", e);
        if (!cancelled) setLastPerformed(null);
      }
    };

    loadLastPerformed();

    return () => {
      cancelled = true;
    };
  }, [visible, routine?.id, historySessions, ensurePrefix, exhausted]);

  const handleStartWorkout = () => {
    if (routine) {
      onStartWorkout(routine);
      onClose();
    }
  };

  const handleEditRoutine = () => {
    setShowEditRoutineModal(true);
  };

  const showLoading = loading || exercisesLoading;

  if (!routine) return null;

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
              <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                <Ionicons name="close" size={28} color="#1C1C1E" />
              </TouchableOpacity>

              <Text style={styles.headerTitle} numberOfLines={1}>
                {routine.name}
              </Text>

              <TouchableOpacity
                onPress={handleEditRoutine}
                style={{ width: 60, alignItems: "flex-end" }}
              >
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Last Performed */}
            {lastPerformed && (
              <Text style={styles.lastPerformed}>
                Last Performed: {lastPerformed}
              </Text>
            )}

            {/* Exercise List */}
            <ScrollView
              style={styles.exerciseList}
              showsVerticalScrollIndicator={false}
            >
              {showLoading ? (
                <ActivityIndicator
                  size="large"
                  color="#007AFF"
                  style={styles.loader}
                />
              ) : (
                routine.exercises.map((exercise, index) => {
                  const detail = byId[exercise.exercise_id];
                  const setCount =
                    exercise.sets?.length || exercise.default_sets || 0;

                  return (
                    <View key={index} style={styles.exerciseRow}>
                      <View style={styles.exerciseImageContainer}>
                        {detail?.image ? (
                          <Image
                            source={{ uri: detail.image }}
                            style={styles.exerciseImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.exercisePlaceholder}>
                            <Ionicons
                              name="barbell"
                              size={24}
                              color="#8E8E93"
                            />
                          </View>
                        )}
                      </View>

                      <View style={styles.exerciseInfo}>
                        <Text style={styles.exerciseName}>
                          {setCount} × {detail?.name || "Loading..."}
                        </Text>
                        <Text style={styles.exerciseMuscle}>
                          {getGroupsFromLoads(detail?.muscle_loads)[0] || ""}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.infoButton}
                        onPress={() => {
                          if (detail) {
                            setSelectedExercise(detail);
                            setShowExerciseDetail(true);
                          }
                        }}
                        disabled={!detail}
                      >
                        <Ionicons
                          name="help-circle"
                          size={28}
                          color={!detail ? "#C7C7CC" : "#007AFF"}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
              <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.footer}>
              {onSchedule && (
                <TouchableOpacity
                  style={styles.scheduleButton}
                  onPress={() => {
                    if (routine) {
                      onSchedule(routine);
                      onClose();
                    }
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color="#007AFF"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.scheduleButtonText}>Schedule</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.startButton,
                  onSchedule && styles.startButtonWithSchedule,
                ]}
                onPress={handleStartWorkout}
              >
                <Text style={styles.startButtonText}>Start Workout</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Exercise Detail Modal */}
      <ExerciseDetailModal
        visible={showExerciseDetail}
        exercise={selectedExercise}
        onClose={() => {
          setShowExerciseDetail(false);
          setSelectedExercise(null);
        }}
        onExerciseUpdated={(newExercise: Exercise) => {
          setSelectedExercise(newExercise);
        }}
      />

      <EditRoutineModal
        onRoutineEdited={onRoutineEdited}
        visible={showEditRoutineModal}
        routine={routine!}
        onClose={() => {
          setShowEditRoutineModal(false);
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
  headerButton: {
    width: 60,
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    textAlign: "center",
  },
  editText: {
    fontSize: 17,
    color: "#007AFF",
    fontWeight: "500",
  },
  lastPerformed: {
    fontSize: 15,
    color: "#8E8E93",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  exerciseList: {
    flex: 1,
  },
  loader: {
    marginTop: 40,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  exerciseImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    marginRight: 12,
    backgroundColor: "#F5F5F7",
  },
  exerciseImage: {
    width: "100%",
    height: "100%",
  },
  exercisePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F7",
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  exerciseMuscle: {
    fontSize: 14,
    color: "#8E8E93",
  },
  infoButton: {
    padding: 8,
  },
  bottomSpacer: {
    height: 20,
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    backgroundColor: "#FFFFFF",
  },
  scheduleButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  buttonIcon: {
    marginRight: 6,
  },
  scheduleButtonText: {
    color: "#007AFF",
    fontSize: 17,
    fontWeight: "600",
  },
  startButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonWithSchedule: {
    flex: 1,
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
});
