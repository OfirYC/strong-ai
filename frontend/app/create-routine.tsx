import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import Input from '../components/Input';
import SetRowInput, { SetHeader } from '../components/SetRowInput';
import CreateExerciseModal from '../components/CreateExerciseModal';
import ExercisePickerModal from '../components/ExercisePickerModal';
import api from '../utils/api';
import { Exercise, TemplateExercise } from '../types';

export default function CreateRoutineScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<TemplateExercise[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [exerciseDetails, setExerciseDetails] = useState<{ [key: string]: Exercise }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExerciseDetails();
  }, [selectedExercises]);

  const loadExerciseDetails = async () => {
    const exerciseIds = selectedExercises.map(e => e.exercise_id);
    const missingIds = exerciseIds.filter(id => !exerciseDetails[id]);
    
    if (missingIds.length > 0) {
      try {
        const response = await api.get('/exercises');
        const allExercises: Exercise[] = response.data;
        const detailsMap: { [key: string]: Exercise } = { ...exerciseDetails };
        
        allExercises.forEach(ex => {
          if (missingIds.includes(ex.id)) {
            detailsMap[ex.id] = ex;
          }
        });
        
        setExerciseDetails(detailsMap);
      } catch (error) {
        console.error('Failed to load exercise details:', error);
      }
    }
  };

  const addExercise = (exercise: Exercise) => {
    const newExercise: TemplateExercise = {
      exercise_id: exercise.id,
      order: selectedExercises.length,
      sets: [{ is_warmup: false }], // Start with one empty set
    };
    setSelectedExercises([...selectedExercises, newExercise]);
    // Add to details immediately
    setExerciseDetails(prev => ({ ...prev, [exercise.id]: exercise }));
  };

  const removeExercise = (index: number) => {
    Alert.alert(
      'Remove Exercise',
      'Are you sure you want to remove this exercise?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const newExercises = selectedExercises.filter((_, i) => i !== index);
            setSelectedExercises(newExercises);
          },
        },
      ]
    );
  };

  const addSet = (exerciseIndex: number) => {
    const newExercises = [...selectedExercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: [...newExercises[exerciseIndex].sets, { is_warmup: false }],
    };
    setSelectedExercises(newExercises);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...selectedExercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex),
    };
    setSelectedExercises(newExercises);
  };

  const updateSet = (exerciseIndex: number, setIndex: number, field: string, value: any) => {
    const newExercises = [...selectedExercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.map((set, i) =>
        i === setIndex ? { ...set, [field]: value } : set
      ),
    };
    setSelectedExercises(newExercises);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a routine name');
      return;
    }

    if (selectedExercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise');
      return;
    }

    try {
      setSaving(true);
      await api.post('/templates', {
        name: name.trim(),
        notes: notes.trim(),
        exercises: selectedExercises,
      });

      Alert.alert('Success', 'Routine created!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to create routine');
    } finally {
      setSaving(false);
    }
  };

  const getExerciseName = (exerciseId: string) => {
    return exerciseDetails[exerciseId]?.name || 'Loading...';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Routine</Text>
        <TouchableOpacity 
          onPress={handleSave}
          disabled={saving || !name.trim() || selectedExercises.length === 0}
          style={[
            styles.saveButton,
            (saving || !name.trim() || selectedExercises.length === 0) && styles.saveButtonDisabled
          ]}
        >
          <Text style={[
            styles.saveButtonText,
            (saving || !name.trim() || selectedExercises.length === 0) && styles.saveButtonTextDisabled
          ]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Input
          label="Routine Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g., Push Day"
        />

        <Input
          label="Notes (Optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add any notes about this routine"
          multiline
          numberOfLines={3}
          style={styles.notesInput}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercises</Text>

          {selectedExercises.map((exercise, exerciseIndex) => {
            const detail = exerciseDetails[exercise.exercise_id];
            const exerciseKind = detail?.exercise_kind || 'Barbell';

            return (
              <View key={exerciseIndex} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <Text style={styles.exerciseName}>
                    {getExerciseName(exercise.exercise_id)}
                  </Text>
                  <TouchableOpacity onPress={() => removeExercise(exerciseIndex)}>
                    <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                {/* Sets */}
                {exercise.sets.length > 0 && (
                  <View style={styles.setsContainer}>
                    <SetHeader exerciseKind={exerciseKind} />

                    {exercise.sets.map((set, setIndex) => (
                      <Swipeable
                        key={setIndex}
                        renderRightActions={() => (
                          <View style={styles.deleteSetAction}>
                            <Ionicons name="trash" size={20} color="#FFFFFF" />
                          </View>
                        )}
                        onSwipeableOpen={(direction) => {
                          if (direction === 'right') {
                            removeSet(exerciseIndex, setIndex);
                          }
                        }}
                        rightThreshold={40}
                        overshootRight={false}
                        friction={2}
                      >
                        <SetRowInput
                          set={set}
                          setIndex={setIndex}
                          exerciseKind={exerciseKind}
                          onUpdateSet={(field, value) => updateSet(exerciseIndex, setIndex, field, value)}
                          showCompleteButton={false}
                        />
                      </Swipeable>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(exerciseIndex)}>
                  <Ionicons name="add" size={20} color="#007AFF" />
                  <Text style={styles.addSetText}>Add Set</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={() => setShowExercisePicker(true)}
          >
            <Ionicons name="add" size={24} color="#007AFF" />
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ExercisePickerModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelectExercise={addExercise}
        onCreateNew={() => {
          setShowExercisePicker(false);
          setTimeout(() => setShowCreateExercise(true), 300);
        }}
      />

      <CreateExerciseModal
        visible={showCreateExercise}
        onClose={() => setShowCreateExercise(false)}
        onExerciseCreated={() => {}}
      />
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
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D1D6',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: '#8E8E93',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  exerciseCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
  },
  setsContainer: {
    marginBottom: 12,
  },
  setRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeSetButton: {
    padding: 4,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  addSetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 6,
  },
  addExerciseButton: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D1D1D6',
    borderStyle: 'dashed',
  },
  addExerciseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
});
