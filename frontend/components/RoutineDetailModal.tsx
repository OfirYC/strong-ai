import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../utils/api";
import { Exercise, WorkoutTemplate } from "../types";
import ExerciseDetailModal from "./ExerciseDetailModal";
import { EditRoutineModal, EditRoutineModalProps } from "./EditRoutineModal";

interface RoutineDetailModalProps {
  visible: boolean;
  routine: WorkoutTemplate | null;
  onClose: () => void;
  onStartWorkout: (routine: WorkoutTemplate) => void;
  onSchedule?: (routine: WorkoutTemplate) => void;
  onRoutineEdited?: EditRoutineModalProps["onRoutineEdited"];
}

interface ExerciseWithDetails {
  exercise_id: string;
  sets: number;
  exercise?: Exercise;
}

export default function RoutineDetailModal({
  visible,
  routine,
  onClose,
  onStartWorkout,
  onSchedule,
  onRoutineEdited,
}: RoutineDetailModalProps) {
  const [exerciseDetails, setExerciseDetails] = useState<{
    [key: string]: Exercise;
  }>({});
  const [loading, setLoading] = useState(false);
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null
  );
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [showEditRoutineModal, setShowEditRoutineModal] = useState(false);

  useEffect(() => {
    if (visible && routine) {
      loadExerciseDetails();
      loadLastPerformed();
    }
  }, [visible, routine]);

  const loadExerciseDetails = async () => {
    if (!routine) return;

    setLoading(true);
    try {
      const exerciseIds = routine.exercises.map(e => e.exercise_id);
      const uniqueIds = [...new Set(exerciseIds)];

      const details: { [key: string]: Exercise } = {};
      await Promise.all(
        uniqueIds.map(async id => {
          try {
            const response = await api.get(`/exercises/${id}`);
            details[id] = response.data;
          } catch (error) {
            console.error(`Failed to load exercise ${id}`);
          }
        })
      );

      setExerciseDetails(details);
    } catch (error) {
      console.error("Failed to load exercise details:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLastPerformed = async () => {
    if (!routine) return;

    try {
      // Get workouts that used this template
      const response = await api.get("/workouts/history?limit=100");
      const workouts = response.data;

      // Find the most recent workout using this template
      const templateWorkout = workouts.find(
        (w: any) => w.template_id === routine.id
      );

      if (templateWorkout) {
        const date = new Date(templateWorkout.started_at);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          setLastPerformed("Today");
        } else if (diffDays === 1) {
          setLastPerformed("Yesterday");
        } else {
          setLastPerformed(`${diffDays} days ago`);
        }
      } else {
        setLastPerformed(null);
      }
    } catch (error) {
      console.error("Failed to load last performed:", error);
      setLastPerformed(null);
    }
  };

  const handleStartWorkout = () => {
    if (routine) {
      onStartWorkout(routine);
      onClose();
    }
  };

  if (!routine) return null;

  const handleEditRoutine = () => {
    setShowEditRoutineModal(true);
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
              <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                <Ionicons name="close" size={28} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {routine.name}
              </Text>
              {handleEditRoutine ? (
                <TouchableOpacity
                  onPress={handleEditRoutine}
                  style={{ width: 60, alignItems: "flex-end" }}
                >
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.headerButton} />
              )}
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
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color="#007AFF"
                  style={styles.loader}
                />
              ) : (
                routine.exercises.map((exercise, index) => {
                  const detail = exerciseDetails[exercise.exercise_id];
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
                          {detail?.muscle_group ||
                            detail?.primary_body_parts?.[0] ||
                            ""}
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
                      >
                        <Ionicons
                          name="help-circle"
                          size={28}
                          color="#007AFF"
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
        onExerciseUpdated={() => {
          // Reload exercise details if user updates the exercise
          loadExerciseDetails();
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
