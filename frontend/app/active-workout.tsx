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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useWorkoutStore } from '../store/workoutStore';
import Button from '../components/Button';
import DurationInput from '../components/DurationInput';
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
    console.log('Adding exercise:', exercise.id, exercise.name);
    
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

    console.log('New exercise object:', newExercise);

    // Use functional state updates to ensure latest state
    setExercises(prevExercises => {
      const updated = [...prevExercises, newExercise];
      console.log('Updated exercises:', updated.map(e => e.exercise_id));
      return updated;
    });
    
    setExerciseDetails(prevDetails => {
      const updated = { ...prevDetails, [exercise.id]: exercise };
      console.log('Updated exercise details keys:', Object.keys(updated));
      return updated;
    });
    
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
    value: string | number
  ) => {
    const newExercises = [...exercises];
    const numValue = typeof value === 'number' ? value : (parseFloat(value) || 0);
    
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
      console.log('Saving workout with id:', activeWorkout.id);
      
      // Generate workout name based on exercises
      const exerciseNames = exercises
        .slice(0, 3)
        .map(ex => exerciseDetails[ex.exercise_id]?.name || 'Exercise')
        .join(', ');
      const workoutName = exerciseNames + (exercises.length > 3 ? '...' : '');
      
      await api.put(`/workouts/${activeWorkout.id}`, {
        exercises,
        ended_at: new Date().toISOString(),
        name: workoutName || 'Workout',
      });

      console.log('Workout saved successfully');
      
      // On web, Alert.alert callback doesn't work well, so handle differently
      if (Platform.OS === 'web') {
        endWorkout();
        router.replace('/(tabs)/history');
      } else {
        Alert.alert('Success', 'Workout completed!', [
          {
            text: 'OK',
            onPress: () => {
              endWorkout();
              router.replace('/(tabs)/history');
            },
          },
        ]);
      }
    } catch (error: any) {
      console.error('Failed to save workout:', error);
      if (Platform.OS === 'web') {
        alert('Failed to save workout: ' + (error.message || 'Unknown error'));
      } else {
        Alert.alert('Error', 'Failed to save workout');
      }
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
          <Ionicons name="close" size={28} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.timerContainer}>
          <Ionicons name="time" size={20} color="#007AFF" />
          <Text style={styles.timerText}>{formatTime(timer)}</Text>
        </View>
        <TouchableOpacity 
          style={styles.finishHeaderButton}
          onPress={handleSaveAndFinish}
          disabled={saving || exercises.length === 0}
        >
          <Text style={[
            styles.finishHeaderText,
            (saving || exercises.length === 0) && styles.finishHeaderTextDisabled
          ]}>
            {saving ? 'Saving...' : 'Finish'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Active Workout</Text>

        {exercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No exercises added yet</Text>
          </View>
        ) : (
          exercises.map((exercise, exerciseIndex) => {
            const detail = exerciseDetails[exercise.exercise_id];
            console.log(`Rendering exercise ${exerciseIndex}:`, {
              exercise_id: exercise.exercise_id,
              detail_name: detail?.name,
              detail_kind: detail?.exercise_kind
            });
            
            return (
              <View key={`${exercise.exercise_id}-${exerciseIndex}`} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <Text style={styles.exerciseName}>
                    {detail?.name || 'Loading...'}
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
                      {fields.includes('duration') && <Text style={styles.setHeaderText}>TIME</Text>}
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
                          <DurationInput
                            value={set.duration || 0}
                            onChangeValue={(seconds) =>
                              updateSet(exerciseIndex, setIndex, 'duration', seconds)
                            }
                            style={styles.durationInput}
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
                <Ionicons name="add" size={20} color="#007AFF" />
                <Text style={styles.addSetText}>Add Set</Text>
              </TouchableOpacity>
            </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Add Exercise"
          onPress={handleShowExercisePicker}
          variant="outline"
          style={styles.addExerciseButton}
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
              <Ionicons name="close" size={28} color="#1C1C1E" />
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
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginLeft: 8,
  },
  finishHeaderButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  finishHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  finishHeaderTextDisabled: {
    opacity: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 24,
  },
  exerciseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  exerciseHeader: {
    marginBottom: 16,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
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
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
    width: 70,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  durationInput: {
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#D1D1D6',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  exerciseList: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  exerciseOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  exerciseOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  exerciseOptionDetail: {
    fontSize: 14,
    color: '#6E6E73',
  },
});
