import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Input from '../components/Input';
import Button from '../components/Button';
import CreateExerciseModal from '../components/CreateExerciseModal';
import api from '../utils/api';
import { Exercise, TemplateExercise } from '../types';

export default function CreateRoutineScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<
    TemplateExercise[]
  >([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    try {
      const response = await api.get('/exercises');
      setAvailableExercises(response.data);
    } catch (error) {
      console.error('Failed to load exercises:', error);
    }
  };

  const addExercise = (exercise: Exercise) => {
    const newExercise: TemplateExercise = {
      exercise_id: exercise.id,
      order: selectedExercises.length,
      default_sets: 0,
      default_reps: 0,
      default_weight: 0,
    };
    setSelectedExercises([...selectedExercises, newExercise]);
    setShowExercisePicker(false);
  };

  const removeExercise = (index: number) => {
    const newExercises = selectedExercises.filter((_, i) => i !== index);
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
    const exercise = availableExercises.find((e) => e.id === exerciseId);
    return exercise?.name || 'Unknown Exercise';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Routine</Text>
        <View style={{ width: 28 }} />
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

          {selectedExercises.map((exercise, index) => (
            <View key={index} style={styles.exerciseCard}>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseNumber}>{index + 1}</Text>
                <Text style={styles.exerciseName}>
                  {getExerciseName(exercise.exercise_id)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeExercise(index)}>
                <Ionicons name="close-circle" size={24} color="#FF453A" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={() => setShowExercisePicker(true)}
          >
            <Ionicons name="add" size={24} color="#4A90E2" />
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Create Routine"
          onPress={handleSave}
          loading={saving}
          disabled={!name.trim() || selectedExercises.length === 0}
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
            <Text style={styles.modalTitle}>Select Exercise</Text>
            <TouchableOpacity onPress={() => setShowCreateExercise(true)}>
              <Text style={styles.newExerciseText}>+ New</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={availableExercises}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.exerciseOption}
                onPress={() => addExercise(item)}
              >
                <View style={styles.exerciseOptionImageContainer}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.exerciseOptionImage} />
                  ) : (
                    <View style={styles.exerciseOptionPlaceholder}>
                      <Ionicons name="barbell" size={20} color="#8E8E93" />
                    </View>
                  )}
                </View>
                <View style={styles.exerciseOptionInfo}>
                  <Text style={styles.exerciseOptionName}>{item.name}</Text>
                  <Text style={styles.exerciseOptionDetail}>
                    {item.exercise_kind} • {item.primary_body_parts?.join(', ')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.exerciseList}
          />
        </SafeAreaView>
      </Modal>

      <CreateExerciseModal
        visible={showCreateExercise}
        onClose={() => setShowCreateExercise(false)}
        onExerciseCreated={loadExercises}
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
  scrollContent: {
    padding: 16,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  exerciseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  exerciseNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    width: 32,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
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
  footer: {
    padding: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  newExerciseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  exerciseList: {
    padding: 16,
  },
  exerciseOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseOptionImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
  },
  exerciseOptionImage: {
    width: '100%',
    height: '100%',
  },
  exerciseOptionPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseOptionInfo: {
    flex: 1,
  },
  exerciseOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  exerciseOptionDetail: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
