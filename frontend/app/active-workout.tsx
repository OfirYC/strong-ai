import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useWorkoutStore } from '../store/workoutStore';
import Button from '../components/Button';
import api from '../utils/api';
import { Exercise, WorkoutExercise, WorkoutSet, getExerciseFields } from '../types';

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const { activeWorkout, updateWorkout, endWorkout } = useWorkoutStore();
  const [exercises, setExercises] = useState<WorkoutExercise[]>(
    activeWorkout?.exercises || []
  );
  const [exerciseDetails, setExerciseDetails] = useState<{
    [key: string]: Exercise;
  }>({});
  const [timer, setTimer] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (!activeWorkout) {
      router.replace('/(tabs)/workout');
      return;
    }

    loadExerciseDetails();

    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const loadExerciseDetails = async () => {
    if (!activeWorkout) return;

    const details: { [key: string]: Exercise } = {};
    for (const exercise of activeWorkout.exercises) {
      try {
        const response = await api.get(`/exercises/${exercise.exercise_id}`);
        details[exercise.exercise_id] = response.data;
      } catch (error) {
        console.error('Failed to load exercise details:', error);
      }
    }
    setExerciseDetails(details);
  };

  const loadAvailableExercises = async () => {
    try {
      const response = await api.get('/exercises');
      setAvailableExercises(response.data);
    } catch (error) {
      console.error('Failed to load exercises:', error);
    }
  };

  const handleAddExerciseToWorkout = async (exercise: Exercise) => {
    // Create default sets based on exercise kind
    const fields = getExerciseFields(exercise.exercise_kind);
    const defaultSets: WorkoutSet[] = [];
    
    for (let i = 0; i < 3; i++) {
      const set: WorkoutSet = { is_warmup: false };
      
      if (fields.includes('weight')) set.weight = 0;
      if (fields.includes('reps')) set.reps = 10;
      if (fields.includes('distance')) set.distance = 0;
      if (fields.includes('duration')) set.duration = 0;
      if (fields.includes('calories')) set.calories = 0;
      
      defaultSets.push(set);
    }

    const newExercise: WorkoutExercise = {
      exercise_id: exercise.id,
      order: exercises.length,
      sets: defaultSets,
    };

    setExercises([...exercises, newExercise]);
    setExerciseDetails({ ...exerciseDetails, [exercise.id]: exercise });
    setShowExercisePicker(false);
  };

  const handleShowExercisePicker = () => {
    loadAvailableExercises();
    setShowExercisePicker(true);
  };

  const addSet = (exerciseIndex: number) => {
    const newExercises = [...exercises];
    const lastSet =
      newExercises[exerciseIndex].sets[
        newExercises[exerciseIndex].sets.length - 1
      ];

    newExercises[exerciseIndex].sets.push({
      reps: lastSet?.reps || 10,
      weight: lastSet?.weight || 0,
      is_warmup: false,
    });

    setExercises(newExercises);
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    field: 'reps' | 'weight' | 'distance' | 'duration' | 'calories',
    value: string
  ) => {
    const newExercises = [...exercises];
    const numValue = parseFloat(value) || 0;
    
    if (field === 'reps') {
      newExercises[exerciseIndex].sets[setIndex].reps = Math.round(numValue);
    } else if (field === 'weight') {
      newExercises[exerciseIndex].sets[setIndex].weight = numValue;
    } else if (field === 'distance') {
      newExercises[exerciseIndex].sets[setIndex].distance = numValue;
    } else if (field === 'duration') {
      newExercises[exerciseIndex].sets[setIndex].duration = Math.round(numValue);
    } else if (field === 'calories') {
      newExercises[exerciseIndex].sets[setIndex].calories = Math.round(numValue);
    }
    
    setExercises(newExercises);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets.splice(setIndex, 1);
    setExercises(newExercises);
  };

  const handleSaveAndFinish = async () => {
    if (!activeWorkout) return;

    try {
      setSaving(true);
      await api.put(`/workouts/${activeWorkout.id}`, {
        exercises,
        ended_at: new Date().toISOString(),
      });

      Alert.alert('Success', 'Workout completed!', [
        {
          text: 'OK',
          onPress: () => {
            endWorkout();
            router.replace('/(tabs)/history');
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!activeWorkout) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.timerContainer}>
          <Ionicons name="time" size={20} color="#4A90E2" />
          <Text style={styles.timerText}>{formatTime(timer)}</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Active Workout</Text>

        {exercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No exercises added yet</Text>
            <Button
              title="Add Exercise"
              onPress={handleShowExercisePicker}
              style={styles.addButton}
            />
          </View>
        ) : (
          exercises.map((exercise, exerciseIndex) => (
            <View key={exerciseIndex} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <Text style={styles.exerciseName}>
                  {exerciseDetails[exercise.exercise_id]?.name || 'Exercise'}
                </Text>
              </View>

              {(() => {
                const exerciseDetail = exerciseDetails[exercise.exercise_id];
                if (!exerciseDetail) return null;
                
                const fields = getExerciseFields(exerciseDetail.exercise_kind);
                
                return (
                  <>
                    <View style={styles.setHeader}>
                      <Text style={[styles.setHeaderText, { width: 32 }]}>SET</Text>
                      {fields.includes('weight') && <Text style={styles.setHeaderText}>WEIGHT</Text>}
                      {fields.includes('reps') && <Text style={styles.setHeaderText}>REPS</Text>}
                      {fields.includes('distance') && <Text style={styles.setHeaderText}>DIST (km)</Text>}
                      {fields.includes('duration') && <Text style={styles.setHeaderText}>TIME (s)</Text>}
                      <View style={{ width: 36 }} />
                    </View>

                    {exercise.sets.map((set, setIndex) => (
                      <View key={setIndex} style={styles.setRow}>
                        <Text style={styles.setNumber}>{setIndex + 1}</Text>
                        
                        {fields.includes('weight') && (
                          <TextInput
                            style={styles.setInput}
                            value={(set.weight || 0).toString()}
                            onChangeText={(value) =>
                              updateSet(exerciseIndex, setIndex, 'weight', value)
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#999"
                          />
                        )}
                        
                        {fields.includes('reps') && (
                          <TextInput
                            style={styles.setInput}
                            value={(set.reps || 0).toString()}
                            onChangeText={(value) =>
                              updateSet(exerciseIndex, setIndex, 'reps', value)
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#999"
                          />
                        )}
                        
                        {fields.includes('distance') && (
                          <TextInput
                            style={styles.setInput}
                            value={(set.distance || 0).toString()}
                            onChangeText={(value) =>
                              updateSet(exerciseIndex, setIndex, 'distance', value)
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#999"
                          />
                        )}
                        
                        {fields.includes('duration') && (
                          <TextInput
                            style={styles.setInput}
                            value={(set.duration || 0).toString()}
                            onChangeText={(value) =>
                              updateSet(exerciseIndex, setIndex, 'duration', value)
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#999"
                          />
                        )}
                        
                        <TouchableOpacity
                          onPress={() => removeSet(exerciseIndex, setIndex)}
                          style={styles.removeButton}
                        >
                          <Ionicons name="close-circle" size={24} color="#FF3B30" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                );
              })()}

              <TouchableOpacity
                style={styles.addSetButton}
                onPress={() => addSet(exerciseIndex)}
              >
                <Ionicons name="add" size={20} color="#4A90E2" />
                <Text style={styles.addSetText}>Add Set</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Finish Workout"
          onPress={handleSaveAndFinish}
          loading={saving}
          disabled={exercises.length === 0}
        />
      </View>

      <Modal
        visible={showExercisePicker}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Exercise</Text>
            <View style={{ width: 28 }} />
          </View>

          <FlatList
            data={availableExercises}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.exerciseOption}
                onPress={() => handleAddExerciseToWorkout(item)}
              >
                <Text style={styles.exerciseOptionName}>{item.name}</Text>
                <Text style={styles.exerciseOptionDetail}>
                  {item.exercise_kind} • {item.primary_body_parts.join(', ')}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.exerciseList}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  exerciseCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exerciseHeader: {
    marginBottom: 16,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  setHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    width: 70,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  setNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    width: 32,
    textAlign: 'center',
  },
  setInput: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    width: 70,
    marginHorizontal: 4,
  },
  removeButton: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  addSetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90E2',
    marginLeft: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 24,
  },
  addButton: {
    width: '100%',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  exerciseList: {
    padding: 16,
  },
  exerciseOption: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  exerciseOptionDetail: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
